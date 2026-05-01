/**
 * POST /api/cron/reap-pending
 *
 * Stripe Checkout sessions expire 30 min after creation. After that, the
 * pending_payment reservation no longer corresponds to an in-flight payment
 * — flip status to `expired` to free the seat (audit-preserving soft-delete).
 *
 * Anti-race (audit fix C-3): for each candidate row, retrieve the Stripe
 * session and only flip if `status === 'expired'` server-side. Otherwise
 * leave it alone — a webhook may still complete payment.
 *
 * Schedule every 5 min (Supabase pg_cron).
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { stripe } from "@/lib/stripe/client";
import { verifyCronAuth } from "@/lib/security/cron-auth";
import type { Reservation } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  // 45-min cutoff: Stripe Checkout default expiry is 30 min, plus 15-min buffer
  // for webhook delivery slack.
  const cutoff = new Date(Date.now() - 45 * 60_000).toISOString();

  const { data: candidates, error } = await sb
    .from("reservations")
    .select("id,stripe_checkout_session_id,created_at")
    .eq("status", "pending_payment")
    .lt("created_at", cutoff)
    .returns<
      Array<Pick<Reservation, "id" | "stripe_checkout_session_id"> & { created_at: string }>
    >();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, reaped: 0 });
  }

  const stripeClient = stripe();
  const reaped: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const r of candidates) {
    // If we have a Stripe session id, confirm the session is genuinely closed.
    if (r.stripe_checkout_session_id) {
      try {
        const session = await stripeClient.checkout.sessions.retrieve(
          r.stripe_checkout_session_id
        );
        // Stripe statuses: 'open' | 'complete' | 'expired'
        if (session.status === "complete") {
          // The webhook should land any moment — DON'T reap.
          skipped.push({ id: r.id, reason: "stripe_complete_pending_webhook" });
          continue;
        }
        if (session.status !== "expired") {
          // Still open and within Stripe's window → leave it.
          skipped.push({ id: r.id, reason: `stripe_status_${session.status}` });
          continue;
        }
      } catch {
        // Stripe lookup failed (transient) — leave alone, retry next cron tick.
        skipped.push({ id: r.id, reason: "stripe_lookup_failed" });
        continue;
      }
    }

    // Soft-delete: flip status to `expired`. Capacity index excludes this status.
    const { data: flipped } = await sb
      .from("reservations")
      .update({
        status: "expired",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "system",
      })
      .eq("id", r.id)
      .eq("status", "pending_payment")
      .select("id");
    if (flipped && flipped.length > 0) {
      reaped.push(r.id);
      await sb.from("audit_log").insert({
        actor: "system",
        reservation_id: r.id,
        action: "reservation.expired",
        reason: "Stripe Checkout session expired without capture",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    reaped: reaped.length,
    skipped: skipped.length,
    skipped_detail: skipped,
  });
}
