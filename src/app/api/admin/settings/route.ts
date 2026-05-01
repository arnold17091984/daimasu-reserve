/**
 * POST /api/admin/settings — owner-only.
 * Updates the single restaurant_settings row. Validated via zod.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/db/clients";
import { getAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    total_seats: z.number().int().min(1).max(50),
    online_seats: z.number().int().min(0).max(50),
    seating_1_label: z.string().min(1).max(40),
    seating_2_label: z.string().min(1).max(40),
    seating_1_starts_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    seating_2_starts_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    service_minutes: z.number().int().min(15).max(360),
    course_price_centavos: z.number().int().min(0).max(100_000_00),
    deposit_pct: z.number().int().min(0).max(100),
    refund_full_hours: z.number().int().min(0).max(168),
    refund_partial_hours: z.number().int().min(0).max(168),
    reminder_long_hours: z.number().int().min(0).max(72),
    reminder_short_hours: z.number().int().min(0).max(72),
    telegram_bot_token: z.string().nullable().optional(),
    telegram_chat_id: z.string().nullable().optional(),
    whatsapp_from_number: z.string().nullable().optional(),
    resend_from_email: z.string().email().nullable().optional(),
    timezone: z.string().min(3).max(40),
    monthly_revenue_target_centavos: z.number().int().min(0),
    display_name: z.string().min(1).max(80),
    reservations_open: z.boolean(),
  })
  .refine((s) => s.online_seats <= s.total_seats, {
    message: "online_seats cannot exceed total_seats",
  })
  .refine((s) => s.refund_partial_hours <= s.refund_full_hours, {
    message: "refund_partial_hours must be ≤ refund_full_hours",
  })
  .refine((s) => s.reminder_short_hours < s.reminder_long_hours, {
    message: "reminder_short_hours must be < reminder_long_hours",
  });

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { data: before } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .single();

  const { error } = await sb
    .from("restaurant_settings")
    .update(parsed.data)
    .eq("id", 1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await sb.from("audit_log").insert({
    actor: admin.email,
    action: "settings.update",
    before_data: before as never,
    after_data: parsed.data as never,
  });

  return NextResponse.json({ ok: true });
}
