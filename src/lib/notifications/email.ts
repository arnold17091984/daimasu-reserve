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

function resend(): Resend {
  if (cached) return cached;
  cached = new Resend(serverEnv().RESEND_API_KEY);
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

export async function sendEmail(
  args: SendArgs
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const env = serverEnv();
  // I-1 fix: parens around the ternary so `??` doesn't bind tighter than `?:`
  // and silently always pick the second branch.
  const from =
    args.fromOverride ??
    (env.NEXT_PUBLIC_SITE_URL.includes("daimasu")
      ? "DAIMASU Reservations <reservations@reserve.daimasu.com.ph>"
      : "DAIMASU Reservations <onboarding@resend.dev>");

  const result: { ok: true; id: string } | { ok: false; error: string } =
    await (async () => {
      try {
        const r = await resend().emails.send(
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
