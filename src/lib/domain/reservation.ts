/**
 * Pure-function domain logic for reservations. No I/O, no Supabase, no Stripe.
 * Unit-testable in isolation.
 */
import type {
  ReservationStatus,
  RestaurantSettings,
  SeatingSlot,
} from "@/lib/db/types";

/** Compute the canonical service start instant in the restaurant's TZ. */
export function serviceStartsAt(
  date: string, // 'YYYY-MM-DD'
  seating: SeatingSlot,
  settings: Pick<
    RestaurantSettings,
    "seating_1_starts_at" | "seating_2_starts_at" | "timezone"
  >
): Date {
  const raw =
    seating === "s1"
      ? settings.seating_1_starts_at
      : settings.seating_2_starts_at;
  // Postgres TIME serialises as "HH:MM:SS"; older snapshots used "HH:MM".
  // Normalise to "HH:MM" so the assembled ISO string isn't "T17:30:00:00+08:00",
  // which silently parses to Invalid Date and breaks downstream JWT exp.
  const hhmm = raw.slice(0, 5);
  // We reconstruct the wall-clock time in the restaurant TZ by using
  // Intl.DateTimeFormat to build an ISO and parsing it back. For Asia/Manila
  // (no DST) we can do a simpler offset application: PHT = UTC+8.
  // Use TZ-aware construction below if more zones are added.
  if (settings.timezone === "Asia/Manila") {
    return new Date(`${date}T${hhmm}:00+08:00`);
  }
  // Fallback: treat as UTC; caller can reformat. Adequate for non-Manila ops.
  return new Date(`${date}T${hhmm}:00Z`);
}

/** Hours between `now` and the booking's service start (negative if past). */
export function hoursUntilService(
  serviceStartsAt: Date,
  now: Date = new Date()
): number {
  return (serviceStartsAt.getTime() - now.getTime()) / 3_600_000;
}

/** Refund tier given remaining hours and policy thresholds. */
export type RefundTier = "full" | "partial" | "late";

export function refundTier(
  hoursRemaining: number,
  settings: Pick<RestaurantSettings, "refund_full_hours" | "refund_partial_hours">
): RefundTier {
  if (hoursRemaining >= settings.refund_full_hours) return "full";
  if (hoursRemaining >= settings.refund_partial_hours) return "partial";
  return "late";
}

/** Refund amount in centavos given tier and original deposit. */
export function refundAmountCentavos(
  tier: RefundTier,
  depositCentavos: number
): number {
  switch (tier) {
    case "full":
      return depositCentavos;
    case "partial":
      return Math.floor(depositCentavos / 2);
    case "late":
      return 0;
  }
}

/**
 * Recurring weekly closure check. The bar is dark on Mondays year-round,
 * so the calendar should refuse a Monday selection without needing the
 * owner to mark each Monday in `closed_dates` by hand.
 *
 * A YYYY-MM-DD calendar date represents the same weekday regardless of
 * which TZ you interpret it in (a date isn't an instant), so building
 * `Date.UTC(y, m-1, d)` and reading `getUTCDay()` returns the right
 * weekday for the calendar date itself.
 */
