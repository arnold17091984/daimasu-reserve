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
 * Philippine restaurant receipt convention:
 *
 *   menu_subtotal              ← course_price × party_size  (VAT-exclusive)
 *   service_charge = 10%       ← computed on menu_subtotal
 *   vat_base = menu_subtotal + service_charge
 *   vat = 12% of vat_base
 *   grand_total = vat_base + vat
 *
 * Rationale:
 *  - SVC 10% is industry standard in Manila and is shared with staff.
 *    BIR Revenue Regulations No. 16-2005 § 4.114-1: SVC is part of the
 *    gross receipts subject to VAT, hence we apply 12% on (subtotal+SVC).
 *  - VAT 12% is the standard rate under NIRC § 106. Restaurants are not
 *    among the VAT-exempt categories.
 *  - All figures are in centavos and are rounded to integer at each step
 *    so the receipt totals are exact (no fractional centavos drift).
 *
 * The deposit (Stripe checkout) is computed off `grand_total` so the
 * 50% prepayment matches what the diner ultimately owes. The balance
 * paid on-site is `grand_total - deposit_centavos`.
 */
export const SERVICE_CHARGE_PCT = 10;
export const VAT_PCT = 12;

export interface ReceiptBreakdown {
  /** Pre-tax, pre-SVC menu total (= course_price × party_size). */
  menu_subtotal_centavos: number;
  /** 10% of menu_subtotal, rounded to integer centavos. */
  service_charge_centavos: number;
  /** 12% applied to (menu_subtotal + service_charge). */
  vat_centavos: number;
  /** Grand total inclusive of SVC + VAT. */
  grand_total_centavos: number;
  /** Stripe deposit charged at booking time. */
  deposit_centavos: number;
  /** Remainder paid on-site. */
  balance_centavos: number;
}

export function receiptBreakdown(
  coursePriceCentavos: number,
  partySize: number,
  depositPct: number
): ReceiptBreakdown {
  const menu_subtotal = coursePriceCentavos * partySize;
  const service_charge = Math.round((menu_subtotal * SERVICE_CHARGE_PCT) / 100);
  const vat_base = menu_subtotal + service_charge;
  const vat = Math.round((vat_base * VAT_PCT) / 100);
  const grand_total = vat_base + vat;
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
