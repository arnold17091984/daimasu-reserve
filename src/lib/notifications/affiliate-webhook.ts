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
 * Delivery: the call is retried up to 3 times with backoff (the receiver
 * is idempotent — keyed on the reservation id). A settlement must never
 * be blocked or rolled back by the affiliate app being down, so the
 * final failure is NOT thrown; instead it is recorded durably in
 * audit_log (`affiliate.webhook.failed`) so an admin can detect a stuck
 * commission and replay it. This keeps a durable trail without a full
 * outbox/worker — sufficient for the single-bar deployment.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { adminClient } from "@/lib/db/clients";
import { auditInsert } from "@/lib/db/audit";

export type AffiliateEvent =
  | {
      event: "reservation.settled";
      reservation_id: string;
      affiliate_link_slug: string | null;
      affiliate_coupon_code: string | null;
      settlement_centavos: number;
      guest_name: string;
      guest_phone: string | null;
      service_date: string;
      occurred_at: string;
    }
  | {
      event: "reservation.no_show";
      reservation_id: string;
      affiliate_link_slug: string | null;
      affiliate_coupon_code: string | null;
      guest_name: string;
      guest_phone: string | null;
      service_date: string;
      occurred_at: string;
    };

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST a signed affiliate event. No-ops silently when the integration
 * isn't configured (no URL / no secret) or the reservation carries no
 * affiliate attribution. Safe to call unconditionally from settle /
 * no-show handlers — best invoked via after() so the response is not
 * blocked on the retry loop.
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

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
        if (res.ok) return; // delivered
        lastError = `non-2xx ${res.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    console.warn(
      "[affiliate-webhook] attempt failed",
      event.event,
      event.reservation_id,
      `${attempt}/${MAX_ATTEMPTS}`,
      lastError
    );
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }

  // All attempts exhausted. The settlement itself is already committed;
  // record a durable, admin-visible failure so the commission can be
  // reconciled / the webhook replayed manually.
  try {
    await auditInsert(adminClient(), {
      actor: "system",
      reservation_id: event.reservation_id,
      action: "affiliate.webhook.failed",
      after_data: {
        event: event.event,
        affiliate_link_slug: event.affiliate_link_slug,
        affiliate_coupon_code: event.affiliate_coupon_code,
        last_error: lastError,
      },
      reason: `affiliate webhook delivery failed after ${MAX_ATTEMPTS} attempts — needs manual replay`,
    });
  } catch (err) {
    console.error(
      "[affiliate-webhook] failed to record delivery failure in audit_log",
      event.reservation_id,
      err
    );
  }
}

/**
 * Attribution payload — fired the moment a public-flow reservation is
 * created carrying an affiliate slug (cookie or query). Tells affiliate
 * to create the Booking mirror so the later settle webhook updates an
 * existing row instead of orphaning.
 *
 * Derived URL: AFFILIATE_WEBHOOK_URL minus its trailing path component
 * (".../reserve-settled") joined with "reserve-attribution". This keeps
 * the integration to a single env var.
 */
export type AffiliateAttributionEvent = {
  event: "reservation.attributed";
  reservation_id: string;
  affiliate_link_slug: string;
  guest_name: string;
  guest_phone: string | null;
  party_size: number;
  reserved_for: string;
  occurred_at: string;
};

function deriveAttributionUrl(settledUrl: string): string {
  // settledUrl ends with "/reserve-settled"; swap for "/reserve-attribution".
  return settledUrl.replace(/\/reserve-settled\/?$/, "/reserve-attribution");
}

export async function notifyAffiliateAttribution(args: {
  readonly reservationId: string;
  readonly slug: string;
  readonly guestName: string;
  readonly guestPhone: string | null;
  readonly partySize: number;
  readonly reservedFor: string;
}): Promise<void> {
  const env = serverEnv();
  const url = env.AFFILIATE_WEBHOOK_URL;
  const secret = env.AFFILIATE_S2S_SECRET;
  if (!url || !secret) return;

  const event: AffiliateAttributionEvent = {
    event: "reservation.attributed",
    reservation_id: args.reservationId,
    affiliate_link_slug: args.slug,
    guest_name: args.guestName,
    guest_phone: args.guestPhone,
    party_size: args.partySize,
    reserved_for: args.reservedFor,
    occurred_at: new Date().toISOString(),
  };
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const target = deriveAttributionUrl(url);

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Affiliate-Signature": signature,
          },
          body,
          signal: controller.signal,
        });
        if (res.ok) return;
        lastError = `non-2xx ${res.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    console.warn(
      "[affiliate-attribution] attempt failed",
      args.reservationId,
      `${attempt}/${MAX_ATTEMPTS}`,
      lastError,
    );
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }

  // Settle webhook will still fire later and the receiver self-heals if
  // no Booking mirror exists. We still log the failure for visibility.
  try {
    await auditInsert(adminClient(), {
      actor: "system",
      reservation_id: args.reservationId,
      action: "affiliate.attribution.failed",
      after_data: {
        slug: args.slug,
        last_error: lastError,
      },
      reason: `affiliate-attribution delivery failed after ${MAX_ATTEMPTS} attempts`,
    });
  } catch (err) {
    console.error(
      "[affiliate-attribution] failed to record delivery failure",
      args.reservationId,
      err,
    );
  }
}
