/**
 * Self-cancel token: HMAC-signed JWT with short TTL.
 * Anti-goal #2: nobody but the booking owner can cancel via the link.
 *
 * Token shape: jose-encoded JWS with `{ rid, exp }` payload.
 * Stored on reservations.cancel_token_hash = sha256(token + secret) so that
 * even with DB read access an attacker cannot reconstruct the raw token.
 */
import "server-only";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

const ALG = "HS256";

function key(): Uint8Array {
  return new TextEncoder().encode(serverEnv().CANCEL_TOKEN_SECRET);
}

export interface CancelTokenPayload {
  rid: string; // reservation id
}

export async function issueCancelToken(
  reservationId: string,
  ttlSeconds = 60 * 60 * 24 * 90 // 90 days — covers the longest possible booking lead time
): Promise<{ token: string; hash: string; expiresAt: Date }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ rid: reservationId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key());
  const hash = sha256Hash(token);
  return { token, hash, expiresAt: new Date(exp * 1000) };
}

export async function verifyCancelToken(
  token: string
): Promise<{ ok: true; rid: string } | { ok: false; reason: string }> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    if (typeof payload.rid !== "string") {
      return { ok: false, reason: "missing_rid" };
    }
    return { ok: true, rid: payload.rid };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: "expired" };
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: "bad_signature" };
    }
    return { ok: false, reason: "invalid" };
  }
}

/**
 * Check that the supplied token matches the hash stored on the reservation.
 * Callers MUST also verify the JWT signature (verifyCancelToken).
 */
export function tokenMatchesHash(token: string, expectedHash: string): boolean {
  return sha256Hash(token) === expectedHash;
}

function sha256Hash(input: string): string {
  // Domain-separate from raw token by mixing the secret. Defense-in-depth: even
  // a DB read leak doesn't yield usable tokens without the secret.
  return createHash("sha256")
    .update(input)
    .update("\x00")
    .update(serverEnv().CANCEL_TOKEN_SECRET)
    .digest("hex");
}
