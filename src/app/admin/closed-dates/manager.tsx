"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus } from "lucide-react";
import type { ClosedDate } from "@/lib/db/types";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { TextFieldButton } from "../_components/text-field-button";

export function ClosedDatesManager({
  initial,
  lang,
}: {
  initial: ClosedDate[];
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const router = useRouter();

  const [rows, setRows] = useState(initial);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/closed-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closed_date: date, reason: reason.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "failed");
        return;
      }
      setRows((prev) =>
        [
          ...prev,
          { closed_date: date, reason: reason.trim() || null, created_at: new Date().toISOString() },
        ].sort((a, b) => a.closed_date.localeCompare(b.closed_date))
      );
      setDate("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network");
    } finally {
      setPending(false);
    }
  }

  async function remove(closed_date: string) {
    if (
      !window.confirm(
        ti(
          `${closed_date} を休業日リストから削除しますか?`,
          `Remove ${closed_date} from closed dates?`
        )
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/closed-dates?closed_date=${closed_date}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "failed");
        return;
      }
      setRows((prev) => prev.filter((r) => r.closed_date !== closed_date));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <form
        onSubmit={add}
        className="flex h-fit flex-col gap-3 border border-border bg-surface p-5"
      >
        <p className="admin-section-label">
          {ti("休業日を追加", "Add a closed date")}
        </p>
        <label className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
          {ti("日付", "Date")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={todayIsoDate()}
            required
            className="border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:border-gold/60 focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
            {ti("理由 (内部用・任意)", "Reason (internal, optional)")}
          </span>
          <TextFieldButton
            value={reason}
            onChange={setReason}
            label={ti("休業の理由", "Closed-date reason")}
            placeholder={ti(
              "例: 貸切 / 店休 / 祝日",
              "e.g. private buyout, holiday, owner-off"
            )}
            maxLength={140}
          />
        </div>
        <button
          type="submit"
          disabled={pending || !date}
          className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium tracking-[0.10em] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="animate-spin" size={13} aria-hidden="true" />
          ) : (
            <Plus size={13} aria-hidden="true" />
          )}
          {ti("追加", "Add")}
        </button>
        {error && <p className="admin-caption text-red-400">{error}</p>}
      </form>

      <div className="border border-border bg-surface">
        <header className="border-b border-border px-4 py-3 admin-section-label">
          {ti("登録済み (今日以降)", "Upcoming closed dates")} · {rows.length}
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-muted">
            {ti("登録された休業日はありません。", "No upcoming closed dates.")}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => (
              <li
                key={r.closed_date}
                className="grid grid-cols-[120px_1fr_auto] items-center gap-4 px-4 py-3"
              >
                <span className="font-mono admin-num admin-body">
                  {r.closed_date}
                </span>
                <span className="admin-body text-text-secondary">
                  {r.reason ?? <span className="text-text-muted">—</span>}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.closed_date)}
                  className="text-text-muted hover:text-red-400"
                  aria-label={ti("削除", "Remove")}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
