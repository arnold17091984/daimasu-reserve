/**
 * Admin auth helpers.
 *
 * Two layers:
 *  1. Supabase Auth — user has a JWT (set by sign-in or recovery callback).
 *  2. admin_owners allowlist — DB-side check that the JWT email is allowed.
 *
 * Plus, a recovery-session lock (Codex review 2026-05-04 H2 fix):
 * after the reset-password callback establishes a session, the user is
 * confined to /admin/auth/reset-password until they actually set a new
 * password. Without this, anyone who intercepts a reset link (legit
 * forwarded email, exposed inbox, etc.) gets full admin access just for
 * clicking — without ever proving they remember or chose a password.
 *
 * Both server components and route handlers go through requireAdminOrRedirect
 * (or requireAdminOrJson) at their top.
 */
import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authedServerClient } from "@/lib/db/clients";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
}

/** Cookie name for the recovery-session lock (see top-of-file rationale). */
export const RECOVERY_LOCK_COOKIE = "daimasu_admin_recovery";

/**
 * Returns the admin user, or null if not signed in / not allowlisted /
 * still inside a recovery-only session.
 */
export async function getAdmin(): Promise<AdminUser | null> {
  // Recovery lock: callers other than the reset-password page itself
  // observe `null` until the lock cookie is cleared. We can't easily know
  // the requested pathname here, so a separate `getAdminAllowingRecovery`
  // export lets the reset-password page bypass the lock.
  const ck = await cookies();
  if (ck.get(RECOVERY_LOCK_COOKIE)?.value === "1") return null;
  return getAdminInternal();
}

/**
 * Same as getAdmin but ignores the recovery lock. ONLY for the reset-
 * password page so the user can call sb.auth.updateUser() with their
 * recovery-issued session.
 */
export async function getAdminAllowingRecovery(): Promise<AdminUser | null> {
  return getAdminInternal();
}

async function getAdminInternal(): Promise<AdminUser | null> {
  const sb = await authedServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !user.email) return null;
  // Belt-and-braces: refuse unconfirmed sessions (audit fix P2-3).
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
