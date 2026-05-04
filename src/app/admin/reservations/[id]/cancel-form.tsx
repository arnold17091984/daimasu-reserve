"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import type { Reservation } from "@/lib/db/types";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { formatPHP } from "@/lib/domain/reservation";
const cancelInputCls =
  "border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-gold/60 focus:outline-none";

/**
 * Owner-side cancellation with refund override.
 * Default: auto-tier (computed by API based on policy hours).
 * Override: enter exact refund amount + reason. Useful for goodwill / illness
 * cases where the owner wants to refund more than the policy allows.
 */
export function CancelWithRefundForm({
  reservation,
  lang,
}: {
  reservation: Reservation;
  lang: AdminLang;
}) {
  const router = useRouter();
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);

  // Captured once on mount to keep render pure (react-hooks/purity).
  const [hoursOut] = useState(
    () =>
      (new Date(reservation.service_starts_at).getTime() - Date.now()) /
      3_600_000
  );

  const [override, setOverride] = useState(false);
  const [amountPesos, setAmountPesos] = useState(
    String(reservation.deposit_centavos / 100)
  );
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function execute() {
    setStatus("pending");
    setErrorMsg(null);
    try {
      const body = override
        ? {
            override: true,
            amount_centavos: Math.round(parseFloat(amountPesos || "0") * 100),
            reason: reason.trim(),
          }
        : { override: false };
      const res = await fetch(
        `/api/admin/reservations/${reservation.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed");
        return;
      }
      // Perf 2026-05-04: router.refresh() re-fetches the server component
      // tree without a full document reload (~700ms saved per action).
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 border border-amber-500/50 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-amber-400 hover:bg-amber-500/10"
      >
        {ti("キャンセル処理", "Cancel reservation")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="admin-section-label !text-amber-400">
        <AlertTriangle size={12} className="mr-1 inline" aria-hidden="true" />
        {ti("店舗側キャンセル", "Owner-side cancel")}
      </p>
      <p className="admin-caption">
        {ti(
          `サービス開始まで${hoursOut.toFixed(1)}時間。デフォルトは規約に基づく自動返金。`,
          `${hoursOut.toFixed(1)}h until service. Default uses policy-based refund.`
        )}
      </p>

      <label className="flex items-start gap-2 admin-body-sm">
        <input
          type="checkbox"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
          className="mt-0.5 accent-gold"
        />
        <span>
          {ti(
            "返金額を上書きする (理由必須)",
            "Override refund amount (reason required)"
          )}
        </span>
      </label>

      {override && (
        <>
          <div className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
            <span>{ti("返金額 (₱)", "Refund amount (₱)")}</span>
            <div className="flex items-stretch">
              <span className="flex items-center border border-r-0 border-border bg-background/30 px-3 text-sm text-text-secondary">
                ₱
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="0"
                className={`${cancelInputCls} flex-1`}
              />
            </div>
            <span className="text-[11px] normal-case text-text-secondary">
              {ti(
                `預かり中: ${formatPHP(reservation.deposit_centavos, lang)}`,
                `Held: ${formatPHP(reservation.deposit_centavos, lang)}`
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
            <span>{ti("理由 (監査ログに残ります)", "Reason (logged for audit)")}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder={ti(
                "例: 体調不良のため特例で全額返金",
                "e.g. illness — full refund as goodwill"
              )}
              className={`${cancelInputCls} resize-y`}
            />
            <span className="text-[11px] normal-case text-text-secondary">
              {ti(
                "audit_log にスタッフ名と一緒に記録されます。",
                "Stored with the staff identity in audit_log."
              )}
            </span>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={execute}
          disabled={
            status === "pending" || (override && reason.trim().length < 3)
          }
          className="inline-flex items-center gap-2 border border-amber-500/60 bg-amber-500/10 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-amber-400 hover:bg-amber-500/20 disabled:opacity-60"
        >
          {status === "pending" ? (
            <>
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
              {ti("処理中...", "Processing...")}
            </>
          ) : (
            ti("確定してキャンセル", "Confirm cancel")
          )}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-secondary hover:text-foreground"
        >
          {ti("やめる", "Cancel")}
        </button>
      </div>
      {status === "error" && <p className="text-xs text-red-400">{errorMsg}</p>}
    </div>
  );
}
