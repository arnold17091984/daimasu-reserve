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
import type { RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayAvailability {
  date: string;
  s1_remaining: number;
  s2_remaining: number;
  closed: boolean;
}

export async function GET(req: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation" },
      { status: 400 }
    );
  }
  const { from, to } = parsed.data;

  const sb = adminClient();

  const [{ data: settingsRow }, { data: rows }, { data: closed }] =
    await Promise.all([
      sb
        .from("restaurant_settings")
        .select("online_seats")
        .eq("id", 1)
        .maybeSingle<Pick<RestaurantSettings, "online_seats">>(),
      sb
        .from("reservations")
        .select("service_date,seating,party_size,status")
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
        .gte("closed_date", from)
        .lte("closed_date", to)
        .returns<{ closed_date: string }[]>(),
    ]);

  const onlineSeats = settingsRow?.online_seats ?? 8;
  const closedSet = new Set((closed ?? []).map((c) => c.closed_date));

  // Sum booked pax per date+seating.
  const takenByKey = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = `${r.service_date}|${r.seating}`;
    takenByKey.set(key, (takenByKey.get(key) ?? 0) + r.party_size);
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
    days.push({
      date,
      s1_remaining: Math.max(0, onlineSeats - s1Taken),
      s2_remaining: Math.max(0, onlineSeats - s2Taken),
      closed: closedSet.has(date),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return NextResponse.json(
    { ok: true, online_seats: onlineSeats, days },
    {
      // Short cache — availability changes on every booking, but a 30s
      // window keeps the form snappy without showing stale-by-minutes data.
      headers: { "Cache-Control": "public, max-age=30" },
    }
  );
}
