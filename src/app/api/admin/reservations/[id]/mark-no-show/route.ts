/**
 * POST /api/admin/reservations/[id]/mark-no-show — owner-only.
 *
 * Manual no-show flip. Deposit is retained; no refund.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";

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
    .select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "not_confirmed" }, { status: 409 });
  }

  await sb.from("audit_log").insert({
    actor: admin.email,
    reservation_id: id,
    action: "reservation.no_show",
    reason: "manual mark by staff",
  });

  return NextResponse.json({ ok: true });
}
