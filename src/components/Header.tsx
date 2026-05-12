"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { useLang } from "@/lib/language";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useLang();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleMobileKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setMobileOpen(false);
      toggleRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      const focusable = mobileMenuRef.current?.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    document.addEventListener("keydown", handleMobileKeyDown);
    return () => document.removeEventListener("keydown", handleMobileKeyDown);
  }, [mobileOpen, handleMobileKeyDown]);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Header height + logo size both shrink on scroll. The transition is
            driven by the `scrolled` state (true when scrollY > 50). */}
        <div
          className={`relative flex items-center transition-[height] duration-300 ease-out ${
            scrolled ? "h-16 sm:h-20" : "h-32 sm:h-36"
          }`}
        >
          {/* Left: nav (desktop) */}
          <nav className="hidden items-center gap-8 md:flex lg:gap-10">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm tracking-wider text-text-secondary transition-colors duration-300 hover:text-foreground"
              >
                {lang === "ja" ? item.label : item.labelEn}
              </a>
            ))}
          </nav>

          {/* Center: logo — full size on hero, shrinks ~40% once user scrolls. */}
          <a
            href="#top"
            className="absolute left-1/2 top-1/2 z-[60] block -translate-x-1/2 -translate-y-1/2"
            aria-label="DAIMASU — Back to top"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, brand mark */}
            <img
              src="/logo.png"
              alt="DAIMASU Japanese Bar"
              width={408}
              height={200}
              loading="eager"
              decoding="sync"
              className={`w-auto drop-shadow-[0_4px_14px_rgba(0,0,0,0.7)] transition-[height] duration-300 ease-out ${
                scrolled
                  ? "h-12 sm:h-14 lg:h-16"
                  : "h-24 sm:h-28 lg:h-32"
              }`}
            />
          </a>

          {/* Right: lang + CTA (desktop) */}
          <div className="ml-auto hidden items-center gap-6 md:flex">
            <button
              onClick={() => setLang(lang === "ja" ? "en" : "ja")}
              className="text-xs tracking-wider text-text-muted transition-colors hover:text-foreground"
              aria-label={lang === "ja" ? "Switch to English (EN)" : "日本語に切替 (JA)"}
            >
              {lang === "ja" ? "EN" : "JA"}
            </button>

            <a
              href="#reservation"
              className="btn-gold-ornate inline-flex items-center px-6 py-2.5 font-[family-name:var(--font-noto-serif)] text-xs font-medium tracking-[0.14em]"
            >
              {t("ご予約", "Book a Table")}
            </a>
          </div>

          {/* Mobile: lang toggle (always visible) + hamburger.
              UX 2026-05-13: the lang toggle was previously hidden inside
              the hamburger menu, so a JA-language iPhone user couldn't
              discover how to switch to English. Surface it next to the
              hamburger so it's always one tap away. */}
          <div className="relative z-[60] ml-auto flex items-center gap-1 md:hidden">
            <button
              onClick={() => setLang(lang === "ja" ? "en" : "ja")}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-border/60 px-2 text-[12px] font-medium tracking-[0.10em] text-foreground hover:border-gold/50 hover:text-gold"
              aria-label={lang === "ja" ? "Switch to English" : "日本語に切替"}
            >
              {lang === "ja" ? "EN" : "日本語"}
            </button>
            <button
              ref={toggleRef}
              onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center -m-2 p-2 text-foreground"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 flex flex-col bg-background/98 backdrop-blur-lg md:hidden"
          >
            {/* Header spacer — keeps logo + X legible against overlay */}
            <div className="h-32 shrink-0 sm:h-36" />

            {/* Top ornate divider */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex shrink-0 justify-center py-5"
            >
              <span aria-hidden="true" className="ornate-divider" />
            </motion.div>

            {/* Eyebrow */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="shrink-0 text-center font-[family-name:var(--font-cinzel)] text-[11px] font-medium tracking-[0.32em] text-gold-soft"
            >
              MASTER OWLY&apos;S TABLE
            </motion.p>

            {/* Nav items — fill vertical space, centered */}
            <nav className="flex flex-1 flex-col items-center justify-center gap-2 px-8">
              {NAV_ITEMS.map((item, i) => (
                <div key={item.href} className="flex flex-col items-center">
                  <motion.a
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.06 }}
                    className="block py-[14px] font-[family-name:var(--font-noto-serif)] text-[22px] font-normal tracking-[0.28em] text-foreground/92 transition-colors hover:text-gold"
                  >
                    {lang === "ja" ? item.label : item.labelEn}
                  </motion.a>
                  {i < NAV_ITEMS.length - 1 && (
                    <motion.span
                      aria-hidden="true"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.06 }}
                      className="inline-block h-[5px] w-[5px] rotate-45 bg-gold/35"
                    />
                  )}
                </div>
              ))}
            </nav>

            {/* Footer — divider + CTA + language + hours */}
            <div className="shrink-0 px-7 pb-9 pt-2">
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.6, delay: 0.55 }}
                className="mb-7 flex justify-center"
              >
                <span aria-hidden="true" className="ornate-divider" />
              </motion.div>

              <motion.a
                href="#reservation"
                onClick={() => setMobileOpen(false)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="btn-gold-ornate mb-6 flex h-[56px] w-full items-center justify-center font-[family-name:var(--font-noto-serif)] text-[15px] font-medium tracking-[0.18em]"
              >
                {t("ご予約", "Book a Table")}
              </motion.a>

              <motion.button
                onClick={() => setLang(lang === "ja" ? "en" : "ja")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                aria-label={lang === "ja" ? "Switch to English" : "日本語に切替"}
                className="mx-auto mb-4 block font-[family-name:var(--font-cinzel)] text-[11px] font-medium tracking-[0.32em] text-gold-soft transition-colors hover:text-gold"
              >
                {lang === "ja" ? "ENGLISH" : "日本語"}
              </motion.button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.75 }}
                className="text-center font-[family-name:var(--font-noto-serif)] text-[11px] tracking-[0.2em] text-gold-soft"
              >
                {t("火〜日 · 17:30 / 20:00", "TUE–SUN · 17:30 / 20:00")}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
