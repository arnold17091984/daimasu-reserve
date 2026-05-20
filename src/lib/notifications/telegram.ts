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

/** Total send attempts per chat before giving up (1 initial + 2 retries). */
const MAX_ATTEMPTS = 3;
/** Per-request timeout. Telegram normally answers in <1s; 8s is generous. */
const REQUEST_TIMEOUT_MS = 8000;

async function sendOne(
  token: string,
  chatId: string,
  text: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  // Retry transient network failures. "fetch failed" / socket hang-up
  // happens when undici reuses a keep-alive connection that Telegram has
  // already closed — a fresh connection on the next attempt almost always
  // succeeds. 2026-05-20: a real booking's group-chat notification was
  // permanently lost to a single un-retried "fetch failed". A Telegram
  // *API* rejection (data.ok === false, e.g. "chat not found") is NOT
  // transient and is returned immediately without retrying.
  let lastReason = "send_failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      const data = (await res.json()) as { ok?: boolean; description?: string };
      if (data.ok) return { ok: true };
      // Telegram-level rejection — deterministic, retrying won't help.
      return { ok: false, reason: data.description ?? "telegram_error" };
    } catch (err) {
      lastReason = err instanceof Error ? err.message : "send_failed";
      if (attempt < MAX_ATTEMPTS) {
        // Linear backoff: 300ms, 600ms.
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: `${lastReason} (after ${MAX_ATTEMPTS} attempts)` };
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
