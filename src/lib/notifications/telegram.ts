/**
 * Telegram fallback notification — kept as a second-channel safety net.
 * Token + chat ID resolved from restaurant_settings (admin-editable per Q3 of Gate 1).
 *
 * Multi-destination fan-out (added 2026-05-03): the chat_id field accepts a
 * comma-separated list, so the same notification reaches both the operator
 * DM and any number of staff groups. Add a destination by simply updating
 * `restaurant_settings.telegram_chat_id` to e.g. "12345678,-1009876543210"
 * — no code changes required. Each destination is logged separately to
 * `notification_log` so per-channel success/failure stays auditable.
 */
import "server-only";
import { serverEnv } from "@/lib/env";
import { recordNotification } from "./log";
import type { NotificationKind } from "@/lib/db/types";

interface NotifyArgs {
  text: string;
  /** Settings-table values take precedence; env fallbacks used if null. */
  tokenOverride?: string | null;
  /** Single chat_id OR comma-separated list (e.g. "123,-456,-789"). */
  chatIdOverride?: string | null;
  /** When provided, each attempt is recorded to notification_log. */
  log?: { reservation_id: string | null; kind: NotificationKind };
}

type SendResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; reason: string };

async function sendOne(
  token: string,
  chatId: string,
  text: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) return { ok: false, reason: data.description ?? "telegram_error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}

export async function notifyTelegram(args: NotifyArgs): Promise<SendResult> {
  const env = serverEnv();
  const token = args.tokenOverride ?? env.TELEGRAM_BOT_TOKEN_FALLBACK;
  const chatIdRaw = args.chatIdOverride ?? env.TELEGRAM_CHAT_ID_FALLBACK;

  if (!token || !chatIdRaw) {
    if (args.log) {
      await recordNotification({
        reservation_id: args.log.reservation_id,
        channel: "telegram",
        kind: args.log.kind,
        status: "skipped",
        recipient: null,
        error_message: "telegram_not_configured",
      });
    }
    return { ok: false, reason: "telegram_not_configured" };
  }

  // Comma-separated fan-out. Empty / whitespace entries are skipped so
  // trailing commas in DB don't cause empty sends.
  const chatIds = chatIdRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Run sends in parallel — Telegram's per-bot global rate limit is 30/sec
  // which is well above any plausible booking burst.
  const results = await Promise.all(
    chatIds.map(async (chatId) => ({
      chatId,
      ...(await sendOne(token, chatId, args.text)),
    }))
  );

  if (args.log) {
    for (const r of results) {
      await recordNotification({
        reservation_id: args.log.reservation_id,
        channel: "telegram",
        kind: args.log.kind,
        status: r.ok ? "sent" : "failed",
        recipient: r.chatId,
        error_message: r.ok ? null : r.reason,
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  if (sent === 0) {
    return {
      ok: false,
      reason: results
        .map((r) => (!r.ok ? `${r.chatId}:${r.reason}` : ""))
        .filter(Boolean)
        .join("; "),
    };
  }
  return { ok: true, sent, failed };
}
