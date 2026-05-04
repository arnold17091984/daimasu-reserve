/**
 * Magic-link / password-reset redirect handler. Exchanges the auth code or
 * token_hash for a session cookie, then redirects to /admin (or to the safe
 * `next` path if one was provided).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authedServerClient } from "@/lib/db/clients";
import { publicUrl } from "@/lib/http/public-url";
import { RECOVERY_LOCK_COOKIE } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Codex review 2026-05-04 H1 fix: parse the next= param through the WHATWG
 * URL constructor to catch open-redirect tricks the previous startsWith
 * check missed (most importantly `\evil.com`, which the URL parser
 * normalises into a host-bearing absolute URL).
 *
 * Returns null for anything that isn't a clean in-site path.
 */
function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;        // must be a relative path
  if (raw.startsWith("//")) return null;        // protocol-relative
  if (raw.includes("\\")) return null;          // backslash → URL parser may host-promote
  if (raw.toLowerCase().includes("javascript:")) return null;
  // Final defence: round-trip through URL constructor and verify the origin
  // didn't move. If the origin shifts away from the synthetic base, the
  // path was a host-bearing string in disguise.
  const base = "https://__synthetic.invalid__";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  return `${url.pathname}${url.search}`;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const safeNext = safeRedirectPath(params.get("next"));

  // For password-reset emails specifically we *always* want to land on
  // the reset form, regardless of whether next= was preserved by the
  // mail client.
  const successPath =
    type === "recovery"
      ? safeNext ?? "/admin/auth/reset-password"
      : safeNext ?? "/admin";

  // Codex review 2026-05-04 H2 fix: when this callback was reached via a
  // recovery email, lock the resulting session to the password-set page
  // until updateUser() succeeds. Without this, anyone clicking a leaked /
  // forwarded reset link would land in /admin with a fully usable session.
  function attachRecoveryLock(res: NextResponse): NextResponse {
    if (type === "recovery") {
      res.cookies.set(RECOVERY_LOCK_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        // 15 min to set a password; longer than the typical workflow but
        // short enough that a forgotten browser tab is auto-released.
        maxAge: 15 * 60,
      });
    }
    return res;
  }

  // Branch 1: token_hash flow (no PKCE — works across browsers & for admin-issued links).
  if (tokenHash && type) {
    const sb = await authedServerClient();
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email" | "recovery" | "invite" | "signup",
    });
    if (error) {
      return NextResponse.redirect(
        publicUrl(req, `/admin/login?error=${encodeURIComponent(error.message)}`)
      );
    }
    return attachRecoveryLock(NextResponse.redirect(publicUrl(req, successPath)));
  }

  // Branch 2: legacy PKCE code flow.
  if (!code) {
    return NextResponse.redirect(publicUrl(req, "/admin/login?error=missing_code"));
  }
  const sb = await authedServerClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      publicUrl(req, `/admin/login?error=${encodeURIComponent(error.message)}`)
    );
  }
  return attachRecoveryLock(NextResponse.redirect(publicUrl(req, successPath)));
}
