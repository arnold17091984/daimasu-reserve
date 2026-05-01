/**
 * Counter seat map — airline-style visualization of the 8 hinoki-counter
 * seats in a single row.
 *
 * No per-seat assignment exists in the schema (a booking has just a
 * `party_size`), so this component allocates seats sequentially by
 * booking arrival — first booking gets seats 1..N, next booking gets
 * the following N, etc. The operator's question this answers is
 * "how many empty seats remain and roughly where" (or "we're 満席"),
 * not "Mr. Yamada sits at chair #3".
 *
 * Visual:
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━ 檜カウンター 8m
 *   ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
 *   │ × ││ × ││ × ││ × ││ × ││ × ││ ○ ││ ○ │
 *   │ 1 ││ 2 ││ 3 ││ 4 ││ 5 ││ 6 ││ 7 ││ 8 │
 *   └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘
 *   ▔▔山田 太郎 4名▔▔ ▔佐藤 2名▔   空 空
 */
import { X, Armchair } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

type SeatBookingShape = {
  id: string;
  guest_name: string;
  party_size: number;
  status: string;
  service_starts_at: string;
  /** When present, takes precedence over auto-sequential allocation. */
  seat_numbers?: number[] | null;
};

interface Props {
  totalSeats: number;
  bookings: SeatBookingShape[];
  lang: AdminLang;
  /** Compact (smaller squares) for the dashboard inline view. */
  compact?: boolean;
  /** Show the wood counter bar + legend above. Default true. */
  showCounter?: boolean;
}

const ti = (lang: AdminLang, ja: string, en: string) =>
  lang === "ja" ? ja : en;

