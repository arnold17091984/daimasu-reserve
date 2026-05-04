"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Reservation } from "@/lib/db/types";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { formatPHP } from "@/lib/domain/reservation";

export function NoShowButton({
  reservation,
  lang,
}: {
  reservation: Reservation;
  lang: AdminLang;
}) {
  const router = useRouter();
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function execute() {
    setStatus("pending");
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservation.id}/mark-no-show`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed");
        return;
      }
      // Perf 2026-05-04: router.refresh() instead of full reload.
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
        className="inline-flex items-center gap-2 border border-red-500/40 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-red-400 hover:bg-red-500/10"
      >
        <AlertTriangle size={14} aria-hidden="true" />
        {ti("no-showにする", "Mark as no-show")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-red-400">
        {ti(
          `デポジット ${formatPHP(reservation.deposit_centavos, lang)} 保留 / 残金 ${formatPHP(reservation.balance_centavos, lang)} 失効。確定しますか?`,
          `Deposit ${formatPHP(reservation.deposit_centavos, lang)} retained · balance ${formatPHP(reservation.balance_centavos, lang)} forfeited. Confirm?`
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={execute}
          disabled={status === "pending"}
          className="inline-flex items-center gap-2 border border-red-500/60 bg-red-500/10 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-red-400 hover:bg-red-500/20 disabled:opacity-60"
        >
          {status === "pending" ? (
            <>
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
              {ti("処理中...", "Processing...")}
            </>
          ) : (
            ti("はい、no-show", "Yes, no-show")
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
