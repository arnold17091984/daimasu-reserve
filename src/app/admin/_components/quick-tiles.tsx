/**
 * Tile-based quick-access for the admin home (Airレジ-style).
 *
 * Big touch targets (≥120px tall) so an iPad-running operator can hit
 * the most-used sections in one tap from the dashboard.
 */
import Link from "next/link";
import {
  ClipboardList,
  Plus,
  CalendarDays,
  Users,
  TrendingUp,
  CalendarX,
} from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { ti } from "@/lib/auth/admin-lang";

interface TileBadge {
  count: number;
  tone?: "info" | "danger";
}

export function QuickTiles({
  lang,
  todayCount,
  upcomingCount,
  pendingActionCount,
}: {
  lang: AdminLang;
  todayCount: number;
  upcomingCount: number;
  pendingActionCount: number;
}) {
  return (
    <section className="mb-10">
      <h2 className="admin-section-label mb-3">
        {ti(lang, "クイックアクセス", "Quick access")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          href="/admin/today"
          icon={<ClipboardList size={26} />}
          label={ti(lang, "本日のサービス表", "Service sheet")}
          sub={ti(
            lang,
            `${todayCount} 件 / 印刷可`,
            `${todayCount} bookings · printable`
          )}
          badge={todayCount > 0 ? { count: todayCount, tone: "info" } : undefined}
        />
        <Tile
          href="/admin/reservations/new"
          icon={<Plus size={26} />}
          label={ti(lang, "新規予約", "New booking")}
          sub={ti(lang, "電話 / 来店 / 手動", "Phone · walk-in · manual")}
          accent
        />
        <Tile
          href="/admin/reservations"
          icon={<CalendarDays size={26} />}
          label={ti(lang, "予約一覧", "All reservations")}
          sub={ti(
            lang,
            `今後 ${upcomingCount} 件`,
            `${upcomingCount} upcoming`
          )}
          badge={
            pendingActionCount > 0
              ? { count: pendingActionCount, tone: "danger" }
              : undefined
          }
        />
        <Tile
          href="/admin/customers"
          icon={<Users size={26} />}
          label={ti(lang, "顧客一覧", "Customers")}
          sub={ti(lang, "履歴 / リピーター", "History · repeat guests")}
        />
        <Tile
          href="/admin/revenue"
          icon={<TrendingUp size={26} />}
          label={ti(lang, "売上分析", "Revenue")}
          sub={ti(lang, "月次 / 日別 / 内訳", "Monthly · daily · breakdown")}
        />
        <Tile
          href="/admin/closed-dates"
          icon={<CalendarX size={26} />}
          label={ti(lang, "休業日", "Closed dates")}
          sub={ti(lang, "貸切 / 祝日 / 休業", "Buyouts · holidays")}
        />
      </div>
    </section>
  );
}

function Tile({
  href,
  icon,
  label,
  sub,
  badge,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  badge?: TileBadge;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        accent
          ? "group relative flex h-[124px] flex-col justify-between border-2 border-gold bg-gold/[0.06] p-4 transition-colors hover:bg-gold/[0.12]"
          : "group relative flex h-[124px] flex-col justify-between border border-border bg-surface p-4 transition-colors hover:border-gold/50 hover:bg-card"
      }
    >
      <div className="flex items-start justify-between">
        <span className={accent ? "text-gold" : "text-gold opacity-80 group-hover:opacity-100"}>
          {icon}
        </span>
        {badge && (
          <span
            className={
              badge.tone === "danger"
                ? "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 font-mono text-[12px] font-semibold text-white"
                : "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-gold px-1.5 font-mono text-[12px] font-semibold"
            }
            style={badge.tone !== "danger" ? { color: "var(--background)" } : undefined}
          >
            {badge.count}
          </span>
        )}
      </div>
      <div>
        <p className="text-[15px] font-semibold leading-tight text-foreground">
          {label}
        </p>
        <p className="mt-0.5 admin-caption">{sub}</p>
      </div>
    </Link>
  );
}
