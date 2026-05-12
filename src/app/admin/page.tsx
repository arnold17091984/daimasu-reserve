/**
 * /admin — Operator Dashboard.
 *
 * Designed for daily ops (not vanity). Focus:
 *   1. Compact KPI bar (month revenue, target %, no-show rate, covers)
 *   2. Today's seat occupancy at a glance (S1/S2 bar fills)
 *   3. Today's confirmed list with inline `settle` / `no-show` shortcut links
 *   4. Tomorrow + 2-days preview (3 mini cards)
 *   5. Action queue — past unsettled, missing reminders, system no-shows that
 *      need owner confirmation
 *   6. 7-day revenue ledger
 *   7. Recent audit-log activity (audit-trail visibility)
 *
 * JA / EN switchable via the cookie-backed `admin-lang` toggle in the sidebar.
 */
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Check,
  Target,
  Users,
  Wallet,
  Clock,
  Activity,
} from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import { formatPHP } from "@/lib/domain/reservation";
import type {
  Reservation,
  RestaurantSettings,
  RevenueMonthly,
} from "@/lib/db/types";
import type { NotificationLog } from "@/lib/db/types";
import { QuickTiles } from "./_components/quick-tiles";
import { CapacityBar } from "./_components/capacity-bar";
import { CounterSeatMap } from "./_components/counter-seat-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NoShowRow {
  month_start: string;
  no_show_count: number;
  eligible_covers: number;
  no_show_rate_pct: number;
}

interface AuditRow {
  id: number;
  occurred_at: string;
  actor: string;
  action: string;
  reservation_id: string | null;
}

