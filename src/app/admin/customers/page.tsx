/**
 * /admin/customers — guest history aggregator.
 *
 * No `customers` table exists; we derive the customer list at read-time
 * from the `reservations` rows, grouping by phone (primary key — most
 * stable). The result feeds the operator's "who is this person, have
 * they been before, what did they spend" question that drives upsell.
 *
 * Read-only for now. Filters: search by name / phone / email.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import type { Reservation } from "@/lib/db/types";
import { formatPHP } from "@/lib/domain/reservation";
import { CustomerSearch } from "./search-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface CustomerRow {
  guest_phone: string;
  guest_name: string;
  guest_email: string;
  visit_count: number;
  no_show_count: number;
  cancel_count: number;
  celebration_count: number;
  total_net_centavos: number;
  last_visit_date: string | null;
  next_booking_date: string | null;
  last_reservation_id: string;
  guest_lang: "ja" | "en";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const lang = await getAdminLang();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  await requireAdminOrRedirect();
  const sb = adminClient();
  const { data } = await sb
    .from("reservations")
    .select("*")
    .order("service_starts_at", { ascending: false })
    .limit(2000)
    .returns<Reservation[]>();
  const rows: Reservation[] = data ?? [];

  // Group by phone (treats duplicate-name people separately).
  const grouped = new Map<string, CustomerRow>();
  const today = todayIsoDate();
  for (const r of rows) {
    const key = (r.guest_phone || r.guest_email || "—").trim();
    if (!key || key === "—") continue;
    const cur = grouped.get(key);
    const isCompleted = r.status === "completed";
    const isFuture = r.service_date >= today &&
      (r.status === "confirmed" || r.status === "pending_payment");

    const hasCelebration =
      !!r.celebration && r.celebration.occasion !== "none";
    if (!cur) {
      grouped.set(key, {
        guest_phone: r.guest_phone,
        guest_name: r.guest_name,
        guest_email: r.guest_email,
        guest_lang: r.guest_lang,
        visit_count: isCompleted ? 1 : 0,
        no_show_count: r.status === "no_show" ? 1 : 0,
        cancel_count:
          r.status === "cancelled_full" ||
          r.status === "cancelled_partial" ||
          r.status === "cancelled_late"
            ? 1
            : 0,
        celebration_count: hasCelebration ? 1 : 0,
        total_net_centavos: isCompleted ? r.settlement_centavos ?? 0 : 0,
        last_visit_date: isCompleted ? r.service_date : null,
        next_booking_date: isFuture ? r.service_date : null,
        last_reservation_id: r.id,
      });
    } else {
      if (isCompleted) {
        cur.visit_count++;
        cur.total_net_centavos += r.settlement_centavos ?? 0;
        if (!cur.last_visit_date || r.service_date > cur.last_visit_date) {
          cur.last_visit_date = r.service_date;
        }
      }
      if (r.status === "no_show") cur.no_show_count++;
      if (
        r.status === "cancelled_full" ||
        r.status === "cancelled_partial" ||
        r.status === "cancelled_late"
      ) {
        cur.cancel_count++;
      }
      if (hasCelebration) cur.celebration_count++;
      if (
        isFuture &&
        (!cur.next_booking_date || r.service_date < cur.next_booking_date)
      ) {
        cur.next_booking_date = r.service_date;
      }
    }
  }

  let customers = Array.from(grouped.values());

  if (q) {
    const needle = q.toLowerCase();
    customers = customers.filter(
      (c) =>
        c.guest_name.toLowerCase().includes(needle) ||
        c.guest_phone.toLowerCase().includes(needle) ||
        c.guest_email.toLowerCase().includes(needle)
    );
  }

  // Sort: visit_count desc, then last_visit desc.
  customers.sort((a, b) => {
    if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
    const av = a.last_visit_date ?? "";
    const bv = b.last_visit_date ?? "";
    return bv.localeCompare(av);
  });

  const total = customers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const paged = customers.slice(offset, offset + PAGE_SIZE);

  // Aggregate stats for the header.
  const totalVisits = customers.reduce((s, c) => s + c.visit_count, 0);
  const repeatGuests = customers.filter((c) => c.visit_count >= 2).length;
  const upcomingGuests = customers.filter((c) => c.next_booking_date).length;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "顧客一覧", "Customers")}
        </h1>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={ti(lang, "登録顧客数", "Unique guests")}
          value={String(customers.length)}
        />
        <Stat
          label={ti(lang, "リピーター (2回以上)", "Repeat (2+)")}
          value={String(repeatGuests)}
          accent
        />
        <Stat
          label={ti(lang, "総来店数 (完了)", "Total visits")}
          value={String(totalVisits)}
        />
        <Stat
          label={ti(lang, "今後予約あり", "With upcoming")}
          value={String(upcomingGuests)}
        />
      </div>

      {/* Search */}
      <div className="mb-4">
        <CustomerSearch
          initial={q}
          placeholder={ti(
            lang,
            "名前 / 電話 / メールで検索",
            "Search by name, phone, email"
          )}
        />
      </div>

      {q && (
        <p className="mb-3 admin-caption">
          {ti(lang, `"${q}" の検索結果 ${total}件`, `${total} matches for "${q}"`)}
        </p>
      )}

      {/* Customer table */}
      {paged.length > 0 ? (
        <>
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                <tr>
                  <th className="px-3 py-3 text-left">{ti(lang, "お客様", "Guest")}</th>
                  <th className="px-3 py-3 text-right">{ti(lang, "来店", "Visits")}</th>
                  <th className="hidden px-3 py-3 text-right md:table-cell">
                    {ti(lang, "累計支払", "Spend")}
                  </th>
                  <th className="hidden px-3 py-3 text-left md:table-cell">
                    {ti(lang, "前回", "Last")}
                  </th>
                  <th className="hidden px-3 py-3 text-left lg:table-cell">
                    {ti(lang, "次回", "Next")}
                  </th>
                  <th className="hidden px-3 py-3 text-left lg:table-cell">
                    {ti(lang, "問題", "Issues")}
                  </th>
                  <th className="px-3 py-3 text-right">
                    {ti(lang, "操作", "Action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <tr
                    key={c.guest_phone}
                    className="border-b border-border/40 last:border-b-0 hover:bg-card"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="admin-body font-medium">{c.guest_name}</span>
                        {c.visit_count >= 5 && (
                          <span className="border border-gold/60 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-gold">
                            VIP
                          </span>
                        )}
                        {c.next_booking_date && (
                          <span className="border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-blue-400">
                            {ti(lang, "来店予定", "Upcoming")}
                          </span>
                        )}
                        {c.celebration_count > 0 && (
                          <span
                            className="border border-gold/60 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-gold"
                            title={ti(
                              lang,
                              `過去 ${c.celebration_count} 回お祝い記録あり`,
                              `${c.celebration_count} celebrations on file`
                            )}
                          >
                            {ti(lang, `お祝い ${c.celebration_count}`, `Celebrations ${c.celebration_count}`)}
                          </span>
                        )}
                      </div>
                      <div className="admin-caption mt-0.5">
                        {c.guest_phone}
                        {c.guest_email && !c.guest_email.endsWith("@daimasu.local") && (
                          <span> · {c.guest_email}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono admin-num">
                      <span className={c.visit_count >= 2 ? "text-gold" : ""}>
                        {c.visit_count}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right font-mono admin-num md:table-cell">
                      {c.total_net_centavos > 0
                        ? formatPHP(c.total_net_centavos, lang)
                        : "—"}
                    </td>
                    <td className="hidden px-3 py-3 text-left font-mono admin-num text-text-secondary md:table-cell">
                      {c.last_visit_date ?? "—"}
                    </td>
                    <td className="hidden px-3 py-3 text-left font-mono admin-num lg:table-cell">
                      {c.next_booking_date ? (
                        <span className="text-blue-400">{c.next_booking_date}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-left lg:table-cell">
                      {c.no_show_count > 0 ? (
                        <span className="border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-400">
                          {ti(lang, "no-show ", "no-show ")}
                          {c.no_show_count}
                        </span>
                      ) : c.cancel_count > 0 ? (
                        <span className="admin-meta">
                          {ti(lang, "Cx ", "Cx ")}
                          {c.cancel_count}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/reservations/${c.last_reservation_id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.12em] text-gold hover:text-gold-light"
                      >
                        {ti(lang, "詳細", "View")}
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} total={total} q={q} lang={lang} />
          )}
        </>
      ) : (
        <p className="border border-border bg-surface px-4 py-6 admin-body text-text-secondary">
          {q
            ? ti(lang, "該当する顧客がいません。", "No matching customers.")
            : ti(lang, "顧客データがありません。", "No customer data yet.")}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-1 font-mono admin-num text-2xl font-semibold text-gold"
            : "mt-1 font-mono admin-num text-2xl font-semibold text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  q,
  lang,
}: {
  page: number;
  totalPages: number;
  total: number;
  q: string;
  lang: AdminLang;
}) {
  const url = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/admin/customers?${sp.toString()}`;
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
        <span className="px-3 py-1.5 font-mono admin-num">
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

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
