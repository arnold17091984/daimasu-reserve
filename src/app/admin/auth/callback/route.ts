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
    return NextResponse.redirect(publicUrl(req, "/admin"));
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
  return NextResponse.redirect(publicUrl(req, "/admin"));
}
