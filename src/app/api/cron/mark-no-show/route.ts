/**
 * POST /api/cron/mark-no-show
 *
 * Once a day (02:00 Manila), promote `confirmed` reservations whose
 * service_starts_at + service_minutes + grace has passed AND that haven't
 * been settled to `no_show`.
 *
 * The grace window prevents marking a slow-but-arrived guest as no-show.
 * Default grace = service_minutes (90), so 3h after start.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { verifyCronAuth } from "@/lib/security/cron-auth";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single<RestaurantSettings>();
  if (!settings) {
    return NextResponse.json({ ok: false, error: "settings_missing" }, { status: 500 });
  }

  const graceMinutes = settings.service_minutes; // 90 default
  const cutoff = new Date(
    Date.now() - (settings.service_minutes + graceMinutes) * 60_000
  ).toISOString();

  const { data: stale, error } = await sb
    .from("reservations")
    .select("*")
    .eq("status", "confirmed")
    .is("settled_at", null)
    .lt("service_starts_at", cutoff)
    .returns<Reservation[]>();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  const ids = stale.map((r) => r.id);
  const nowIso = new Date().toISOString();
  const { error: updErr } = await sb
    .from("reservations")
    .update({
      status: "no_show",
      cancelled_at: nowIso,
      cancelled_by: "system",
    })
    .in("id", ids)
    .eq("status", "confirmed");
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // Bulk audit
  await sb.from("audit_log").insert(
    ids.map((id) => ({
      actor: "system",
      reservation_id: id,
      action: "reservation.no_show",
      reason: "auto: not settled after service window",
    }))
  );

  return NextResponse.json({ ok: true, marked: ids.length, ids });
}
