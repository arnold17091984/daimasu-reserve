/**
 * POST /api/admin/reservations/[id]/resend-confirm
 *
 * Re-dispatches the confirmation email + Telegram + WhatsApp for an
 * existing reservation. Owner-only. UX 2026-05-06 (Operations review):
 * staff could see failed notifications on the dashboard but had no way
 * to retry them — they were stuck in the failure log forever.
 *
 * Re-uses the canonical sendConfirmationDispatch path so the recipient
 * gets the same template (with the recently-added venue + dietary
 * blocks) and we keep the cancellation token unchanged.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import { sendConfirmationDispatch } from "@/lib/notifications/dispatch";
import type { Reservation } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await ctx.params;
  const sb = adminClient();
  const { data: reservation } = await sb
    .from("reservations")
    .select("*")
    .eq("id", id)
    .single<Reservation>();
  if (!reservation) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }
  if (
    reservation.status !== "pending_payment" &&
    reservation.status !== "confirmed"
  ) {
    return NextResponse.json(
      { ok: false, error: `bad_state:${reservation.status}` },
      { status: 409 }
    );
  }

  try {
    await sendConfirmationDispatch(reservation, sb);
    await sb.from("audit_log").insert({
      actor: admin.email,
      reservation_id: id,
      action: "reservation.notify.resend_confirm",
      reason: "manual resend from /admin",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "dispatch_failed",
        reason: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 }
    );
  }
}
