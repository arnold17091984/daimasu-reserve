/**
 * /admin/receipts — BIR Official Receipt list + month-end export.
 *
 * UX research 2026-05-06 (Persona: owner doing month-end accounting)
 * flagged that the OR registry exists in the DB (settle issues an
 * `or_number` via the `settle_with_receipt` RPC) but is invisible to
 * the operator. Filing the BIR monthly OR summary required pulling
 * raw data from Supabase. This page fixes that.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Download } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import { formatPHP } from "@/lib/domain/reservation";
import type { Receipt } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReceiptRow extends Receipt {
  reservations: {
    guest_name: string;
    service_date: string;
    party_size: number;
  } | null;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const lang = await getAdminLang();
  const sp = await searchParams;
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
  );
  const targetY = parseInt(sp.y ?? "", 10) || now.getFullYear();
  const targetM = parseInt(sp.m ?? "", 10) || now.getMonth() + 1;

  const monthStart = `${targetY}-${String(targetM).padStart(2, "0")}-01T00:00:00+08:00`;
  const lastDay = new Date(targetY, targetM, 0).getDate();
  const monthEnd = `${targetY}-${String(targetM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+08:00`;

  await requireAdminOrRedirect();
  const sb = adminClient();

  const { data } = await sb
    .from("receipts")
    .select(
      "*, reservations(guest_name, service_date, party_size)"
    )
    .gte("issued_at", monthStart)
    .lte("issued_at", monthEnd)
    .order("issued_at", { ascending: true })
    .returns<ReceiptRow[]>();

  const receipts = data ?? [];
  const liveReceipts = receipts.filter((r) => !r.voided_at);
  const voidedReceipts = receipts.filter((r) => r.voided_at);

  const total = liveReceipts.reduce(
    (acc, r) => {
      acc.menu += r.menu_subtotal_centavos;
      acc.svc += r.service_charge_centavos;
      acc.vat += r.vat_centavos;
      acc.grand += r.grand_total_centavos;
      return acc;
    },
    { menu: 0, svc: 0, vat: 0, grand: 0 }
  );

  const byMethod = liveReceipts.reduce<Record<string, number>>((acc, r) => {
    const k = r.settlement_method ?? "unknown";
    acc[k] = (acc[k] ?? 0) + r.grand_total_centavos;
    return acc;
  }, {});

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "公式領収書 (OR)", "Official Receipts")}
        </h1>
        <MonthPicker year={targetY} month={targetM} lang={lang} />
      </div>

      <p className="mb-4 admin-caption">
        {ti(
          lang,
          "BIR 月次サマリー用。精算時に発番された OR 番号が一覧表示されます。CSV でエクスポートして月次申告に添付してください。",
          "For BIR monthly OR summary. Each row was issued atomically at settle time. Export as CSV for filing."
        )}
      </p>

      {/* Totals strip */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={ti(lang, "件数", "Receipts")}
          value={String(liveReceipts.length)}
          sub={
            voidedReceipts.length > 0
              ? ti(
                  lang,
                  `+ 取消 ${voidedReceipts.length}件`,
                  `+ ${voidedReceipts.length} voided`
                )
              : undefined
          }
        />
        <Stat
          label={ti(lang, "メニュー小計", "Menu subtotal")}
          value={formatPHP(total.menu, lang)}
        />
        <Stat
          label={ti(lang, "サービス料 (10%)", "Service charge (10%)")}
          value={formatPHP(total.svc, lang)}
        />
        <Stat
          label={ti(lang, "VAT (12%)", "VAT (12%)")}
          value={formatPHP(total.vat, lang)}
        />
      </div>
      <div className="mb-6 border border-gold/40 bg-gold/[0.04] px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold">
          {ti(lang, "月計 (税サ込)", "Grand total (incl. tax/svc)")}
        </p>
        <p className="mt-1 font-mono admin-num text-2xl font-semibold text-gold">
          {formatPHP(total.grand, lang)}
        </p>
        {Object.keys(byMethod).length > 0 && (
          <p className="mt-1 admin-caption">
            {ti(lang, "支払方法別: ", "By method: ")}
            {Object.entries(byMethod)
              .map(([k, v]) => `${k} ${formatPHP(v, lang)}`)
              .join(" · ")}
          </p>
        )}
      </div>

      {/* Export */}
      <div className="mb-4">
        <a
          href={`/api/admin/receipts/export?y=${targetY}&m=${targetM}`}
          className="inline-flex items-center gap-2 border border-border bg-surface px-4 py-2 text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/50 hover:text-gold"
        >
          <Download size={14} />
          {ti(lang, "CSV ダウンロード", "Download CSV")}
        </a>
      </div>

      {/* Table */}
      <section className="border border-border bg-surface">
        {receipts.length === 0 ? (
          <p className="border border-dashed border-border/60 px-6 py-12 text-center admin-caption">
            <FileText
              size={28}
              className="mx-auto mb-2 text-text-muted"
              aria-hidden="true"
            />
            {ti(
              lang,
              "この月は領収書がありません。",
              "No receipts issued in this month yet."
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                <tr>
                  <th className="px-3 py-3 text-left">
                    {ti(lang, "発行日時", "Issued")}
                  </th>
                  <th className="px-3 py-3 text-left">
                    {ti(lang, "OR 番号", "OR No.")}
                  </th>
                  <th className="px-3 py-3 text-left">
                    {ti(lang, "お客様", "Guest")}
                  </th>
                  <th className="px-3 py-3 text-right">
                    {ti(lang, "メニュー", "Menu")}
                  </th>
                  <th className="px-3 py-3 text-right">
                    {ti(lang, "サービス料", "Svc")}
                  </th>
                  <th className="px-3 py-3 text-right">
                    {ti(lang, "VAT", "VAT")}
                  </th>
                  <th className="px-3 py-3 text-right">
                    {ti(lang, "総額", "Total")}
                  </th>
                  <th className="px-3 py-3 text-left">
                    {ti(lang, "支払", "Method")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.voided_at
                        ? "border-b border-border/40 last:border-b-0 line-through opacity-50"
                        : "border-b border-border/40 last:border-b-0 hover:bg-card"
                    }
                  >
                    <td className="px-3 py-2.5 font-mono admin-num text-[12px]">
                      {new Date(r.issued_at).toLocaleString(
                        lang === "ja" ? "ja-JP" : "en-PH",
                        {
                          timeZone: "Asia/Manila",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono admin-num font-semibold text-gold">
                      {r.or_number}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.reservations ? (
                        <Link
                          href={`/admin/reservations/${r.reservation_id}`}
                          className="hover:text-gold"
                        >
                          {r.reservations.guest_name}
                        </Link>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                      {r.reservations && (
                        <span className="ml-2 admin-caption">
                          {r.reservations.service_date} ·{" "}
                          {r.reservations.party_size}
                          {ti(lang, "名", " pax")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num">
                      {formatPHP(r.menu_subtotal_centavos, lang)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num text-text-secondary">
                      {formatPHP(r.service_charge_centavos, lang)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num text-text-secondary">
                      {formatPHP(r.vat_centavos, lang)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono admin-num font-semibold text-gold">
                      {formatPHP(r.grand_total_centavos, lang)}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-text-secondary">
                      {r.settlement_method ?? "—"}
                      {r.voided_at && (
                        <span className="ml-2 rounded-sm bg-red-500/40 px-1 py-0.5 text-[10px] font-bold text-white">
                          {ti(lang, "取消", "VOIDED")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  const url = (y: number, m: number) => `/admin/receipts?y=${y}&m=${m}`;
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
            new Date(
              new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
            ).getFullYear(),
            new Date(
              new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
            ).getMonth() + 1
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
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </p>
      <p className="mt-1 font-mono admin-num text-xl font-semibold text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 admin-caption">{sub}</p>}
    </div>
  );
}
