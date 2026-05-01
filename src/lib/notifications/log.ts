/**
 * Centralized notification_log writer. Called by sendEmail / notifyTelegram /
 * sendWhatsApp after each attempt so the dashboard "通知の送信失敗" panel can
 * surface delivery failures to the owner.
 *
 * Best-effort: a logging failure must NEVER cause the caller to crash, since
 * the primary notification side effect already happened (or already failed).
 */
import "server-only";
import { adminClient } from "@/lib/db/clients";
import type { NotificationChannel, NotificationKind, NotificationStatus } from "@/lib/db/types";

export interface NotificationLogInput {
  reservation_id: string | null;
  channel: NotificationChannel;
  kind: NotificationKind;
  status: NotificationStatus;
  recipient?: string | null;
  error_message?: string | null;
}

export async function recordNotification(input: NotificationLogInput): Promise<void> {
  try {
    const sb = adminClient();
    await sb.from("notification_log").insert({
      reservation_id: input.reservation_id,
      channel: input.channel,
      kind: input.kind,
      status: input.status,
      recipient: input.recipient ?? null,
      error_message: input.error_message ?? null,
    });
  } catch {
    // Swallowed: logging is best-effort. Avoid recursive error spirals.
  }
}
