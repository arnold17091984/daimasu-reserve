/**
 * Outbound webhook to the cast-affiliate app.
 *
 * When a reservation that carries an `affiliate_link_slug` reaches a
 * terminal lifecycle event (settled or no-show), the affiliate app needs
 * to know so it can confirm — or withhold — the referring cast's
 * commission. The affiliate app cannot watch this DB, so reserve pushes
 * a signed event to AFFILIATE_WEBHOOK_URL.
 *
 * The body is signed with HMAC-SHA256 over the raw JSON using
 * AFFILIATE_S2S_SECRET (the same shared secret the affiliate app uses to
 * call POST /api/reservations). The affiliate receiver re-computes the
 * digest and constant-time-compares before trusting the payload.
 *
 * Fire-and-forget: failures are logged, never thrown — a settlement must
 * never be blocked by the affiliate app being down. Reconciliation for a
 * missed webhook is a separate concern (out of scope for v1).
 */
import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env";

export type AffiliateEvent =
  | {
      event: "reservation.settled";
      reservation_id: string;
      affiliate_link_slug: string | null;
      affiliate_coupon_code: string | null;
      settlement_centavos: number;
      guest_name: string;
      service_date: string;
      occurred_at: string;
    }
  | {
      event: "reservation.no_show";
      reservation_id: string;
      affiliate_link_slug: string | null;
      affiliate_coupon_code: string | null;
      guest_name: string;
      service_date: string;
      occurred_at: string;
    };

/**
 * POST a signed affiliate event. No-ops silently when the integration
 * isn't configured (no URL / no secret) or the reservation carries no
 * affiliate attribution. Safe to call unconditionally from settle /
 * no-show handlers.
 */
export async function notifyAffiliate(event: AffiliateEvent): Promise<void> {
  // Nothing to attribute — skip without touching the network.
  if (!event.affiliate_link_slug && !event.affiliate_coupon_code) return;

  const env = serverEnv();
  const url = env.AFFILIATE_WEBHOOK_URL;
  const secret = env.AFFILIATE_S2S_SECRET;
  if (!url || !secret) return;

  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Affiliate-Signature": signature,
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(
          "[affiliate-webhook] non-2xx",
          event.event,
          event.reservation_id,
          res.status
        );
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Affiliate app down / network blip — log and move on. The
    // settlement itself is already committed.
    console.warn(
      "[affiliate-webhook] send failed",
      event.event,
      event.reservation_id,
      err instanceof Error ? err.message : String(err)
    );
  }
}
