/**
 * /api/admin/closed-dates — owner-only.
 *
 *   POST   { closed_date, reason? } — upsert
 *   DELETE ?closed_date=YYYY-MM-DD  — remove
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import { closedDateSchema } from "@/lib/domain/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const parsed = closedDateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation" },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { error } = await sb
    .from("closed_dates")
    .upsert({
      closed_date: parsed.data.closed_date,
      reason: parsed.data.reason ?? null,
    });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await sb.from("audit_log").insert({
    actor: admin.email,
    action: "closed_date.add",
    after_data: parsed.data as never,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const closedDate = req.nextUrl.searchParams.get("closed_date");
  if (!closedDate || !/^\d{4}-\d{2}-\d{2}$/.test(closedDate)) {
    return NextResponse.json(
      { ok: false, error: "invalid_date" },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { error } = await sb
    .from("closed_dates")
    .delete()
    .eq("closed_date", closedDate);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await sb.from("audit_log").insert({
    actor: admin.email,
    action: "closed_date.remove",
    before_data: { closed_date: closedDate } as never,
  });

  return NextResponse.json({ ok: true });
}
