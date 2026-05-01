/**
 * Cookie-backed language preference for the admin panel.
 * Server-only — admin pages read this and pass the result to client components.
 */
import "server-only";
import { cookies } from "next/headers";

export type AdminLang = "ja" | "en";

const COOKIE_NAME = "daimasu_admin_lang";

export async function getAdminLang(): Promise<AdminLang> {
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  // English is the primary surface (matches public site). Owner can switch
  // to Japanese via the in-admin language toggle (writes COOKIE_NAME=ja).
  return c === "ja" ? "ja" : "en";
}

/** t-function for server components. */
export function ti(lang: AdminLang, ja: string, en: string): string {
  return lang === "ja" ? ja : en;
}

export const COOKIE = COOKIE_NAME;
