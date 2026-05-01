import "server-only";
import { cookies } from "next/headers";

/**
 * Light = day shift (primary recommendation, Linear/Stripe-style).
 * Dark  = night shift / dim-bar usability.
 */
export type AdminTheme = "light" | "dark";

const COOKIE_NAME = "daimasu_admin_theme";

export async function getAdminTheme(): Promise<AdminTheme> {
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  return c === "dark" ? "dark" : "light";
}
