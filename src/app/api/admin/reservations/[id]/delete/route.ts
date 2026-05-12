/**
 * POST /api/admin/reservations/[id]/delete — owner-only hard delete.
 *
 * Built 2026-05-12 for the "clean up test data" workflow. Cascade-removes
 * the reservation and all dependent rows (notification_log, audit_log,
 * payments, receipts) so the row disappears from every admin list.
 *
 * Guardrails:
 *  - Status must NOT be `completed` or `no_show`. Those statuses represent
 *    settled / no-show financial events the bar needs for tax filing; if
 *    the operator really wants to delete one, they must first cancel it
 *    (`cancelled_*`) — that's an explicit financial reversal, distinct
 *    from a typo cleanup.
 *  - Receipt rows with non-null `or_number` block deletion regardless of
 *    status. An OR was already issued under BIR sequence; the row must
 *    be voided (not deleted) so the OR number stays accounted for.
 *  - An audit row capturing the deletion is inserted with reservation_id=NULL
 *    (after the FK is gone) so the action is still traceable.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import type { Reservation } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NON_DELETABLE_STATUSES = ["completed", "no_show"] as const;

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
    .maybeSingle<Reservation>();
  if (!reservation) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 }
    );
  }
  if (
    (NON_DELETABLE_STATUSES as readonly string[]).includes(reservation.status)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `non_deletable_status:${reservation.status}`,
        hint:
          "Settled or no-show reservations carry tax records. Cancel first if you really want to delete.",
      },
      { status: 409 }
    );
  }

  // Issued OR? Block. BIR-relevant. Operator should void the OR first.
  const { data: liveReceipts } = await sb
    .from("receipts")
    .select("id,or_number,voided_at")
    .eq("reservation_id", id)
    .is("voided_at", null);
  if (liveReceipts && liveReceipts.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "live_receipt_present",
        hint: "Void the Official Receipt before deleting this reservation.",
        or_numbers: liveReceipts.map((r) => r.or_number),
      },
      { status: 409 }
    );
  }

  // Cascade clean. Order matters — children first.
  await sb.from("notification_log").delete().eq("reservation_id", id);
  await sb.from("audit_log").delete().eq("reservation_id", id);
  // payments and receipts (voided rows) may exist for cancelled bookings.
  await sb.from("payments").delete().eq("reservation_id", id);
  await sb.from("receipts").delete().eq("reservation_id", id);

  const { error: delErr } = await sb
    .from("reservations")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "delete_failed",
        reason: delErr.message,
      },
      { status: 500 }
    );
  }

  // Post-delete audit trail — reservation_id is NULL since the row is gone.
  // The snapshot captures who/what/when so a forensic operator can still
  // reconstruct what was removed.
  await sb.from("audit_log").insert({
    actor: admin.email,
    reservation_id: null,
    action: "reservation.delete",
    after_data: {
      deleted_id: id,
      guest_name: reservation.guest_name,
      guest_email: reservation.guest_email,
      service_date: reservation.service_date,
      seating: reservation.seating,
      status_before_delete: reservation.status,
      total_centavos: reservation.total_centavos,
    } as never,
    reason: "admin delete via /admin/reservations",
  });

  return NextResponse.json({ ok: true, deleted_id: id });
}
