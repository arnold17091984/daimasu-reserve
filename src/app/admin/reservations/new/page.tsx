/**
 * /admin/reservations/new — owner-side manual booking.
 *
 * Use cases: phone reservation, walk-in, regular guest the owner is logging in
 * after the fact. Bypasses Stripe deposit; status starts at `confirmed`.
 *
 * The form pre-loads:
 *  - 14-day capacity grid (which slots are full / closed) so the owner sees
 *    options at a glance
 *  - settings (course price + deposit %) for display
 *
 * Capacity is re-checked atomically on submit via assert_capacity_or_throw.
 */
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti } from "@/lib/auth/admin-lang";
import { getAdminTheme } from "@/lib/auth/admin-theme";
import { adminClient } from "@/lib/db/clients";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";
import { ManualBookingForm } from "./booking-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; seating?: string }>;
}) {
  const lang = await getAdminLang();
  const theme = await getAdminTheme();
  const sp = await searchParams;

  // Per-date+seating occupancy. Each entry holds:
  //   - taken: number of pax (sum of party_size)
  //   - seats: actual seat_numbers occupied
  //   - bookings: small list of {name, seats} for tooltips on the picker
  type SlotInfo = {
    taken: number;
    seats: number[];
    bookings: { guest_name: string; seats: number[] }[];
  };
  const empty = (): SlotInfo => ({ taken: 0, seats: [], bookings: [] });
  const occupancy: Map<string, { s1: SlotInfo; s2: SlotInfo }> = new Map();

  const today = todayIsoDate();
  // 60-day horizon so the booking form can paginate forward up to ~2 months.
  const horizon = isoDateDaysAhead(60);

  function pushBooking(
    date: string,
    seating: "s1" | "s2",
    party_size: number,
    seat_numbers: number[] | null,
    guest_name: string
  ) {
    const cur = occupancy.get(date) ?? { s1: empty(), s2: empty() };
    const slot = cur[seating];
    slot.taken += party_size;
    if (seat_numbers && seat_numbers.length > 0) {
      slot.seats.push(...seat_numbers);
      slot.bookings.push({ guest_name, seats: seat_numbers });
    }
    occupancy.set(date, cur);
  }

  await requireAdminOrRedirect();
  const sb = adminClient();
  const [{ data: settingsRow }, { data: rows }, { data: closed }] =
    await Promise.all([
      sb
        .from("restaurant_settings")
        .select("*")
        .eq("id", 1)
        .single<RestaurantSettings>(),
      sb
        .from("reservations")
        .select("service_date,seating,party_size,status,seat_numbers,guest_name")
        .gte("service_date", today)
        .lte("service_date", horizon)
        .in("status", ["confirmed", "pending_payment"])
        .returns<
          Pick<
            Reservation,
            "service_date" | "seating" | "party_size" | "status" | "seat_numbers" | "guest_name"
          >[]
        >(),
      sb
        .from("closed_dates")
        .select("closed_date")
        .gte("closed_date", today)
        .lte("closed_date", horizon)
        .returns<{ closed_date: string }[]>(),
    ]);
  const settings: RestaurantSettings | null = settingsRow;
  for (const r of rows ?? []) {
    pushBooking(r.service_date, r.seating, r.party_size, r.seat_numbers, r.guest_name);
  }
  const closedDates: Set<string> = new Set((closed ?? []).map((c) => c.closed_date));

  if (!settings) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-red-400">
          {ti(
            lang,
            "設定行が見つかりません。",
            "Settings row missing. Run migration 0002."
          )}
        </p>
      </div>
    );
  }

  // Build 60-day grid for the form. The form slices its visible 14-day
  // window from this with paginate-forward / back buttons.
  const grid = [];
  for (let i = 0; i < 60; i++) {
    const date = isoDateDaysAhead(i);
    const occ = occupancy.get(date) ?? { s1: empty(), s2: empty() };
    grid.push({
      date,
      s1_taken: occ.s1.taken,
      s1_seats: occ.s1.seats,
      s1_bookings: occ.s1.bookings,
      s2_taken: occ.s2.taken,
      s2_seats: occ.s2.seats,
      s2_bookings: occ.s2.bookings,
      closed: closedDates.has(date),
    });
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-3 font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
        {ti(lang, "新規予約 (店舗側)", "New booking (owner-side)")}
      </h1>
      <p className="mb-6 max-w-2xl admin-body text-text-secondary">
        {ti(
          lang,
          "電話・来店・スタッフ手動入力用。Stripe決済は不要で、保存と同時に確定状態になります。返金規約は通常通り適用されます。",
          "For phone, walk-in, or staff entries. No Stripe deposit; created in confirmed state. Refund policy applies normally."
        )}
      </p>

      <ManualBookingForm
        lang={lang}
        theme={theme}
        settings={settings}
        grid={grid}
        defaultDate={sp.date}
        defaultSeating={sp.seating === "s2" ? "s2" : sp.seating === "s1" ? "s1" : undefined}
      />
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
function isoDateDaysAhead(days: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
