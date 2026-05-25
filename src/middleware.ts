import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const AFFILIATE_COOKIE = "daimasu_aff_token";
const AFFILIATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Middleware has two responsibilities:
 *
 *  1. (Admin only) Refresh the Supabase session on every admin
 *     request. Without this, when the 1-hour access token expires,
 *     server components can no longer persist a refreshed token
 *     (Next.js disallows cookie writes from RSC).
 *
 *  2. (Public path) Convert the `?aff_token=` query param into a
 *     server-readable cookie when a guest lands on reserve via the
 *     affiliate /r/[slug] redirect. The token is a signed HMAC so a
 *     malicious caller can't fabricate one without the shared secret;
 *     verification happens at the booking handler (see
 *     /api/reservations). Middleware only stages the cookie + strips
 *     the query so the URL the guest sees is clean.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");

  // — Affiliate handoff —
  // Only applied on non-admin paths; admins shouldn't accidentally
  // attribute themselves by tail-pasting a link. Also skip any route
  // serving an .ext file (favicon, opengraph image, etc).
  if (!isAdmin) {
    const token = request.nextUrl.searchParams.get("aff_token");
    if (token) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("aff_token");
      const res = NextResponse.redirect(cleanUrl);
      res.cookies.set({
        name: AFFILIATE_COOKIE,
        value: token,
        path: "/",
        maxAge: AFFILIATE_COOKIE_MAX_AGE,
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      });
      return res;
    }
  }

  let response = NextResponse.next({ request });

  if (!isAdmin) return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Trigger refresh if the access token is near/past expiry.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Admin paths (session refresh) + public root (affiliate handoff).
  // The handoff check has to run on the path the affiliate redirects
  // to — currently the homepage — so we match it there.
  matcher: ["/admin/:path*", "/"],
};
