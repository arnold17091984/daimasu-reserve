/**
 * Bearer-token guard for /api/cron/* endpoints.
 *
 * Constant-time comparison so timing attacks can't leak the secret length.
 * Configure pg_cron jobs with `Authorization: Bearer <CRON_SHARED_SECRET>`.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

export function verifyCronAuth(authorizationHeader: string | null): boolean {
  if (!authorizationHeader) return false;
  const expected = `Bearer ${serverEnv().CRON_SHARED_SECRET}`;
  const got = authorizationHeader;
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}
