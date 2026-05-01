"use client";

/**
 * Text input shown as a card; opens a centered modal with a large
 * autofocus input on tap. Mirrors NumPadInput for textual data.
 *
 * Why: on iPad the native keyboard pops at the bottom and covers
 * neighbouring form fields. By isolating one field per modal, the input
 * is always visible above the keyboard, with focus + size scaled up so
 * the operator can easily verify what they typed (especially Japanese
 * IME conversions).
 *
 * Native iOS keyboard (with full Japanese IME) appears under the modal
 * as soon as the input is focused; we don't replicate the keyboard,
 * just provide a clean canvas.
 */
import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Pencil, X as XIcon, Check } from "lucide-react";

type InputMode = "text" | "email" | "tel" | "url" | "search" | "numeric";

interface Props {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "search";
  inputMode?: InputMode;
  autoCapitalize?: "off" | "none" | "sentences" | "words" | "characters";
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  /** Hint shown beneath the modal input. */
  hint?: string;
  /** Disable interaction. */
  disabled?: boolean;
}

export function TextFieldButton({
  value,
  onChange,
  label,
  placeholder,
  type = "text",
  inputMode,
  autoCapitalize,
  autoComplete,
  maxLength,
  multiline = false,
  rows = 4,
  hint,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  function openModal() {
    setDraft(value);
    setOpen(true);
  }

  // Autofocus on open so iOS pops the native keyboard immediately.
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      // Move caret to end so adding characters is the natural action.
      const len = inputRef.current.value.length;
      try {
        inputRef.current.setSelectionRange(len, len);
      } catch {
        // some inputs don't support selection range
      }
    }
  }, [open]);

  function confirm() {
    onChange(draft);
    setOpen(false);
  }
  function cancel() {
    setDraft(value);
    setOpen(false);
  }
  // Outside-click + ESC commit the draft (iPad operators tap away to "finish"
  // a field, mirroring native form behaviour). Explicit cancel via the X / キャンセル
  // button still discards the draft.
  function dismiss() {
    onChange(draft);
    setOpen(false);
  }

  // Esc to cancel; Enter to confirm (single-line only — multiline uses
  // Cmd/Ctrl+Enter to confirm so plain Enter inserts a newline).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (
        e.key === "Enter" &&
        (!multiline || e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, multiline]);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && openModal()}
        disabled={disabled}
        className={
          multiline
            ? "group flex w-full items-start justify-between gap-3 border border-border bg-surface px-3 py-2.5 text-left text-sm text-foreground hover:border-gold/50 focus:border-gold focus:outline-none disabled:opacity-50"
            : "group flex h-12 w-full items-center justify-between gap-2 border border-border bg-surface px-3 text-sm text-foreground hover:border-gold/50 focus:border-gold focus:outline-none disabled:opacity-50"
        }
      >
        <span
          className={
            value
              ? multiline
                ? "min-w-0 flex-1 whitespace-pre-line break-words"
                : "min-w-0 flex-1 truncate"
              : "min-w-0 flex-1 truncate text-text-muted"
          }
        >
          {value || placeholder || label}
        </span>
        <Pencil
          size={14}
          className="shrink-0 text-text-muted group-hover:text-gold"
          aria-hidden="true"
        />
      </button>

      {mounted && open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => {
              if (e.target === e.currentTarget) dismiss();
            }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[8vh] backdrop-blur-sm"
          >
            <div className="w-full max-w-2xl border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">
                  {label}
                </p>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-text-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div className="px-5 py-6">
                {multiline ? (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    maxLength={maxLength}
                    autoCapitalize={autoCapitalize}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    className="block w-full resize-y border border-border bg-card px-4 py-3 text-lg leading-relaxed text-foreground placeholder:text-text-muted focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
                  />
                ) : (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={type}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    autoCapitalize={autoCapitalize}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    className="block w-full border-b-2 border-border bg-transparent px-1 py-3 text-3xl font-medium text-foreground placeholder:text-text-muted focus:border-gold focus:outline-none"
                  />
                )}
                {(hint || maxLength) && (
                  <div className="mt-3 flex items-center justify-between admin-meta normal-case tracking-normal">
                    <span>{hint ?? ""}</span>
                    {maxLength && (
                      <span className="font-mono">
                        {draft.length}/{maxLength}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
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
                  className="inline-flex items-center justify-center gap-2 bg-gold px-4 py-3 text-[14px] font-semibold hover:opacity-90"
                  style={{ color: "var(--background)" }}
                >
                  <Check size={16} aria-hidden="true" />
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
