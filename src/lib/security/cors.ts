/**
 * Cross-origin booking helpers.
 *
 * The public Reserve API is normally same-origin (called from the booking
 * form at reserve.daimasu.com.ph), but the marketing site at
 * daimasu.com.ph also posts Restaurant reservations here. That cross-origin
 * POST needs an explicit CORS allowlist — the browser strips the response
 * otherwise.
 *
 * The allowlist comes from RESERVATIONS_ALLOWED_ORIGINS so it stays
 * deployment-tunable. Each entry is matched verbatim against the incoming
 * `Origin` header; we deliberately do NOT echo arbitrary origins to dodge
 * the "Access-Control-Allow-Origin: *" + cookies misconfig footgun.
 */
import { serverEnv } from "@/lib/env";
import type { NextRequest } from "next/server";

/**
 * Resolve the Access-Control-Allow-Origin value for this request.
 * Returns the matched origin (so browser pins ACAO to it), or null when
 * the request did not present a recognised cross-origin Origin header.
 * Same-origin requests typically omit Origin entirely — return null so
 * we leave ACAO unset (the browser doesn't need it).
 */
export function resolveAllowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = serverEnv().RESERVATIONS_ALLOWED_ORIGINS;
  return allowed.includes(origin) ? origin : null;
}

/**
 * Build the CORS response headers for a successful preflight or actual
 * response. Returns an empty object when the origin isn't allowed so the
 * caller doesn't accidentally relax ACAO.
 */
export function corsHeaders(
  req: NextRequest,
  extras: Record<string, string> = {}
): Record<string, string> {
  const origin = resolveAllowedOrigin(req);
  if (!origin) return extras;
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    ...extras,
  };
}

/**
 * Standard preflight (OPTIONS) response. Returns 204 + the appropriate
 * CORS headers, or 403 when the origin is not in the allowlist.
 */
export function preflight(req: NextRequest): Response {
  const origin = resolveAllowedOrigin(req);
  if (!origin) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}
