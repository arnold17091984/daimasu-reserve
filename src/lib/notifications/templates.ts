/**
 * Bilingual email templates. Plain HTML, no framework — keeps the bundle
 * small and avoids the Resend React-email peer dep.
 *
 * Style matches the site's gold-on-dark aesthetic but degrades gracefully
 * on Outlook (table-based skeleton, inline styles only).
 */
import type { Reservation, RestaurantSettings } from "@/lib/db/types";
import { formatPHP } from "@/lib/domain/reservation";

interface ConfirmArgs {
  reservation: Reservation;
  settings: RestaurantSettings;
  cancelUrl: string;
}

interface CancelledArgs {
  reservation: Reservation;
  refundCentavos: number;
  tier: "full" | "partial" | "late";
}

interface ReminderArgs {
  reservation: Reservation;
  hoursOut: number;
}

const PALETTE = {
  bg: "#0a0a0b",
  surface: "#141417",
  border: "#2a2a2e",
  gold: "#d4af37",
  goldSoft: "#e7c769",
  text: "#f5f5f5",
  textMuted: "#a0a0a8",
};

function shell(title: string, body: string, lang: "ja" | "en" = "en"): string {
  // Codex audit fix 2026-04-29: lang attr now reflects guest language so
  // screen readers / clients render text in the correct locale.
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${PALETTE.bg};font-family:'Noto Serif JP','Times New Roman',serif;color:${PALETTE.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.bg};">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${PALETTE.surface};border:1px solid ${PALETTE.border};">
          <tr><td style="padding:32px 32px 16px;text-align:center;border-bottom:1px solid ${PALETTE.border};">
            <div style="font-size:11px;letter-spacing:0.32em;color:${PALETTE.goldSoft};text-transform:uppercase;">DAIMASU 大桝 BAR</div>
            <div style="font-size:13px;color:${PALETTE.textMuted};margin-top:6px;">JAPANESE BAR · MANILA</div>
          </td></tr>
          <tr><td style="padding:32px;">${body}</td></tr>
          <tr><td style="padding:24px 32px;border-top:1px solid ${PALETTE.border};font-size:11px;color:${PALETTE.textMuted};letter-spacing:0.04em;line-height:1.6;">
            DAIMASU 大桝 BAR · Manila, Philippines<br />
            <a href="https://reserve.daimasu.com.ph" style="color:${PALETTE.goldSoft};text-decoration:none;">reserve.daimasu.com.ph</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function dateLine(reservation: Reservation, lang: "ja" | "en"): string {
  const d = new Date(reservation.service_starts_at);
  const fmt = d.toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt;
}

function summaryTable(r: Reservation, lang: "ja" | "en"): string {
  const labels =
    lang === "ja"
      ? { name: "お名前", date: "ご来店日時", party: "人数", course: "コース", deposit: "デポジット", balance: "当日お支払い" }
      : { name: "Name", date: "Date / time", party: "Party", course: "Course", deposit: "Deposit (paid)", balance: "Balance on arrival" };

  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:${PALETTE.textMuted};font-size:13px;letter-spacing:0.04em;">${k}</td><td style="padding:6px 0;color:${PALETTE.text};font-size:14px;text-align:right;">${v}</td></tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${PALETTE.border};border-bottom:1px solid ${PALETTE.border};margin:16px 0;">
    ${row(labels.name, escapeHtml(r.guest_name))}
    ${row(labels.date, dateLine(r, lang))}
    ${row(labels.party, `${r.party_size}`)}
    ${row(labels.course, formatPHP(r.course_price_centavos, lang))}
    ${row(labels.deposit, formatPHP(r.deposit_centavos, lang))}
    ${row(labels.balance, formatPHP(r.balance_centavos, lang))}
  </table>`;
}

export function renderConfirmEmail(args: ConfirmArgs): { subject: string; html: string } {
  const r = args.reservation;
  const lang = r.guest_lang;
  const subject =
    lang === "ja"
      ? `【DAIMASU 大桝 BAR】ご予約を承りました`
      : `DAIMASU Reservation Confirmed`;

  const greeting =
    lang === "ja"
      ? `<h1 style="margin:0 0 8px;font-size:22px;font-weight:500;letter-spacing:0.04em;">ご予約を承りました</h1>
         <p style="margin:0 0 16px;font-size:13px;color:${PALETTE.textMuted};">${escapeHtml(r.guest_name)} 様</p>
         <p style="margin:0 0 8px;font-size:14px;line-height:1.7;">DAIMASU 大桝 BAR をお選びいただきありがとうございます。<br />ご予約内容は下記の通りです。</p>`
      : `<h1 style="margin:0 0 8px;font-size:22px;font-weight:500;letter-spacing:0.04em;">Your reservation is confirmed</h1>
         <p style="margin:0 0 16px;font-size:13px;color:${PALETTE.textMuted};">Dear ${escapeHtml(r.guest_name)},</p>
         <p style="margin:0 0 8px;font-size:14px;line-height:1.7;">Thank you for choosing DAIMASU 大桝 BAR. Your booking is summarised below.</p>`;

  const policy =
    lang === "ja"
      ? `<p style="margin:16px 0 0;font-size:12px;color:${PALETTE.textMuted};line-height:1.7;">
        <strong style="color:${PALETTE.goldSoft};">キャンセルポリシー:</strong>
        ご来店の 48 時間前まで 100% / 24 時間前まで 50% を返金いたします。それ以降のキャンセルは返金いたしかねます。<br />
        ご都合変更は下記のキャンセルリンクから 24 時間 365 日承ります。</p>`
      : `<p style="margin:16px 0 0;font-size:12px;color:${PALETTE.textMuted};line-height:1.7;">
        <strong style="color:${PALETTE.goldSoft};">Cancellation policy:</strong>
        100% refund up to 48 h before arrival, 50% up to 24 h, 0% thereafter.<br />
        Use the cancel link below any time.</p>`;

  const cancelButton =
    `<p style="margin:24px 0 0;text-align:center;">
      <a href="${args.cancelUrl}" style="display:inline-block;padding:12px 28px;border:1px solid ${PALETTE.gold};color:${PALETTE.gold};text-decoration:none;font-size:13px;letter-spacing:0.18em;font-weight:500;text-transform:uppercase;">${lang === "ja" ? "予約を変更/キャンセル" : "Change / Cancel"}</a>
    </p>`;

  return {
    subject,
    html: shell(subject, greeting + summaryTable(r, lang) + policy + cancelButton, lang),
  };
}

export function renderCancelEmail(args: CancelledArgs): { subject: string; html: string } {
  const r = args.reservation;
  const lang = r.guest_lang;
  const subject =
    lang === "ja"
      ? `【DAIMASU 大桝 BAR】キャンセルを承りました`
      : `DAIMASU Reservation Cancelled`;

  const refundLine =
    args.refundCentavos > 0
      ? lang === "ja"
        ? `${formatPHP(args.refundCentavos, lang)} を Stripe より返金処理いたしました (5–10 営業日でお戻りいたします)。`
        : `A refund of ${formatPHP(args.refundCentavos, lang)} has been issued via Stripe (typically 5–10 business days).`
      : lang === "ja"
        ? `恐れ入りますが、当日キャンセルにつき返金はございません。`
        : `As this is a same-day cancellation, no refund is issued per our policy.`;

  const body = `<h1 style="margin:0 0 8px;font-size:22px;font-weight:500;letter-spacing:0.04em;">${lang === "ja" ? "キャンセルを承りました" : "Reservation cancelled"}</h1>
    <p style="margin:0 0 16px;font-size:13px;color:${PALETTE.textMuted};">${escapeHtml(r.guest_name)} 様</p>
    ${summaryTable(r, lang)}
    <p style="margin:16px 0 0;font-size:13px;color:${PALETTE.text};line-height:1.7;">${refundLine}</p>
    <p style="margin:16px 0 0;font-size:12px;color:${PALETTE.textMuted};line-height:1.7;">${lang === "ja" ? "またのご来店を心よりお待ちしております。" : "We hope to welcome you another time."}</p>`;

  return { subject, html: shell(subject, body, lang) };
}

export function renderReminderEmail(args: ReminderArgs): { subject: string; html: string } {
  const r = args.reservation;
  const lang = r.guest_lang;
  const subject =
    lang === "ja"
      ? `【DAIMASU 大桝 BAR】ご来店リマインド (${args.hoursOut}h 前)`
      : `DAIMASU Reminder — ${args.hoursOut}h to your reservation`;

  const body = `<h1 style="margin:0 0 8px;font-size:22px;font-weight:500;letter-spacing:0.04em;">${lang === "ja" ? "ご来店をお待ちしております" : "We look forward to welcoming you"}</h1>
    <p style="margin:0 0 16px;font-size:13px;color:${PALETTE.textMuted};">${escapeHtml(r.guest_name)} 様</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;">${lang === "ja" ? "ご予約のお時間が近づいております。下記をご確認ください。" : "Your reservation is approaching. Please confirm the details below."}</p>
    ${summaryTable(r, lang)}
    <p style="margin:16px 0 0;font-size:12px;color:${PALETTE.textMuted};line-height:1.7;">${lang === "ja" ? "ご都合が変わった場合は、ご予約確認メール内のキャンセルリンクをご利用ください。" : "If your plans change, please use the cancel link in your original booking confirmation email."}</p>`;

  return { subject, html: shell(subject, body, lang) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Telegram (HTML mode) — short ops-side notification. */
export function renderTelegramConfirm(r: Reservation): string {
  const d = new Date(r.service_starts_at).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return [
    "<b>🥢 New reservation confirmed</b>",
    "━━━━━━━━━━━━━━━━━━━━━",
    `<b>Name</b>: ${escapeHtml(r.guest_name)}`,
    `<b>Phone</b>: ${escapeHtml(r.guest_phone)}`,
    `<b>Email</b>: ${escapeHtml(r.guest_email)}`,
    `<b>When</b>: ${d}`,
    `<b>Party</b>: ${r.party_size}`,
    `<b>Notes</b>: ${escapeHtml(r.notes ?? "—")}`,
    `<b>Deposit</b>: ${formatPHP(r.deposit_centavos)} (paid)`,
    `<b>Balance</b>: ${formatPHP(r.balance_centavos)} (on arrival)`,
    "━━━━━━━━━━━━━━━━━━━━━",
    `via reserve.daimasu.com.ph`,
  ].join("\n");
}

export function renderTelegramCancelled(r: Reservation, refundCentavos: number, tier: "full" | "partial" | "late"): string {
  const d = new Date(r.service_starts_at).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return [
    "<b>❌ Reservation cancelled</b>",
    "━━━━━━━━━━━━━━━━━━━━━",
    `<b>Name</b>: ${escapeHtml(r.guest_name)}`,
    `<b>When</b>: ${d}`,
    `<b>Party</b>: ${r.party_size}`,
    `<b>Tier</b>: ${tier} (${refundCentavos > 0 ? `refunded ${formatPHP(refundCentavos)}` : "no refund"})`,
    "━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}
