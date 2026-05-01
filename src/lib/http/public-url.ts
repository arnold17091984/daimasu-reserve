import "server-only";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

// Build an absolute URL behind a reverse proxy. Prefers NEXT_PUBLIC_SITE_URL,
// falls back to forwarded headers, finally to req.url for local dev.
// Without this, Next.js 16's req.url resolves to the listen host (localhost:3001),
// which would send the user's browser to a non-public URL.
export function publicUrl(req: NextRequest, path: string): string {
  const fromEnv = serverEnv().NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return new URL(path, fromEnv).toString();
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost ? `${proto}://${forwardedHost}` : req.url;
  return new URL(path, base).toString();
}
