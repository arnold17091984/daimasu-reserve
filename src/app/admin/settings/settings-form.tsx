"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import type { RestaurantSettings } from "@/lib/db/types";

type Lang = "ja" | "en";
const ti = (lang: Lang, ja: string, en: string) => (lang === "ja" ? ja : en);

const settingsInputCls =
  "border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-gold/60 focus:outline-none";

const DANGER_FIELDS = [
  "course_price_centavos",
  "deposit_pct",
  "refund_full_hours",
  "refund_partial_hours",
  "total_seats",
  "online_seats",
] as const;

type DangerField = (typeof DANGER_FIELDS)[number];

export function SettingsForm({
  settings,
  lang,
}: {
  settings: RestaurantSettings;
  lang: Lang;
}) {
  const [s, setS] = useState(settings);
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error" | "confirm">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dangerDiffs = useMemo(() => {
    return DANGER_FIELDS.filter((k) => s[k] !== settings[k]).map((k) => ({
      key: k as DangerField,
      before: settings[k] as number | boolean,
      after: s[k] as number | boolean,
    }));
  }, [s, settings]);

  function update<K extends keyof RestaurantSettings>(
    key: K,
    val: RestaurantSettings[K]
  ) {
    setS((prev) => ({ ...prev, [key]: val }));
    setStatus("idle");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dangerDiffs.length > 0 && status !== "confirm") {
      setStatus("confirm");
      return;
    }
    actuallySave();
  }

  async function actuallySave() {
    setStatus("pending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed");
        return;
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
      <Section title={ti(lang, "予約", "Reservations")}>
        <Toggle
          label={ti(lang, "予約受付中 (公開フォーム)", "Reservations open (public form)")}
          checked={s.reservations_open}
          onChange={(v) => update("reservations_open", v)}
        />
        <NumberField
          label={ti(lang, "総席数 (カウンター物理席)", "Total seats (physical)")}
          value={s.total_seats}
          onChange={(v) => update("total_seats", v)}
          min={1}
          max={20}
          help={ti(
            lang,
            "店舗の実席数。各時間帯 (1部・2部) の最大収容。",
            "Physical capacity of the bar. Max guests per seating (S1/S2)."
          )}
        />
        <NumberField
          label={ti(lang, "オンライン予約可能席数", "Online-bookable seats")}
          value={s.online_seats}
          onChange={(v) => update("online_seats", v)}
          min={0}
          max={s.total_seats}
          help={ti(
            lang,
            `Webから予約できる席数。ダッシュボードの「残席」「満席」表示はこの値に基づきます。ウォークイン枠 = ${s.total_seats} − ${s.online_seats} = ${s.total_seats - s.online_seats} 席。`,
            `Seats bookable via the website. Dashboard "remaining" / "FULL" use this value. Walk-in budget = ${s.total_seats} − ${s.online_seats} = ${s.total_seats - s.online_seats} seats.`
          )}
        />
        <NumberField
          label={ti(lang, "1部の所要時間 (分)", "Service minutes")}
          value={s.service_minutes}
          onChange={(v) => update("service_minutes", v)}
          min={30}
          max={300}
        />
      </Section>

      <Section title={ti(lang, "料金とデポジット", "Pricing & deposit")}>
        <NumberField
          label={ti(lang, "コース料金 (₱)", "Course price (₱)")}
          value={Math.floor(s.course_price_centavos / 100)}
          onChange={(v) => update("course_price_centavos", v * 100)}
          min={0}
        />
        <NumberField
          label={ti(lang, "デポジット率 (%)", "Deposit %")}
          value={s.deposit_pct}
          onChange={(v) => update("deposit_pct", v)}
          min={0}
          max={100}
        />
        <NumberField
          label={ti(lang, "月次売上目標 (₱)", "Monthly revenue target (₱)")}
          value={Math.floor(s.monthly_revenue_target_centavos / 100)}
          onChange={(v) => update("monthly_revenue_target_centavos", v * 100)}
          min={0}
        />
      </Section>

      <Section title={ti(lang, "キャンセルポリシー", "Cancellation policy")}>
        <NumberField
          label={ti(lang, "100%返金の境界 (時間前)", "100% refund cutoff (hours)")}
          value={s.refund_full_hours}
          onChange={(v) => update("refund_full_hours", v)}
          min={0}
          max={168}
        />
        <NumberField
          label={ti(lang, "50%返金の境界 (時間前)", "50% refund cutoff (hours)")}
          value={s.refund_partial_hours}
          onChange={(v) => update("refund_partial_hours", v)}
          min={0}
          max={s.refund_full_hours}
          help={ti(lang, "これ以降は返金なし", "Below this: 0% refund.")}
        />
      </Section>

      <Section title={ti(lang, "リマインダー", "Reminders")}>
        <NumberField
          label={ti(lang, "ロングリマインダー (時間前)", "Long reminder (hours before)")}
          value={s.reminder_long_hours}
          onChange={(v) => update("reminder_long_hours", v)}
          min={1}
          max={72}
        />
        <NumberField
          label={ti(lang, "ショートリマインダー (時間前)", "Short reminder (hours before)")}
          value={s.reminder_short_hours}
          onChange={(v) => update("reminder_short_hours", v)}
          min={0}
          max={s.reminder_long_hours - 1}
        />
      </Section>

      <Section title={ti(lang, "通知チャネル", "Notification channels")}>
        <TextField
          label={ti(lang, "Telegram Bot トークン", "Telegram bot token")}
          value={s.telegram_bot_token ?? ""}
          onChange={(v) => update("telegram_bot_token", v || null)}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="123456:ABC-..."
          help={ti(
            lang,
            "@BotFather から取得。空欄で Telegram 通知を無効化。",
            "From @BotFather. Leave blank to disable Telegram alerts."
          )}
        />
        <TextField
          label={ti(lang, "Telegram チャットID", "Telegram chat ID")}
          value={s.telegram_chat_id ?? ""}
          onChange={(v) => update("telegram_chat_id", v || null)}
          inputMode="numeric"
          autoCapitalize="none"
          autoComplete="off"
          placeholder="-1234567890"
        />
        <TextField
          label={ti(lang, "WhatsApp 送信元番号 (Twilio)", "WhatsApp 'from' number (Twilio)")}
          value={s.whatsapp_from_number ?? ""}
          onChange={(v) => update("whatsapp_from_number", v || null)}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="whatsapp:+14155238886"
          help={ti(lang, "例: whatsapp:+14155238886", "e.g. whatsapp:+14155238886")}
        />
        <TextField
          label={ti(lang, "Resend 送信元メール", "Resend 'from' email")}
          value={s.resend_from_email ?? ""}
          onChange={(v) => update("resend_from_email", v || null)}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="reservations@reserve.daimasu.com.ph"
        />
      </Section>

      <Section title={ti(lang, "表示", "Display")}>
        <TextField
          label={ti(lang, "表示名", "Display name")}
          value={s.display_name}
          onChange={(v) => update("display_name", v)}
          autoCapitalize="words"
          placeholder="DAIMASU 大桝 BAR"
        />
        <TextField
          label={ti(lang, "タイムゾーン (IANA)", "Timezone (IANA)")}
          value={s.timezone}
          onChange={(v) => update("timezone", v)}
          autoCapitalize="none"
          autoComplete="off"
          placeholder="Asia/Manila"
          help={ti(lang, "デフォルト: Asia/Manila", "Default: Asia/Manila")}
        />
      </Section>

      <div className="lg:col-span-2 border-t border-border pt-5">
        {status === "confirm" && dangerDiffs.length > 0 && (
          <div className="mb-4 border border-red-500/40 bg-red-500/[0.06] p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-red-400">
              <AlertTriangle size={14} />
              {ti(lang, "重要な値を変更しています", "You're changing critical values")}
            </div>
            <ul className="mb-3 grid gap-1 text-[12px]">
              {dangerDiffs.map((d) => (
                <li key={d.key} className="grid grid-cols-[200px_1fr] gap-3 font-mono">
                  <span className="text-text-muted">{dangerLabel(d.key, lang)}</span>
                  <span>
                    <span className="text-red-400/80">{String(d.before)}</span>
                    <span className="mx-2 text-text-muted">→</span>
                    <span className="text-foreground">{String(d.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-3 admin-caption">
              {ti(
                lang,
                "コース価格・デポジット率・キャンセル境界・席数の変更は、今後の予約に即座に影響します。意図した変更ですか?",
                "Course price, deposit %, cancellation cutoffs, and seat counts affect every future booking immediately. Are you sure?"
              )}
            </p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "pending"}
            className={
              status === "confirm"
                ? "inline-flex items-center justify-center gap-2 border border-red-500/60 bg-red-500/15 px-6 py-2.5 text-sm font-medium tracking-[0.14em] text-red-300 hover:bg-red-500/25 disabled:opacity-60"
                : "btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium tracking-[0.14em] disabled:opacity-60"
            }
          >
            {status === "pending" ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                {ti(lang, "保存中...", "Saving...")}
              </>
            ) : status === "ok" ? (
              <>
                <CheckCircle2 size={16} />
                {ti(lang, "保存しました", "Saved")}
              </>
            ) : status === "confirm" ? (
              ti(lang, "確認: 保存する", "Confirm: save changes")
            ) : (
              ti(lang, "設定を保存", "Save settings")
            )}
          </button>
          {status === "confirm" && (
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-secondary hover:text-foreground"
            >
              {ti(lang, "やめる", "Cancel")}
            </button>
          )}
          {status === "error" && <p className="text-xs text-red-400">{errorMsg}</p>}
        </div>
      </div>
    </form>
  );
}

function dangerLabel(key: DangerField, lang: Lang): string {
  const map: Record<DangerField, { ja: string; en: string }> = {
    course_price_centavos: { ja: "コース料金 (centavos)", en: "Course price (centavos)" },
    deposit_pct: { ja: "デポジット率 (%)", en: "Deposit %" },
    refund_full_hours: { ja: "100%返金境界 (時間)", en: "100% refund cutoff (h)" },
    refund_partial_hours: { ja: "50%返金境界 (時間)", en: "50% refund cutoff (h)" },
    total_seats: { ja: "総席数", en: "Total seats" },
    online_seats: { ja: "オンライン枠", en: "Online seats" },
  };
  return map[key][lang];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-border bg-surface p-6">
      <legend className="px-2 admin-section-label">
        {title}
      </legend>
      <div className="flex flex-col gap-4">{children}</div>
    </fieldset>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  help,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(min ?? 0);
            return;
          }
          let n = parseInt(raw, 10);
          if (Number.isNaN(n)) return;
          if (typeof min === "number") n = Math.max(min, n);
          if (typeof max === "number") n = Math.min(max, n);
          onChange(n);
        }}
        min={min}
        max={max}
        placeholder="0"
        className={settingsInputCls}
      />
      {help && <span className="admin-meta normal-case tracking-normal">{help}</span>}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  help,
  placeholder,
  type,
  inputMode,
  autoCapitalize,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  help?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  autoCapitalize?: "off" | "none" | "sentences" | "words" | "characters";
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        className={settingsInputCls}
      />
      {help && <span className="admin-meta normal-case tracking-normal">{help}</span>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 border border-border/40 bg-background/30 px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-gold"
      />
    </label>
  );
}
