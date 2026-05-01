"use client";

/**
 * RA 10173-compliant consent banner.
 *
 * Three buttons: Accept all, Essential only, Privacy details.
 * Stored decision lives in `localStorage` (no third-party cookies are
 * actually set yet — analytics / marketing pixels read this flag before
 * loading).
 *
 * Why a banner at all when the site is mostly first-party + transactional?
 * RA 10173 Section 3(b) defines processing broadly; consent is the
 * defensible lawful basis for any non-essential cookie/tracker
 * (analytics included). The banner closes that gap.
 */
import { useState, useSyncExternalStore } from "react";
import { useLang } from "@/lib/language";

const STORAGE_KEY = "daimasu_cookie_consent_v1";

type Choice = "all" | "essential" | null;

function read(): Choice {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "all" || v === "essential") return v;
  } catch {
    /* localStorage unavailable */
  }
  return null;
}

function write(c: Exclude<Choice, null>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, c);
    window.dispatchEvent(new CustomEvent("daimasu:consent", { detail: c }));
  } catch {
    /* ignore */
  }
}

export function CookieBanner() {
  const { t } = useLang();
  // SSR-safe hydration: server returns null, client returns the stored value.
  const stored = useSyncExternalStore(
    () => () => {},
    () => read(),
    () => null
  );
  const [dismissed, setDismissed] = useState<Choice>(null);
  const choice = dismissed ?? stored;

  if (choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-background/98 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:gap-6 lg:px-12">
        <p className="flex-1 text-[13px] leading-relaxed text-text-secondary">
          {t(
            <>
              当サイトは予約処理に必要な Cookie のほか、サービス改善のための匿名化された分析 Cookie を使用します。詳細は
              {" "}
              <a href="/privacy" className="text-gold underline underline-offset-2 hover:text-gold-light">プライバシーポリシー</a>
              {" "} をご覧ください。
            </>,
            <>
              We use cookies essential to your reservation, plus anonymous analytics to improve our service. See our
              {" "}
              <a href="/privacy" className="text-gold underline underline-offset-2 hover:text-gold-light">Privacy Policy</a>
              {" "} for details.
            </>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={() => {
              write("essential");
              setDismissed("essential");
            }}
            className="border border-gold/60 bg-transparent px-5 py-2.5 text-[13px] font-medium tracking-[0.06em] text-gold transition-colors hover:bg-gold/10"
          >
            {t("必須のみ", "Essential only")}
          </button>
          <button
            type="button"
            onClick={() => {
              write("all");
              setDismissed("all");
            }}
            className="btn-gold-ornate px-5 py-2.5 font-[family-name:var(--font-noto-serif)] text-[13px] font-medium tracking-[0.08em]"
          >
            {t("すべて許可", "Accept all")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only helper for code that needs to check before firing analytics. */
export function hasMarketingConsent(): boolean {
  return read() === "all";
}
