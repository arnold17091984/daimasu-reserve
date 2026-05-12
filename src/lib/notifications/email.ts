/**
 * Resend transactional email. Templates for booking confirm / reminder / cancel.
 * Bilingual JA/EN driven by reservation.guest_lang.
 */
import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import { recordNotification } from "./log";
import type { NotificationKind } from "@/lib/db/types";

let cached: Resend | null = null;

function resend(): Resend | null {
  if (cached) return cached;
  const key = serverEnv().RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  fromOverride?: string;
  idempotencyKey?: string;
  /** When provided, the attempt is recorded to notification_log. */
  log?: { reservation_id: string | null; kind: NotificationKind };
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

export async function sendEmail(args: SendArgs): Promise<SendEmailResult> {
  const env = serverEnv();
  const client = resend();

  // E2E test 2026-05-02 fix: when RESEND_API_KEY is intentionally unset,
  // record a "skipped" log row instead of failing. Callers (cron/reminders
  // notably) should treat skipped == ok-but-no-effect and NOT mark the
  // reminder as sent. The result shape distinguishes via the `skipped`
  // discriminator so cron/reminders can guard `reminder_*_sent_at` updates.
  if (!client) {
    if (args.log) {
      await recordNotification({
        reservation_id: args.log.reservation_id,
        channel: "email",
        kind: args.log.kind,
        status: "skipped",
        recipient: args.to,
        error_message: "RESEND_API_KEY not configured",
      });
    }
    return { ok: false, error: "resend_disabled", skipped: true };
  }

  // I-1 fix: parens around the ternary so `??` doesn't bind tighter than `?:`
  // and silently always pick the second branch.
  // Send from the root domain (daimasu.com.ph) — UX 2026-05-12: switched
  // from the subdomain `reservations@reserve.daimasu.com.ph` to keep the
  // sender memorable, improve deliverability (root domains carry better
  // reputation than unfamiliar subdomains), and avoid having to verify
  // an extra subdomain in Resend. The fallback to onboarding@resend.dev
  // is for dev/test envs where the daimasu domain isn't configured.
  const from =
    args.fromOverride ??
    (env.NEXT_PUBLIC_SITE_URL.includes("daimasu")
      ? "DAIMASU Reservations <reserve@daimasu.com.ph>"
      : "DAIMASU Reservations <onboarding@resend.dev>");

  const result: SendEmailResult = await (async () => {
    try {
      const r = await client.emails.send(
        { from, to: args.to, subject: args.subject, html: args.html },
        args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined
      );
      if (r.error) return { ok: false, error: r.error.message };
      return { ok: true, id: r.data?.id ?? "unknown" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  if (args.log) {
    await recordNotification({
      reservation_id: args.log.reservation_id,
      channel: "email",
      kind: args.log.kind,
      status: result.ok ? "sent" : "failed",
      recipient: args.to,
      error_message: result.ok ? null : result.error,
    });
  }

  return result;
}
