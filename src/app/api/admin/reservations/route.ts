/**
 * POST /api/admin/reservations — owner-side manual booking.
 *
 * Bypasses Stripe deposit; creates the reservation in `confirmed` state.
 * Capacity + closed-date checks reuse the SQL function used by the public path
 * so capacity invariants are identical for both flows.
 *
 * If the owner collected a cash deposit, an `on_site` payment row of kind
 * `deposit_capture` is added so revenue reports stay accurate.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import { adminCreateReservationSchema } from "@/lib/domain/schemas";
import { serviceStartsAt, priceBreakdown } from "@/lib/domain/reservation";
import { issueCancelToken } from "@/lib/security/cancel-token";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_json" } },
      { status: 400 }
    );
  }

  const parsed = adminCreateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", details: parsed.error.issues } },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = adminClient();
  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) {
    return NextResponse.json(
      { ok: false, error: { code: "settings_missing" } },
      { status: 500 }
    );
  }

  // Manual mode: validated requested seats; omitting → auto-allocate.
  const requested =
    input.seat_numbers && input.seat_numbers.length === input.party_size
      ? input.seat_numbers
      : null;

  const startsAt = serviceStartsAt(input.service_date, input.seating, settings);
  const { deposit, balance } = priceBreakdown(
    settings.course_price_centavos,
    input.party_size,
    settings.deposit_pct
  );

  const reservationId = crypto.randomUUID();
  // Token still useful: lets owner share a self-cancel link with the guest.
  const ttlSeconds = Math.max(
    Math.floor((startsAt.getTime() - Date.now()) / 1000) + 7 * 86_400,
    86_400
  );
  const tokenBundle = await issueCancelToken(reservationId, ttlSeconds);

  // Atomic allocate + INSERT in a single transaction (codex P1 fix —
  // the prior two-step RPC + insert flow allowed concurrent oversell).
  const { error: bookErr } = await sb
    .rpc("book_reservation_atomic", {
      p_id: reservationId,
      p_service_date: input.service_date,
      p_seating: input.seating,
      p_service_starts_at: startsAt.toISOString(),
      p_party_size: input.party_size,
      p_guest_name: input.guest_name,
      p_guest_email:
        input.guest_email || `manual-${reservationId.slice(0, 8)}@daimasu.local`,
      p_guest_phone: input.guest_phone,
      p_guest_lang: input.guest_lang,
      p_notes: input.notes ?? null,
      p_course_price_centavos: settings.course_price_centavos,
      p_deposit_pct: settings.deposit_pct,
      p_deposit_centavos: input.deposit_received ? deposit : 0,
      p_balance_centavos: input.deposit_received ? balance : deposit + balance,
      p_cancel_token_hash: tokenBundle.hash,
      p_cancel_token_expires_at: tokenBundle.expiresAt.toISOString(),
      p_source: input.source,
      p_requested_seats: requested,
      p_celebration:
        input.celebration && input.celebration.occasion !== "none"
          ? input.celebration
          : null,
      p_status: "confirmed",
    })
    .single<Reservation>();
  if (bookErr) {
    const msg = bookErr.message || "";
    if (msg.includes("closed_date")) {
      return NextResponse.json({ ok: false, error: { code: "closed_date" } }, { status: 409 });
    }
    if (msg.includes("capacity_exceeded")) {
      return NextResponse.json({ ok: false, error: { code: "capacity_exceeded" } }, { status: 409 });
    }
    if (msg.includes("seat_occupied") || msg.includes("seat_count_mismatch") || msg.includes("seat_out_of_range")) {
      return NextResponse.json({ ok: false, error: { code: "seat_conflict", reason: msg } }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: { code: "insert_failed", reason: msg } },
      { status: 500 }
    );
  }

  // Cash deposit payment row (if collected upfront).
  if (input.deposit_received) {
    await sb.from("payments").insert({
      reservation_id: reservationId,
      kind: "deposit_capture",
      provider: "on_site",
      amount_centavos: deposit,
      method: "cash",
      idempotency_key: `res:${reservationId}:manual-deposit:v1`,
      recorded_by: admin.email,
      notes: `manual booking via /admin/reservations/new (${input.source})`,
    });
  }

  await sb.from("audit_log").insert({
    actor: admin.email,
    reservation_id: reservationId,
    action: "reservation.create",
    after_data: {
      source: input.source,
      deposit_received: input.deposit_received,
      party_size: input.party_size,
    } as never,
    reason: `manual booking (${input.source})`,
  });

  return NextResponse.json(
    { ok: true, reservation_id: reservationId },
    { status: 201 }
  );
}
