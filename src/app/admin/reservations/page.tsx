/**
 * /admin/reservations — paginated list with filters + search.
 * Default view: upcoming (today + future), confirmed/pending only.
 * Query: ?filter=upcoming|today|past|all  ?q=<search>  ?page=<n>
 */
import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import { formatPHP } from "@/lib/domain/reservation";
import type { Reservation } from "@/lib/db/types";
import { ReservationSearch } from "./search-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const FILTERS = [
  { key: "upcoming", labelJa: "今後の予約", labelEn: "Upcoming" },
  { key: "today", labelJa: "本日", labelEn: "Today" },
  { key: "past", labelJa: "過去", labelEn: "Past" },
  { key: "all", labelJa: "すべて", labelEn: "All" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const lang = await getAdminLang();
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ??
    "upcoming") as FilterKey;
  const today = todayIsoDate();
  const searchTerm = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  await requireAdminOrRedirect();
  const sb = adminClient();
  let q = sb.from("reservations").select("*", { count: "exact" });
  switch (filter) {
    case "upcoming":
      q = q
        .gte("service_date", today)
        .in("status", ["pending_payment", "confirmed"])
        .order("service_starts_at", { ascending: true });
      break;
    case "today":
      q = q
        .eq("service_date", today)
        .order("service_starts_at", { ascending: true });
      break;
    case "past":
      q = q.lt("service_date", today).order("service_date", { ascending: false });
      break;
    case "all":
      q = q.order("created_at", { ascending: false });
      break;
  }
  if (searchTerm) {
    const escaped = searchTerm.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(
      `guest_name.ilike.%${escaped}%,guest_email.ilike.%${escaped}%,guest_phone.ilike.%${escaped}%,notes.ilike.%${escaped}%`
    );
  }
  const { data, count } = await q
    .range(offset, offset + PAGE_SIZE - 1)
    .returns<Reservation[]>();
  const rows: Reservation[] | null = data;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "予約一覧", "Reservations")}
        </h1>
        <Link
          href="/admin/reservations/new"
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-gold/80 hover:text-gold"
        >
          + {ti(lang, "新規予約 (電話/来店)", "New booking")}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ReservationSearch
          initial={searchTerm}
          filter={filter}
          placeholder={ti(lang, "名前 / 電話 / メール / 備考で検索", "Search by name, phone, email, note")}
        />
        <nav className="flex flex-wrap gap-1 text-[12px] font-medium uppercase tracking-[0.12em]">
          {FILTERS.map((f) => {
            const url = new URL("https://x.local/admin/reservations");
            url.searchParams.set("filter", f.key);
            if (searchTerm) url.searchParams.set("q", searchTerm);
            const href = `${url.pathname}?${url.searchParams.toString()}`;
            return (
              <Link
                key={f.key}
                href={href}
                className={
                  f.key === filter
                    ? "border border-gold/60 bg-gold/10 px-3 py-1.5 text-gold"
                    : "border border-transparent px-3 py-1.5 text-text-muted hover:text-foreground"
                }
              >
                {ti(lang, f.labelJa, f.labelEn)}
              </Link>
            );
          })}
        </nav>
      </div>

      {searchTerm && (
        <p className="mb-3 admin-caption">
          {ti(
            lang,
            `"${searchTerm}" の検索結果 ${total}件`,
            `${total} matches for "${searchTerm}"`
          )}
        </p>
      )}

      {rows && rows.length > 0 ? (
        <>
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left">{ti(lang, "日時", "When")}</th>
                  <th className="px-3 py-2 text-left">{ti(lang, "お客様", "Guest")}</th>
                  <th className="px-3 py-2 text-right">{ti(lang, "人数", "Pax")}</th>
                  <th className="px-3 py-2 text-right">{ti(lang, "合計", "Total")}</th>
                  <th className="hidden px-3 py-2 text-left lg:table-cell">{ti(lang, "経路", "Source")}</th>
                  <th className="px-3 py-2 text-left">{ti(lang, "状態", "Status")}</th>
                  <th className="px-3 py-2 text-right">{ti(lang, "操作", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-b-0 hover:bg-background/30">
                    <td className="px-3 py-2 font-mono admin-num text-[13px]">
                      <div>
                        {new Date(r.service_starts_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
                          timeZone: "Asia/Manila",
                          month: "short",
                          day: "2-digit",
                          weekday: "short",
                        })}
                      </div>
                      <div className="text-text-muted">
                        {new Date(r.service_starts_at).toLocaleTimeString(lang === "ja" ? "ja-JP" : "en-PH", {
                          timeZone: "Asia/Manila",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-foreground">{r.guest_name}</div>
                      <div className="admin-meta">
                        {r.guest_phone}
                        {r.guest_email && <span> · {r.guest_email}</span>}
                      </div>
                      {r.notes && (
                        <div className="mt-0.5 max-w-md admin-meta text-gold line-clamp-2">
                          {ti(lang, "備考: ", "Note: ")}
                          {r.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.party_size}</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatPHP(r.total_centavos, lang)}
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      <SourcePill source={r.source} lang={lang} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} lang={lang} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/reservations/${r.id}`}
                        className="text-[12px] font-medium uppercase tracking-[0.12em] text-gold hover:text-gold-light"
                      >
                        {ti(lang, "詳細", "View")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              filter={filter}
              q={searchTerm}
              lang={lang}
            />
          )}
        </>
      ) : (
        <p className="border border-border bg-surface px-3 py-5 text-sm text-text-muted">
          {searchTerm
            ? ti(lang, "該当する予約がありません。", "No matching reservations.")
            : ti(lang, "予約はありません。", "No reservations.")}
        </p>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  filter,
  q,
  lang,
}: {
  page: number;
  totalPages: number;
  total: number;
  filter: FilterKey;
  q: string;
  lang: AdminLang;
}) {
  const url = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("filter", filter);
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/admin/reservations?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 admin-caption">
      <span>
        {ti(
          lang,
          `${total}件中 ${(page - 1) * PAGE_SIZE + 1}〜${Math.min(page * PAGE_SIZE, total)}件目`,
          `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
        )}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 && (
          <Link
            href={url(page - 1)}
            className="border border-border px-3 py-1.5 uppercase tracking-[0.14em] hover:border-gold/40 hover:text-gold"
          >
            {ti(lang, "前", "Prev")}
          </Link>
        )}
        <span className="px-3 py-1.5 font-mono">
          {page} / {totalPages}
        </span>
        {page < totalPages && (
          <Link
            href={url(page + 1)}
            className="border border-border px-3 py-1.5 uppercase tracking-[0.14em] hover:border-gold/40 hover:text-gold"
          >
            {ti(lang, "次", "Next")}
          </Link>
        )}
      </div>
    </div>
  );
}

function SourcePill({
  source,
  lang,
}: {
  source: Reservation["source"];
  lang: AdminLang;
}) {
  const labels: Record<Reservation["source"], { ja: string; en: string }> = {
    web: { ja: "Web", en: "Web" },
    staff: { ja: "店舗", en: "Staff" },
    phone: { ja: "電話", en: "Phone" },
    walkin: { ja: "来店", en: "Walk-in" },
  };
  return (
    <span className="inline-block border border-border/60 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
      {labels[source][lang]}
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
    completed: { ja: "終了", en: "Completed" },
    no_show: { ja: "no-show", en: "No-show" },
    cancelled_full: { ja: "Cx (100%)", en: "Cancelled (100%)" },
    cancelled_partial: { ja: "Cx (50%)", en: "Cancelled (50%)" },
    cancelled_late: { ja: "Cx (0%)", en: "Cancelled (0%)" },
    expired: { ja: "期限切れ", en: "Expired" },
  };
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${styles[status]}`}
    >
      {labels[status][lang]}
    </span>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
