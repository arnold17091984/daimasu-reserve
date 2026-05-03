/**
 * Magic-link redirect handler. Exchanges the auth code for a session cookie,
 * then redirects to /admin (or /admin/login if the user isn't allowlisted).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authedServerClient } from "@/lib/db/clients";
import { publicUrl } from "@/lib/http/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  // Optional ?next= path — used by the password-reset flow to land the
  // authenticated user on /admin/auth/reset-password instead of /admin.
  // Restricted to in-site paths so an open-redirect via the reset email
  // is not possible.
  const rawNext = params.get("next");
  const safeNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  // For password-reset emails specifically we *always* want to land on
  // the reset form, regardless of whether ?next= was preserved by the
  // mail client.
  const successPath =
    type === "recovery"
      ? safeNext ?? "/admin/auth/reset-password"
      : safeNext ?? "/admin";

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
    return NextResponse.redirect(publicUrl(req, successPath));
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
  return NextResponse.redirect(publicUrl(req, successPath));
}
