"use client";

/**
 * Inline settle / no-show buttons rendered in each row of the today
 * service sheet. UX 2026-05-06 (operations review): without these, the
 * floor manager had a 4-tap journey to mark each party complete during
 * the tight 30-second window between courses. The today-sheet is the
 * page the chef has open during service, so the actions belong there.
 *
 * Settle button uses the default fast path: method = cash, amount =
 * remaining balance (from the snapshot the row already carries). For
 * any non-default settlement (card, gcash, partial), the operator opens
 * the detail page via the "Detail" link as before.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, X, ExternalLink } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

interface Props {
  reservationId: string;
  balanceCentavos: number;
  lang: AdminLang;
}

export function TodayRowActions({
  reservationId,
  balanceCentavos,
  lang,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"settle" | "no-show" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);

  async function settle() {
    if (busy) return;
    setBusy("settle");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/settle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "cash",
            amount_centavos: balanceCentavos,
          }),
        }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "failed");
        setBusy(null);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(null);
    }
  }

  async function markNoShow() {
    if (busy) return;
    if (
      !confirm(
        ti(
          "ノーショーとして記録しますか？",
          "Mark this reservation as no-show?"
        )
      )
    ) {
      return;
    }
    setBusy("no-show");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/mark-no-show`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "failed");
        setBusy(null);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 print:hidden">
      <button
        type="button"
        onClick={settle}
        disabled={busy !== null}
        title={ti("精算 (現金 / 残額)", "Settle (cash / remaining balance)")}
        className="inline-flex items-center justify-center gap-1 border border-gold/60 bg-gold/[0.08] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-gold hover:bg-gold/[0.20] disabled:opacity-50"
      >
        {busy === "settle" ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Check size={11} />
        )}
        {ti("精算", "Settle")}
      </button>
      <button
        type="button"
        onClick={markNoShow}
        disabled={busy !== null}
        title={ti("ノーショー記録", "Record no-show")}
        className="inline-flex items-center justify-center gap-1 border border-red-500/40 bg-red-500/[0.05] px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-red-400 hover:bg-red-500/[0.12] disabled:opacity-50"
      >
        {busy === "no-show" ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <X size={11} />
        )}
        {ti("不戻", "No-show")}
      </button>
      <Link
        href={`/admin/reservations/${reservationId}`}
        className="inline-flex items-center justify-center gap-1 border border-border bg-surface px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/40 hover:text-foreground"
      >
        <ExternalLink size={11} />
        {ti("詳細", "Detail")}
      </Link>
      {error && (
        <span className="text-[10px] text-red-400">
          {ti("失敗: ", "Failed: ")}
          {error}
        </span>
      )}
    </div>
  );
}
