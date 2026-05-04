/**
 * POST /admin/auth/reset-password/finish — clears the recovery-session
 * lock cookie set by the magic-link callback after the user successfully
 * updated their password.
 *
 * Codex review 2026-05-04 H2 fix companion: keeps the cookie clearing
 * server-side so the (httpOnly) lock can actually be removed. The client
 * form calls this immediately after sb.auth.updateUser() resolves.
 */
import { NextResponse } from "next/server";
import { RECOVERY_LOCK_COOKIE } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(RECOVERY_LOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
