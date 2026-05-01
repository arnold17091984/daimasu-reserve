/**
 * POST /api/admin/reservations/[id]/cancel — owner-side cancel.
 *
 * Two modes:
 *   { override: false } — apply policy-based refund tier (same as guest path)
 *   { override: true, amount_centavos, reason } — owner overrides the refund.
 *     Useful for goodwill / illness / staff-error cases. Reason is required and
 *     logged to audit_log + payments.notes for NPC compliance.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import { stripe } from "@/lib/stripe/client";
import {
  hoursUntilService,
  refundAmountCentavos,
  refundTier,
  statusAfterCancel,
} from "@/lib/domain/reservation";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("override", [
  z.object({ override: z.literal(false) }),
  z.object({
    override: z.literal(true),
    amount_centavos: z.number().int().min(0).max(100_000_00),
    reason: z.string().min(3).max(280),
  }),
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { data: reservation } = await sb
    .from("reservations")
    .select("*")
    .eq("id", id)
    .single<Reservation>();
  if (!reservation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (
    reservation.status !== "pending_payment" &&
    reservation.status !== "confirmed"
  ) {
    return NextResponse.json(
      { ok: false, error: `bad_state:${reservation.status}` },
      { status: 409 }
    );
  }

  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) {
    return NextResponse.json(
      { ok: false, error: "settings_missing" },
      { status: 500 }
    );
  }

  const startsAt = new Date(reservation.service_starts_at);
  const hours = hoursUntilService(startsAt);
  const autoTier = refundTier(hours, settings);

  let refundCentavos: number;
  let tierLabel: string;
  let auditReason: string;
  let paymentNotes: string | null = null;

  if (parsed.data.override) {
    refundCentavos = Math.min(
      parsed.data.amount_centavos,
      reservation.deposit_centavos
    );
    tierLabel = "override";
    auditReason = parsed.data.reason;
    paymentNotes = `override by ${admin.email}: ${parsed.data.reason}`;
  } else {
    refundCentavos = refundAmountCentavos(autoTier, reservation.deposit_centavos);
    tierLabel = autoTier;
    auditReason = `staff cancel via /admin, ${Math.round(hours * 10) / 10}h remaining`;
  }

  // Stripe refund (if any).
  const { data: depositPayment } = await sb
    .from("payments")
    .select("provider_ref")
    .eq("reservation_id", reservation.id)
    .eq("kind", "deposit_capture")
    .limit(1)
    .maybeSingle<{ provider_ref: string | null }>();

  const minuteBucket = Math.floor(Date.now() / 60_000);
  let stripeRefundId: string | null = null;
  if (refundCentavos > 0 && depositPayment?.provider_ref) {
    try {
      const refund = await stripe().refunds.create(
        {
          payment_intent: depositPayment.provider_ref,
          amount: refundCentavos,
          metadata: {
            reservation_id: reservation.id,
            tier: tierLabel,
            actor: admin.email,
          },
        },
        {
          idempotencyKey: `res:${reservation.id}:admin-refund:${tierLabel}:m${minuteBucket}`,
        }
      );
      stripeRefundId = refund.id;
    } catch (err) {
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

  // Payment row (negative amount). Override gets manual_adjustment kind.
  if (refundCentavos > 0) {
    const kind = parsed.data.override
      ? "manual_adjustment"
      : autoTier === "full"
        ? "refund_full"
        : "refund_partial";
    await sb.from("payments").insert({
      reservation_id: reservation.id,
      kind,
      provider: "stripe",
      amount_centavos: -refundCentavos,
      method: null,
      provider_ref: stripeRefundId,
      idempotency_key: `res:${reservation.id}:admin-refund:${tierLabel}:v1`,
      notes: paymentNotes,
      recorded_by: admin.email,
    });
  }

  // Reservation flip. Override falls back to the closest tier label.
  const newStatus = parsed.data.override
    ? refundCentavos === reservation.deposit_centavos
      ? "cancelled_full"
      : refundCentavos > 0
        ? "cancelled_partial"
        : "cancelled_late"
    : statusAfterCancel(autoTier);

  await sb
    .from("reservations")
    .update({
      status: newStatus,
      cancelled_at: new Date().toISOString(),
      cancelled_by: "staff",
    })
    .eq("id", reservation.id)
    .in("status", ["pending_payment", "confirmed"]);

  await sb.from("audit_log").insert({
    actor: admin.email,
    reservation_id: reservation.id,
    action: parsed.data.override
      ? "reservation.cancel.override"
      : `reservation.cancel.${autoTier}`,
    before_data: {
      status: reservation.status,
      deposit_centavos: reservation.deposit_centavos,
    } as never,
    after_data: {
      status: newStatus,
      refund_centavos: refundCentavos,
      stripe_refund_id: stripeRefundId,
    } as never,
    reason: auditReason,
  });

  return NextResponse.json({
    ok: true,
    tier: tierLabel,
    refund_centavos: refundCentavos,
    stripe_refund_id: stripeRefundId,
  });
}
