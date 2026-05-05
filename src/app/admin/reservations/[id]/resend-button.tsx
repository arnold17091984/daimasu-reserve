"use client";

/**
 * Manually resend the confirmation email + Telegram + WhatsApp for a
 * reservation. Useful when the original delivery failed (Resend
 * downtime, mistyped email at booking, etc.) and the operator wants
 * to push a fresh copy. UX 2026-05-06 (operations M7).
 */
import { useState } from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

interface Props {
  reservationId: string;
  lang: AdminLang;
}

// Local copy — admin-lang.ts is server-only and can't be imported into
// a client component. Same signature so call sites can stay readable.
const ti = (lang: AdminLang, ja: string, en: string) =>
  lang === "ja" ? ja : en;

export function ResendConfirmButton({ reservationId, lang }: Props) {
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "err">(
    "idle"
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function send() {
    if (status === "pending") return;
    setStatus("pending");
    setErrMsg(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/resend-confirm`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErrMsg(data.error ?? "failed");
        setStatus("err");
        return;
      }
      setStatus("ok");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "network");
      setStatus("err");
    }
  }

  if (status === "ok") {
    return (
      <p className="inline-flex items-center gap-2 text-[13px] text-gold">
        <CheckCircle2 size={14} />
        {ti(lang, "再送信しました", "Resent")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={send}
        disabled={status === "pending"}
        className="inline-flex w-fit items-center gap-2 border border-border bg-surface px-3 py-2 text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/50 hover:text-gold disabled:opacity-60"
      >
        {status === "pending" ? (
          <Loader2 className="animate-spin" size={13} />
        ) : (
          <Send size={13} />
        )}
        {ti(lang, "確認メールを再送", "Resend confirmation")}
      </button>
      {errMsg && (
        <p className="text-[11px] text-red-400">
          {ti(lang, "失敗: ", "Failed: ")}
          {errMsg}
        </p>
      )}
    </div>
  );
}
