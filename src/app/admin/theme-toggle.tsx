"use client";

import { useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import type { AdminTheme } from "@/lib/auth/admin-theme";

export function ThemeToggle({ current }: { current: AdminTheme }) {
  const router = useRouter();
  function flip() {
    const next: AdminTheme = current === "light" ? "dark" : "light";
    document.cookie = `daimasu_admin_theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // Perf 2026-05-04: router.refresh() instead of window.location.reload —
    // re-runs the server render with the new cookie without dropping the
    // SPA runtime. ~700ms faster perceived response on tablet.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={flip}
      className="flex items-center gap-2 text-text-secondary transition-colors hover:text-foreground"
      aria-label={current === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {current === "light" ? <Moon size={14} /> : <Sun size={14} />}
      <span className="font-mono text-[12px] font-medium tracking-[0.16em]">
        {current === "light" ? "DARK" : "LIGHT"}
      </span>
    </button>
  );
}
