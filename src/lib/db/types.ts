/**
 * Domain types mirroring the Supabase schema (supabase/migrations/0003_*.sql).
 * Hand-maintained for now; replace with `supabase gen types typescript` once
 * the project is linked.
 */

export type SeatingSlot = "s1" | "s2";

export type ReservationStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled_full"
  | "cancelled_partial"
  | "cancelled_late"
  | "no_show"
  | "completed"
  | "expired";

export type PaymentMethod = "cash" | "card" | "gcash" | "deposit_only";

export type PaymentKind =
  | "deposit_capture"
  | "refund_full"
  | "refund_partial"
  | "on_site_settlement"
  | "manual_adjustment";

export type PaymentProvider = "stripe" | "paymongo" | "on_site";

export interface RestaurantSettings {
  id: 1;
  total_seats: number;
  online_seats: number;
  seating_1_label: string;
  seating_2_label: string;
  seating_1_starts_at: string; // 'HH:MM'
  seating_2_starts_at: string;
  service_minutes: number;
  course_price_centavos: number;
  deposit_pct: number;
  refund_full_hours: number;
  refund_partial_hours: number;
  reminder_long_hours: number;
  reminder_short_hours: number;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  whatsapp_from_number: string | null;
  resend_from_email: string | null;
  timezone: string;
  monthly_revenue_target_centavos: number;
  display_name: string;
  reservations_open: boolean;
  updated_at: string;
}

export interface Reservation {
  id: string;
  service_date: string; // 'YYYY-MM-DD'
  seating: SeatingSlot;
  service_starts_at: string; // ISO
  party_size: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_lang: "ja" | "en";
  notes: string | null;
  course_price_centavos: number;
  deposit_pct: number;
  total_centavos: number;
  deposit_centavos: number;
  balance_centavos: number;
  status: ReservationStatus;
  cancel_token_hash: string;
  cancel_token_expires_at: string;
  reminder_long_sent_at: string | null;
  reminder_short_sent_at: string | null;
  settled_at: string | null;
  settlement_method: PaymentMethod | null;
  settlement_centavos: number | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: "guest" | "staff" | "system" | null;
  source: "web" | "staff" | "phone" | "walkin";
  stripe_checkout_session_id: string | null;
  /** 1-indexed counter seats assigned to this booking (rightmost = back of bar). */
  seat_numbers: number[] | null;
  /** Structured celebration / surprise metadata. NULL = ordinary booking. */
  celebration: CelebrationData | null;
}

export type CelebrationOccasion =
  | "none"
  | "birthday"
  | "anniversary"
  | "proposal"
  | "milestone_age"
  | "business"
  | "farewell"
  | "other";

export type CelebrantRelation =
  | "self"
  | "spouse"
  | "partner"
  | "parent"
  | "child"
  | "friend"
  | "colleague"
  | "other";

export type CelebrantGender = "m" | "f" | "x";

export type SurpriseTimingMoment =
  | "arrival"
  | "mid_course"
  | "dessert"
  | "farewell"
  | "custom";

export type ArrivesFirst = "booker" | "celebrant" | "together";

export interface CelebrationDeliverables {
  cake?: { size?: string; message?: string; dietary?: string };
  message_plate?: { message: string };
  flowers?: { budget_pesos?: number; color?: string };
  champagne?: { label?: string };
  projection?: { content: string };
  photo_service?: { delivery_method?: string };
  bgm?: string;
}

export interface CelebrationData {
  occasion: CelebrationOccasion;
  occasion_other?: string;
  is_surprise: boolean;
  celebrant: {
    name: string;
    relation?: CelebrantRelation;
    gender?: CelebrantGender;
    age_label?: string;
  };
  surprise?: {
    timing: SurpriseTimingMoment;
    timing_custom?: string;
    arrives_first: ArrivesFirst;
    bringing_items?: string;
    coordination_phone?: string;
  };
  deliverables: CelebrationDeliverables;
  sns_ok: boolean;
  notes_celebration?: string;
}

export interface Payment {
  id: string;
  reservation_id: string;
  kind: PaymentKind;
  provider: PaymentProvider;
  amount_centavos: number;
  method: PaymentMethod | null;
  provider_ref: string | null;
  idempotency_key: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

/**
 * Bureau of Internal Revenue (BIR) Official Receipt record.
 * One row per fully-settled reservation. Voided rows are kept for audit
 * (5-year retention) — never hard-deleted.
 *
 * The breakdown trio (menu_subtotal + service_charge + vat) MUST sum to
 * grand_total_centavos; a CHECK constraint enforces this at the DB level
 * so accounting drift is caught on insert, not at audit time.
 */
export interface Receipt {
  id: string;
  reservation_id: string;
  /** Formatted with the active series prefix, e.g. "DBM-00001234". */
  or_number: string;
  menu_subtotal_centavos: number;
  service_charge_centavos: number;
  vat_centavos: number;
  grand_total_centavos: number;
  settlement_method: PaymentMethod | null;
  issued_at: string;
  /** Admin email (audit_log.actor convention) — not an FK. */
  issued_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface ORSeries {
  id: number;
  prefix: string;
  next_number: number;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface ReservationMoney {
  reservation_id: string;
  service_date: string;
  seating: SeatingSlot;
  status: ReservationStatus;
  party_size: number;
  total_centavos: number;
  deposit_received: number;
  refunded: number;
  on_site_received: number;
  net_received: number;
}

export interface RevenueDaily {
  service_date: string;
  covers_booked: number;
  gross_booked_centavos: number;
  net_completed_centavos: number;
  no_show_deposit_kept_centavos: number;
  no_show_lost_centavos: number;
  no_show_count: number;
  cancel_count: number;
}

export interface RevenueMonthly {
  month_start: string;
  covers_booked: number;
  gross_booked_centavos: number;
  net_completed_centavos: number;
  no_show_deposit_kept_centavos: number;
  no_show_lost_centavos: number;
  no_show_count: number;
  cancel_count: number;
}

export type NotificationChannel = "telegram" | "email" | "whatsapp" | "sms";

export type NotificationKind =
  | "admin_alert"
  | "guest_confirm"
  | "reminder_long"
  | "reminder_short"
  | "cancel_confirm"
  | "no_show_alert";

export type NotificationStatus = "sent" | "failed" | "skipped";

export interface NotificationLog {
  id: number;
  reservation_id: string | null;
  channel: NotificationChannel;
  kind: NotificationKind;
  status: NotificationStatus;
  recipient: string | null;
  error_message: string | null;
  attempted_at: string;
}

export interface ClosedDate {
  closed_date: string;
  reason: string | null;
  created_at: string;
}
