/**
 * /admin/reservations/[id] — single-reservation detail + actions.
 *
 * JA/EN switchable. Includes:
 *  - reservation detail card
 *  - actions: settle, no-show, cancel-with-refund-override
 *  - repeat-customer history (count + last visit + total spend)
 *  - payment ledger (deposit + refunds)
 *  - notification log (so the owner sees if confirms/reminders failed)
 *  - audit log
 */
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ListChecks } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import { formatPHP, receiptBreakdown } from "@/lib/domain/reservation";
import type {
  NotificationLog,
  Payment,
  Receipt,
  Reservation,
} from "@/lib/db/types";
import { SettleForm } from "./settle-form";
import { NoShowButton } from "./no-show-button";
import { CancelWithRefundForm } from "./cancel-form";
import { CelebrationReview } from "../../_components/celebration-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuditRow {
  id: number;
  occurred_at: string;
  actor: string;
  action: string;
  reason: string | null;
}

interface RepeatStats {
  total_visits: number;
  last_visit: string | null;
  no_show_count: number;
  total_net_centavos: number;
}

export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const lang = await getAdminLang();
  const { id } = await params;
  const sp = await searchParams;
  const justConfirmed = sp.confirmed === "1";

  let reservation: Reservation | null = null;
  let payments: Payment[] | null = null;
  let audits: AuditRow[] | null = null;
  let notifications: NotificationLog[] | null = null;
  let receipt: Receipt | null = null;
  let repeat: RepeatStats = {
    total_visits: 0,
    last_visit: null,
    no_show_count: 0,
    total_net_centavos: 0,
  };

  await requireAdminOrRedirect();
  const sb = adminClient();
  const [
    { data: rRow },
    { data: pRows },
    { data: aRows },
    { data: nRows },
    { data: rcptRows },
  ] = await Promise.all([
    sb.from("reservations").select("*").eq("id", id).maybeSingle<Reservation>(),
    sb
      .from("payments")
      .select("*")
      .eq("reservation_id", id)
      .order("created_at", { ascending: true })
      .returns<Payment[]>(),
    sb
      .from("audit_log")
      .select("*")
      .eq("reservation_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50)
      .returns<AuditRow[]>(),
    sb
      .from("notification_log")
      .select("*")
      .eq("reservation_id", id)
      .order("attempted_at", { ascending: false })
      .limit(20)
      .returns<NotificationLog[]>(),
    sb
      .from("receipts")
      .select("*")
      .eq("reservation_id", id)
      .is("voided_at", null)
      .order("issued_at", { ascending: false })
      .limit(1)
      .returns<Receipt[]>(),
  ]);
  reservation = rRow;
  payments = pRows;
  audits = aRows;
  notifications = nRows;
  receipt = rcptRows && rcptRows.length > 0 ? rcptRows[0] : null;

  if (reservation) {
    // Two separate queries (Postgrest's `.or()` splits on commas, which is
    // fragile when phone/email values contain commas or other URL-tricky
    // characters). Dedupe in JS.
    const [{ data: byPhone }, { data: byEmail }] = await Promise.all([
      sb
        .from("reservations")
        .select("id,status,service_date,settlement_centavos")
        .eq("guest_phone", reservation.guest_phone)
        .neq("id", id)
        .returns<
          Pick<
            Reservation,
            "id" | "status" | "service_date" | "settlement_centavos"
          >[]
        >(),
      reservation.guest_email
        ? sb
            .from("reservations")
            .select("id,status,service_date,settlement_centavos")
            .eq("guest_email", reservation.guest_email)
            .neq("id", id)
            .returns<
              Pick<
                Reservation,
                "id" | "status" | "service_date" | "settlement_centavos"
              >[]
            >()
        : Promise.resolve({ data: [] }),
    ]);
    const seen = new Set<string>();
    const sameGuest = [...(byPhone ?? []), ...(byEmail ?? [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const completed = sameGuest.filter((r) => r.status === "completed");
    repeat = {
      total_visits: completed.length,
      last_visit:
        completed
          .map((r) => r.service_date)
          .sort()
          .reverse()[0] ?? null,
      no_show_count: sameGuest.filter((r) => r.status === "no_show").length,
      total_net_centavos: completed.reduce(
        (s, r) => s + (r.settlement_centavos ?? 0),
        0
      ),
    };
  }

  if (!reservation) notFound();

  const totalReceived =
    payments?.reduce((sum, p) => sum + p.amount_centavos, 0) ?? 0;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/admin/reservations"
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary hover:text-foreground"
        >
          <ArrowLeft size={14} />
          {ti(lang, "予約一覧へ", "Reservations")}
        </Link>
        <Link
          href="/admin/reservations"
          className="inline-flex items-center gap-2 border border-border bg-surface px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-foreground hover:border-gold/50 hover:text-gold"
        >
          <ListChecks size={14} aria-hidden="true" />
          {ti(lang, "予約一覧を見る", "View all reservations")}
        </Link>
      </div>

      {justConfirmed && (
        <div className="mb-6 flex items-start gap-3 border-2 border-gold bg-gold/[0.08] p-5">
          <CheckCircle2 size={28} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[18px] font-semibold text-foreground">
              {ti(lang, "予約が確定しました", "Reservation confirmed")}
            </p>
            <p className="mt-1 admin-body text-text-secondary">
              {ti(
                lang,
                "下記の予約詳細をご確認ください。お客様への確認連絡もお忘れなく。",
                "Review the booking details below. Don't forget to follow up with the guest."
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/reservations"
                className="inline-flex items-center gap-2 bg-gold px-4 py-2 text-[13px] font-semibold hover:opacity-90"
                style={{ color: "var(--background)" }}
              >
                <ListChecks size={14} aria-hidden="true" />
                {ti(lang, "予約一覧を見る", "View all reservations")}
              </Link>
              <Link
                href="/admin/reservations/new"
                className="inline-flex items-center gap-2 border border-gold/60 px-4 py-2 text-[13px] font-medium text-gold hover:bg-gold/10"
              >
                {ti(lang, "もう1件入力", "Add another")}
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-noto-serif)] text-3xl tracking-[0.02em] text-foreground">
            {reservation.guest_name}
          </h1>
          <p className="mt-1.5 admin-body text-text-secondary">
            {new Date(reservation.service_starts_at).toLocaleString(
              lang === "ja" ? "ja-JP" : "en-PH",
              {
                timeZone: "Asia/Manila",
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }
            )}
            {" · "}
            {reservation.party_size}
            {ti(lang, "名", " pax")}
          </p>
        </div>
        {repeat.total_visits > 0 && (
          <RepeatBadge stats={repeat} lang={lang} />
        )}
        {repeat.no_show_count > 0 && (
          <span className="border border-red-500/60 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-red-400">
            {ti(
              lang,
              `過去 no-show ${repeat.no_show_count}回`,
              `${repeat.no_show_count} prior no-show${repeat.no_show_count > 1 ? "s" : ""}`
            )}
          </span>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-border bg-surface p-6">
          <h2 className="mb-4 admin-section-label">
            {ti(lang, "予約詳細", "Reservation")}
          </h2>
          <DataRow
            label={ti(lang, "状態", "Status")}
            value={statusLabel(reservation.status, lang)}
          />
          <DataRow
            label={ti(lang, "経路", "Source")}
            value={sourceLabel(reservation.source, lang)}
          />
          <DataRow
            label={ti(lang, "電話", "Phone")}
            value={reservation.guest_phone ?? "—"}
          />
          <DataRow
            label={ti(lang, "メール", "Email")}
            value={reservation.guest_email || "—"}
          />
          <DataRow
            label={ti(lang, "言語", "Lang")}
            value={reservation.guest_lang.toUpperCase()}
          />
          {(() => {
            // SVC + VAT breakdown for display. Pre-settle: recomputed
            // from the reservation snapshot (course_price + party_size +
            // deposit_pct). Post-settle: snapshotted in the receipts row.
            //
            // Important: reservation.deposit_centavos and balance_centavos
            // are the *menu-only* halves (the schema has a CHECK that they
            // sum to total_centavos = course_price × party). The diner's
            // grand-total liability is menu + SVC + VAT; the on-site
            // amount the operator collects is therefore
            //   on_site = grand_total - menu_only_deposit
            // i.e. menu_balance + SVC + VAT, NOT just balance_centavos.
            const r = receiptBreakdown(
              reservation.course_price_centavos,
              reservation.party_size,
              reservation.deposit_pct
            );
            const onSiteDue = r.grand_total_centavos - reservation.deposit_centavos;
            return (
              <>
                <DataRow
                  label={ti(lang, "コース小計", "Menu subtotal")}
                  value={formatPHP(r.menu_subtotal_centavos, lang)}
                />
                <DataRow
                  label={ti(lang, "サービス料 (10%)", "Service charge (10%)")}
                  value={formatPHP(r.service_charge_centavos, lang)}
                />
                <DataRow
                  label={ti(lang, "VAT (12%)", "VAT (12%)")}
                  value={formatPHP(r.vat_centavos, lang)}
                />
                <DataRow
                  label={ti(lang, "合計 (税サ込)", "Grand total")}
                  value={formatPHP(r.grand_total_centavos, lang)}
                  emphasis
                />
                <DataRow
                  label={ti(lang, "デポジット (受領)", "Deposit (paid)")}
                  value={formatPHP(reservation.deposit_centavos, lang)}
                />
                <DataRow
                  label={ti(lang, "店舗精算 (残金 + 税サ)", "On-site due (balance + tax/svc)")}
                  value={formatPHP(onSiteDue, lang)}
                  emphasis
                />
                {receipt && !receipt.voided_at && (
                  <DataRow
                    label={ti(lang, "OR 番号", "OR no.")}
                    value={receipt.or_number}
                    emphasis
                  />
                )}
              </>
            );
          })()}
          {reservation.dietary &&
            (reservation.dietary.type !== "none" ||
              reservation.dietary.allergens ||
              reservation.dietary.severe ||
              reservation.dietary.instructions) && (
              <div
                className={
                  reservation.dietary.severe
                    ? "mt-4 border-t-2 border-red-500/60 bg-red-500/[0.06] px-3 py-3"
                    : "mt-4 border-t border-gold/40 bg-gold/[0.04] px-3 py-3"
                }
              >
                <p
                  className={
                    reservation.dietary.severe
                      ? "text-[11px] font-bold uppercase tracking-[0.14em] text-red-400"
                      : "text-[11px] font-medium uppercase tracking-[0.14em] text-gold"
                  }
                >
                  {ti(lang, "食事制限・アレルギー", "Dietary / allergens")}
                  {reservation.dietary.severe && (
                    <span className="ml-2 rounded-sm bg-red-500/80 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.10em] text-white">
                      {ti(lang, "重度", "SEVERE")}
                    </span>
                  )}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
                  {reservation.dietary.type !== "none" && (
                    <li>
                      <span className="text-text-secondary">
                        {ti(lang, "種別: ", "Type: ")}
                      </span>
                      {reservation.dietary.type}
                    </li>
                  )}
                  {reservation.dietary.allergens && (
                    <li>
                      <span className="text-text-secondary">
                        {ti(lang, "アレルギー: ", "Allergens: ")}
                      </span>
                      {reservation.dietary.allergens}
                    </li>
                  )}
                  {reservation.dietary.instructions && (
                    <li>
                      <span className="text-text-secondary">
                        {ti(lang, "指示: ", "Instructions: ")}
                      </span>
                      {reservation.dietary.instructions}
                    </li>
                  )}
                </ul>
              </div>
            )}
          {reservation.notes && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">
                {ti(lang, "備考", "Notes")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {reservation.notes}
              </p>
            </div>
          )}
        </div>

        <div className="border border-border bg-surface p-6">
          <h2 className="mb-4 admin-section-label">
            {ti(lang, "操作", "Actions")}
          </h2>
          {reservation.status === "confirmed" ? (
            <div className="flex flex-col gap-6">
              <SettleForm reservation={reservation} lang={lang} />
              <div className="border-t border-border pt-6">
                <NoShowButton reservation={reservation} lang={lang} />
              </div>
              <div className="border-t border-border pt-6">
                <CancelWithRefundForm reservation={reservation} lang={lang} />
              </div>
            </div>
          ) : reservation.status === "completed" ? (
            <p className="text-sm text-green-400">
              {ti(lang, "精算済み: ", "Settled on ")}
              {reservation.settled_at &&
                new Date(reservation.settled_at).toLocaleString(
                  lang === "ja" ? "ja-JP" : "en-PH",
                  { timeZone: "Asia/Manila" }
                )}
              {" · "}
              {reservation.settlement_method ?? "—"}
              {" · "}
              {formatPHP(reservation.settlement_centavos ?? 0, lang)}
            </p>
          ) : reservation.status === "no_show" ? (
            <p className="text-sm text-red-400">
              {ti(
                lang,
                "no-shoとしてマーク。デポジットは保留。",
                "Marked as no-show. Deposit retained."
              )}
            </p>
          ) : reservation.status === "pending_payment" ? (
            <p className="text-sm text-yellow-400">
              {ti(
                lang,
                "Stripe Checkout 完了待ち。30分でリリース。",
                "Awaiting Stripe Checkout. Auto-released after 30 min."
              )}
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              {ti(lang, "キャンセル済み。", "Cancelled. No further action.")}
            </p>
          )}
        </div>
      </section>

      {reservation.celebration && (
        <div className="mt-8">
          <CelebrationReview
            celebration={reservation.celebration}
            lang={lang}
          />
        </div>
      )}

      {/* Payments */}
      <section className="mt-8 border border-border bg-surface">
        <header className="border-b border-border px-6 py-4 admin-section-label">
          {ti(lang, "決済履歴", "Payment ledger")} ·{" "}
          {ti(lang, "受領合計", "Net received")} {formatPHP(totalReceived, lang)}
        </header>
        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                <tr>
                  <th className="px-4 py-3 text-left">{ti(lang, "日時", "When")}</th>
                  <th className="px-4 py-3 text-left">{ti(lang, "種別", "Kind")}</th>
                  <th className="px-4 py-3 text-left">{ti(lang, "提供元", "Provider")}</th>
                  <th className="px-4 py-3 text-left">{ti(lang, "方法", "Method")}</th>
                  <th className="px-4 py-3 text-right">{ti(lang, "金額", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 last:border-b-0">
                    <td className="px-4 py-3 font-mono admin-num text-[12px] text-text-secondary">
                      {new Date(p.created_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </td>
                    <td className="px-4 py-3">{paymentKindLabel(p.kind, lang)}</td>
                    <td className="px-4 py-3 text-text-muted">{p.provider}</td>
                    <td className="px-4 py-3 text-text-muted">{p.method ?? "—"}</td>
                    <td
                      className={
                        p.amount_centavos < 0
                          ? "px-4 py-3 text-right text-red-400"
                          : "px-4 py-3 text-right text-foreground"
                      }
                    >
                      {formatPHP(p.amount_centavos, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-text-muted">
            {ti(lang, "決済履歴なし。", "No payments recorded.")}
          </p>
        )}
      </section>

      {/* Notifications */}
      {notifications && notifications.length > 0 && (
        <section className="mt-8 border border-border bg-surface">
          <header className="border-b border-border px-6 py-4 admin-section-label">
            {ti(lang, "通知ログ", "Notification log")}
          </header>
          <ul className="divide-y divide-border/40">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="grid grid-cols-[110px_70px_70px_1fr_auto] items-center gap-3 px-4 py-2 text-[12px]"
              >
                <span className="font-mono admin-num text-[12px] text-text-secondary">
                  {new Date(n.attempted_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
                    timeZone: "Asia/Manila",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-gold">
                  {n.channel}
                </span>
                <span className="text-[11px] uppercase tracking-[0.10em] text-text-secondary">
                  {n.kind.replace(/_/g, " ")}
                </span>
                <span className="truncate text-text-muted">
                  {n.error_message ?? n.recipient ?? "—"}
                </span>
                <span
                  className={
                    n.status === "sent"
                      ? "text-[11px] font-medium uppercase tracking-[0.10em] text-green-400"
                      : n.status === "failed"
                        ? "text-[11px] font-medium uppercase tracking-[0.10em] text-red-400"
                        : "text-[11px] uppercase tracking-[0.10em] text-text-secondary"
                  }
                >
                  {n.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Audit log */}
      <section className="mt-8 border border-border bg-surface">
        <header className="border-b border-border px-6 py-4 admin-section-label">
          {ti(lang, "監査ログ", "Audit log")}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
              <tr>
                <th className="px-4 py-3 text-left">{ti(lang, "日時", "When")}</th>
                <th className="px-4 py-3 text-left">{ti(lang, "実行者", "Actor")}</th>
                <th className="px-4 py-3 text-left">{ti(lang, "操作", "Action")}</th>
                <th className="px-4 py-3 text-left">{ti(lang, "理由", "Reason")}</th>
              </tr>
            </thead>
            <tbody>
              {(audits ?? []).map((a) => (
                <tr key={a.id} className="border-b border-border/40 last:border-b-0">
                  <td className="px-4 py-3 font-mono admin-num text-[12px] text-text-secondary">
                    {new Date(a.occurred_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{a.actor}</td>
                  <td className="px-4 py-3">{actionLabel(a.action, lang)}</td>
                  <td className="px-4 py-3 text-text-muted">{a.reason ?? "—"}</td>
                </tr>
              ))}
              {(audits ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-muted">
                    {ti(lang, "監査ログなし。", "No audit events.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DataRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-2 text-sm last:border-b-0">
      <span className={emphasis ? "font-semibold text-foreground" : "text-text-muted"}>{label}</span>
      <span className={emphasis ? "text-right font-semibold text-foreground" : "text-right text-foreground"}>{value}</span>
    </div>
  );
}

function RepeatBadge({
  stats,
  lang,
}: {
  stats: RepeatStats;
  lang: AdminLang;
}) {
  return (
    <div className="border border-gold/60 bg-gold/10 px-3 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-gold">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-base text-gold">
          {stats.total_visits}
        </span>
        <span>{ti(lang, "回目のご来店", `prior visit${stats.total_visits > 1 ? "s" : ""}`)}</span>
      </div>
      <div className="mt-0.5 text-[12px] normal-case text-gold-light">
        {stats.last_visit && (
          <span>
            {ti(lang, "前回 ", "Last ")}
            {stats.last_visit}
          </span>
        )}
        {stats.total_net_centavos > 0 && (
          <span> · {formatPHP(stats.total_net_centavos, lang)} </span>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: Reservation["status"], lang: AdminLang): string {
  const map: Record<Reservation["status"], { ja: string; en: string }> = {
    pending_payment: { ja: "決済待ち", en: "Pending payment" },
    confirmed: { ja: "確定", en: "Confirmed" },
    completed: { ja: "終了", en: "Completed" },
    no_show: { ja: "no-show", en: "No-show" },
    cancelled_full: { ja: "キャンセル (100%返金)", en: "Cancelled (100% refund)" },
    cancelled_partial: { ja: "キャンセル (50%返金)", en: "Cancelled (50% refund)" },
    cancelled_late: { ja: "キャンセル (返金なし)", en: "Cancelled (no refund)" },
    expired: { ja: "期限切れ", en: "Expired" },
  };
  return map[status][lang];
}

function sourceLabel(source: Reservation["source"], lang: AdminLang): string {
  const map: Record<Reservation["source"], { ja: string; en: string }> = {
    web: { ja: "Web (オンライン)", en: "Web (online)" },
    staff: { ja: "店舗 (手動)", en: "Staff (manual)" },
    phone: { ja: "電話", en: "Phone" },
    walkin: { ja: "来店", en: "Walk-in" },
  };
  return map[source][lang];
}

function paymentKindLabel(
  kind: Payment["kind"],
  lang: AdminLang
): string {
  const map: Record<Payment["kind"], { ja: string; en: string }> = {
    deposit_capture: { ja: "デポジット受領", en: "Deposit captured" },
    refund_full: { ja: "全額返金", en: "Full refund" },
    refund_partial: { ja: "一部返金", en: "Partial refund" },
    on_site_settlement: { ja: "店舗精算", en: "On-site settlement" },
    manual_adjustment: { ja: "手動調整", en: "Manual adjustment" },
  };
  return map[kind][lang];
}

function actionLabel(action: string, lang: AdminLang): string {
  const map: Record<string, { ja: string; en: string }> = {
    "reservation.create": { ja: "予約作成", en: "Reservation created" },
    "reservation.confirm": { ja: "予約確定", en: "Reservation confirmed" },
    "reservation.no_show": { ja: "no-showマーク", en: "Marked no-show" },
    "reservation.cancel.full": { ja: "100%返金キャンセル", en: "Cancelled (100% refund)" },
    "reservation.cancel.partial": { ja: "50%返金キャンセル", en: "Cancelled (50% refund)" },
    "reservation.cancel.late": { ja: "返金なしキャンセル", en: "Cancelled (no refund)" },
    "reservation.cancel.override": { ja: "返金オーバーライドでキャンセル", en: "Cancelled (refund override)" },
    "reservation.settle": { ja: "精算完了", en: "Settled" },
    "reservation.expired": { ja: "決済期限切れ", en: "Expired" },
    "settings.update": { ja: "設定更新", en: "Settings updated" },
  };
  return map[action]?.[lang] ?? action;
}
