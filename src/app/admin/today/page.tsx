/**
 * /admin/today — Service Sheet.
 *
 * One screen designed for print + tablet at the counter:
 *  - Header: today's date, total covers, S1+S2 timing
 *  - Per-seating block: every booking with time, guest, pax, notes, lang flag,
 *    repeat-customer indicator, and a checkbox column for "arrived".
 *
 * Print-optimized via @media print rules in globals.css (already supports
 * `.print-area` background neutralization).
 */
import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";
import { PrintButton } from "./print-button";
import { CounterSeatMap } from "../_components/counter-seat-map";
import { celebrationSummaryLine } from "../_components/celebration-display";
import { Sparkles } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TodayServiceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const lang = await getAdminLang();
  const sp = await searchParams;
  const date = sp.date ?? todayIsoDate();

  const repeatMap: Map<string, number> = new Map();

  await requireAdminOrRedirect();
  const sb = adminClient();
  const [{ data: settingsRow }, { data: rRows }] = await Promise.all([
    sb
      .from("restaurant_settings")
      .select("*")
      .eq("id", 1)
      .single<RestaurantSettings>(),
    sb
      .from("reservations")
      .select("*")
      .eq("service_date", date)
      .in("status", ["confirmed", "completed", "no_show"])
      .order("service_starts_at", { ascending: true })
      .returns<Reservation[]>(),
  ]);
  const settings: RestaurantSettings | null = settingsRow;
  const bookings: Reservation[] = rRows ?? [];

  if (bookings.length > 0) {
    const phones = Array.from(
      new Set(bookings.map((b) => b.guest_phone).filter(Boolean))
    );
    const emails = Array.from(
      new Set(
        bookings
          .map((b) => b.guest_email)
          .filter((e) => e && !e.endsWith("@daimasu.local"))
      )
    );
    // Two `.in(...)` calls instead of `.or()` so values with commas don't
    // corrupt the parsed filter.
    const [byPhone, byEmail] = await Promise.all([
      phones.length > 0
        ? sb
            .from("reservations")
            .select("guest_phone,guest_email")
            .eq("status", "completed")
            .lt("service_date", date)
            .in("guest_phone", phones)
            .returns<Pick<Reservation, "guest_phone" | "guest_email">[]>()
        : Promise.resolve({ data: [] }),
      emails.length > 0
        ? sb
            .from("reservations")
            .select("guest_phone,guest_email")
            .eq("status", "completed")
            .lt("service_date", date)
            .in("guest_email", emails)
            .returns<Pick<Reservation, "guest_phone" | "guest_email">[]>()
        : Promise.resolve({ data: [] }),
    ]);
    const priorRows = [...(byPhone.data ?? []), ...(byEmail.data ?? [])];
    for (const b of bookings) {
      const count = priorRows.filter(
        (p) => p.guest_phone === b.guest_phone || p.guest_email === b.guest_email
      ).length;
      repeatMap.set(b.guest_phone || b.guest_email, count);
    }
  }

  if (!settings) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-red-400">
          {ti(lang, "設定行が見つかりません。", "Settings row missing.")}
        </p>
      </div>
    );
  }

  const s1 = bookings.filter((b) => b.seating === "s1");
  const s2 = bookings.filter((b) => b.seating === "s2");
  const totalCovers = bookings.reduce((s, b) => s + b.party_size, 0);

  const dateObj = new Date(`${date}T00:00:00+08:00`);
  const dateLabel = dateObj.toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-PH",
    {
      timeZone: "Asia/Manila",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "本日のサービス表", "Today's service sheet")}
        </h1>
        <div className="flex items-center gap-2">
          <DateNavLinks date={date} lang={lang} />
          <PrintButton lang={lang} />
        </div>
      </div>

      <article className="border border-border bg-surface p-6 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4 print:border-black/30">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold print:text-black/70">
              DAIMASU BAR · {ti(lang, "サービス表", "Service sheet")}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.04em] print:text-3xl">
              {dateLabel}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary print:text-black/70">
              {ti(lang, "本日合計", "Total today")}
            </p>
            <p className="font-mono text-2xl">
              {bookings.length}{" "}
              <span className="text-base text-text-muted print:text-black/50">
                /
              </span>{" "}
              {totalCovers}
              <span className="ml-2 text-sm text-text-muted print:text-black/50">
                {ti(lang, "(予約数 / 人数)", "(bkgs / pax)")}
              </span>
            </p>
          </div>
        </header>

        {/* Counter seat map — airline-style per-seat status. Operator's
            first read on arrival: which seats are sold, where's room. */}
        <div className="mb-8 grid gap-5 border-b border-border pb-6 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
          <div>
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary print:text-black/70">
              {settings.seating_1_label} · {ti(lang, "1部", "Seating 1")}
            </p>
            <CounterSeatMap
              totalSeats={settings.online_seats}
              bookings={s1}
              lang={lang}
            />
          </div>
          <div>
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary print:text-black/70">
              {settings.seating_2_label} · {ti(lang, "2部", "Seating 2")}
            </p>
            <CounterSeatMap
              totalSeats={settings.online_seats}
              bookings={s2}
              lang={lang}
            />
          </div>
        </div>

        {bookings.some((b) => b.celebration) && (
          <section className="mb-6 border-2 border-gold/60 bg-gold/[0.06] print:border-black">
            <header className="flex items-center gap-2 border-b border-gold/40 px-4 py-2.5 print:border-black/40">
              <Sparkles size={14} className="text-gold print:text-black" aria-hidden="true" />
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold print:text-black">
                {ti(lang, "本日のサプライズ・お祝い", "Today's celebrations")}
              </p>
              <span className="font-mono text-[12px] text-text-secondary print:text-black/60">
                {bookings.filter((b) => b.celebration).length}
                {ti(lang, "件", "")}
              </span>
            </header>
            <ul className="divide-y divide-gold/20 print:divide-black/30">
              {bookings
                .filter((b) => b.celebration)
                .map((b) => {
                  const c = b.celebration!;
                  const time = new Date(b.service_starts_at).toLocaleTimeString(
                    lang === "ja" ? "ja-JP" : "en-PH",
                    { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" }
                  );
                  return (
                    <li
                      key={b.id}
                      className="grid grid-cols-[60px_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-[13px]"
                    >
                      <span className="font-mono admin-num font-medium text-foreground print:text-black">
                        {time}
                      </span>
                      <span className="leading-snug text-foreground print:text-black">
                        <span className="font-semibold">{b.guest_name}</span>
                        <span className="ml-2 admin-meta">
                          {b.party_size}
                          {ti(lang, "名", " pax")}
                          {b.seat_numbers && ` · ${ti(lang, "席", "seat")} ${b.seat_numbers.join(",")}`}
                        </span>
                        <div className="mt-0.5 admin-body normal-case tracking-normal">
                          {celebrationSummaryLine(c, lang)}
                        </div>
                      </span>
                      {c.is_surprise && (
                        <span className="border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.10em] text-amber-400 print:border-black print:bg-transparent print:text-black">
                          {ti(lang, "サプライズ", "SURPRISE")}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        )}

        <SeatingBlock
          title={`${settings.seating_1_label} · ${ti(lang, "1部", "Seating 1")}`}
          bookings={s1}
          repeatMap={repeatMap}
          lang={lang}
          totalSeats={settings.online_seats}
        />
        <SeatingBlock
          title={`${settings.seating_2_label} · ${ti(lang, "2部", "Seating 2")}`}
          bookings={s2}
          repeatMap={repeatMap}
          lang={lang}
          totalSeats={settings.online_seats}
          className="mt-8"
        />

        <footer className="mt-8 border-t border-border pt-3 text-[11px] text-text-muted print:border-black/30 print:text-black/60">
          {ti(
            lang,
            `生成: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Manila" })} · 凡例: ★=リピーター(N回目以降) · ●=備考あり`,
            `Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Legend: ★=repeat customer · ●=has notes`
          )}
        </footer>
      </article>
    </div>
  );
}

function SeatingBlock({
  title,
  bookings,
  repeatMap,
  lang,
  totalSeats,
  className,
}: {
  title: string;
  bookings: Reservation[];
  repeatMap: Map<string, number>;
  lang: AdminLang;
  totalSeats: number;
  className?: string;
}) {
  const taken = bookings.reduce((s, b) => s + b.party_size, 0);
  const remaining = Math.max(0, totalSeats - taken);
  const isFull = remaining === 0;
  return (
    <section className={className}>
      <h3 className="mb-3 flex flex-wrap items-baseline gap-3 text-[13px] font-medium uppercase tracking-[0.18em] text-gold print:text-black">
        <span>{title}</span>
        <span className="text-text-secondary print:text-black/70">·</span>
        <span>
          {bookings.length}{ti(lang, "件", " bkg")}
        </span>
        <span className="text-text-secondary print:text-black/70">·</span>
        <span>
          {taken}/{totalSeats}{ti(lang, "名", "")}
        </span>
        {isFull ? (
          <span className="border border-red-500/60 bg-red-500/15 px-2 py-0.5 text-[11px] font-bold tracking-[0.10em] text-red-400 print:border-black print:bg-transparent print:text-black">
            {ti(lang, "満席", "FULL")}
          </span>
        ) : remaining <= 1 ? (
          <span className="border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold tracking-[0.10em] text-amber-400 print:border-black print:bg-transparent print:text-black">
            {ti(lang, `あと ${remaining} 席`, `${remaining} LEFT`)}
          </span>
        ) : (
          <span className="text-text-muted print:text-black/60 normal-case">
            {ti(lang, `残 ${remaining} 席`, `${remaining} left`)}
          </span>
        )}
      </h3>
      {bookings.length === 0 ? (
        <p className="border border-dashed border-border/60 px-3 py-4 text-center admin-caption print:border-black/30 print:text-black/60">
          {ti(lang, "予約なし", "No bookings")}
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary print:border-black/40 print:text-black/70">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">{ti(lang, "時間", "Time")}</th>
              <th className="px-2 py-2 text-left">{ti(lang, "お客様", "Guest")}</th>
              <th className="px-2 py-2 text-right">{ti(lang, "人数", "Pax")}</th>
              <th className="px-2 py-2 text-left">{ti(lang, "言語", "Lang")}</th>
              <th className="px-2 py-2 text-left">{ti(lang, "備考", "Notes")}</th>
              <th className="w-8 px-2 py-2 text-center print:table-cell">✓</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b, i) => {
              const repeats = repeatMap.get(b.guest_phone || b.guest_email) ?? 0;
              return (
                <tr
                  key={b.id}
                  className="border-b border-border/60 align-top print:border-black/20"
                >
                  <td className="px-2 py-3 font-mono admin-num text-[12px] text-text-secondary print:text-black/60">
                    {i + 1}
                  </td>
                  <td className="px-2 py-3 font-mono admin-num text-sm font-medium">
                    {new Date(b.service_starts_at).toLocaleTimeString(
                      lang === "ja" ? "ja-JP" : "en-PH",
                      {
                        timeZone: "Asia/Manila",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      {repeats > 0 && (
                        <span
                          className="text-[11px] text-gold/90 print:text-black"
                          title={ti(
                            lang,
                            `${repeats + 1}回目のご来店`,
                            `${repeats + 1} prior visit${repeats > 0 ? "s" : ""}`
                          )}
                        >
                          ★{repeats + 1}
                        </span>
                      )}
                      <span>{b.guest_name}</span>
                    </div>
                    <div className="admin-meta print:text-black/60">
                      {b.guest_phone}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right font-mono">{b.party_size}</td>
                  <td className="px-2 py-3 text-[11px] uppercase">
                    {b.guest_lang}
                  </td>
                  <td className="px-2 py-3 text-[13px] leading-snug">
                    {b.celebration && (
                      <div className="mb-1 inline-flex items-start gap-1 border border-gold/60 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold print:border-black print:bg-transparent print:text-black">
                        <Sparkles size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {celebrationSummaryLine(b.celebration, lang)}
                      </div>
                    )}
                    {b.notes ? (
                      <span className="flex items-start gap-1.5">
                        <span className="text-gold/80 print:text-black">●</span>
                        <span className="whitespace-pre-line">{b.notes}</span>
                      </span>
                    ) : !b.celebration ? (
                      <span className="text-text-muted print:text-black/40">—</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className="inline-block h-4 w-4 border border-border/60 print:border-black/40" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DateNavLinks({ date, lang }: { date: string; lang: AdminLang }) {
  const prev = shiftIsoDate(date, -1);
  const next = shiftIsoDate(date, 1);
  const today = todayIsoDate();
  return (
    <div className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.12em]">
      <Link
        href={`/admin/today?date=${prev}`}
        className="border border-border px-2 py-1.5 hover:border-gold/40 hover:text-gold"
      >
        ←
      </Link>
      <Link
        href={`/admin/today?date=${today}`}
        className="border border-border px-2 py-1.5 hover:border-gold/40 hover:text-gold"
      >
        {ti(lang, "本日", "Today")}
      </Link>
      <Link
        href={`/admin/today?date=${next}`}
        className="border border-border px-2 py-1.5 hover:border-gold/40 hover:text-gold"
      >
        →
      </Link>
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
