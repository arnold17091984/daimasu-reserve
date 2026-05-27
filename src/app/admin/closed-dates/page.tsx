/**
 * /admin/closed-dates — owner-managed list of dates fully blocked from booking.
 *
 * Used for holidays, private events, owner-vacation. Public booking flow already
 * checks `closed_dates` via assert_capacity_or_throw; this page is the management
 * UI for the table.
 */
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti } from "@/lib/auth/admin-lang";
import { getAdminVenue } from "@/lib/auth/admin-venue";
import { adminClient } from "@/lib/db/clients";
import type { ClosedDate } from "@/lib/db/types";
import { ClosedDatesManager } from "./manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClosedDatesPage() {
  const lang = await getAdminLang();
  const venue = await getAdminVenue();
  const today = todayIsoDate();

  await requireAdminOrRedirect();
  const sb = adminClient();
  // Phase 1b: scope to the currently-selected venue. closed_dates gained
  // a venue column in migration 0022 (defaults to 'bar' for historical
  // rows). The PK is still on closed_date alone, so a date can only be
  // closed for one venue at a time today.
  const { data } = await sb
    .from("closed_dates")
    .select("*")
    .eq("venue", venue)
    .gte("closed_date", today)
    .order("closed_date", { ascending: true })
    .limit(100)
    .returns<ClosedDate[]>();
  const upcoming: ClosedDate[] = data ?? [];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-3 font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
        {ti(lang, "休業日", "Closed dates")}
        <span className="ml-3 align-middle text-[12px] font-medium uppercase tracking-[0.16em] text-gold">
          · {venue}
        </span>
      </h1>
      <p className="mb-6 max-w-2xl admin-body text-text-secondary">
        {ti(
          lang,
          "ここに登録した日は、Webからの予約が一切受け付けられなくなります。祝日・貸切・店休など。理由はお客様には表示されません (内部記録用)。",
          "Dates added here are entirely blocked from online booking. Use for holidays, private events, owner vacation. Reason is internal only — guests don't see it."
        )}
      </p>

      <ClosedDatesManager initial={upcoming} lang={lang} />
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
