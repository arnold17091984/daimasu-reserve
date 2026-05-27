/**
 * GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Public endpoint that powers the "seats remaining" display on the
 * reservation form. Returns, per service date in the range, how many
 * counter seats are still open for each of the two seatings, plus a
 * closed flag for owner-blocked dates.
 *
 * Runs with the service-role client (anon RLS would block reading the
 * reservations table). Only aggregate counts leave the server — no
 * guest PII — so this is safe to expose unauthenticated.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { availabilityQuerySchema } from "@/lib/domain/schemas";
import { isClosedWeekday } from "@/lib/domain/reservation";
import { corsHeaders, preflight } from "@/lib/security/cors";
import type { RestaurantSettings, Venue } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayAvailability {
  date: string;
  s1_remaining: number;
  s2_remaining: number;
  /**
   * Per-day remaining capacity used by capacity_only venues
   * (Restaurant). Bar callers can ignore this and continue to read
   * s1_remaining / s2_remaining; Restaurant ignores those and reads
   * total_remaining instead because covers across the operating
   * window share one pool.
   */
  total_remaining: number;
  closed: boolean;
}

interface OperatingHoursPayload {
  weekday_open: string;
  weekday_close: string;
  weekend_open: string;
  weekend_close: string;
  slot_interval_minutes: number;
}

// CORS preflight for cross-origin availability lookups (Restaurant
// booking component on daimasu.com.ph polls this).
export function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation" },
      { status: 400, headers: corsHeaders(req) }
    );
  }
  const { from, to } = parsed.data;

  // venue=bar|restaurant — defaults to 'bar' for back-compat with the
  // existing booking form. Each venue has its own online_seats and its
  // own bookings, so availability is calculated per venue.
  const venueParam = req.nextUrl.searchParams.get("venue");
  const venue: Venue = venueParam === "restaurant" ? "restaurant" : "bar";

  const sb = adminClient();

  const [{ data: settingsRow }, { data: rows }, { data: closed }] =
    await Promise.all([
      sb
        .from("restaurant_settings")
        .select(
          "online_seats,seat_layout_mode,weekday_open_at,weekday_close_at,weekend_open_at,weekend_close_at,slot_interval_minutes"
        )
        .eq("venue", venue)
        .maybeSingle<
          Pick<
            RestaurantSettings,
            | "online_seats"
            | "seat_layout_mode"
            | "weekday_open_at"
            | "weekday_close_at"
            | "weekend_open_at"
            | "weekend_close_at"
            | "slot_interval_minutes"
          >
        >(),
      sb
        .from("reservations")
        .select("service_date,seating,party_size,status")
        .eq("venue", venue)
        // confirmed + pending hold a seat; cancelled / no_show free it.
        .in("status", ["confirmed", "pending_payment"])
        .gte("service_date", from)
        .lte("service_date", to)
        .returns<
          {
            service_date: string;
            seating: "s1" | "s2";
            party_size: number;
            status: string;
          }[]
        >(),
      sb
        .from("closed_dates")
        .select("closed_date")
        .eq("venue", venue)
        .gte("closed_date", from)
        .lte("closed_date", to)
        .returns<{ closed_date: string }[]>(),
    ]);

  const onlineSeats = settingsRow?.online_seats ?? 8;
  const closedSet = new Set((closed ?? []).map((c) => c.closed_date));
  const capacityOnly = settingsRow?.seat_layout_mode === "capacity_only";

  // Sum booked pax per date+seating (used by Bar). Also keep a per-date
  // total so capacity_only venues can compute pool-wide remaining.
  const takenByKey = new Map<string, number>();
  const takenByDate = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = `${r.service_date}|${r.seating}`;
    takenByKey.set(key, (takenByKey.get(key) ?? 0) + r.party_size);
    takenByDate.set(
      r.service_date,
      (takenByDate.get(r.service_date) ?? 0) + r.party_size
    );
  }

  // Emit one row per calendar date in [from, to]. Iterate in pure UTC
  // (Date.UTC + setUTCDate) so no timezone shift can move a date across
  // a day boundary — `service_date` is a plain calendar date, not an
  // instant, so it must not be reinterpreted in any local zone.
  const days: DayAvailability[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const s1Taken = takenByKey.get(`${date}|s1`) ?? 0;
    const s2Taken = takenByKey.get(`${date}|s2`) ?? 0;
    const dayTaken = takenByDate.get(date) ?? 0;
    days.push({
      date,
      s1_remaining: Math.max(0, onlineSeats - s1Taken),
      s2_remaining: Math.max(0, onlineSeats - s2Taken),
      total_remaining: Math.max(0, onlineSeats - dayTaken),
      // Monday is the bar's weekly closure — surface it the same way
      // owner-marked closures are so the calendar disables it without
      // requiring 52× per-year hand-entries in `closed_dates`.
      closed: closedSet.has(date) || isClosedWeekday(date),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Operating hours surfaced for capacity_only venues so the dialog
  // can build its time-grid client-side without a second roundtrip.
  const operatingHours: OperatingHoursPayload | null = capacityOnly
    ? {
        weekday_open: (settingsRow?.weekday_open_at ?? "11:00:00").slice(0, 5),
        weekday_close: (settingsRow?.weekday_close_at ?? "23:00:00").slice(0, 5),
        weekend_open: (settingsRow?.weekend_open_at ?? "11:00:00").slice(0, 5),
        weekend_close: (settingsRow?.weekend_close_at ?? "00:00:00").slice(0, 5),
        slot_interval_minutes: settingsRow?.slot_interval_minutes ?? 30,
      }
    : null;

  return NextResponse.json(
    {
      ok: true,
      online_seats: onlineSeats,
      seat_layout_mode: settingsRow?.seat_layout_mode ?? "numbered",
      operating_hours: operatingHours,
      days,
    },
    {
      // Short cache — availability changes on every booking, but a 30s
      // window keeps the form snappy without showing stale-by-minutes data.
      headers: corsHeaders(req, { "Cache-Control": "public, max-age=30" }),
    }
  );
}
