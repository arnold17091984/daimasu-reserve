"use client";

import { Languages } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

export function LangToggle({ current }: { current: AdminLang }) {
  function flip() {
    const next: AdminLang = current === "ja" ? "en" : "ja";
    // 1 year, scoped to /admin so the public site keeps its own toggle.
    document.cookie = `daimasu_admin_lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={flip}
      className="flex items-center gap-2 text-text-secondary transition-colors hover:text-foreground"
      aria-label={current === "ja" ? "Switch to English" : "日本語に切替"}
    >
      <Languages size={14} />
      <span className="font-mono text-[12px] font-medium tracking-[0.16em]">
        {current === "ja" ? "EN" : "JA"}
      </span>
    </button>
  );
}
