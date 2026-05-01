/**
 * Capacity bar with strong 満席 / 残席 messaging.
 *
 * Operator's job at glance: "are there seats? how many?". The default
 * SeatBar showed `4/8` which buries the answer. This shows
 *   - "残 4 席" in big text when there's room
 *   - "満席" (red) when taken >= total
 *   - "あと1席" (amber) when only 1 left, to nudge staff toward holding it
 * plus a thin progress bar for the analog feel.
 */
import type { AdminLang } from "@/lib/auth/admin-lang";

interface Props {
  label: string;
  /** Pax already booked into this slot. */
  taken: number;
  /** Total online-bookable seats for this slot. */
  total: number;
  lang: AdminLang;
  /** Compact = single-line for tight cards (e.g. day-after preview). */
  compact?: boolean;
}

export function CapacityBar({
  label,
  taken,
  total,
  lang,
  compact = false,
}: Props) {
  const pct = total > 0 ? Math.min(100, (taken / total) * 100) : 0;
  const remaining = Math.max(0, total - taken);
  const isFull = remaining === 0;
  const isLastFew = !isFull && remaining <= 1;

  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary">
          {label}
        </span>
        <span className="font-mono admin-num text-[12px] text-text-muted">
          {taken}/{total}
        </span>
      </div>

      {/* Big status text (the operator's actual answer) */}
      {isFull ? (
        <div
          className={
            compact
              ? "flex items-center gap-2 border border-red-500/60 bg-red-500/15 px-2.5 py-1.5"
              : "flex items-center justify-between border border-red-500/60 bg-red-500/15 px-3 py-2"
          }
        >
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-red-400">
            {ti("満席", "FULL")}
          </span>
          {!compact && (
            <span className="admin-meta">
              {ti("オンライン予約不可", "no online booking")}
            </span>
          )}
        </div>
      ) : isLastFew ? (
        <div
          className={
            compact
              ? "flex items-center gap-2 border border-amber-500/60 bg-amber-500/15 px-2.5 py-1.5"
              : "flex items-center justify-between border border-amber-500/60 bg-amber-500/15 px-3 py-2"
          }
        >
          <span className="text-[13px] font-bold uppercase tracking-[0.10em] text-amber-400">
            {ti(`残り ${remaining} 席`, `${remaining} seat left`)}
          </span>
          {!compact && (
            <span className="admin-meta">
              {ti("もうすぐ満席", "almost full")}
            </span>
          )}
        </div>
      ) : (
        <div
          className={
            compact
              ? "flex items-center gap-2"
              : "flex items-baseline justify-between"
          }
        >
          <span className="font-mono admin-num text-xl font-semibold text-foreground">
            <span className="text-[12px] font-normal text-text-secondary">
              {ti("残 ", "")}
            </span>
            {remaining}
            <span className="ml-0.5 text-[12px] font-normal text-text-secondary">
              {ti(" 席", " left")}
            </span>
          </span>
          {!compact && (
            <span className="admin-meta">
              {ti(`合計 ${total} 席`, `of ${total}`)}
            </span>
          )}
        </div>
      )}

      {/* Thin progress bar */}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden bg-card">
        <div
          className={
            isFull
              ? "h-full bg-red-500"
              : isLastFew
                ? "h-full bg-amber-500"
                : pct > 75
                  ? "h-full bg-amber-500/80"
                  : "h-full bg-gold"
          }
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
