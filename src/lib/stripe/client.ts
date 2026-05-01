/**
 * Stripe SDK singleton + helper for idempotent operations.
 * Anti-goal #1: every charge / refund must use idempotency_key.
 */
import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) {
    // Should never reach this branch in production: every caller is gated
    // by isDepositRequired() before touching the Stripe client. If it does
    // fire, the env is misconfigured (deposit flow on, key missing) and we
    // want to fail loud rather than send a malformed Stripe call.
    throw new Error(
      "STRIPE_SECRET_KEY is unset but the deposit flow attempted to call Stripe. " +
        "Either set RESERVATIONS_DEPOSIT_REQUIRED=false or provide the key."
    );
  }
  cached = new Stripe(key, {
    // Pin API version; bumping this is an Orange-tier action (potential
    // breakage of webhook payload shape).
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
}

/** Format PHP centavos into Stripe `unit_amount`. Stripe uses smallest currency unit. */
export function toStripeAmount(centavos: number): number {
  return centavos;
}
