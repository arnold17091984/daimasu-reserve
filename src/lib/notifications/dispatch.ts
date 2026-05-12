/**
 * sendConfirmationDispatch — fire the guest confirmation email and the
 * admin Telegram ping for a freshly-confirmed reservation.
 *
 * Extracted from /api/webhooks/stripe so the deposit-free path
 * (RESERVATIONS_DEPOSIT_REQUIRED=false) can call the same code from
 * /api/reservations directly. The Stripe webhook still calls this after
 * the payment-success branch flips the row to `confirmed`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { issueCancelToken } from "@/lib/security/cancel-token";
import {
  renderConfirmEmail,
  renderOwnerNewBookingEmail,
  renderTelegramConfirm,
} from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/email";
import { notifyTelegram } from "@/lib/notifications/telegram";
import { CONTACT } from "@/lib/constants";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

type SbClient = SupabaseClient;

export interface DispatchOptions {
  /**
   * Pass a token that was just issued by the caller (deposit-free flow:
   * route.ts already issued one before calling this dispatcher) so we can
   * skip the rotation step and let the caller's response carry a token
   * that's actually valid against the DB hash. If omitted, a fresh token
   * is issued (legacy: webhook-driven dispatch on the Stripe path, which
   * runs after the API response was already sent so rotation is fine).
   */
  preIssuedToken?: { token: string; hash: string; expiresAt: Date };
}

/**
 * Send the guest confirmation email + admin Telegram ping. Returns the
 * canonical token bundle so deposit-free callers can return it to the
 * client (E2E test 2026-05-02 fix for the cancel-token rotation desync —
 * previously this rotated the hash, invalidating the token route.ts had
 * already returned to the browser, breaking the localStorage backup).
 *
 * Idempotent on the email side via Resend's idempotencyKey
 * (`email:confirm:<reservation.id>`).
 */
export async function sendConfirmationDispatch(
  reservation: Reservation,
  sb: SbClient,
  opts: DispatchOptions = {}
): Promise<{token: string; expiresAt: Date}> {
  const env = serverEnv();
  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) {
    // Without settings we can't render the email or ping Telegram. Surface
    // a token so the caller's response is still cancellable; whichever
    // token the caller passed in is already in DB, so reuse it.
    if (opts.preIssuedToken) {
      return {token: opts.preIssuedToken.token, expiresAt: opts.preIssuedToken.expiresAt};
    }
    const fresh = await issueCancelToken(reservation.id);
    return {token: fresh.token, expiresAt: fresh.expiresAt};
  }

  const canonical = opts.preIssuedToken ?? (await issueCancelToken(reservation.id));
  // Only need to rotate the DB hash when the caller did NOT pre-issue
  // (otherwise route.ts has already written the same hash via book_*).
  if (!opts.preIssuedToken) {
    await sb
      .from("reservations")
      .update({
        cancel_token_hash: canonical.hash,
        cancel_token_expires_at: canonical.expiresAt.toISOString(),
      })
      .eq("id", reservation.id);
  }

  const cancelUrl = `${env.NEXT_PUBLIC_SITE_URL}/cancel?token=${encodeURIComponent(canonical.token)}`;
  const { subject, html } = renderConfirmEmail({
    reservation,
    settings,
    cancelUrl,
  });

  const emailRes = await sendEmail({
    to: reservation.guest_email,
    subject,
    html,
    idempotencyKey: `email:confirm:${reservation.id}`,
    log: { reservation_id: reservation.id, kind: "guest_confirm" },
  });

  // E2E fix: don't escalate when the email is intentionally skipped
  // (RESEND_API_KEY not configured) — that would spam the operator with
  // "FAILED" alerts on every booking under the email-disabled deployment.
  if (!emailRes.ok && !emailRes.skipped) {
    await notifyTelegram({
      text: `<b>⚠ Confirmation email FAILED</b>\nReservation: <code>${reservation.id}</code>\nGuest: ${reservation.guest_name} &lt;${reservation.guest_email}&gt;\nReason: ${emailRes.error}`,
      tokenOverride: settings.telegram_bot_token,
      chatIdOverride: settings.telegram_chat_id,
      log: { reservation_id: reservation.id, kind: "admin_alert" },
    });
  }

  await notifyTelegram({
    text: renderTelegramConfirm(reservation),
    tokenOverride: settings.telegram_bot_token,
    chatIdOverride: settings.telegram_chat_id,
    log: { reservation_id: reservation.id, kind: "admin_alert" },
  });

  // Owner-side email alert (2026-05-12): adds an email channel alongside
  // Telegram so the operator gets a copy in their Gmail. Compact ops
  // template (separate from the guest's pretty confirmation). Failure
  // is non-fatal — booking is already committed and the guest email +
  // Telegram likely already succeeded.
  if (CONTACT.email && CONTACT.email !== reservation.guest_email) {
    const owner = renderOwnerNewBookingEmail(reservation);
    await sendEmail({
      to: CONTACT.email,
      subject: owner.subject,
      html: owner.html,
      idempotencyKey: `email:owner-alert:${reservation.id}`,
      log: { reservation_id: reservation.id, kind: "admin_alert" },
    });
  }

  return {token: canonical.token, expiresAt: canonical.expiresAt};
}