export default async function AdminDashboardPage() {
  const lang = await getAdminLang();
  // Server-component snapshot of "now"; the react-hooks/purity rule is a
  // browser-component heuristic that doesn't apply to async server components.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  let settings: RestaurantSettings | null = null;
  let monthly: RevenueMonthly | null = null;
  let noShow: NoShowRow | null = null;
  let allUpcoming: Reservation[] | null = null;
  let unsettledPast: Reservation[] | null = null;
  let recentAudits: AuditRow[] | null = null;
  let recentFailures: NotificationLog[] | null = null;

  await requireAdminOrRedirect();
  const sb = adminClient();
  const monthStart = currentMonthStart();
  const monthIso = monthStart.toISOString().slice(0, 10);
  const today = todayIsoDate();
  const dayPlus2 = isoDateDaysAhead(2);

  const [settingsRes, monthlyRes, noShowRes, upcomingRes, unsettledRes, auditsRes, failuresRes] =
    await Promise.all([
      sb.from("restaurant_settings").select("*").eq("id", 1).single<RestaurantSettings>(),
      sb.from("revenue_monthly").select("*").eq("month_start", monthIso).maybeSingle<RevenueMonthly>(),
      sb.from("no_show_rate").select("*").eq("month_start", monthIso).maybeSingle<NoShowRow>(),
      sb
        .from("reservations")
        .select("*")
        .gte("service_date", today)
        .lte("service_date", dayPlus2)
        .in("status", ["confirmed", "completed"])
        .order("service_starts_at", { ascending: true })
        .returns<Reservation[]>(),
      sb
        .from("reservations")
        .select("*")
        .lt("service_date", today)
        .eq("status", "confirmed")
        .order("service_starts_at", { ascending: false })
        .limit(20)
        .returns<Reservation[]>(),
      sb
        .from("audit_log")
        .select("id,occurred_at,actor,action,reservation_id")
        .order("occurred_at", { ascending: false })
        .limit(10)
        .returns<AuditRow[]>(),
      sb
        .from("notification_log")
        .select("*")
        .eq("status", "failed")
        .gte("attempted_at", new Date(nowMs - 7 * 86400_000).toISOString())
        .order("attempted_at", { ascending: false })
        .limit(20)
        .returns<NotificationLog[]>(),
    ]);
  settings = settingsRes.data;
  monthly = monthlyRes.data;
  noShow = noShowRes.data;
  allUpcoming = upcomingRes.data;
  unsettledPast = unsettledRes.data;
  recentAudits = auditsRes.data;
  recentFailures = failuresRes.data;

  const tomorrow = isoDateDaysAhead(1);
  const onlineSeats = settings?.online_seats ?? 8;

  // Group upcoming by date+seating
  const todayList = (allUpcoming ?? []).filter((r) => r.service_date === today);
  const tomorrowList = (allUpcoming ?? []).filter((r) => r.service_date === tomorrow);
  const dayPlus2List = (allUpcoming ?? []).filter((r) => r.service_date === dayPlus2);

  // Action queue — items needing owner attention
  const reminderDue = (allUpcoming ?? []).filter((r) => {
    const hoursOut = (new Date(r.service_starts_at).getTime() - nowMs) / 3_600_000;
    return r.status === "confirmed" && hoursOut < 24 && hoursOut > 2 && !r.reminder_long_sent_at;
  });
  // Confirmed reservations whose service ended ≥30 min ago and were
  // never settled or marked no-show. The /api/cron/mark-no-show route
  // sweeps these on a schedule, but the dashboard surfaces them
  // immediately so the operator can act before the cron fires (or
  // manually retry when the cron fails). UX 2026-05-06 (operations
  // review M4) flagged this list as previously hardcoded to [].
  const systemNoShows: Reservation[] = (allUpcoming ?? []).filter((r) => {
    if (r.status !== "confirmed") return false;
    // Course is ~90 min; treat 2h after start as the auto-no-show window.
    const endsAtMs =
      new Date(r.service_starts_at).getTime() + 120 * 60_000;
    return endsAtMs < nowMs;
  });

  // KPI calcs
  const monthRevenue = monthly?.net_completed_centavos ?? 0;
  const monthBookedGross = monthly?.gross_booked_centavos ?? 0;
  const monthTarget = settings?.monthly_revenue_target_centavos ?? 0;
  const targetPct = monthTarget > 0 ? Math.round((monthRevenue / monthTarget) * 100) : 0;
  const noShowPct = noShow?.no_show_rate_pct ?? 0;
  const noShowOver = noShowPct > 5;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
            {ti(lang, "ダッシュボード", "Dashboard")}
          </h1>
          <p className="mt-1 admin-caption">
            {formatToday(lang)}
          </p>
        </div>
        <Link
          href="/admin/reservations"
          className="admin-section-label hover:text-gold"
        >
          {ti(lang, "予約一覧へ →", "All reservations →")}
        </Link>
      </header>

      {/* ── Quick-access tiles (Airレジ-style) ─────────────────────────── */}
      <QuickTiles
        lang={lang}
        todayCount={todayList.length}
        upcomingCount={(allUpcoming ?? []).length}
        pendingActionCount={
          (unsettledPast?.length ?? 0) +
          (recentFailures?.length ?? 0)
        }
      />

      {/* ── KPI bar ──────────────────────────────────────────────────────── */}
      <section className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          icon={<Wallet size={14} />}
          label={ti(lang, "今月の売上 (純)", "Net revenue (mo)")}
          value={formatPHP(monthRevenue, lang)}
          sub={ti(lang, `予約総額 ${formatPHP(monthBookedGross, lang)}`, `Booked ${formatPHP(monthBookedGross, lang)}`)}
        />
        <Kpi
          icon={<Target size={14} />}
          label={ti(lang, "目標達成率", "Target progress")}
          value={monthTarget > 0 ? `${targetPct}%` : "—"}
          sub={
            monthTarget > 0
              ? ti(lang, `目標 ${formatPHP(monthTarget, lang)}`, `Target ${formatPHP(monthTarget, lang)}`)
              : ti(lang, "目標は設定で入力", "Set target in settings")
          }
        />
        <Kpi
          icon={<AlertTriangle size={14} />}
          label={ti(lang, "no-show率", "No-show rate")}
          value={`${noShowPct}%`}
          sub={ti(lang, `${noShow?.no_show_count ?? 0}件 / ${noShow?.eligible_covers ?? 0}カバー`, `${noShow?.no_show_count ?? 0} of ${noShow?.eligible_covers ?? 0}`)}
          warn={noShowOver}
        />
        <Kpi
          icon={<Users size={14} />}
          label={ti(lang, "今月の予約数", "Covers (mo)")}
          value={`${monthly?.covers_booked ?? 0}`}
          sub={ti(lang, `キャンセル ${monthly?.cancel_count ?? 0}件`, `Cancels ${monthly?.cancel_count ?? 0}`)}
        />
      </section>

      {/* ── Action queue ─────────────────────────────────────────────────── */}
      {(unsettledPast?.length || reminderDue.length || systemNoShows.length || (recentFailures && recentFailures.length > 0)) ? (
        <section className="mb-8 border border-amber-500/40 bg-amber-500/[0.06] p-5">
          <h2 className="mb-4 flex items-center gap-2 admin-section-label !text-amber-400">
            <AlertTriangle size={14} />
            {ti(lang, "要対応", "Needs attention")}
          </h2>
          <ul className="flex flex-col gap-2">
            {unsettledPast && unsettledPast.length > 0 && (
              <ActionItem
                count={unsettledPast.length}
                label={ti(lang, "過去予約の精算が未完了", "Past reservations not yet settled")}
                href="/admin/reservations?filter=past"
              />
            )}
            {reminderDue.length > 0 && (
              <ActionItem
                count={reminderDue.length}
                label={ti(lang, "24時間前リマインダー未送信", "24h reminder not yet sent")}
                href="/admin/reservations?filter=upcoming"
                tone="info"
              />
            )}
            {recentFailures && recentFailures.length > 0 && (
              <ActionItem
                count={recentFailures.length}
                label={ti(
                  lang,
                  "通知の送信失敗 (直近7日)",
                  "Notification failures (last 7 days)"
                )}
                href="#notification-failures"
                tone="danger"
              />
            )}
          </ul>
        </section>
      ) : null}

      {/* ── Today: seat occupancy + table ────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 admin-section-label">
          <Clock size={14} />
          {ti(lang, "今日", "Today")}
        </h2>
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-5 border border-border bg-surface p-5">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                17:30 {ti(lang, "1部", "Seating 1")}
              </p>
              <CounterSeatMap
                totalSeats={onlineSeats}
                bookings={todayList.filter((r) => r.seating === "s1")}
                lang={lang}
                compact
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                20:00 {ti(lang, "2部", "Seating 2")}
              </p>
              <CounterSeatMap
                totalSeats={onlineSeats}
                bookings={todayList.filter((r) => r.seating === "s2")}
                lang={lang}
                compact
              />
            </div>
            <p className="mt-1 admin-caption">
              {ti(
                lang,
                `合計 ${todayList.length}件 / ${todayList.reduce((s, r) => s + r.party_size, 0)}名`,
                `${todayList.length} bookings · ${todayList.reduce((s, r) => s + r.party_size, 0)} guests`
              )}
            </p>
          </div>

          <ReservationsTable list={todayList} lang={lang} dense includeActions />
        </div>
      </section>

      {/* ── Tomorrow + day after ─────────────────────────────────────────── */}
      <section className="mb-10 grid gap-4 lg:grid-cols-2">
        <DayCard
          dateLabel={dateHeader(tomorrow, lang)}
          list={tomorrowList}
          onlineSeats={onlineSeats}
          lang={lang}
        />
        <DayCard
          dateLabel={dateHeader(dayPlus2, lang)}
          list={dayPlus2List}
          onlineSeats={onlineSeats}
          lang={lang}
        />
      </section>

      {/* ── Notification failures (last 7 days) ─────────────────────────── */}
      {recentFailures && recentFailures.length > 0 && (
        <section id="notification-failures" className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 admin-section-label !text-red-400">
            <AlertTriangle size={13} />
            {ti(lang, "通知の送信失敗 (直近7日)", "Notification failures (last 7 days)")}
          </h2>
          <ul className="border border-red-500/30 bg-red-500/[0.04] divide-y divide-red-500/15">
            {recentFailures.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-[110px_70px_90px_1fr_auto] items-center gap-3 px-3 py-2 text-[12px]"
              >
                <span className="admin-meta admin-num">
                  {new Date(f.attempted_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
                    timeZone: "Asia/Manila",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-gold">
                  {f.channel}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                  {f.kind.replace(/_/g, " ")}
                </span>
                <span className="truncate text-red-400/90">
                  {f.error_message ?? "—"}
                </span>
                {f.reservation_id && (
                  <Link
                    href={`/admin/reservations/${f.reservation_id}`}
                    className="text-[11px] uppercase tracking-[0.14em] text-gold hover:text-gold-light"
                  >
                    →
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 admin-caption">
            {ti(
              lang,
              "Telegram bot トークンや Resend ドメイン認証を /admin/settings で確認してください。",
              "Check Telegram bot token / Resend domain verification in /admin/settings."
            )}
          </p>
        </section>
      )}

      {/* ── Recent activity (audit log preview) ──────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 admin-section-label">
          <Activity size={13} />
          {ti(lang, "最近のアクティビティ", "Recent activity")}
        </h2>
        <ul className="border border-border bg-surface divide-y divide-border/40">
          {(recentAudits ?? []).map((a) => (
            <li
              key={a.id}
              className="grid grid-cols-[64px_minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-[12px]"
            >
              <span className="admin-meta admin-num">
                {new Date(a.occurred_at).toLocaleTimeString(lang === "ja" ? "ja-JP" : "en-PH", {
                  timeZone: "Asia/Manila",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className="truncate text-[11px] uppercase tracking-[0.14em] text-gold"
                title={a.actor}
              >
                {/* Strip the @domain — gmail.com on every row is noise; the
                    full email is still available via the title tooltip.
                    Fixes 2026-05-12 overlap report (actor cell was 88px,
                    daimasumakati@gmail.com is 23 chars and spilled into
                    the action label column). */}
                {a.actor.includes("@") ? a.actor.split("@")[0] : a.actor}
              </span>
              <span className="truncate">{actionLabel(a.action, lang)}</span>
              {a.reservation_id && (
                <Link
                  href={`/admin/reservations/${a.reservation_id}`}
                  className="text-[11px] uppercase tracking-[0.14em] text-gold hover:text-gold-light"
                >
                  →
                </Link>
              )}
            </li>
          ))}
          {(recentAudits ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-text-muted">
              {ti(lang, "履歴がありません。", "No activity yet.")}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Kpi({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
        <span className={warn ? "text-red-400" : "text-gold"}>{icon}</span>
        {label}
      </div>
      <div className={warn ? "font-mono admin-num text-2xl font-medium text-red-400" : "font-mono admin-num text-2xl font-medium text-foreground"}>
        {value}
      </div>
      {sub && <div className="mt-1.5 admin-caption">{sub}</div>}
    </div>
  );
}

function ActionItem({
  count,
  label,
  href,
  tone,
}: {
  count: number;
  label: string;
  href: string;
  tone?: "info" | "danger";
}) {
  const badgeCls =
    tone === "info"
      ? "inline-flex h-7 w-7 items-center justify-center bg-gold/15 text-[13px] font-semibold text-gold"
      : tone === "danger"
        ? "inline-flex h-7 w-7 items-center justify-center bg-red-500/15 text-[13px] font-semibold text-red-400"
        : "inline-flex h-7 w-7 items-center justify-center bg-amber-500/15 text-[13px] font-semibold text-amber-400";
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center justify-between gap-3 border border-border/60 bg-background/60 px-3 py-2.5 hover:border-gold/40 hover:bg-surface"
      >
        <span className="flex items-center gap-3">
          <span className={badgeCls}>{count}</span>
          <span className="admin-body">{label}</span>
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-gold group-hover:text-gold-light">
          →
        </span>
      </Link>
    </li>
  );
}

function ReservationsTable({
  list,
  lang,
  dense,
  includeActions,
}: {
  list: Reservation[];
  lang: AdminLang;
  dense?: boolean;
  includeActions?: boolean;
}) {
  if (list.length === 0) {
    return (
      <div className="border border-border bg-surface px-4 py-6 text-center admin-body text-text-secondary">
        {ti(lang, "予約はありません。", "No bookings.")}
      </div>
    );
  }
  const cellPad = dense ? "px-3 py-3" : "px-4 py-3.5";
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-text-secondary">
          <tr>
            <th className={`${cellPad} text-left`}>{ti(lang, "時間", "Time")}</th>
            <th className={`${cellPad} text-left`}>{ti(lang, "お客様", "Guest")}</th>
            <th className={`${cellPad} text-right`}>{ti(lang, "人数", "Pax")}</th>
            <th className={`${cellPad} text-right`}>{ti(lang, "残金", "Balance")}</th>
            <th className={`${cellPad} text-left`}>{ti(lang, "リマインダー", "Reminders")}</th>
            <th className={`${cellPad} text-left`}>{ti(lang, "状態", "Status")}</th>
            {includeActions && <th className={`${cellPad} text-right`}>{ti(lang, "操作", "Action")}</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="border-b border-border/40 last:border-b-0 hover:bg-background/30">
              <td className={`${cellPad} font-mono text-[13px]`}>
                {new Date(r.service_starts_at).toLocaleTimeString(lang === "ja" ? "ja-JP" : "en-PH", {
                  timeZone: "Asia/Manila",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className={cellPad}>
                <div className="admin-body font-medium">
                  {r.guest_name}
                  {r.notes && <span title={r.notes} className="ml-1.5 text-amber-400" aria-label="has notes">●</span>}
                </div>
                <div className="admin-caption mt-0.5">{r.guest_phone}</div>
              </td>
              <td className={`${cellPad} text-right font-mono admin-num text-foreground`}>{r.party_size}</td>
              <td className={`${cellPad} text-right font-mono admin-num text-gold`}>
                {formatPHP(r.balance_centavos, lang)}
              </td>
              <td className={`${cellPad} text-[11px]`}>
                <ReminderDots reservation={r} />
              </td>
              <td className={cellPad}>
                <StatusPill status={r.status} lang={lang} />
              </td>
              {includeActions && (
                <td className={`${cellPad} text-right`}>
                  <Link
                    href={`/admin/reservations/${r.id}`}
                    className="text-[11px] uppercase tracking-[0.14em] text-gold hover:text-gold"
                  >
                    {ti(lang, "詳細", "Detail")}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReminderDots({ reservation }: { reservation: Reservation }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot label="24h" sent={!!reservation.reminder_long_sent_at} />
      <Dot label="2h" sent={!!reservation.reminder_short_sent_at} />
    </span>
  );
}

function Dot({ label, sent }: { label: string; sent: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span
        className={
          sent
            ? "inline-block h-2 w-2 rounded-full bg-gold"
            : "inline-block h-2 w-2 rounded-full border border-text-muted/40"
        }
        aria-hidden="true"
      />
      <span className="admin-meta">{label}</span>
    </span>
  );
}

function StatusPill({
  status,
  lang,
}: {
  status: Reservation["status"];
  lang: AdminLang;
}) {
  const styles: Record<Reservation["status"], string> = {
    pending_payment: "border-yellow-500/40 text-yellow-400",
    confirmed: "border-gold/60 text-gold",
    completed: "border-green-500/40 text-green-400",
    no_show: "border-red-500/60 text-red-400",
    cancelled_full: "border-text-muted/40 text-text-muted",
    cancelled_partial: "border-text-muted/40 text-text-muted",
    cancelled_late: "border-text-muted/40 text-text-muted",
    expired: "border-text-muted/30 text-text-muted/70",
  };
  const labels: Record<Reservation["status"], { ja: string; en: string }> = {
    pending_payment: { ja: "決済待ち", en: "Pending" },
    confirmed: { ja: "確定", en: "Confirmed" },
    completed: { ja: "終了", en: "Done" },
    no_show: { ja: "no-show", en: "No-show" },
    cancelled_full: { ja: "Cx (100%)", en: "Cx (100%)" },
    cancelled_partial: { ja: "Cx (50%)", en: "Cx (50%)" },
    cancelled_late: { ja: "Cx (0%)", en: "Cx (0%)" },
    expired: { ja: "期限切れ", en: "Expired" },
  };
  return (
    <span className={`inline-block border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${styles[status]}`}>
      {labels[status][lang]}
    </span>
  );
}

function DayCard({
  dateLabel,
  list,
  onlineSeats,
  lang,
}: {
  dateLabel: string;
  list: Reservation[];
  onlineSeats: number;
  lang: AdminLang;
}) {
  const s1 = paxAt(list, "s1");
  const s2 = paxAt(list, "s2");
  return (
    <div className="border border-border bg-surface p-4">
      <p className="admin-section-label mb-4">{dateLabel}</p>
      <div className="grid grid-cols-2 gap-3">
        <CapacityBar label="17:30" taken={s1} total={onlineSeats} lang={lang} compact />
        <CapacityBar label="20:00" taken={s2} total={onlineSeats} lang={lang} compact />
      </div>
      <p className="mt-4 admin-caption">
        {list.length === 0
          ? ti(lang, "予約なし", "No bookings")
          : ti(
              lang,
              `${list.length}件 / ${list.reduce((s, r) => s + r.party_size, 0)}名`,
              `${list.length} bookings · ${list.reduce((s, r) => s + r.party_size, 0)} guests`
            )}
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function paxAt(list: Reservation[], slot: "s1" | "s2"): number {
  return list.filter((r) => r.seating === slot).reduce((s, r) => s + r.party_size, 0);
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
function isoDateDaysAhead(days: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function currentMonthStart(): Date {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function formatToday(lang: AdminLang): string {
  const d = new Date();
  return d.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function dateHeader(iso: string, lang: AdminLang): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  return d.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function actionLabel(action: string, lang: AdminLang): string {
  const map: Record<string, { ja: string; en: string }> = {
    "reservation.confirm": { ja: "予約が確定しました", en: "Reservation confirmed" },
    "reservation.no_show": { ja: "no-show としてマーク", en: "Marked as no-show" },
    "reservation.cancel.full": { ja: "100%返金でキャンセル", en: "Cancelled (100% refund)" },
    "reservation.cancel.partial": { ja: "50%返金でキャンセル", en: "Cancelled (50% refund)" },
    "reservation.cancel.late": { ja: "返金なしでキャンセル", en: "Cancelled (no refund)" },
    "reservation.settle": { ja: "精算を完了", en: "Settled" },
    "reservation.expired": { ja: "決済期限切れ", en: "Expired (no payment)" },
    "settings.update": { ja: "設定を更新", en: "Settings updated" },
  };
  return map[action]?.[lang] ?? action;
}

// (lint silence: we may use these icons in a future commit)
void Bell;
void Check;
