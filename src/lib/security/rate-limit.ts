/**
 * In-memory sliding-window rate limiter.
 *
 * Designed for the single-VM Vultr deployment — keeps state in process
 * memory. If/when the app moves to multi-instance, swap the backing
 * store for Upstash Redis or Supabase (the limit() signature is the
 * abstraction point). Until then, an LRU map is enough to absorb
 * booking-form spam (a real-world DAIMASU peak is ≪ 100 req/sec).
 *
 * Why not a token-bucket: sliding window gives a tighter bound on
 * burst behaviour, which is what we want for "no more than 5
 * reservation attempts from one IP in 10 minutes" — bursts are exactly
 * the failure mode honeypot misses.
 */
import "server-only";
import type { NextRequest } from "next/server";

interface Entry {
  /** Unix-ms timestamps of recent hits inside the window. */
  hits: number[];
}

interface Bucket {
  /** Cap on number of hits per window. */
  max: number;
  /** Window length in ms. */
  windowMs: number;
  /** Per-key state. Cleaned lazily; cap size with `maxEntries`. */
  store: Map<string, Entry>;
  /** Hard cap on distinct keys to prevent memory growth on a flood. */
  maxEntries: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(name: string, max: number, windowMs: number, maxEntries = 10_000): Bucket {
  let b = buckets.get(name);
  if (!b) {
    b = { max, windowMs, store: new Map(), maxEntries };
    buckets.set(name, b);
  }
  return b;
}

/**
 * Resolve client IP from x-forwarded-for / x-real-ip / x-vercel-forwarded-for.
 * The Vultr nginx terminator forwards the real IP via x-forwarded-for.
 * Fallback to a fixed string so the limiter still applies during local dev.
 */
export function clientKey(req: NextRequest, scope: string): string {
  const xff = req.headers.get("x-forwarded-for");
  const ip =
    (xff && xff.split(",")[0]?.trim()) ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

interface LimitResult {
  /** True iff the call is allowed. */
  ok: boolean;
  /** Remaining hits in this window after this call (>= 0). */
  remaining: number;
  /** When the oldest hit in the window will expire (Unix ms). */
  resetAt: number;
  /** Cap configured for the bucket. */
  limit: number;
}

/**
 * Increment + check. Returns ok=false when the caller already used up
 * `max` hits inside the past `windowMs` milliseconds.
 *
 * The hit is recorded only when ok=true — otherwise an attacker could
 * extend their own block by retrying through the limiter.
 */
export function limit(
  bucketName: string,
  key: string,
  max: number,
  windowMs: number
): LimitResult {
  const b = getBucket(bucketName, max, windowMs);
  const now = Date.now();
  const cutoff = now - windowMs;

  // Lazy maxEntries trim — drop the oldest 25% when over cap.
  if (b.store.size >= b.maxEntries) {
    const trimTarget = Math.floor(b.maxEntries * 0.75);
    const keys = Array.from(b.store.keys());
    for (let i = 0; i < keys.length - trimTarget; i++) {
      b.store.delete(keys[i]);
    }
  }

  let entry = b.store.get(key);
  if (!entry) {
    entry = { hits: [] };
    b.store.set(key, entry);
  }

  entry.hits = entry.hits.filter((t) => t > cutoff);

  if (entry.hits.length >= b.max) {
    const oldest = entry.hits[0];
    return {
      ok: false,
      remaining: 0,
      resetAt: oldest + windowMs,
      limit: b.max,
    };
  }

  entry.hits.push(now);
  return {
    ok: true,
    remaining: b.max - entry.hits.length,
    resetAt: now + windowMs,
    limit: b.max,
  };
}

/** Format the standard rate-limit headers for an HTTP response. */
export function rateLimitHeaders(r: LimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
    ...(r.ok ? {} : { "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) }),
  };
}
