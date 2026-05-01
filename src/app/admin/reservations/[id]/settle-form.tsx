"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { Reservation, PaymentMethod } from "@/lib/db/types";
import { formatPHP, receiptBreakdown } from "@/lib/domain/reservation";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { NumPadInput } from "../../_components/num-pad-input";

const METHODS: {
  value: PaymentMethod;
  ja: string;
  en: string;
}[] = [
  { value: "cash", ja: "現金", en: "Cash" },
  { value: "card", ja: "カード", en: "Card" },
  { value: "gcash", ja: "GCash", en: "GCash" },
  { value: "deposit_only", ja: "デポジットのみ (残金なし)", en: "Deposit only (no balance)" },
];

export function SettleForm({
  reservation,
  lang,
}: {
  reservation: Reservation;
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // On-site due = grand_total (menu+SVC+VAT) − deposit already paid.
  // The reservation row's balance_centavos is menu-only and would
  // undercollect by SVC+VAT amounts.
  const breakdown = receiptBreakdown(
    reservation.course_price_centavos,
    reservation.party_size,
    reservation.deposit_pct
  );
  const onSiteDueCentavos = Math.max(
    0,
    breakdown.grand_total_centavos - reservation.deposit_centavos
  );
  const [amountPesos, setAmountPesos] = useState(
    String(onSiteDueCentavos / 100)
  );
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("pending");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservation.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          amount_centavos: Math.round(parseFloat(amountPesos || "0") * 100),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed");
        return;
      }
      setStatus("ok");
      window.location.reload();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="admin-section-label">
        {ti("精算する", "Mark as settled")}
      </p>
      <p className="text-sm text-text-secondary">
        {ti("店舗精算 (税サ込): ", "On-site due (incl. tax/svc): ")}
        {formatPHP(onSiteDueCentavos, lang)}
      </p>

      <label className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {ti("支払方法", "Payment method")}
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:border-gold/60 focus:outline-none"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {ti(m.ja, m.en)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        <span>{ti("受領合計 (₱)", "Total received (₱)")}</span>
        <NumPadInput
          value={amountPesos}
          onChange={setAmountPesos}
          label={ti("受領合計を入力", "Enter total received")}
          subText={ti(
            `店舗精算 ${formatPHP(onSiteDueCentavos, lang)} (税サ込)`,
            `On-site due ${formatPHP(onSiteDueCentavos, lang)} (incl. tax/svc)`
          )}
          prefix="₱"
          allowDecimal
          placeholder="0"
        />
        <span className="admin-meta normal-case tracking-normal">
          {ti(
            "ドリンク等のアップセルもここで合計可能。",
            "Drinks / upsell beyond the course can be added here."
          )}
        </span>
      </div>

      <button
        type="submit"
        disabled={status === "pending"}
        className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium tracking-[0.14em] disabled:opacity-60"
      >
        {status === "pending" ? (
          <>
            <Loader2 className="animate-spin" size={14} aria-hidden="true" />
            {ti("保存中...", "Saving...")}
          </>
        ) : status === "ok" ? (
          <>
            <CheckCircle2 size={14} aria-hidden="true" />
            {ti("精算完了", "Settled")}
          </>
        ) : (
          ti("精算する", "Mark as settled")
        )}
      </button>

      {status === "error" && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </form>
  );
}
