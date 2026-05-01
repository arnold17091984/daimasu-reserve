/**
 * Admin auth helpers.
 *
 * Two layers:
 *  1. Supabase Auth (magic link) — user has a JWT.
 *  2. admin_owners allowlist — DB-side check that the JWT email is allowed.
 *
 * Both server components and route handlers go through requireAdminOrRedirect
 * (or requireAdminOrJson) at their top.
 */
import "server-only";
import { redirect } from "next/navigation";
import { authedServerClient } from "@/lib/db/clients";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
}

/** Returns the admin user, or null if not signed in / not allowlisted. */
export async function getAdmin(): Promise<AdminUser | null> {
  const sb = await authedServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !user.email) return null;
  // Belt-and-braces: refuse unconfirmed magic-link sessions (audit fix P2-3).
  if (!user.email_confirmed_at) return null;

  // Exact, case-insensitive match — `admin_owners.email` is `citext`. Avoid
  // `.ilike` so SQL pattern wildcards in an attacker's email cannot match
  // adjacent rows (audit fix C-2).
  const { data: row } = await sb
    .from("admin_owners")
    .select("email,display_name")
    .eq("email", user.email.trim().toLowerCase())
    .maybeSingle<{ email: string; display_name: string | null }>();
  if (!row) return null;
  return { id: user.id, email: row.email, display_name: row.display_name };
}

/** Use in server components — redirects to /admin/login if not signed in. */
export async function requireAdminOrRedirect(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
