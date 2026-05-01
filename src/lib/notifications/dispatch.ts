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
  renderTelegramConfirm,
} from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/email";
import { notifyTelegram } from "@/lib/notifications/telegram";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

type SbClient = SupabaseClient;

/**
 * Re-issue the cancel token (so the email's bearer link is canonical),
 * send the confirmation email, then admin Telegram ping. Errors on the
 * email path escalate to Telegram so the operator can manually re-send.
 *
 * Idempotent on the email side via Resend's idempotencyKey
 * (`email:confirm:<reservation.id>`).
 */
export async function sendConfirmationDispatch(
  reservation: Reservation,
  sb: SbClient
): Promise<void> {
  const env = serverEnv();
  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) return;

  const fresh = await issueCancelToken(reservation.id);
  await sb
    .from("reservations")
    .update({
      cancel_token_hash: fresh.hash,
      cancel_token_expires_at: fresh.expiresAt.toISOString(),
    })
    .eq("id", reservation.id);

  const cancelUrl = `${env.NEXT_PUBLIC_SITE_URL}/cancel?token=${encodeURIComponent(fresh.token)}`;
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

  if (!emailRes.ok) {
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
}
