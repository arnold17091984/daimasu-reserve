/**
 * Hand-rolled Supabase Database type for our schema.
 *
 * Replace with `pnpm supabase gen types typescript --linked > database.types.ts`
 * once the Supabase project is linked. The shape below mirrors the SQL
 * migrations in supabase/migrations/.
 *
 * Inserts intentionally permissive: zod validates inputs at the API boundary,
 * so the structural type just needs to permit Reservation/Payment columns.
 */
import type {
  Reservation,
  Payment,
  RestaurantSettings,
  PaymentKind,
  PaymentMethod,
  PaymentProvider,
  ReservationStatus,
  SeatingSlot,
  ReservationMoney,
  RevenueDaily,
  RevenueMonthly,
} from "@/lib/db/types";

interface AuditLogRow {
  id: number;
  occurred_at: string;
  actor: string;
  actor_ip: string | null;
  reservation_id: string | null;
  action: string;
  before_data: unknown;
  after_data: unknown;
  reason: string | null;
}

interface ClosedDateRow {
  closed_date: string;
  reason: string | null;
  created_at: string;
}

interface AdminOwnerRow {
  email: string;
  display_name: string | null;
  created_at: string;
}

type ReservationInsert = {
  id?: string;
  service_date: string;
  seating: SeatingSlot;
  service_starts_at: string;
  party_size: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_lang?: "ja" | "en";
  notes?: string | null;
  course_price_centavos: number;
  deposit_pct: number;
  deposit_centavos: number;
  balance_centavos: number;
  status?: ReservationStatus;
  cancel_token_hash: string;
  cancel_token_expires_at: string;
  source?: "web" | "staff" | "phone" | "walkin";
  stripe_checkout_session_id?: string | null;
};

type ReservationUpdate = Partial<{
  status: ReservationStatus;
  notes: string | null;
  source: "web" | "staff" | "phone" | "walkin";
  reminder_long_sent_at: string | null;
  reminder_short_sent_at: string | null;
  settled_at: string | null;
  settlement_method: PaymentMethod | null;
  settlement_centavos: number | null;
  cancelled_at: string | null;
  cancelled_by: "guest" | "staff" | "system" | null;
  cancel_token_hash: string;
  cancel_token_expires_at: string;
  stripe_checkout_session_id: string | null;
}>;

type PaymentInsert = {
  reservation_id: string;
  kind: PaymentKind;
  provider: PaymentProvider;
  amount_centavos: number;
  method?: PaymentMethod | null;
  provider_ref?: string | null;
  idempotency_key: string;
  notes?: string | null;
  recorded_by?: string | null;
};

type AuditLogInsert = {
  actor: string;
  actor_ip?: string | null;
  reservation_id?: string | null;
  action: string;
  before_data?: unknown;
  after_data?: unknown;
  reason?: string | null;
};

type ClosedDateInsert = {
  closed_date: string;
  reason?: string | null;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      reservations: {
        Row: Reservation;
        Insert: ReservationInsert;
        Update: ReservationUpdate;
        Relationships: [];
      };
      payments: {
        Row: Payment;
        Insert: PaymentInsert;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "payments_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          }
        ];
      };
      restaurant_settings: {
        Row: RestaurantSettings;
        Insert: Partial<RestaurantSettings>;
        Update: Partial<RestaurantSettings>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      closed_dates: {
        Row: ClosedDateRow;
        Insert: ClosedDateInsert;
        Update: Partial<ClosedDateRow>;
        Relationships: [];
      };
      admin_owners: {
        Row: AdminOwnerRow;
        Insert: { email: string; display_name?: string | null };
        Update: Partial<AdminOwnerRow>;
        Relationships: [];
      };
    };
    Views: {
      reservation_money: {
        Row: ReservationMoney;
        Relationships: [];
      };
      revenue_daily: {
        Row: RevenueDaily;
        Relationships: [];
      };
      revenue_monthly: {
        Row: RevenueMonthly;
        Relationships: [];
      };
      no_show_rate: {
        Row: {
          month_start: string;
          no_show_count: number;
          eligible_covers: number;
          no_show_rate_pct: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      assert_capacity_or_throw: {
        Args: {
          p_service_date: string;
          p_seating: SeatingSlot;
          p_party_size: number;
        };
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      reservation_status: ReservationStatus;
      seating_slot: SeatingSlot;
      payment_method: PaymentMethod;
      payment_kind: PaymentKind;
      payment_provider: PaymentProvider;
    };
    CompositeTypes: Record<string, never>;
  };
};
