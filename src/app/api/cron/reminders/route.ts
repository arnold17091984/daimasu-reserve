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

      // Each channel runs in its own try so a throw in one cannot undo
      // the other's success (Codex review 2026-05-02 fix). Email skipped
      // (RESEND_API_KEY absent) is treated as "not delivered" so the
      // next cron run reprocesses once a key is set; WhatsApp absent is
      // similarly inert.
      let emailDelivered = false;
      let lastEmailError: string | null = null;
      try {
        const emailRes = await sendEmail({
          to: r.guest_email,
          subject,
          html,
          idempotencyKey: `email:reminder:${win}:${r.id}`,
          log: { reservation_id: r.id, kind: reminderKind },
        });
        emailDelivered = emailRes.ok;
        if (!emailRes.ok) lastEmailError = emailRes.error;
      } catch (err) {
        lastEmailError = err instanceof Error ? err.message : "send_failed";
      }

      let whatsappDelivered = false;
      let lastWaError: string | null = null;
      // Skip WhatsApp entirely when the booking has no phone (walk-in
       // entered without one — migration 0019). Email reminders still go
       // out for those guests.
      if (
        r.guest_phone &&
        settings.whatsapp_from_number &&
        env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN
      ) {
        try {
          const body =
            r.guest_lang === "ja"
              ? `[DAIMASU] ご来店${hours}時間前のリマインドです。 / ${new Date(r.service_starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" })}`
              : `[DAIMASU] Reminder — ${hours}h to your reservation at ${new Date(r.service_starts_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" })}`;
          const wa = await sendWhatsApp({
            toPhoneE164: r.guest_phone.replace(/\s/g, ""),
            body,
            fromWhatsApp: settings.whatsapp_from_number,
            log: { reservation_id: r.id, kind: reminderKind },
          });
          whatsappDelivered = wa.ok;
          if (!wa.ok) lastWaError = wa.reason;
        } catch (err) {
          lastWaError = err instanceof Error ? err.message : "send_failed";
        }
      }

      // Mark sent only when AT LEAST one channel actually delivered.
      // Email-only deployments without WhatsApp work; WhatsApp-only
      // deployments without Resend work; neither configured leaves the
      // row open for retry. Email success guarantees mark even if a
      // subsequent WhatsApp throw happened (the early try/catch above
      // already absorbed that throw and we never lose email-success state).
      if (emailDelivered || whatsappDelivered) {
        const {error: updateErr} = await sb
          .from("reservations")
          .update({ [sentColumn]: new Date().toISOString() })
          .eq("id", r.id);
        if (updateErr) {
          console.error("[cron/reminders] sent_at update failed", {
            id: r.id, error: updateErr.message,
          });
        }
        results.push({ id: r.id, ok: true });
      } else {
        results.push({
          id: r.id,
          ok: false,
          reason: lastEmailError
            ? `email_failed:${lastEmailError}`
            : lastWaError
              ? `whatsapp_failed:${lastWaError}`
              : "no_channel_configured",
        });
      }
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
