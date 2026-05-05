/**
 * GET /api/admin/receipts/export?y=YYYY&m=MM
 *
 * Returns the month's BIR Official Receipts as a CSV ready for the BIR
 * monthly OR summary filing. Owner-only. Numbers are PHP (not centavos)
 * so the file opens cleanly in Excel/Numbers without conversion.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";
import type { Receipt } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  y: z.coerce.number().int().min(2024).max(2100),
  m: z.coerce.number().int().min(1).max(12),
});

interface ReceiptRow extends Receipt {
  reservations: {
    guest_name: string;
    service_date: string;
    party_size: number;
  } | null;
}

export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation" },
      { status: 400 }
    );
  }
  const { y, m } = parsed.data;
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01T00:00:00+08:00`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+08:00`;

  const sb = adminClient();
  const { data } = await sb
    .from("receipts")
    .select("*, reservations(guest_name, service_date, party_size)")
    .gte("issued_at", monthStart)
    .lte("issued_at", monthEnd)
    .order("issued_at", { ascending: true })
    .returns<ReceiptRow[]>();

  const rows = data ?? [];
  const lines: string[] = [
    [
      "Issued (Manila)",
      "OR Number",
      "Guest",
      "Service Date",
      "Party",
      "Menu Subtotal (PHP)",
      "Service Charge (PHP)",
      "VAT (PHP)",
      "Grand Total (PHP)",
      "Method",
      "Issued By",
      "Voided At",
      "Voided By",
      "Void Reason",
    ].join(","),
  ];
  for (const r of rows) {
    const issued = new Date(r.issued_at).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const voided = r.voided_at
      ? new Date(r.voided_at).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
        })
      : "";
    lines.push(
      [
        csv(issued),
        csv(r.or_number),
        csv(r.reservations?.guest_name ?? ""),
        csv(r.reservations?.service_date ?? ""),
        r.reservations?.party_size ?? "",
        php(r.menu_subtotal_centavos),
        php(r.service_charge_centavos),
        php(r.vat_centavos),
        php(r.grand_total_centavos),
        csv(r.settlement_method ?? ""),
        csv(r.issued_by ?? ""),
        csv(voided),
        csv(r.voided_by ?? ""),
        csv(r.void_reason ?? ""),
      ].join(",")
    );
  }

  const filename = `daimasu-receipts-${y}-${String(m).padStart(2, "0")}.csv`;
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function csv(s: string): string {
  // Quote when the field contains chars with special meaning in CSV.
  const needsQuoting = /[",\n\r]/.test(s);
  if (!needsQuoting) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function php(centavos: number): string {
  return (centavos / 100).toFixed(2);
}
