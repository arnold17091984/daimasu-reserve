/**
 * /admin/settings — owner-editable tenant config.
 * Dangerous fields (course price, deposit %) edit-protected behind a confirm step.
 */
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti } from "@/lib/auth/admin-lang";
import { getAdminVenue } from "@/lib/auth/admin-venue";
import { adminClient } from "@/lib/db/clients";
import type { RestaurantSettings } from "@/lib/db/types";
import { SettingsForm } from "./settings-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const lang = await getAdminLang();
  const venue = await getAdminVenue();
  await requireAdminOrRedirect();
  const sb = adminClient();
  // Phase 1b: load the settings row for the currently selected venue
  // (cookie `daimasu_admin_venue`, defaults to 'bar'). Each venue has its
  // own row in restaurant_settings since migration 0022.
  const { data } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("venue", venue)
    .single<RestaurantSettings>();
  const settings: RestaurantSettings | null = data;

  return (
    <div className="px-6 py-6 sm:px-8">
      <h1 className="mb-6 font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
        {ti(lang, "設定", "Settings")}
        <span className="ml-3 align-middle text-[12px] font-medium uppercase tracking-[0.16em] text-gold">
          · {venue}
        </span>
      </h1>
      {settings ? (
        <SettingsForm settings={settings} lang={lang} />
      ) : (
        <p className="text-sm text-red-400">
          {ti(
            lang,
            `'${venue}' の設定行が存在しません。Supabase SQL editor で 0022 migration を確認してください。`,
            `Settings row for venue '${venue}' missing. Verify migration 0022 in Supabase SQL editor.`
          )}
        </p>
      )}
    </div>
  );
}
