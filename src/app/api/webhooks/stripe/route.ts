/**
 * POST /api/webhooks/stripe — single source of truth for confirmed/refunded state.
 *
 * Anti-goal #1 hard-enforced via two layers:
 *  - Stripe sends `event.id` (unique). We INSERT into payments with
 *    idempotency_key = event.id; UNIQUE constraint absorbs duplicates.
 *  - The reservation status update is keyed on current status (only flips
 *    `pending_payment → confirmed` once).
 *
 * Events handled (subscribe in Stripe dashboard):
 *  - checkout.session.completed   — deposit captured → confirm reservation
 *  - charge.refunded              — refund landed (initiated by /cancel API)
 *  - payment_intent.payment_failed — release seat (mark cancelled_late, no refund)
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { adminClient } from "@/lib/db/clients";
import { serverEnv, isDepositRequired } from "@/lib/env";
import { sendConfirmationDispatch } from "@/lib/notifications/dispatch";
import type { Reservation } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Hard-disable when the deposit flow is off. Any inbound Stripe call
  // is either a stale webhook from a prior deployment or hostile noise
  // — in both cases we want the loud 410 rather than silently passing
  // signature verification on a key the operator no longer manages.
  if (!isDepositRequired()) {
    return NextResponse.json(
      { ok: false, reason: "stripe_disabled" },
      { status: 410 }
    );
  }

  const env = serverEnv();
  // Fail loud rather than passing undefined into constructEvent — same
  // rationale as the stripe() singleton: if the deposit flow is on, the
  // secret must be present.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, reason: "stripe_webhook_secret_missing" },
      { status: 500 }
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, reason: "missing_signature" }, { status: 400 });
  }
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "bad_signature" },
      { status: 400 }
    );
  }

  const sb = adminClient();

  // Codex audit 2026-04-29: stateful dedup so handler failures don't get
  // silently dropped on Stripe retry.
  //
  // Lifecycle:
  //   1st arrival                → INSERT (status=processing, attempts=1) → run handler
  //                                 ├─ success → UPDATE status=succeeded, processed_at=now()
  //                                 └─ failure → UPDATE last_error=…, attempts++ (status stays "processing")
  //                                              return 5xx so Stripe retries
  //   replay where status=succeeded → ack 200 noop
  //   replay where status=processing → run handler again (was previously broken)
  type ExistingRow = {status: "processing" | "succeeded" | "failed"; attempts: number};
  const {data: existing, error: lookupErr} = await sb
    .from("webhook_events")
    .select("status, attempts")
    .eq("event_id", event.id)
    .maybeSingle<ExistingRow>();

  if (lookupErr) {
    return NextResponse.json(
      {ok: false, reason: `dedup_lookup_failed:${lookupErr.message}`},
      {status: 500}
    );
  }

  if (existing?.status === "succeeded") {
    return NextResponse.json({ok: true, event_id: event.id, replay: true});
  }

  if (!existing) {
    const {error: insertErr} = await sb.from("webhook_events").insert({
      event_id: event.id,
      source: "stripe",
      event_type: event.type,
      status: "processing",
      attempts: 1,
    });
    if (insertErr) {
      // Race: another worker inserted between our SELECT and INSERT. Treat as
      // "another worker is handling it" — return 200 to drop the duplicate.
      if (insertErr.message.includes("duplicate key")) {
        return NextResponse.json({ok: true, event_id: event.id, replay: true});
      }
      return NextResponse.json(
        {ok: false, reason: `dedup_insert_failed:${insertErr.message}`},
        {status: 500}
      );
    }
  } else {
    // Existing processing row — increment attempts on retry path.
    await sb
      .from("webhook_events")
      .update({attempts: existing.attempts + 1})
      .eq("event_id", event.id);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event, sb);
        break;
      case "charge.refunded":
        await onChargeRefunded(event, sb);
        break;
      case "payment_intent.payment_failed":
        await onPaymentFailed(event, sb);
        break;
      default:
        console.info(`[stripe-webhook] ignored event=${event.type}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "handler_error";
    console.error("[stripe-webhook] handler failed", err);
    // Record the failure but keep status=processing so Stripe retries can
    // re-enter the handler.
    await sb
      .from("webhook_events")
      .update({last_error: reason})
      .eq("event_id", event.id);
    return NextResponse.json({ok: false, reason}, {status: 500});
  }

  // Handler succeeded — mark terminal so future replays no-op.
  await sb
    .from("webhook_events")
    .update({status: "succeeded", processed_at: new Date().toISOString(), last_error: null})
    .eq("event_id", event.id);

  return NextResponse.json({ok: true, event_id: event.id});
}

type SbClient = ReturnType<typeof adminClient>;

async function onCheckoutCompleted(event: Stripe.Event, sb: SbClient) {
  const session = event.data.object as Stripe.Checkout.Session;
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) {
    console.warn(`[stripe-webhook] checkout.session.completed missing reservation_id ${session.id}`);
    return;
  }

  // 1. Idempotent payment insert
  const amount = session.amount_total ?? 0;
  const { error: payErr } = await sb.from("payments").insert({
    reservation_id: reservationId,
    kind: "deposit_capture",
    provider: "stripe",
    amount_centavos: amount,
    method: null,
    provider_ref: session.payment_intent as string,
    idempotency_key: `stripe:event:${event.id}`,
    recorded_by: "webhook",
  });
  if (payErr && !payErr.message.includes("duplicate key")) {
    throw new Error(`payments insert failed: ${payErr.message}`);
  }

  // 2. Promote reservation status. Match-on-status absorbs duplicate webhooks.
  const { data: updated, error: updErr } = await sb
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", reservationId)
    .eq("status", "pending_payment")
    .select("*")
    .maybeSingle<Reservation>();

  if (updErr) {
    throw new Error(`reservation update failed: ${updErr.message}`);
  }

  if (!updated) {
    // Already confirmed by an earlier delivery — nothing else to do.
    return;
  }

  // 3. Audit
  await sb.from("audit_log").insert({
    actor: "webhook",
    reservation_id: reservationId,
    action: "reservation.confirm",
    after_data: { stripe_event: event.id, payment_intent: session.payment_intent } as never,
  });

  // 4. Notify customer + ops (shared with the deposit-free flow)
  await sendConfirmationDispatch(updated, sb);
}

async function onChargeRefunded(event: Stripe.Event, sb: SbClient) {
  const charge = event.data.object as Stripe.Charge;
  const reservationId = charge.metadata?.reservation_id;
  if (!reservationId) return;

  // Was the refund initiated by /cancel API? If so, the payments row already
  // exists. The webhook is confirmation (no-op aside from audit).
  // P1-1 fix: report the refunded amount, not "refunded - captured" math.
  const totalRefundedCentavos = charge.amount_refunded ?? 0;
  await sb.from("audit_log").insert({
    actor: "webhook",
    reservation_id: reservationId,
    action: "stripe.refund.confirmed",
    after_data: {
      stripe_event: event.id,
      charge_id: charge.id,
      total_refunded_centavos: totalRefundedCentavos,
    } as never,
  });
}

async function onPaymentFailed(event: Stripe.Event, sb: SbClient) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const reservationId = intent.metadata?.reservation_id;
  if (!reservationId) return;

  // Move pending_payment → cancelled_late so capacity is freed for the slot.
  // The reservation never made it to confirmed; nothing to refund.
  await sb
    .from("reservations")
    .update({
      status: "cancelled_late",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "system",
    })
    .eq("id", reservationId)
    .eq("status", "pending_payment");

  await sb.from("audit_log").insert({
    actor: "webhook",
    reservation_id: reservationId,
    action: "reservation.payment_failed",
    after_data: { stripe_event: event.id, intent_id: intent.id } as never,
  });
}

