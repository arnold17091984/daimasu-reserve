import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refresh the Supabase session on every admin request. Without this, when the
// 1-hour access token expires, server components can no longer persist a refreshed
// token (Next.js disallows cookie writes from RSC), and the user is silently
// logged out. Middleware runs before any handler and can write Set-Cookie freely,
// so this is the canonical place to keep the session warm.
//
// See: https://supabase.com/docs/guides/auth/server-side/nextjs
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
  // Only run on admin paths — public reservation pages don't need session refresh.
  matcher: ["/admin/:path*"],
};
