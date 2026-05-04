"use client";

/**
 * Inline text/textarea input. Originally rendered as a card that opened
 * a centered tap-to-edit modal for iPad bar operations; replaced with a
 * standard inline input because the admin runs on desktop now and the
 * extra tap was friction. Component name kept for backward compatibility
 * with existing callers (celebration-panel etc.).
 */
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
  hint?: string;
  disabled?: boolean;
}

const cls =
  "border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-gold/60 focus:outline-none disabled:opacity-50";

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
  required,
  multiline = false,
  rows = 4,
  hint,
  disabled,
}: Props) {
  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    placeholder,
    maxLength,
    required,
    disabled,
    "aria-label": label,
  } as const;

  return (
    <div className="flex flex-col gap-1">
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          className={`${cls} resize-y`}
        />
      ) : (
        <input
          {...common}
          type={type}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          className={cls}
        />
      )}
      {hint && (
        <span className="admin-meta normal-case tracking-normal">{hint}</span>
      )}
    </div>
  );
}
