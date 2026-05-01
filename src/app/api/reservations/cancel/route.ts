/**
 * POST /api/reservations/cancel
 *
 * Self-cancel by token. Two stages:
 *   - GET-style preview returns the refund tier so /cancel page shows it before
 *     the user clicks "confirm". Implemented as POST { mode: "preview", token }.
 *   - Real cancel: POST { mode: "execute", token }
 *
 * Anti-goal #3: refund tier is recomputed inside this handler from the DB
 * state of the reservation. The client's preview is advisory only.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/db/clients";
import { stripe } from "@/lib/stripe/client";
import {
  verifyCancelToken,
  tokenMatchesHash,
} from "@/lib/security/cancel-token";
import { clientKey, limit, rateLimitHeaders } from "@/lib/security/rate-limit";
import {
  hoursUntilService,
  refundAmountCentavos,
  refundTier,
  statusAfterCancel,
  formatPHP,
} from "@/lib/domain/reservation";
import { sendEmail } from "@/lib/notifications/email";
import { notifyTelegram } from "@/lib/notifications/telegram";
import {
  renderCancelEmail,
  renderTelegramCancelled,
} from "@/lib/notifications/templates";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Codex audit 2026-04-29: validate `mode` strictly. Previously, `mode` was
// not type-checked at runtime — any non-"preview" value (typo, garbage,
// missing field) fell through to actual cancellation execution.
const reqBodySchema = z.object({
  mode: z.enum(["preview", "execute"]),
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Rate-limit cancellation attempts: a token-guessing attacker would
  // burn unique tokens here. 30 attempts / IP / hour is well above any
  // legit "I clicked the wrong refund tier" retry pattern.
  const rl = limit("cancel", clientKey(req, "cancel"), 30, 60 * 60 * 1000);
  if (!rl.ok) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "rate_limited" }),
      { status: 429, headers: { ...rateLimitHeaders(rl), "Content-Type": "application/json" } }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = reqBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const verified = await verifyCancelToken(body.token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 401 });
  }
  const sb = adminClient();
  const { data: reservation, error: rErr } = await sb
    .from("reservations")
    .select("*")
    .eq("id", verified.rid)
    .single<Reservation>();
  if (rErr || !reservation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!tokenMatchesHash(body.token, reservation.cancel_token_hash)) {
    // Hash mismatch: the token was rotated (likely by a prior cancel attempt
    // or webhook re-issue) — treat as expired.
    return NextResponse.json({ ok: false, error: "token_rotated" }, { status: 401 });
  }
  if (
    reservation.status === "cancelled_full" ||
    reservation.status === "cancelled_partial" ||
    reservation.status === "cancelled_late"
  ) {
    return NextResponse.json(
      { ok: false, error: "already_cancelled", status: reservation.status },
      { status: 409 }
    );
  }
  if (reservation.status === "no_show" || reservation.status === "completed") {
    return NextResponse.json(
      { ok: false, error: "non_cancellable", status: reservation.status },
      { status: 409 }
    );
  }

  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) {
    return NextResponse.json({ ok: false, error: "settings_missing" }, { status: 500 });
  }

  const startsAt = new Date(reservation.service_starts_at);
  const hours = hoursUntilService(startsAt);
  const tier = refundTier(hours, settings);
  const refundCentavos = refundAmountCentavos(tier, reservation.deposit_centavos);

  if (body.mode === "preview") {
    return NextResponse.json({
      ok: true,
      preview: {
        tier,
        hours_remaining: Math.round(hours * 10) / 10,
        refund_centavos: refundCentavos,
        refund_display: formatPHP(refundCentavos, reservation.guest_lang),
        deposit_centavos: reservation.deposit_centavos,
        deposit_display: formatPHP(reservation.deposit_centavos, reservation.guest_lang),
        starts_at: reservation.service_starts_at,
      },
    });
  }

  // execute: issue Stripe refund (if any) + flip reservation status atomically-ish

  // 1. Stripe refund — idempotent. Reuse the deposit's payment_intent.
  const { data: depositPayment } = await sb
    .from("payments")
    .select("provider_ref")
    .eq("reservation_id", reservation.id)
    .eq("kind", "deposit_capture")
    .limit(1)
    .maybeSingle<{ provider_ref: string | null }>();

  // P1-3 fix: minute-bucketed idempotency key. Stripe's idempotency window is
  // 24h; a transient failure with a static key would replay the failure forever.
  // The bucket lets retries within the same minute be idempotent (covers
  // double-clicks) but the next minute's retry gets a fresh attempt.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  let stripeRefundId: string | null = null;
  if (refundCentavos > 0 && depositPayment?.provider_ref) {
    try {
      const refund = await stripe().refunds.create(
        {
          payment_intent: depositPayment.provider_ref,
          amount: refundCentavos,
          metadata: { reservation_id: reservation.id, tier },
        },
        {
          idempotencyKey: `res:${reservation.id}:refund:${tier}:m${minuteBucket}`,
        }
      );
      stripeRefundId = refund.id;
    } catch (err) {
      // Don't flip status if Stripe failed — the user will retry, and the
      // /cancel page will show the same state.
      return NextResponse.json(
        {
          ok: false,
          error: "refund_failed",
          reason: err instanceof Error ? err.message : "stripe_error",
        },
        { status: 502 }
      );
    }
  }

  // 2. Insert payment row (negative amount). UNIQUE on idempotency_key absorbs retries.
  if (refundCentavos > 0) {
    await sb.from("payments").insert({
      reservation_id: reservation.id,
      kind: tier === "full" ? "refund_full" : "refund_partial",
      provider: "stripe",
      amount_centavos: -refundCentavos,
      method: null,
      provider_ref: stripeRefundId,
      idempotency_key: `res:${reservation.id}:refund:${tier}:v1`,
      recorded_by: "guest",
    });
  }

  // 3. Update reservation status — gated on previous status to absorb double-clicks.
  const { data: flipped } = await sb
    .from("reservations")
    .update({
      status: statusAfterCancel(tier),
      cancelled_at: new Date().toISOString(),
      cancelled_by: "guest",
    })
    .eq("id", reservation.id)
    .in("status", ["pending_payment", "confirmed"])
    .select("*")
    .maybeSingle<Reservation>();

  // 4. Audit
  await sb.from("audit_log").insert({
    actor: "guest",
    reservation_id: reservation.id,
    action: `reservation.cancel.${tier}`,
    before_data: { status: reservation.status, deposit_centavos: reservation.deposit_centavos } as never,
    after_data: { status: statusAfterCancel(tier), refund_centavos: refundCentavos, stripe_refund_id: stripeRefundId } as never,
    reason: `self-cancel via signed link, ${Math.round(hours * 10) / 10}h remaining`,
  });

  // 5. Notify customer + ops
  if (flipped) {
    const { subject, html } = renderCancelEmail({
      reservation: flipped,
      refundCentavos,
      tier,
    });
    await sendEmail({
      to: flipped.guest_email,
      subject,
      html,
      idempotencyKey: `email:cancel:${flipped.id}:${tier}`,
      log: { reservation_id: flipped.id, kind: "cancel_confirm" },
    });

    await notifyTelegram({
      text: renderTelegramCancelled(flipped, refundCentavos, tier),
      tokenOverride: settings.telegram_bot_token,
      chatIdOverride: settings.telegram_chat_id,
      log: { reservation_id: flipped.id, kind: "admin_alert" },
    });
  }

  return NextResponse.json({
    ok: true,
    cancelled: {
      tier,
      refund_centavos: refundCentavos,
      stripe_refund_id: stripeRefundId,
    },
  });
}
