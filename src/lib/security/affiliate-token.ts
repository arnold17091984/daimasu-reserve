/**
 * Signed attribution token shared between affiliate and reserve.
 *
 * The /r/[slug] route used to set a raw `daimasu_aff_slug=<slug>`
 * cookie. Reserve trusted it, which meant anyone could open devtools,
 * paste a slug, and earn commission on every reservation they made.
 *
 * Tokens are now HMAC-signed with AFFILIATE_S2S_SECRET (the same
 * shared secret both apps already use to sign webhooks). The token
 * carries the slug, an issue timestamp, a 30-day expiry, and a random
 * nonce so a captured token can't be replayed indefinitely.
 *
 * Encoding is `<payload-b64url>.<signature-b64url>`. Compact, no JWT
 * dependency, and the verifier uses constant-time comparison.
 *
 * Both apps include this file (kept identical via copy-paste because
 * the codebases don't share a workspace package).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_ENV = "AFFILIATE_S2S_SECRET";
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AffiliateTokenPayload {
  v: number;
  slug: string;
  iat: number; // issued-at (epoch seconds)
  exp: number; // expiry (epoch seconds)
  nonce: string;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s || s.length < 32) {
    throw new Error(`${SECRET_ENV} not configured (need >= 32 chars)`);
  }
  return s;
}

export function signAffiliateToken(
  slug: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AffiliateTokenPayload = {
    v: TOKEN_VERSION,
    slug,
    iat: now,
    exp: now + ttlSeconds,
    nonce: randomBytes(8).toString("hex"),
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = b64urlEncode(
    createHmac("sha256", getSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

/**
 * Verify a signed attribution token. Returns the slug on success, or
 * null if the token is missing, malformed, expired, or signed with a
 * different secret. Constant-time signature comparison.
 */
export function verifyAffiliateToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  let expected: Buffer;
  try {
    expected = createHmac("sha256", getSecret()).update(body).digest();
  } catch {
    return null;
  }
  let actual: Buffer;
  try {
    actual = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  let payload: AffiliateTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as AffiliateTokenPayload;
  } catch {
    return null;
  }
  if (payload.v !== TOKEN_VERSION) return null;
  if (typeof payload.slug !== "string" || payload.slug.length === 0) return null;
  if (typeof payload.exp !== "number") return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload.slug;
}
