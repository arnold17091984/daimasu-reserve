/**
 * POST /api/cron/reminders?window=long|short
 *
 * Sends reminder emails (+ optional WhatsApp) for confirmed reservations
 * crossing the configured window. Idempotent: marks reminder_long_sent_at /
 * reminder_short_sent_at after success — same row can't fire twice.
 *
 * Schedule via Supabase pg_cron (see supabase/migrations/0008_cron.sql),
 * every 5–10 minutes.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/db/clients";
import { verifyCronAuth } from "@/lib/security/cron-auth";
import { sendEmail } from "@/lib/notifications/email";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { renderReminderEmail } from "@/lib/notifications/templates";
import { serverEnv } from "@/lib/env";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Window = "long" | "short";

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const win = (url.searchParams.get("window") ?? "long") as Window;
  if (win !== "long" && win !== "short") {
    return NextResponse.json({ ok: false, error: "bad_window" }, { status: 400 });
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

  const hours = win === "long" ? settings.reminder_long_hours : settings.reminder_short_hours;
  const now = Date.now();
  const upper = new Date(now + hours * 3_600_000).toISOString();
  // 30-min span: catch any reservation crossing the threshold since last run.
  const lower = new Date(now + (hours - 0.5) * 3_600_000).toISOString();
  const sentColumn =
    win === "long" ? "reminder_long_sent_at" : "reminder_short_sent_at";

  const { data: due, error } = await sb
    .from("reservations")
    .select("*")
    .eq("status", "confirmed")
    .is(sentColumn, null)
    .gte("service_starts_at", lower)
    .lte("service_starts_at", upper)
    .returns<Reservation[]>();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const env = serverEnv();
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const r of due) {
    try {
      // Reminder no longer carries a cancel link — the original
      // confirmation email's link is valid for the full reservation
      // lifecycle (issued at booking with TTL = service_starts_at + 7d).
      // Rotating cancel_token_hash here previously invalidated that link
      // and broke self-cancel from the original email (codex P1 fix).
      const { subject, html } = renderReminderEmail({
        reservation: r,
        hoursOut: hours,
      });
      const reminderKind = win === "long" ? "reminder_long" : "reminder_short";
      await sendEmail({
        to: r.guest_email,
        subject,
        html,
        idempotencyKey: `email:reminder:${win}:${r.id}`,
        log: { reservation_id: r.id, kind: reminderKind },
      });

      // Best-effort WhatsApp.
      if (settings.whatsapp_from_number && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
        const body =
          r.guest_lang === "ja"
            ? `[DAIMASU] ご来店${hours}時間前のリマインドです。 / ${new Date(r.service_starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" })}`
            : `[DAIMASU] Reminder — ${hours}h to your reservation at ${new Date(r.service_starts_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" })}`;
        await sendWhatsApp({
          toPhoneE164: r.guest_phone.replace(/\s/g, ""),
          body,
          fromWhatsApp: settings.whatsapp_from_number,
          log: { reservation_id: r.id, kind: reminderKind },
        });
      }

      // Mark sent (idempotent — same column, only if still null)
      await sb
        .from("reservations")
        .update({ [sentColumn]: new Date().toISOString() })
        .eq("id", r.id);

      results.push({ id: r.id, ok: true });
    } catch (err) {
      results.push({
        id: r.id,
        ok: false,
        reason: err instanceof Error ? err.message : "send_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    window: win,
    attempted: due.length,
    succeeded: results.filter((x) => x.ok).length,
    failures: results.filter((x) => !x.ok),
  });
}
