"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

export function CustomerSearch({
  initial,
  placeholder,
}: {
  initial: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function submit(next: string) {
    const sp = new URLSearchParams();
    if (next) sp.set("q", next);
    startTransition(() => {
      router.push(`/admin/customers${sp.toString() ? `?${sp.toString()}` : ""}`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value.trim());
      }}
      className="flex w-full items-center gap-2 border border-border bg-background px-3 py-2 focus-within:border-gold/60 sm:max-w-md"
    >
      <Search size={15} className="text-text-secondary" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-text-muted focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="text-text-muted hover:text-foreground"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
      <span className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
        {pending ? "..." : "↵"}
      </span>
    </form>
  );
}