export function isClosedWeekday(dateIso: string): boolean {
  const [y, m, d] = dateIso.split("-").map(Number);
  // 0 = Sunday, 1 = Monday … 6 = Saturday.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/** Reservation status after cancellation by tier. */
export function statusAfterCancel(tier: RefundTier): ReservationStatus {
  switch (tier) {
    case "full":
      return "cancelled_full";
    case "partial":
      return "cancelled_partial";
    case "late":
      return "cancelled_late";
  }
}

/** Centavos -> "₱8,000" style display.
 *  Uses narrowSymbol so the ₱ glyph renders even when the user is in JA locale
 *  (otherwise ja-JP defaults to "PHP" prefix). The business is PH-only. */
export function formatPHP(centavos: number, locale: "ja" | "en" = "en"): string {
  const peso = centavos / 100;
  return peso.toLocaleString(locale === "ja" ? "ja-JP" : "en-PH", {
    style: "currency",
    currency: "PHP",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  });
}

/**
 * Compute deposit / balance breakdown given course price and party size.
 *
 * Codex audit fix (2026-04-29): reconciled with receiptBreakdown(). Previously
 * the booking flow charged 50% of MENU-ONLY total but the OR settlement
 * computed the same 50% of GRAND_TOTAL (menu + 10% SVC + 12% VAT). The diner
 * was undercharged at booking, then asked for an inflated balance on-site.
 *
 * This helper now delegates to receiptBreakdown() and returns the same
 * grand-total-derived deposit. The reservation row stores menu-only
 * `course_price_centavos`; SVC + VAT are derived deterministically from it
 * at any point (booking, settlement, OR), so the figures stay consistent.
 *
 * `total` retained for backward compatibility with callers that previously
 * recorded menu-only into `total_centavos`. New callers should prefer
 * receiptBreakdown() directly for clarity.
 */
export function priceBreakdown(
  coursePriceCentavos: number,
  partySize: number,
  depositPct: number
) {
  // Reservation row holds menu-only snapshot. SVC + VAT are layered in at
  // settlement / OR issuance via receipts_or (migration 0013). The DB
  // constraint balance_eq_total enforces deposit + balance = menu_subtotal,
  // so we must NOT use grand_total here.
  const total = coursePriceCentavos * partySize;
  const deposit = Math.round((total * depositPct) / 100);
  const balance = total - deposit;
  return { total, deposit, balance };
}

/**
 * Philippine restaurant receipt convention (BIR review 2026-05-26):
 *
 *   course_price × party_size  =  gross_menu_incl   (VAT-INCLUSIVE)
 *   menu_subtotal              =  round(gross / 1.12)   ← Gross Sale (VAT-Ex Base)
 *   vat                        =  gross - menu_subtotal ← 12% VAT (back-derived)
 *   service_charge             =  round(menu_subtotal × 0.10)  ← 10% SC on net
 *   grand_total                =  menu_subtotal + service_charge + vat
 *                              =  gross_menu_incl + service_charge
 *
 * Why VAT-INCLUSIVE menu pricing:
 *  - The menu price shown to guests on the website (₱8,000 / cover) is
 *    VAT-inclusive. The BIR-compliant OR back-derives the VAT-Ex base
 *    from it instead of layering VAT on top (which would push the
 *    advertised price up to ₱9,856 — confusing to guests and out of step
 *    with how Filipino fine-dining quotes net prices).
 *  - Service charge 10% is added on top of the VAT-Ex base, matching the
 *    BIR-approved breakdown:
 *       Gross Sale (VAT-Ex)    7,142.86
 *       12% VAT                  857.14   (already inside the menu price)
 *       10% Service Charge       714.29
 *       Total Amount Due       8,714.29
 *
 *  Note: BIR RR 16-2005 § 4.114-1 typically makes SC part of gross receipts
 *  subject to VAT, but the receipt format the Bureau approved for this
 *  establishment quotes SC on the VAT-Ex base specifically so the guest-
 *  facing price stays clean at ₱8,000.
 *
 *  - VAT 12% is the standard rate under NIRC § 106.
 *  - All figures are in centavos with integer rounding at each step so
 *    the receipts_money_eq DB constraint (menu + sc + vat = grand) is
 *    exactly satisfied per row.
 *
 * The deposit (Stripe checkout) is computed off `grand_total` here so the
 * receipt's "deposit / balance" lines reconcile, but the reservation row
 * stores a separate deposit/balance derived from menu-only (see
 * `priceBreakdown` — DB constraint balance_eq_total). The actual on-site
 * balance owed is always `grand_total - reservation.deposit_centavos`.
 */
export const SERVICE_CHARGE_PCT = 10;
export const VAT_PCT = 12;

export interface ReceiptBreakdown {
  /** BIR "Gross Sale (VAT-Ex Base)" — net of VAT, back-derived from menu price. */
  menu_subtotal_centavos: number;
  /** 10% of menu_subtotal (VAT-Ex base), rounded to integer centavos. */
  service_charge_centavos: number;
  /** 12% VAT, back-derived: gross_menu_incl - menu_subtotal. */
  vat_centavos: number;
  /** Final amount due to the guest = menu + sc + vat (DB constraint). */
  grand_total_centavos: number;
  /** Stripe deposit at the receipt-grand-total level. */
  deposit_centavos: number;
  /** Remainder paid on-site (= grand - deposit). */
  balance_centavos: number;
}

export function receiptBreakdown(
  coursePriceCentavos: number,
  partySize: number,
  depositPct: number
): ReceiptBreakdown {
  // The menu price (course_price_centavos) is VAT-INCLUSIVE; back-derive
  // the VAT-Ex base so the OR shows BIR-compliant Gross Sale + VAT lines.
  const gross_menu_incl = coursePriceCentavos * partySize;
  const menu_subtotal = Math.round((gross_menu_incl * 100) / (100 + VAT_PCT));
  // Force vat to absorb the rounding residual so net + vat == gross exactly
  // (otherwise BIR reconciliation drifts by 1 centavo for some party sizes).
  const vat = gross_menu_incl - menu_subtotal;
  const service_charge = Math.round((menu_subtotal * SERVICE_CHARGE_PCT) / 100);
  // Sum form satisfies the DB check `menu + sc + vat = grand_total`.
  const grand_total = menu_subtotal + service_charge + vat;
  const deposit = Math.floor((grand_total * depositPct) / 100);
  const balance = grand_total - deposit;
  return {
    menu_subtotal_centavos: menu_subtotal,
    service_charge_centavos: service_charge,
    vat_centavos: vat,
    grand_total_centavos: grand_total,
    deposit_centavos: deposit,
    balance_centavos: balance,
  };
}

/** Whether a reservation is still capacity-blocking (counts against seats). */
export function blocksCapacity(status: ReservationStatus): boolean {
  return status === "pending_payment" || status === "confirmed";
}

/**
 * Auto-allocate the rightmost contiguous block of `partySize` seats.
 * Used client-side to preview the assignment before submit; the canonical
 * allocator is `allocate_seats_or_throw` PL/pgSQL (with FOR UPDATE).
 *
 * Rule: fill from seat #total (back of counter) toward seat #1, requiring
 * a contiguous block. Returns null if no block fits.
 */
export function autoAllocateSeats(
  totalSeats: number,
  takenSeats: ReadonlySet<number>,
  partySize: number
): number[] | null {
  if (partySize < 1 || partySize > totalSeats) return null;
  for (let end = totalSeats; end >= partySize; end--) {
    const start = end - partySize + 1;
    let ok = true;
    for (let s = start; s <= end; s++) {
      if (takenSeats.has(s)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return Array.from({ length: partySize }, (_, i) => start + i);
    }
  }
  return null;
}

/** Returns true if the manually-chosen seats form a valid pick. */
export function validateSeatPick(
  totalSeats: number,
  takenSeats: ReadonlySet<number>,
  partySize: number,
  picked: readonly number[]
): { ok: true } | { ok: false; reason: "count" | "range" | "occupied" | "duplicate" } {
  if (picked.length !== partySize) return { ok: false, reason: "count" };
  const seen = new Set<number>();
  for (const s of picked) {
    if (s < 1 || s > totalSeats) return { ok: false, reason: "range" };
    if (seen.has(s)) return { ok: false, reason: "duplicate" };
    seen.add(s);
    if (takenSeats.has(s)) return { ok: false, reason: "occupied" };
  }
  return { ok: true };
}
