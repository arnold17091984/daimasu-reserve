"use client";

/**
 * Airレジ-style on-screen tenkey for iPad operations.
 *
 * Why: the bar runs on iPad; a fast, finger-friendly tenkey is required
 * for the high-frequency numeric inputs (settle amount, refund override,
 * party size). Native iOS keyboards work but cost a tap and disappear
 * on first error. This component replaces the input with a "card" that
 * opens a centered tenkey modal when tapped.
 *
 * The component still works with a Bluetooth keyboard — the displayed
 * draft is updated by both tenkey taps and physical keypresses.
 */
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Delete } from "lucide-react";

interface NumPadInputProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  /** Allows entering a decimal point. Default false (integer-only). */
  allowDecimal?: boolean;
  /** Maximum digits before decimal (rough cap). */
  maxIntegerDigits?: number;
  /** Optional sub-text shown above the value during edit (e.g. "Balance ₱1,600"). */
  subText?: string;
  /** Disable editing. */
  disabled?: boolean;
  className?: string;
}

const KEYS: Array<{ label: string; value: string }> = [
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
];

export function NumPadInput({
  value,
  onChange,
  label,
  prefix = "",
  suffix = "",
  placeholder = "0",
  allowDecimal = false,
  maxIntegerDigits = 12,
  subText,
  disabled = false,
  className,
}: NumPadInputProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");
  // After every open(), the first key press replaces the draft instead
  // of appending. Mirrors iOS Calculator behavior: starting a new entry
  // shouldn't require pressing ⌫ to clear the previous value first.
  const [freshStart, setFreshStart] = useState(false);
  // SSR-safe portal flag without setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  function openModal() {
    setDraft(value || "");
    setFreshStart(true);
    setOpen(true);
  }

  const append = useCallback(
    (digit: string) => {
      setDraft((prev) => {
        // Fresh-start: first key press after open clears the prior value.
        const base = freshStart ? "" : prev;
        if (digit === ".") {
          if (!allowDecimal) return prev;
          if (base.includes(".")) return prev;
          return base === "" ? "0." : base + ".";
        }
        if (digit === "00") {
          if (base === "" || base === "0") return "0";
          const intPart = base.split(".")[0] ?? "";
          if (intPart.length + 2 > maxIntegerDigits) return prev;
          return base + "00";
        }
        // single digit
        if (base === "0") return digit;
        const intPart = base.split(".")[0] ?? "";
        if (intPart.length >= maxIntegerDigits && !base.includes(".")) {
          // Hit the digit cap: replace the last digit instead of refusing
          // the press. With maxIntegerDigits=1 (party size) this means
          // "2 → tap 5" yields 5 rather than getting stuck at 2.
          if (intPart.length === maxIntegerDigits) {
            const decPart = base.includes(".") ? "." + base.split(".")[1] : "";
            return digit + decPart;
          }
          return prev;
        }
        return base + digit;
      });
      if (freshStart) setFreshStart(false);
    },
    [allowDecimal, maxIntegerDigits, freshStart]
  );

  const backspace = useCallback(() => {
    setFreshStart(false);
    setDraft((prev) => {
      const next = prev.slice(0, -1);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFreshStart(false);
    setDraft("");
  }, []);

  const confirm = useCallback(() => {
    onChange(draft);
    setOpen(false);
  }, [draft, onChange]);

  const cancel = useCallback(() => {
    setDraft(value || "");
    setOpen(false);
  }, [value]);

  // Physical keyboard support while modal is open (iPad with bluetooth, dev).
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        append(e.key);
        e.preventDefault();
      } else if (e.key === ".") {
        append(".");
        e.preventDefault();
      } else if (e.key === "Backspace") {
        backspace();
        e.preventDefault();
      } else if (e.key === "Enter") {
        confirm();
        e.preventDefault();
      } else if (e.key === "Escape") {
        cancel();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, append, backspace, confirm, cancel]);

  const display = draft || "0";

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && openModal()}
        disabled={disabled}
        className={
          className ??
          "flex h-12 w-full items-center justify-end gap-1 border border-border bg-surface px-4 font-mono text-base font-medium tabular-nums text-foreground hover:border-gold/50 focus:border-gold focus:outline-none disabled:opacity-50"
        }
      >
        {prefix && <span className="text-text-secondary">{prefix}</span>}
        <span className={value ? "" : "text-text-muted"}>
          {value
            ? formatThousands(value)
            : placeholder}
        </span>
        {suffix && <span className="text-text-secondary">{suffix}</span>}
      </button>

      {mounted && open && createPortal(
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={label ?? "Number pad"}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancel();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm border border-border bg-surface shadow-2xl">
            {/* Header */}
            <div className="border-b border-border px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-secondary">
                {label ?? "金額入力"}
              </p>
              {subText && (
                <p className="mt-1 text-[12px] text-text-muted">{subText}</p>
              )}
            </div>

            {/* Display */}
            <div className="border-b border-border bg-card px-5 py-6 text-right">
              <div className="font-mono text-4xl font-semibold tabular-nums text-foreground">
                {prefix && (
                  <span className="mr-1 text-2xl text-text-secondary">
                    {prefix}
                  </span>
                )}
                {formatThousands(display)}
                {suffix && (
                  <span className="ml-1 text-2xl text-text-secondary">
                    {suffix}
                  </span>
                )}
              </div>
            </div>

            {/* Tenkey grid */}
            <div className="grid grid-cols-3 gap-px bg-border p-px">
              {KEYS.map((k) => (
                <PadKey key={k.value} onClick={() => append(k.value)}>
                  {k.label}
                </PadKey>
              ))}
              {allowDecimal ? (
                <PadKey onClick={() => append(".")}>.</PadKey>
              ) : (
                <PadKey onClick={() => append("00")}>00</PadKey>
              )}
              <PadKey onClick={() => append("0")}>0</PadKey>
              <PadKey onClick={backspace} variant="muted">
                <Delete size={20} aria-hidden="true" />
              </PadKey>
            </div>

            {/* Footer actions */}
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 border-t border-border p-3">
              <button
                type="button"
                onClick={clear}
                className="flex items-center justify-center px-4 py-3 text-[13px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:bg-card"
              >
                CLR
              </button>
              <button
                type="button"
                onClick={cancel}
                className="border border-border bg-background px-4 py-3 text-[14px] font-medium text-foreground hover:border-text-muted"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirm}
                className="bg-gold px-4 py-3 text-[14px] font-semibold text-background hover:opacity-90"
                style={{ color: "var(--background)" }}
              >
                確定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function PadKey({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        variant === "muted"
          ? "flex h-16 items-center justify-center bg-card text-text-secondary transition-colors hover:bg-background active:bg-background"
          : "flex h-16 items-center justify-center bg-surface font-mono text-2xl font-medium tabular-nums text-foreground transition-colors hover:bg-card active:bg-card"
      }
    >
      {children}
    </button>
  );
}

function formatThousands(s: string): string {
  if (!s) return "";
  const [intPart, decPart] = s.split(".");
  const formatted = (intPart ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}
