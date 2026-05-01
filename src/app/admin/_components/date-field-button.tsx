"use client";

/**
 * iPad-friendly date picker shown as a card; opens a centered modal with
 * a large DayPicker on tap. Built on react-day-picker so behaviour matches
 * the public booking flow, but cells are 56px+ for finger taps and the
 * caption / nav buttons are scaled up.
 *
 * Why: native <input type="date"> on iPad pops a small wheel that the
 * staff find awkward — wrong month is one mis-tap away. This modal uses
 * the same component as the public site (consistency) but sized for
 * counter-staff operation.
 */
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type Matcher } from "react-day-picker";
import { CalendarDays, X as XIcon, Check } from "lucide-react";
import "react-day-picker/style.css";
import type { AdminLang } from "@/lib/auth/admin-lang";
import type { AdminTheme } from "@/lib/auth/admin-theme";

interface Props {
  /** YYYY-MM-DD or empty string */
  value: string;
  onChange: (next: string) => void;
  label: string;
  /** Inclusive lower bound (YYYY-MM-DD). Defaults to today. */
  min?: string;
  /** Inclusive upper bound (YYYY-MM-DD). */
  max?: string;
  /** ISO dates that are unavailable (e.g. closed dates). */
  disabledDates?: Set<string>;
  lang: AdminLang;
  /**
   * Admin theme. Required because the modal renders via createPortal to
   * document.body and would otherwise escape the [data-admin-theme] scope
   * — the wrapper below re-applies the right token set.
   */
  theme: AdminTheme;
  disabled?: boolean;
}

function parseIso(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHumanDate(d: Date | undefined, lang: AdminLang): string {
  if (!d) return "";
  if (lang === "ja") {
    const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${w})`;
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DateFieldButton({
  value,
  onChange,
  label,
  min,
  max,
  disabledDates,
  lang,
  theme,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | undefined>(parseIso(value));

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  function openModal() {
    setDraft(parseIso(value));
    setOpen(true);
  }

  function confirm(next?: Date) {
    const target = next ?? draft;
    if (target) onChange(formatIso(target));
    setOpen(false);
  }

  const minDate = min ? parseIso(min) : new Date();
  const maxDate = max ? parseIso(max) : undefined;

  const disabledMatcher: Matcher[] = [];
  if (minDate) disabledMatcher.push({ before: minDate });
  if (maxDate) disabledMatcher.push({ after: maxDate });
  if (disabledDates && disabledDates.size > 0) {
    const blocked = disabledDates;
    disabledMatcher.push((d: Date) => blocked.has(formatIso(d)));
  }

  const display = parseIso(value);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && openModal()}
        disabled={disabled}
        className="group flex h-12 w-full items-center justify-between gap-2 border border-border bg-surface px-3 text-sm text-foreground hover:border-gold/50 focus:border-gold focus:outline-none disabled:opacity-50"
      >
        <span
          className={
            display
              ? "min-w-0 flex-1 truncate font-mono admin-num"
              : "min-w-0 flex-1 truncate text-text-muted"
          }
        >
          {display
            ? formatHumanDate(display, lang)
            : lang === "ja"
              ? "日付を選択"
              : "Pick a date"}
        </span>
        <CalendarDays
          size={16}
          className="shrink-0 text-text-muted group-hover:text-gold"
          aria-hidden="true"
        />
      </button>

      {mounted && open &&
        createPortal(
          <div
            data-admin-theme={theme}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[6vh] text-foreground backdrop-blur-sm"
          >
            <div className="w-full max-w-[34rem] border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">
                  {label}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-text-muted hover:text-foreground"
                  aria-label={lang === "ja" ? "閉じる" : "Close"}
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div className="rdp-daimasu-admin px-3 py-4 sm:px-5 sm:py-5">
                <DayPicker
                  mode="single"
                  selected={draft}
                  onSelect={(d) => {
                    setDraft(d);
                    if (d) confirm(d); // single-tap commit — no extra confirm step
                  }}
                  disabled={disabledMatcher.length > 0 ? disabledMatcher : undefined}
                  weekStartsOn={1}
                  numberOfMonths={1}
                  showOutsideDays
                  defaultMonth={draft ?? minDate}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border border-border bg-background px-4 py-3 text-[14px] font-medium text-foreground hover:border-text-muted"
                >
                  {lang === "ja" ? "キャンセル" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => confirm()}
                  disabled={!draft}
                  className="inline-flex items-center justify-center gap-2 bg-gold px-4 py-3 text-[14px] font-semibold disabled:opacity-50"
                  style={{ color: "var(--background)" }}
                >
                  <Check size={16} aria-hidden="true" />
                  {lang === "ja" ? "確定" : "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
