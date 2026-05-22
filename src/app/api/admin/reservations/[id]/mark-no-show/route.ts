/**
 * POST /api/admin/reservations/[id]/mark-no-show — owner-only.
 *
 * Manual no-show flip. Deposit is retained; no refund.
 */
import "server-only";
import { after, NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import { notifyAffiliate } from "@/lib/notifications/affiliate-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sb = adminClient();
  const { data, error } = await sb
    .from("reservations")
    .update({
      status: "no_show",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "staff",
    })
    .eq("id", id)
    .eq("status", "confirmed")
    // select("*") (not an explicit column list) so the handler keeps
    // working even before migration 0021 adds the affiliate_* columns —
    // a missing column simply yields `undefined` rather than erroring.
    .select("*");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "not_confirmed" }, { status: 409 });
  }
  const row = data[0] as {
    guest_name: string;
    guest_phone: string;
    service_date: string;
    affiliate_link_slug?: string | null;
    affiliate_coupon_code?: string | null;
  };

  await sb.from("audit_log").insert({
    actor: admin.email,
    reservation_id: id,
    action: "reservation.no_show",
    reason: "manual mark by staff",
  });

  // Tell the affiliate app the booking was a no-show so the referring
  // cast's commission is withheld. No-ops unless the row carries
  // affiliate attribution and the webhook is configured.
  after(() =>
    notifyAffiliate({
      event: "reservation.no_show",
      reservation_id: id,
      affiliate_link_slug: row.affiliate_link_slug ?? null,
      affiliate_coupon_code: row.affiliate_coupon_code ?? null,
      guest_name: row.guest_name,
      guest_phone: row.guest_phone,
      service_date: row.service_date,
      occurred_at: new Date().toISOString(),
    })
  );

  return NextResponse.json({ ok: true });
}
