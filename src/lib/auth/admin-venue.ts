/**
 * Cookie-backed venue selection for the admin panel.
 *
 * The same admin UI manages two venues — DAIMASU 大桝 BAR and DAIMASU 大桝
 * Restaurant. Operators flip between them with the venue toggle in the
 * sidebar, and every admin page reads the cookie to scope its queries.
 *
 * Defaults to 'bar' so operators who never touch the toggle see the
 * historical single-venue behaviour unchanged.
 *
 * Server-only — admin pages read this and pass the result to client
 * components (mirrors the admin-lang / admin-theme pattern).
 */
import "server-only";
import { cookies } from "next/headers";

export type AdminVenue = "bar" | "restaurant";

export const ADMIN_VENUES: readonly AdminVenue[] = ["bar", "restaurant"] as const;

const COOKIE_NAME = "daimasu_admin_venue";

export async function getAdminVenue(): Promise<AdminVenue> {
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  return c === "restaurant" ? "restaurant" : "bar";
}

/** Display label for a venue in the active admin language. */
export function venueLabel(venue: AdminVenue, lang: "ja" | "en"): string {
  if (venue === "restaurant") {
    return lang === "ja" ? "Restaurant" : "Restaurant";
  }
  return lang === "ja" ? "Bar" : "Bar";
}

export const COOKIE = COOKIE_NAME;
