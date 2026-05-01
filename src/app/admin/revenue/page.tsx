/**
 * /admin/revenue — daily + monthly revenue analytics.
 *
 * Replaces the dashboard's compact 7-day table with a dedicated analytics
 * page. Operator picks year+month, sees a bar/line combo chart for daily
 * 売上 + 客数, plus a detail table breaking down covers / 会計単価 /
 * no-show / kept / lost. Inspired by Airレジ's 日別売上 view.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingUp, Info } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import { formatPHP } from "@/lib/domain/reservation";
import { isDepositRequired } from "@/lib/env";
import type { RevenueDaily, RevenueMonthly } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DailyExtended extends RevenueDaily {
  // computed by us
  avg_check_centavos: number;
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const lang = await getAdminLang();
  const sp = await searchParams;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const targetY = parseInt(sp.y ?? "", 10) || now.getFullYear();
  const targetM = parseInt(sp.m ?? "", 10) || now.getMonth() + 1;

  const monthStart = isoFirstOfMonth(targetY, targetM);
  const monthEnd = isoLastOfMonth(targetY, targetM);

  await requireAdminOrRedirect();
  const sb = adminClient();

  // Deposit-free flow: revenue views (revenue_daily / revenue_monthly) are
  // built from `payments` rows that no longer exist. Render a covers-only
  // summary instead so the page isn't a wall of zeros and ₱0.
  if (!isDepositRequired()) {
    return (
      <ReservationsOnlyView
        lang={lang}
        sb={sb}
        targetY={targetY}
        targetM={targetM}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
    );
  }

  let monthly: RevenueMonthly | null = null;
  let daily: RevenueDaily[] = [];
  const [{ data: m }, { data: d }] = await Promise.all([
    sb
      .from("revenue_monthly")
      .select("*")
      .eq("month_start", monthStart)
      .maybeSingle<RevenueMonthly>(),
    sb
      .from("revenue_daily")
      .select("*")
      .gte("service_date", monthStart)
      .lte("service_date", monthEnd)
      .order("service_date", { ascending: true })
      .returns<RevenueDaily[]>(),
  ]);
  monthly = m;
  daily = d ?? [];

  // Compute avg-check + ensure full-month rows (zero-fill missing days).
  const filledByDate = new Map<string, RevenueDaily>(
    daily.map((d) => [d.service_date, d])
  );
  const daysInMonth = new Date(targetY, targetM, 0).getDate();
  const allDays: DailyExtended[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const date = `${targetY}-${String(targetM).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const d =
      filledByDate.get(date) ??
      ({
        service_date: date,
        covers_booked: 0,
        gross_booked_centavos: 0,
        net_completed_centavos: 0,
        no_show_deposit_kept_centavos: 0,
        no_show_lost_centavos: 0,
        no_show_count: 0,
        cancel_count: 0,
      } satisfies RevenueDaily);
    const avg =
      d.covers_booked > 0
        ? Math.floor(d.net_completed_centavos / d.covers_booked)
        : 0;
    allDays.push({ ...d, avg_check_centavos: avg });
  }

  // Totals
  const totalNet = allDays.reduce((s, d) => s + d.net_completed_centavos, 0);
  const totalGross = allDays.reduce(
    (s, d) => s + d.gross_booked_centavos,
    0
  );
  const totalCovers = allDays.reduce((s, d) => s + d.covers_booked, 0);
  const totalCancel = allDays.reduce((s, d) => s + d.cancel_count, 0);
  const totalNoShow = allDays.reduce((s, d) => s + d.no_show_count, 0);
  const totalKept = allDays.reduce(
    (s, d) => s + d.no_show_deposit_kept_centavos,
    0
  );
  const totalLost = allDays.reduce((s, d) => s + d.no_show_lost_centavos, 0);
  const totalCheck = totalCovers > 0 ? Math.floor(totalNet / totalCovers) : 0;
  // Cancellation rate: cancels / (cancels + bookings) * 100. Confirmed +
  // completed + no-show count as "kept" bookings (covers_booked already
  // excludes cancellations per the SQL view).
  const totalAttempts = totalCovers + totalCancel;
  const cancelRatePct =
    totalAttempts > 0
      ? Math.round((totalCancel / totalAttempts) * 1000) / 10
      : 0;
  const cancelHigh = cancelRatePct >= 15;
  // No-show rate: no_show / eligible (covers_booked) * 100.
  const noShowRatePct =
    totalCovers > 0
      ? Math.round((totalNoShow / totalCovers) * 1000) / 10
      : 0;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "売上分析", "Revenue")}
        </h1>
        <MonthPicker year={targetY} month={targetM} lang={lang} />
      </div>

      {/* Revenue stats — first row */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={ti(lang, "純売上 (月)", "Net rev")}
          value={formatPHP(totalNet, lang)}
          accent
          sub={ti(
            lang,
            "確定済みで実際に受領した金額",
            "Actually received"
          )}
        />
        <Stat
          label={ti(lang, "予想売上 (月)", "Expected rev")}
          value={formatPHP(totalGross, lang)}
          sub={ti(
            lang,
            "確定済み予約の総額 (no-show含む)",
            "Confirmed bookings (incl. no-show)"
          )}
        />
        <Stat
          label={ti(lang, "予約件数 (月)", "Bookings")}
          value={String(totalCovers)}
          sub={ti(
            lang,
            `+ キャンセル ${totalCancel}件`,
            `+ ${totalCancel} cancels`
          )}
        />
        <Stat
          label={ti(lang, "客単価 (月)", "Avg check")}
          value={totalCovers > 0 ? formatPHP(totalCheck, lang) : "—"}
          sub={ti(lang, "純売上 ÷ 予約件数", "Net ÷ bookings")}
        />
      </div>

      {/* Issue stats — second row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={ti(lang, "キャンセル率", "Cancel rate")}
          value={`${cancelRatePct}%`}
          warn={cancelHigh}
          sub={ti(
            lang,
            `${totalCancel} / ${totalAttempts}件`,
            `${totalCancel} / ${totalAttempts}`
          )}
        />
        <Stat
          label={ti(lang, "no-show率", "No-show rate")}
          value={`${noShowRatePct}%`}
          warn={noShowRatePct > 5}
          sub={ti(
            lang,
            `${totalNoShow} / ${totalCovers}件`,
            `${totalNoShow} / ${totalCovers}`
          )}
        />
        <Stat
          label={ti(lang, "保留売上", "Kept (no-show deposit)")}
          value={formatPHP(totalKept, lang)}
          sub={ti(
            lang,
            "no-show時にデポジット保留",
            "Deposits retained on no-show"
          )}
        />
        <Stat
          label={ti(lang, "失った売上", "Lost (no-show balance)")}
          value={formatPHP(totalLost, lang)}
          warn={totalLost > 0}
          sub={ti(
            lang,
            "no-show時の残金未回収",
            "Balance forfeited"
          )}
        />
      </div>

      {/* Bar chart */}
      <section className="mb-6 border border-border bg-surface p-4 sm:p-6">
        <h2 className="admin-section-label mb-4 flex items-center gap-2">
          <TrendingUp size={14} />
          {ti(
            lang,
            `${targetY}年${targetM}月の売上推移`,
            `${monthName(targetM, lang)} ${targetY} — daily`
          )}
        </h2>
        <DailyChart days={allDays} lang={lang} />
      </section>

      {/* Detail table */}
      <section className="border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
              <tr>
                <th className="px-3 py-3 text-left">{ti(lang, "日付", "Date")}</th>
                <th className="px-3 py-3 text-right">{ti(lang, "件数", "Bkgs")}</th>
                <th className="hidden px-3 py-3 text-right md:table-cell">
                  {ti(lang, "予想売上", "Expected")}
                </th>
                <th className="px-3 py-3 text-right">{ti(lang, "純売上", "Net")}</th>
                <th className="hidden px-3 py-3 text-right md:table-cell">
                  {ti(lang, "客単価", "Avg check")}
                </th>
                <th className="px-3 py-3 text-right">
                  {ti(lang, "Cx", "Cx")}
                </th>
                <th className="px-3 py-3 text-right">
                  {ti(lang, "No-show", "No-show")}
                </th>
                <th className="hidden px-3 py-3 text-right md:table-cell">
                  {ti(lang, "保留売上", "Kept")}
                </th>
                <th className="hidden px-3 py-3 text-right md:table-cell">
                  {ti(lang, "失った売上", "Lost")}
                </th>
              </tr>
            </thead>
            <tbody>
              {allDays.map((d) => {
                const dt = new Date(`${d.service_date}T00:00:00+08:00`);
                const dow = dt.toLocaleDateString(
                  lang === "ja" ? "ja-JP" : "en-PH",
                  { timeZone: "Asia/Manila", weekday: "short" }
                );
                const isWeekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                return (
                  <tr
                    key={d.service_date}
                    className="border-b border-border/40 last:border-b-0 hover:bg-card"
                  >
                    <td className="px-3 py-2.5 admin-num font-mono">
                      <span className={isWeekend ? "text-gold" : "text-foreground"}>
                        {d.service_date.slice(8, 10)}
                      </span>
                      <span className="ml-1 admin-meta">({dow})</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num">
                      {d.covers_booked > 0 ? d.covers_booked : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono admin-num text-text-secondary md:table-cell">
                      {d.gross_booked_centavos > 0
                        ? formatPHP(d.gross_booked_centavos, lang)
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num text-foreground">
                      {d.net_completed_centavos > 0
                        ? formatPHP(d.net_completed_centavos, lang)
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono admin-num text-text-secondary md:table-cell">
                      {d.avg_check_centavos > 0
                        ? formatPHP(d.avg_check_centavos, lang)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {d.cancel_count > 0 ? (
                        <span className="font-mono admin-num text-amber-400">{d.cancel_count}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {d.no_show_count > 0 ? (
                        <span className="font-mono admin-num text-red-400">{d.no_show_count}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono admin-num md:table-cell">
                      {d.no_show_deposit_kept_centavos > 0 ? (
                        <span className="text-gold">
                          {formatPHP(d.no_show_deposit_kept_centavos, lang)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono admin-num md:table-cell">
                      {d.no_show_lost_centavos > 0 ? (
                        <span className="text-red-400/80">
                          {formatPHP(d.no_show_lost_centavos, lang)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border">
              <tr className="bg-card">
                <td className="px-3 py-3 admin-section-label">
                  {ti(lang, "月計", "Total")}
                </td>
                <td className="px-3 py-3 text-right font-mono admin-num font-semibold">
                  {totalCovers}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono admin-num text-text-secondary md:table-cell">
                  {totalGross > 0 ? formatPHP(totalGross, lang) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono admin-num font-semibold text-gold">
                  {formatPHP(totalNet, lang)}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono admin-num md:table-cell">
                  {totalCheck > 0 ? formatPHP(totalCheck, lang) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono admin-num text-amber-400">
                  {totalCancel}
                </td>
                <td className="px-3 py-3 text-right font-mono admin-num text-red-400">
                  {totalNoShow}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono admin-num text-gold md:table-cell">
                  {formatPHP(totalKept, lang)}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono admin-num text-red-400/80 md:table-cell">
                  {formatPHP(totalLost, lang)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {monthly && (
        <p className="mt-3 admin-caption">
          {ti(
            lang,
            `※ revenue_monthly ビューより: ${monthly.covers_booked}件 / 純${formatPHP(monthly.net_completed_centavos, lang)} (このページの集計と一致するはず)`,
            `Source: revenue_monthly view — ${monthly.covers_booked} covers / net ${formatPHP(monthly.net_completed_centavos, lang)}`
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Deposit-free / Stripe-disabled view. The revenue_daily / revenue_monthly
 * views aggregate `payments` rows that no longer exist, so the regular
 * revenue dashboard is meaningless here — we render a covers-only summary
 * (counts by status, party-size sum) drawn directly from `reservations`.
 */
async function ReservationsOnlyView({
  lang,
  sb,
  targetY,
  targetM,
  monthStart,
  monthEnd,
}: {
  lang: AdminLang;
  sb: ReturnType<typeof adminClient>;
  targetY: number;
  targetM: number;
  monthStart: string;
  monthEnd: string;
}) {
  const { data: rows } = await sb
    .from("reservations")
    .select("status, party_size, service_date")
    .gte("service_date", monthStart)
    .lte("service_date", monthEnd)
    .returns<{ status: string; party_size: number; service_date: string }[]>();

  const list = rows ?? [];
  const total = list.length;
  const covers = list.reduce((acc, r) => acc + r.party_size, 0);
  const byStatus: Record<string, number> = {};
  for (const r of list) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  const confirmed = byStatus.confirmed ?? 0;
  const cancelled =
    (byStatus.cancelled_full ?? 0) +
    (byStatus.cancelled_partial ?? 0) +
    (byStatus.cancelled_late ?? 0);
  const noShow = byStatus.no_show ?? 0;
  const completed = byStatus.completed ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl font-medium tracking-[0.04em] text-foreground sm:text-3xl">
            <TrendingUp size={20} className="mr-2 inline-block text-gold" />
            {ti(lang, "予約サマリー", "Reservations Summary")}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {ti(
              lang,
              `${targetY}年 ${monthName(targetM, lang)}`,
              `${monthName(targetM, lang)} ${targetY}`
            )}
          </p>
        </div>
        <MonthPicker year={targetY} month={targetM} lang={lang} />
      </div>

      <div className="mb-4 flex items-start gap-3 border border-border bg-surface/40 p-4 text-xs leading-relaxed text-text-muted">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-gold/70" />
        <p>
          {ti(
            lang,
            "デポジット非収受モードのため、売上データは記録されていません。予約件数のみ表示しています。",
            "Deposit-free mode is active — payment data is not recorded. Reservation counts only."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={ti(lang, "予約件数", "Reservations")} value={String(total)} />
        <Stat label={ti(lang, "総客数", "Covers")} value={String(covers)} />
        <Stat label={ti(lang, "確定", "Confirmed")} value={String(confirmed)} />
        <Stat label={ti(lang, "完了", "Completed")} value={String(completed)} />
        <Stat
          label={ti(lang, "キャンセル", "Cancelled")}
          value={String(cancelled + noShow)}
        />
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-text-muted">
        {ti(
          lang,
          "予約一覧の管理は ",
          "Manage individual reservations in "
        )}
        <Link
          href="/admin/reservations"
          className="text-gold underline underline-offset-2 hover:text-gold-light"
        >
          /admin/reservations
        </Link>
        {ti(lang, " から行えます。", ".")}
      </p>
    </div>
  );
}

function MonthPicker({
  year,
  month,
  lang,
}: {
  year: number;
  month: number;
  lang: AdminLang;
}) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const url = (y: number, m: number) => `/admin/revenue?y=${y}&m=${m}`;
  return (
    <div className="flex items-center gap-1 border border-border bg-surface">
      <Link
        href={url(prev.y, prev.m)}
        className="flex h-10 w-10 items-center justify-center text-text-secondary hover:text-foreground"
      >
        <ChevronLeft size={16} />
      </Link>
      <span className="px-3 font-mono admin-num text-base font-medium text-foreground">
        {year} / {String(month).padStart(2, "0")}
      </span>
      <Link
        href={url(next.y, next.m)}
        className="flex h-10 w-10 items-center justify-center text-text-secondary hover:text-foreground"
      >
        <ChevronRight size={16} />
      </Link>
      <span className="border-l border-border px-3">
        <Link
          href={url(
            new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })).getFullYear(),
            new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })).getMonth() + 1
          )}
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold hover:text-gold-light"
        >
          {ti(lang, "今月", "This month")}
        </Link>
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </p>
      <p
        className={
          warn
            ? "mt-1 font-mono admin-num text-2xl font-semibold text-red-400"
            : accent
              ? "mt-1 font-mono admin-num text-2xl font-semibold text-gold"
              : "mt-1 font-mono admin-num text-2xl font-semibold text-foreground"
        }
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 admin-caption">{sub}</p>}
    </div>
  );
}

function DailyChart({
  days,
  lang,
}: {
  days: DailyExtended[];
  lang: AdminLang;
}) {
  const maxNet = Math.max(...days.map((d) => d.net_completed_centavos), 1);
  const maxCovers = Math.max(...days.map((d) => d.covers_booked), 1);
  const w = 1000;
  const h = 220;
  const padX = 24;
  const padY = 24;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const barW = innerW / days.length - 2;

  // Line points for covers count.
  const points = days
    .map((d, i) => {
      const x = padX + i * (innerW / days.length) + barW / 2;
      const y = padY + (1 - d.covers_booked / maxCovers) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h + 24}`}
        className="w-full min-w-[640px]"
        preserveAspectRatio="none"
      >
        {/* Y-axis grid */}
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={padX}
            x2={w - padX}
            y1={padY + (1 - p) * innerH}
            y2={padY + (1 - p) * innerH}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Bars (revenue) */}
        {days.map((d, i) => {
          const x = padX + i * (innerW / days.length);
          const barH = (d.net_completed_centavos / maxNet) * innerH;
          const y = padY + (innerH - barH);
          return (
            <rect
              key={d.service_date}
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, 0.5)}
              fill="var(--gold)"
              opacity={d.net_completed_centavos > 0 ? 0.7 : 0.15}
            />
          );
        })}

        {/* Line (covers) */}
        <polyline
          points={points}
          fill="none"
          stroke="var(--status-info)"
          strokeWidth="2"
        />
        {days.map((d, i) => {
          const x = padX + i * (innerW / days.length) + barW / 2;
          const y = padY + (1 - d.covers_booked / maxCovers) * innerH;
          return d.covers_booked > 0 ? (
            <circle key={d.service_date} cx={x} cy={y} r="3" fill="var(--status-info)" />
          ) : null;
        })}

        {/* X-axis day labels (every 5th to avoid clutter) */}
        {days.map((d, i) => {
          if (i % 5 !== 0 && i !== days.length - 1) return null;
          const x = padX + i * (innerW / days.length) + barW / 2;
          return (
            <text
              key={d.service_date}
              x={x}
              y={h + 18}
              fontSize="10"
              fill="var(--text-muted)"
              textAnchor="middle"
              fontFamily="var(--font-inter)"
            >
              {d.service_date.slice(8, 10)}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 flex items-center gap-5 admin-caption">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-gold opacity-70" />
          {ti(lang, "純売上", "Net revenue")}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-4"
            style={{ backgroundColor: "var(--status-info)" }}
          />
          {ti(lang, "予約件数", "Covers")}
        </span>
      </div>
    </div>
  );
}

function isoFirstOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function isoLastOfMonth(y: number, m: number): string {
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function monthName(m: number, lang: AdminLang): string {
  if (lang === "ja") return `${m}月`;
  return new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });
}
