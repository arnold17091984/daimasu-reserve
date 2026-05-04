/**
 * POST /api/reservations
 *
 * The atomic booking entry point.
 *
 * Two flows controlled by the `RESERVATIONS_DEPOSIT_REQUIRED` env flag:
 *
 * Deposit flow (flag=true, legacy):
 *  1. Validate input (zod)
 *  2. Atomic allocate + INSERT (status=pending_payment) via book_reservation_atomic
 *  3. Issue HMAC self-cancel token, persist hash
 *  4. Create Stripe Checkout, return { checkout_url }; client redirects.
 *  5. Stripe webhook flips status to confirmed and dispatches the email + ping.
 *  Stale pending_payment rows older than 30 min are reaped by /api/cron/reap-pending.
 *
 * Deposit-free flow (flag=false, used where Stripe is unavailable):
 *  1. Same validate + atomic allocate, but with status=confirmed up front.
 *  2. Send the guest confirmation email + admin Telegram ping inline
 *     (sendConfirmationDispatch — same code path the webhook uses).
 *  3. Return { reservation_id }; client redirects to /reservation/confirm.
 *  No Stripe touchpoints, no pending_payment limbo, no reap-pending step.
 */
import "server-only";
import { after, NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { stripe, toStripeAmount } from "@/lib/stripe/client";
import { issueCancelToken } from "@/lib/security/cancel-token";
import { clientKey, limit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { createReservationSchema } from "@/lib/domain/schemas";
import {
  serviceStartsAt,
  priceBreakdown,
} from "@/lib/domain/reservation";
import { serverEnv, isDepositRequired } from "@/lib/env";
import { sendConfirmationDispatch } from "@/lib/notifications/dispatch";
import { auditInsert } from "@/lib/db/audit";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiError =
  | { code: "validation"; details: unknown }
  | { code: "closed_date" }
  | { code: "capacity_exceeded" }
  | { code: "reservations_closed" }
  | { code: "internal"; reason?: string };

export async function POST(req: NextRequest) {
  // 0. rate-limit: 5 booking attempts / IP / 10 min, plus 20 / IP / hour.
  // Bot floods + competitive seat-sniping both die here. Honeypot stays
  // active separately — bots that pass the rate cap also need a clean
  // `website` field. Retry-After header tells well-behaved clients when
  // to come back; bots ignore it and burn quota.
  const ipKey = clientKey(req, "reservations");
  const burst = limit("reservations:burst", ipKey, 5, 10 * 60 * 1000);
  if (!burst.ok) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: { code: "rate_limited" } }),
      { status: 429, headers: { ...rateLimitHeaders(burst), "Content-Type": "application/json" } }
    );
  }
  const hourly = limit("reservations:hourly", ipKey, 20, 60 * 60 * 1000);
  if (!hourly.ok) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: { code: "rate_limited" } }),
      { status: 429, headers: { ...rateLimitHeaders(hourly), "Content-Type": "application/json" } }
    );
  }

  // 1. parse + validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errJson({ code: "validation", details: "invalid_json" }, 400);
  }
  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    return errJson({ code: "validation", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  if (input.website && input.website.length > 0) {
    // Honeypot tripped. Pretend success for bot-tarpit.
    return NextResponse.json({ ok: true, fake: true }, { status: 200 });
  }

  const sb = adminClient();

  // 2. read settings (single row id=1)
  const { data: settings, error: settingsErr } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (settingsErr || !settings) {
    return errJson({ code: "internal", reason: "settings_missing" }, 500);
  }
  if (!settings.reservations_open) {
    return errJson({ code: "reservations_closed" }, 409);
  }

  // 3. price snapshot — menu-only totals on the reservation row (SVC + VAT
  //    are layered on at settlement / OR issuance, not here).
  //
  //    Codex review H3 fix: in the deposit-free flow the row must NOT carry
  //    a positive deposit_centavos / deposit_pct, otherwise the admin UI and
  //    the cancel route both think there's a Stripe payment to refund. Set
  //    deposit=0, balance=total, deposit_pct=0 so the row truthfully reflects
  //    "nothing has been charged, balance is the full course total".
  const depositRequired = isDepositRequired();
  const startsAt = serviceStartsAt(input.service_date, input.seating, settings);
  const breakdown = priceBreakdown(
    settings.course_price_centavos,
    input.party_size,
    settings.deposit_pct
  );
  const totalCentavos = settings.course_price_centavos * input.party_size;
  const deposit = depositRequired ? breakdown.deposit : 0;
  const balance = depositRequired ? breakdown.balance : totalCentavos;
  const depositPct = depositRequired ? settings.deposit_pct : 0;

  // pre-issue an id so we can use it in the cancel-token + Stripe metadata
  const reservationId = crypto.randomUUID();

  // P1-2 fix: bound token TTL to "service date + 7 days" instead of a flat 90 days,
  // so a leaked token from a forwarded email has a tight blast radius.
  const ttlSeconds =
    Math.max(
      Math.floor((startsAt.getTime() - Date.now()) / 1000) + 7 * 86_400,
      86_400 // floor: 24h, even for last-minute bookings
    );
  const tokenBundle = await issueCancelToken(reservationId, ttlSeconds);

  // 4. Atomic allocate + INSERT in a single transaction. The previous
  //    two-step flow (allocate then insert via two HTTP calls) released
  //    the FOR UPDATE lock between calls, allowing concurrent oversell.
  //    book_reservation_atomic() holds the lock until insert commits.
  //    The status defaults to 'pending_payment' for the deposit flow and
  //    is flipped to 'confirmed' up-front for the deposit-free flow so
  //    the row never enters the pending limbo / reaper sweep.
  const initialStatus = depositRequired ? "pending_payment" : "confirmed";
  const { data: bookedRow, error: bookErr } = await sb
    .rpc("book_reservation_atomic", {
      p_id: reservationId,
      p_service_date: input.service_date,
      p_seating: input.seating,
      p_service_starts_at: startsAt.toISOString(),
      p_party_size: input.party_size,
      p_guest_name: input.guest_name,
      p_guest_email: input.guest_email,
      p_guest_phone: input.guest_phone,
      p_guest_lang: input.guest_lang,
      p_notes: input.notes ?? null,
      p_course_price_centavos: settings.course_price_centavos,
      p_deposit_pct: depositPct,
      p_deposit_centavos: deposit,
      p_balance_centavos: balance,
      p_cancel_token_hash: tokenBundle.hash,
      p_cancel_token_expires_at: tokenBundle.expiresAt.toISOString(),
      p_source: "web",
      p_requested_seats: null,
      p_celebration: null,
      p_status: initialStatus,
    })
    .single<Reservation>();
  if (bookErr || !bookedRow) {
    if (bookErr?.message.includes("closed_date")) {
      return errJson({ code: "closed_date" }, 409);
    }
    if (bookErr?.message.includes("capacity_exceeded")) {
      return errJson({ code: "capacity_exceeded" }, 409);
    }
    return errJson({ code: "internal", reason: bookErr?.message ?? "book_failed" }, 500);
  }
  // seat_numbers is filled by the atomic RPC; surfaced for downstream
  // logging if needed (currently unused — Stripe metadata covers tracking).

  // 5a. Deposit-free path: row is already committed by the atomic RPC
  // above. Push the side effects (Telegram fan-out, email log, audit
  // insert) into the post-response phase via Next 16 after() so the
  // booking confirmation lands in <1s instead of waiting on 2x Telegram
  // round-trips + 3x notification_log inserts (~2.5-3s previously
  // measured on 2026-05-04). Failure of any of these is logged but does
  // NOT roll back the booking — the seat is already allocated.
  if (!depositRequired) {
    after(async () => {
      try {
        // E2E test 2026-05-02 fix (H1): pass our already-issued token
        // through so dispatch doesn't rotate the hash out from under us.
        await sendConfirmationDispatch(bookedRow, sb, {preIssuedToken: tokenBundle});
      } catch (err) {
        console.error("[reservations] sendConfirmationDispatch failed", err);
      }
      // E2E fix (H2): audit the deposit-free creation. The legacy Stripe
      // flow logged via the webhook's reservation.confirm action; with no
      // webhook in this path we'd have no audit trail otherwise.
      await auditInsert(sb, {
        actor: "system",
        reservation_id: reservationId,
        action: "reservation.confirm.deposit_free",
        after_data: {
          seating: input.seating,
          service_date: input.service_date,
          party_size: input.party_size,
          seat_numbers: bookedRow.seat_numbers,
        },
        reason: "deposit-free flow — auto-confirmed at booking time",
      });
    });
    return NextResponse.json(
      {
        ok: true,
        reservation_id: reservationId,
        cancel_token: tokenBundle.token,
        confirmed: true,
      },
      { status: 201 }
    );
  }

  // 5b. Deposit path: Stripe Checkout (PHP). Idempotent per reservation.
  const env = serverEnv();
  const successUrl = `${env.NEXT_PUBLIC_SITE_URL}/reservation/confirm?session_id={CHECKOUT_SESSION_ID}&rid=${reservationId}`;
  const cancelUrl = `${env.NEXT_PUBLIC_SITE_URL}/reservation/abandoned?rid=${reservationId}`;

  let checkoutUrl: string;
  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        currency: "php",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: input.guest_email,
        metadata: {
          reservation_id: reservationId,
          service_date: input.service_date,
          seating: input.seating,
          party_size: String(input.party_size),
        },
        payment_intent_data: {
          description: `DAIMASU 大桝 BAR — ${input.service_date} ${settings[input.seating === "s1" ? "seating_1_label" : "seating_2_label"]} (${input.party_size}p)`,
          metadata: { reservation_id: reservationId },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "php",
              product_data: {
                name: input.guest_lang === "ja" ? "DAIMASU 大桝 BAR — デポジット" : "DAIMASU 大桝 BAR — Deposit",
                description: `${input.party_size} × ₱${(settings.course_price_centavos / 100).toLocaleString()}  (${settings.deposit_pct}%)`,
              },
              unit_amount: toStripeAmount(deposit),
            },
          },
        ],
        // 30 min hold — anything beyond and the slot is reaped.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        locale: input.guest_lang === "ja" ? "ja" : "en",
      },
      {
        idempotencyKey: `res:${reservationId}:checkout:v1`,
      }
    );
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    checkoutUrl = session.url;

    // Persist the Stripe session id so /api/cron/reap-pending can verify the
    // session is truly expired before flipping status (audit fix C-3).
    await sb
      .from("reservations")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", reservationId);
  } catch (err) {
    // Roll back the half-built reservation so the seat returns to the pool.
    await sb.from("reservations").delete().eq("id", reservationId);
    return errJson(
      { code: "internal", reason: err instanceof Error ? err.message : "stripe_failed" },
      502
    );
  }

  // Best-effort: token expiry mirrored from JWT exp
  return NextResponse.json(
    {
      ok: true,
      reservation_id: reservationId,
      checkout_url: checkoutUrl,
      cancel_token: tokenBundle.token, // returned ONCE; client may store in localStorage as a backup
    },
    { status: 201 }
  );
}

function errJson(error: ApiError, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}
