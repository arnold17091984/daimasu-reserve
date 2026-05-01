"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { CURRENT_CHAPTER, COURSE_PRICE, CONTACT } from "@/lib/constants";
import { useLang } from "@/lib/language";

// Gold shimmer applied inline to bypass Tailwind v4 / Turbopack class-purging quirks.
// Base gradient has a bright highlight band that sweeps across the text via
// framer-motion's backgroundPosition animation (below on the <motion.span>).
const goldShimmerStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, #9d7418 0%, #d4af37 28%, #fff0ad 50%, #d4af37 72%, #9d7418 100%)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  textShadow: "none",
  display: "inline-block",
};

export default function Hero() {
  const { t, lang } = useLang();

  return (
    // Min-h-screen + content pushed below the (now taller) fixed header so the
    // chapter badge no longer overlaps the centered logo. pt scales with the
    // header heights set in Header.tsx (h-32 / sm:h-36).
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-32 sm:pt-36">
      <div className="absolute inset-0" style={{ contain: "paint" }} aria-hidden="true">
        <video
          className="hero-bg-video absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/videos/hero-poster.jpg"
        >
          <source src="/videos/hero-highlight-720.mp4" media="(max-width: 768px)" type="video/mp4" />
          <source src="/videos/hero-highlight-1080.mp4" type="video/mp4" />
        </video>
        {/* Darken video so body/price text retains contrast against bright scenes (flame, surf). */}
        <div className="absolute inset-0 bg-black/60" />
        {/* Top-fade gradient — sits above the global darken so the white logo
            and nav have a deep-black backdrop without flattening the rest of
            the video. Heights tuned to cover the h-32 / sm:h-36 header. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/85 via-black/50 to-transparent sm:h-56" />
        {/* Radial dim around the centered text column — boosts the thin gold price line
            without flattening the video's edges. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
        {/* Edge-fade gradient keeps chrome-on-black aesthetic and blends into next section. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background" />
        <motion.div
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/4 blur-[120px]"
          style={{ willChange: "opacity", transform: "translate3d(-50%, -50%, 0)" }}
        />
        {/* Widescreen ambient: faint gold vertical lines (byobu-inspired), xl+ only */}
        <motion.div
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute left-[10%] top-1/2 hidden h-[400px] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-gold/70 to-transparent xl:block"
          style={{ willChange: "opacity" }}
        />
        <motion.div
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute right-[10%] top-1/2 hidden h-[400px] w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-gold/70 to-transparent xl:block"
          style={{ willChange: "opacity" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 text-center">
        {/* Chapter badge — sharp corners, 1px gold border, translucent fill + backdrop blur */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 0.3 }}
          className="text-shadow-hero inline-flex min-w-[214px] items-center justify-center border border-[rgba(212,175,55,0.72)] bg-black/25 px-4 py-2.5 font-[family-name:var(--font-noto-serif)] text-[13px] font-medium tracking-[0.14em] text-gold backdrop-blur-[4px] shadow-[inset_0_0_18px_rgba(212,175,55,0.08)] sm:min-w-[250px] sm:px-5 sm:py-3 sm:text-[14px]"
        >
          <span>{CURRENT_CHAPTER.number}</span>
          <span className="mx-3 text-[#F2D47A]/60 sm:mx-[14px]">|</span>
          <span>{t(CURRENT_CHAPTER.name.ja, CURRENT_CHAPTER.name.en)}</span>
        </motion.div>

        {/* Hero ornament — 180px gold line with 2 inner diamond markers */}
        <motion.span
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 0.85, scaleX: 1 }}
          transition={{ duration: 1.4, delay: 0.45 }}
          className="ornate-divider my-7"
          aria-hidden="true"
        />

        {/* Kicker — Noto Sans JP 13px SP / 15px PC, white */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="mb-[22px] font-[family-name:var(--font-noto-serif)] text-[13px] font-medium tracking-[0.14em] text-foreground text-shadow-hero sm:text-[15px]"
        >
          {t("プロジェクションマッピング・ダイニング", "PROJECTION MAPPING DINING")}
        </motion.p>

        {/* H1 — Noto Serif JP Bold, clamp(42px, 11vw, 72px), 0.04em, 1.15 leading.
            CSS animation (not framer-motion) so Lighthouse detects it as an LCP candidate. */}
        {/* The English variant ("An evening at Master Owly's table" — 35 chars)
            overflows max-w-5xl at the previous 72px cap. Reduce the upper
            bound so even the longest variant fits the container on one line.
            JA ("マスターの食卓へ" — 8 chars) still scales up to 72px. */}
        <h1
          className="hero-h1 mb-[22px] whitespace-nowrap font-[family-name:var(--font-noto-serif)] font-bold leading-[1.15] tracking-[0.02em] text-foreground [font-size:clamp(28px,6.5vw,56px)] [text-shadow:0_0_40px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.85),0_4px_8px_rgba(0,0,0,0.75),0_0_22px_rgba(255,255,255,0.12)] data-[lang=ja]:[font-size:clamp(34px,8.5vw,72px)]"
          data-lang={lang}
        >
          {t(
            <>
              マスターの
              <motion.span
                style={goldShimmerStyle}
                animate={{ backgroundPosition: ["0% center", "200% center"] }}
                transition={{ duration: 3.2, ease: "linear", repeat: Infinity }}
              >
                食卓
              </motion.span>
              へ
            </>,
            <>
              An evening at{" "}
              <motion.span
                style={goldShimmerStyle}
                animate={{ backgroundPosition: ["0% center", "200% center"] }}
                transition={{ duration: 3.2, ease: "linear", repeat: Infinity }}
              >
                Master Owly&apos;s
              </motion.span>{" "}
              table
            </>
          )}
        </h1>

        {/* Lead — Noto Serif JP clamp(16px, 4.2vw, 23px) white 0.08em 1.8 leading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.5 }}
          className="mb-6 whitespace-nowrap font-[family-name:var(--font-noto-serif)] font-normal leading-[1.8] tracking-[0.06em] text-foreground text-shadow-hero [font-size:clamp(12px,3.6vw,22px)]"
        >
          {t("マスター・アウリと綴る、九十分の懐石劇場", "Ninety minutes. Eight courses. One owl with a golden feather pen.")}
        </motion.p>

        {/* Price — Cinzel-NotoSerifJP stack, clamp(17px, 4vw, 23px), gold with glow */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-shadow-hero-gold mb-8 font-[family-name:var(--font-cinzel),var(--font-noto-serif),serif] font-medium tracking-[0.06em] text-gold [font-size:clamp(17px,4vw,23px)]"
        >
          {COURSE_PRICE.amount}
          <span className="ml-1 text-[0.78em] tracking-[0.12em]">PHP</span>
          <span className="mx-3 text-gold/60">|</span>
          {t("全8コース・約90分", "8 courses · 90 minutes")}
        </motion.p>

        {/* CTA stack — max-w 560px, 64px tall (58px mobile), sharp corners, chevron right */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mx-auto mb-[34px] flex w-full max-w-[560px] flex-col items-stretch gap-4"
        >
          <a
            href="#reservation"
            className="btn-gold-ornate relative flex h-[58px] items-center justify-between overflow-hidden px-7 font-[family-name:var(--font-noto-serif)] text-[15px] font-bold tracking-[0.08em] sm:h-16 sm:text-[17px]"
          >
            {/* Diagonal glint sweep — periodic shine across the button face */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-[42%]"
              style={{
                background:
                  "linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%)",
              }}
              initial={{ x: "-160%" }}
              animate={{ x: "360%" }}
              transition={{
                duration: 2.4,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 2.6,
              }}
            />
            <span aria-hidden="true" className="relative w-4" />
            <span className="relative flex-1 text-center">{t("ご予約はこちら", "Reserve your seat")}</span>
            <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" className="relative" />
          </a>
          <a
            href={CONTACT.whatsapp.reservationHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("WhatsAppで問い合わせる", "Inquire via WhatsApp")}
            className="btn-ornate-ghost flex h-[58px] items-center justify-between gap-3 px-6 font-[family-name:var(--font-noto-serif)] text-[15px] font-medium tracking-[0.06em] sm:h-16 sm:text-[17px]"
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span className="flex-1 text-center">{t("WhatsAppでお問い合わせ", "Inquire via WhatsApp")}</span>
            <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
          </a>
        </motion.div>

        {/* Scroll hint — 14px white/85% with gold underline */}
        <motion.a
          href="#experience"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mb-[42px] inline-block border-b border-[rgba(212,175,55,0.8)] pb-2 font-[family-name:var(--font-noto-serif)] text-[14px] font-normal tracking-[0.06em] text-foreground/85 transition-colors duration-300 hover:text-foreground"
        >
          {t("体験の流れを見る ↓", "see how the evening unfolds ↓")}
        </motion.a>

        {/* Limited-seat frame — top/bottom gold borders + centered diamond markers */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85 }}
          className="limited-frame mx-auto font-[family-name:var(--font-noto-serif)] text-[15px] font-medium tracking-[0.14em] text-foreground text-shadow-hero sm:text-[17px]"
        >
          {t("カウンター8席限定", "Limited to 8 counter seats")}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="hero-float-down absolute bottom-10 left-1/2 -translate-x-1/2"
        aria-hidden="true"
      >
        <ChevronDown size={22} strokeWidth={1.5} className="text-gold" />
      </motion.div>
    </section>
  );
}
