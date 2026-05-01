"use client";

import { Printer } from "lucide-react";
import type { AdminLang } from "@/lib/auth/admin-lang";

export function PrintButton({ lang }: { lang: AdminLang }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 border border-gold/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-gold hover:bg-gold/10"
    >
      <Printer size={13} />
      {lang === "ja" ? "印刷" : "Print"}
    </button>
  );
}
