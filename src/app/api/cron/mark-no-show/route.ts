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
import { after, NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { verifyCronAuth } from "@/lib/security/cron-auth";
import { notifyAffiliate } from "@/lib/notifications/affiliate-webhook";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  // Multi-venue: the no-show grace cutoff is derived from each venue's own
  // service_minutes (Bar 90 vs Restaurant 120). Read every venue's settings
  // and process each venue's reservations with its own cutoff — applying the
  // Bar row to all venues would flip Restaurant guests to no_show too early.
  const { data: allSettings, error: settingsErr } = await sb
    .from("restaurant_settings")
    .select("*")
    .returns<RestaurantSettings[]>();
  if (settingsErr) {
    return NextResponse.json({ ok: false, error: settingsErr.message }, { status: 500 });
  }
  if (!allSettings || allSettings.length === 0) {
    return NextResponse.json({ ok: false, error: "settings_missing" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const flippedRows: Reservation[] = [];

  for (const settings of allSettings) {
    const graceMinutes = settings.service_minutes; // grace == one service window
    const cutoff = new Date(
      Date.now() - (settings.service_minutes + graceMinutes) * 60_000
    ).toISOString();

    const { data: stale, error } = await sb
      .from("reservations")
      .select("*")
      .eq("venue", settings.venue)
      .eq("status", "confirmed")
      .is("settled_at", null)
      .lt("service_starts_at", cutoff)
      .returns<Reservation[]>();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!stale || stale.length === 0) continue;

    const ids = stale.map((r) => r.id);
    // .select() so we act on the rows ACTUALLY transitioned — a concurrent
    // settle / manual no-show between the read above and this update could
    // otherwise make the pre-update `stale` list wrong.
    const { data: flipped, error: updErr } = await sb
      .from("reservations")
      .update({
        status: "no_show",
        cancelled_at: nowIso,
        cancelled_by: "system",
      })
      .in("id", ids)
      .eq("status", "confirmed")
      .select("*")
      .returns<Reservation[]>();
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }
    if (flipped) flippedRows.push(...flipped);
  }

  const flippedIds = flippedRows.map((r) => r.id);

  // Bulk audit — only the rows actually transitioned.
  if (flippedIds.length > 0) {
    await sb.from("audit_log").insert(
      flippedIds.map((id) => ({
        actor: "system",
        reservation_id: id,
        action: "reservation.no_show",
        reason: "auto: not settled after service window",
      }))
    );
  }

  // Notify the affiliate app for any auto-no-show carrying affiliate
  // attribution, so the referring cast's commission is withheld. The
  // manual no-show route already does this; the cron path is the
  // documented daily mechanism and must do it too. Pushed into after()
  // so the cron response isn't blocked on the webhook retry loop.
  after(() => {
    for (const r of flippedRows) {
      if (!r.affiliate_link_slug && !r.affiliate_coupon_code) continue;
      void notifyAffiliate({
        event: "reservation.no_show",
        reservation_id: r.id,
        affiliate_link_slug: r.affiliate_link_slug ?? null,
        affiliate_coupon_code: r.affiliate_coupon_code ?? null,
        guest_name: r.guest_name,
        guest_phone: r.guest_phone,
        service_date: r.service_date,
        occurred_at: nowIso,
        // Race-fix: see settle route.
        party_size: r.party_size,
        reserved_for: r.service_starts_at,
      });
    }
  });

  return NextResponse.json({ ok: true, marked: flippedIds.length, ids: flippedIds });
}
