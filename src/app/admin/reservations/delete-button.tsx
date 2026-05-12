"use client";

/**
 * Inline "Delete" action shown next to View on the reservation list.
 * UX 2026-05-12: the operator needs to clean up test bookings without
 * the cancel-then-delete two-step. Hard delete cascades dependent rows
 * (notification_log / audit_log / payments / receipts) via the API.
 *
 * Guardrails live on the API:
 *  - settled (`completed`) and `no_show` rows are rejected (tax records)
 *  - reservations with a non-voided receipt are rejected
 *
 * Client-side: a typed-name confirmation prevents accidental deletes
 * during a fast scroll/click. Native confirm() would be too low-friction
 * for an irreversible action on a real-money table.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

interface Props {
  reservationId: string;
  guestName: string;
  status: string;
  lang: AdminLang;
}

// Local copy — admin-lang.ts is server-only and can't be imported into
// a client component.
const ti = (lang: AdminLang, ja: string, en: string) =>
  lang === "ja" ? ja : en;

export function DeleteReservationButton({
  reservationId,
  guestName,
  status,
  lang,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = status === "completed" || status === "no_show";
  if (blocked) return null;

  const canConfirm = typed.trim() === guestName.trim();

  async function execute() {
    if (!canConfirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/delete`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok: boolean; error?: string; hint?: string };
      if (!data.ok) {
        setError(data.hint ?? data.error ?? "failed");
        setBusy(false);
        return;
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTyped("");
          setError(null);
        }}
        title={ti(lang, "予約を完全削除", "Delete reservation permanently")}
        className="ml-3 text-[12px] font-medium uppercase tracking-[0.12em] text-red-400/80 hover:text-red-400"
      >
        {ti(lang, "削除", "Delete")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md border border-red-500/40 bg-surface p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-red-400">
              <Trash2 size={18} />
              <h3 className="text-[14px] font-bold uppercase tracking-[0.12em]">
                {ti(lang, "予約を完全削除", "Delete reservation")}
              </h3>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
              {ti(
                lang,
                "この操作は元に戻せません。予約、関連通知ログ、監査ログ、決済記録、レシート (取消済) を全て削除します。テストデータ整理のみに使用してください。",
                "This cannot be undone. The reservation and all related notification logs, audit logs, payments and (voided) receipts will be removed. Use only for test-data cleanup."
              )}
            </p>
            <p className="mb-2 text-[12px] text-text-secondary">
              {lang === "ja" ? "確認のため、お客様名 " : "Type the guest name "}
              <strong className="text-foreground">{guestName}</strong>
              {lang === "ja" ? " を入力してください:" : " to confirm:"}
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-red-500/60 focus:outline-none"
            />
            {error && (
              <p className="mt-2 text-[12px] text-red-400">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-text-secondary hover:text-foreground disabled:opacity-50"
              >
                {ti(lang, "キャンセル", "Cancel")}
              </button>
              <button
                type="button"
                onClick={execute}
                disabled={!canConfirm || busy}
                className="inline-flex items-center gap-2 border border-red-500/60 bg-red-500/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" size={12} />
                    {ti(lang, "削除中...", "Deleting...")}
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    {ti(lang, "完全に削除する", "Delete permanently")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