export function CounterSeatMap({
  totalSeats,
  bookings,
  lang,
  compact = false,
  showCounter = true,
}: Props) {
  // Filter out cancellations — those don't actually occupy a seat.
  const live = bookings.filter(
    (b) =>
      b.status !== "cancelled_full" &&
      b.status !== "cancelled_partial" &&
      b.status !== "cancelled_late" &&
      b.status !== "expired"
  );

  // Sort by service_starts_at then guest_name for stable ordering.
  const sorted = [...live].sort((a, b) => {
    const t = a.service_starts_at.localeCompare(b.service_starts_at);
    return t !== 0 ? t : a.guest_name.localeCompare(b.guest_name);
  });

  // Use actual seat_numbers when the booking has them; fall back to
  // sequential allocation from seat 1 for legacy rows missing the column.
  const seatToBooking: Array<SeatBookingShape | null> = Array(totalSeats).fill(null);
  let nextLegacy = 1;
  for (const b of sorted) {
    if (b.seat_numbers && b.seat_numbers.length > 0) {
      for (const s of b.seat_numbers) {
        if (s >= 1 && s <= totalSeats) seatToBooking[s - 1] = b;
      }
    } else {
      // Legacy fallback: leftmost free seats.
      let assigned = 0;
      while (assigned < b.party_size && nextLegacy <= totalSeats) {
        if (seatToBooking[nextLegacy - 1] === null) {
          seatToBooking[nextLegacy - 1] = b;
          assigned++;
        }
        nextLegacy++;
      }
    }
  }

  const taken = seatToBooking.filter((s) => s !== null).length;
  const remaining = Math.max(0, totalSeats - taken);
  const isFull = remaining === 0 && totalSeats > 0;

  // The seat box is a square; size from compact flag.
  const sizeCls = compact ? "min-w-0 aspect-square" : "min-w-0 aspect-square";

  // Walk the seat array and emit consecutive runs of the same booking
  // (or null = empty). Used to render a single group label spanning the
  // run, so operators can see "these 4 seats = Yamada Taro" at a glance.
  const groups: Array<{ start: number; count: number; booking: SeatBookingShape | null }> = [];
  for (let i = 0; i < totalSeats; ) {
    const b = seatToBooking[i];
    let j = i;
    while (j < totalSeats && seatToBooking[j] === b) j++;
    groups.push({ start: i, count: j - i, booking: b });
    i = j;
  }

  return (
    <div className="w-full">
      {showCounter && (
        <div className={compact ? "mb-1.5" : "mb-2.5"}>
          <div
            className={
              compact
                ? "flex items-center justify-between border-y border-gold/40 bg-gold/[0.04] px-3 py-1.5"
                : "flex items-center justify-between border-y border-gold/50 bg-gold/[0.05] px-4 py-2.5"
            }
          >
            <span
              className={
                compact
                  ? "text-[11px] font-medium uppercase tracking-[0.14em] text-gold"
                  : "text-[12px] font-medium uppercase tracking-[0.16em] text-gold"
              }
            >
              {ti(lang, "檜カウンター 8m", "Hinoki counter · 8m")}
            </span>
            <span className="font-mono admin-num text-[12px] text-text-secondary">
              {taken}/{totalSeats}
            </span>
          </div>
        </div>
      )}

      {/* Seat row + group labels — single 2-row grid so labels span
          across all the seats that belong to the same booking. */}
      <div
        className={compact ? "grid gap-x-1 gap-y-0.5" : "grid gap-x-1.5 gap-y-1"}
        style={{
          gridTemplateColumns: `repeat(${Math.min(totalSeats, 8)}, minmax(0, 1fr))`,
        }}
      >
        {/* Row 1: seat squares */}
        {seatToBooking.map((b, i) => (
          <SeatSquare
            key={`seat-${i}`}
            number={i + 1}
            booking={b}
            compact={compact}
            sizeCls={sizeCls}
            lang={lang}
          />
        ))}
        {/* Row 2: group label bars — one per booked group, spans the
            booking's seat range. Empty groups render nothing. */}
        {groups.map((g) =>
          g.booking ? (
            <div
              key={`group-${g.start}`}
              style={{
                gridColumn: `${g.start + 1} / span ${g.count}`,
                gridRow: 2,
              }}
              className={
                compact
                  ? "flex items-center justify-center gap-1 border-l-2 border-r-2 border-b-2 border-red-500/60 bg-red-500/[0.18] px-1 py-0.5 text-[10px] font-semibold leading-none text-red-400"
                  : "flex items-center justify-center gap-1.5 border-l-2 border-r-2 border-b-2 border-red-500/70 bg-red-500/[0.18] px-2 py-1 text-[12px] font-semibold leading-none text-red-400"
              }
              title={`${g.booking.guest_name} (${g.booking.party_size}${ti(lang, "名", " pax")})`}
            >
              <span className="min-w-0 truncate">
                {g.booking.guest_name}
              </span>
              <span
                className={
                  compact
                    ? "shrink-0 rounded-sm bg-red-500/30 px-1 font-mono text-[9px] text-red-300"
                    : "shrink-0 rounded-sm bg-red-500/30 px-1.5 py-0.5 font-mono text-[10px] text-red-300"
                }
              >
                {g.booking.party_size}
                {ti(lang, "名", "")}
              </span>
            </div>
          ) : (
            <div
              key={`gap-${g.start}`}
              style={{
                gridColumn: `${g.start + 1} / span ${g.count}`,
                gridRow: 2,
              }}
              aria-hidden="true"
            />
          )
        )}
      </div>

      {/* Footer status */}
      {showCounter && (
        <div
          className={
            compact
              ? "mt-2 flex items-center justify-between admin-meta"
              : "mt-3 flex items-center justify-between"
          }
        >
          <Legend lang={lang} compact={compact} />
          {isFull ? (
            <span
              className={
                compact
                  ? "border border-red-500/60 bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.10em] text-red-400"
                  : "border border-red-500/60 bg-red-500/15 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-red-400"
              }
            >
              {ti(lang, "満席", "FULL")}
            </span>
          ) : remaining <= 1 ? (
            <span
              className={
                compact
                  ? "border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-400"
                  : "border border-amber-500/60 bg-amber-500/10 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.10em] text-amber-400"
              }
            >
              {ti(lang, `あと ${remaining} 席`, `${remaining} LEFT`)}
            </span>
          ) : (
            <span
              className={
                compact
                  ? "font-mono admin-num text-[12px] font-medium text-foreground"
                  : "font-mono admin-num text-base font-medium text-foreground"
              }
            >
              <span className="text-text-secondary">
                {ti(lang, "残 ", "")}
              </span>
              {remaining}
              <span className="text-text-secondary">
                {ti(lang, " 席", " left")}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SeatSquare({
  number,
  booking,
  compact,
  sizeCls,
  lang,
}: {
  number: number;
  booking: SeatBookingShape | null;
  compact: boolean;
  sizeCls: string;
  lang: AdminLang;
}) {
  const isTaken = booking !== null;

  if (!isTaken) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center border border-border bg-card text-text-muted ${sizeCls}`}
        title={ti(lang, `${number}番 — 空席`, `Seat ${number} — empty`)}
      >
        <Armchair size={compact ? 18 : 24} aria-hidden="true" />
        <span
          className={
            compact
              ? "absolute left-1 top-0.5 font-mono text-[9px]"
              : "absolute left-1.5 top-1 font-mono text-[10px]"
          }
        >
          {number}
        </span>
        <span
          className={
            compact
              ? "mt-0.5 text-[9px] uppercase tracking-[0.06em]"
              : "mt-0.5 text-[10px] uppercase tracking-[0.08em]"
          }
        >
          {ti(lang, "空", "open")}
        </span>
      </div>
    );
  }

  // Group name + party_size now live in the bracket bar below the seat
  // row (rendered by the parent grid). Each individual seat just shows
  // the X + seat number.
  return (
    <div
      className={`relative flex flex-col items-center justify-center border-2 border-b-0 border-red-500/60 bg-red-500/[0.12] text-red-400 ${sizeCls}`}
      title={`${booking.guest_name} (${booking.party_size}${ti(lang, "名", " pax")})`}
    >
      <X size={compact ? 22 : 32} strokeWidth={2.5} aria-hidden="true" />
      <span
        className={
          compact
            ? "absolute left-1 top-0.5 font-mono text-[9px] text-red-400/70"
            : "absolute left-1.5 top-1 font-mono text-[10px] text-red-400/70"
        }
      >
        {number}
      </span>
    </div>
  );
}

function Legend({
  lang,
  compact,
}: {
  lang: AdminLang;
  compact: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-3 admin-meta"
          : "flex items-center gap-4 admin-caption"
      }
    >
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-3 w-3 items-center justify-center border border-red-500/60 bg-red-500/[0.15]">
          <X size={8} strokeWidth={3} className="text-red-400" />
        </span>
        {ti(lang, "予約済", "booked")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-3 w-3 items-center justify-center border border-border bg-card" />
        {ti(lang, "空席", "open")}
      </span>
    </div>
  );
}
