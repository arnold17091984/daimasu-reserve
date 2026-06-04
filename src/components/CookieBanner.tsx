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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const visible = choice === null;

  const ref = useRef<HTMLDivElement>(null);
  // Publish the banner height as a CSS var so the sticky mobile CTA can sit
  // directly above it; reset to 0 once consent is given.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty("--cookie-banner-h", "0px");
      return;
    }
    const el = ref.current;
    if (!el) return;
    const set = () =>
      root.style.setProperty("--cookie-banner-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--cookie-banner-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-background/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 lg:px-12">
        <p className="flex-1 text-[12px] leading-relaxed text-text-muted">
          {t(
            <>
              当サイトは予約処理に必要な Cookie のほか、サービス改善のための匿名化された分析 Cookie を使用します。詳細は
              {" "}
              <a href="/privacy" className="text-text-secondary underline underline-offset-2 hover:text-gold">プライバシーポリシー</a>
              {" "} をご覧ください。
            </>,
            <>
              We use cookies essential to your reservation, plus anonymous analytics to improve our service. See our
              {" "}
              <a href="/privacy" className="text-text-secondary underline underline-offset-2 hover:text-gold">Privacy Policy</a>
              {" "} for details.
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              write("essential");
              setDismissed("essential");
            }}
            className="px-2 py-1.5 text-[12px] text-text-muted underline underline-offset-2 transition-colors hover:text-text-secondary"
          >
            {t("必須のみ", "Essential only")}
          </button>
          <button
            type="button"
            onClick={() => {
              write("all");
              setDismissed("all");
            }}
            className="border border-gold/50 px-4 py-1.5 text-[12px] font-medium tracking-[0.04em] text-gold transition-colors hover:bg-gold/10"
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
