/**
 * Supabase clients — three flavors used across the app.
 *
 * 1. service-role (server only)  — bypasses RLS. ONLY for trusted code paths.
 * 2. server-bound user client    — cookie-bound, honors RLS for /admin.
 * 3. browser client              — anon key, public reads only.
 *
 * The Database generic is OFF for now: supabase-js v2.105 has a complex
 * conditional type that doesn't accept hand-rolled Database shapes for all
 * operations. Once `pnpm supabase gen types typescript --linked` runs, the
 * generated types pass the constraint cleanly and we can re-enable.
 *
 * Trade-off: no autocomplete on `.from('reservations')`. We compensate by
 * casting `.select<T>()` and `.single<T>()` callers to our domain types
 * (see src/lib/db/types.ts). Inserts go through zod-validated input objects.
 */
import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

/** Service-role client. Use sparingly; bypasses RLS. */
export function adminClient(): SupabaseClient {
  const env = serverEnv();
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

/** Cookie-bound server client — used in /admin route handlers and server components. */
export async function authedServerClient(): Promise<SupabaseClient> {
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value, options } of toSet) {
            cookieStore.set({ name, value, ...options });
          }
        },
      },
    }
  );
}
