"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useLang } from "@/lib/language";

// Gold gradient applied inline to the 一夜 accent — Tailwind v4 / Turbopack
// silently drops single-use custom classes from compiled CSS under this
// project's setup, so inline styles are the safe path for gradient-text.
const goldGradientStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #fff0ad 0%, #d4af37 45%, #9d7418 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  textShadow: "none",
};

const STATS = [
  { value: "8", label: { ja: "コース", en: "Courses" } },
  { value: "90", label: { ja: "分", en: "min" } },
  { value: "8M", label: { ja: "カウンター", en: "Counter" } },
  { value: "8", label: { ja: "席", en: "Seats" } },
];

export default function About() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { t } = useLang();

  return (
    <section
      id="about"
      ref={ref}
      className="relative overflow-hidden py-[60px] lg:py-[80px]"
      style={{ background: "#0B0B0B" }}
    >
      {/* Background: the Owly-at-counter image fills the section.
          The image has ~55% dark empty space on the left so text can overlay. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(/images/about/owly-sushi.png)",
          backgroundSize: "cover",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Left-side dark gradient — anchors the text column on PC.
          Mobile reads it as a broader darkening. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(11,11,11,0.96) 0%, rgba(11,11,11,0.88) 35%, rgba(11,11,11,0.55) 55%, rgba(11,11,11,0.15) 72%, rgba(11,11,11,0.05) 100%)",
        }}
      />

      {/* Top / bottom vertical fade — blends the About image into the dark
          hero above and the dark Experience section below with no hard edge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(11,11,11,1) 0%, rgba(11,11,11,0.6) 6%, rgba(11,11,11,0) 18%, rgba(11,11,11,0) 82%, rgba(11,11,11,0.6) 94%, rgba(11,11,11,1) 100%)",
        }}
      />

      {/* Mobile-only extra vignette — owl face still visible, text area readable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 lg:hidden"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 35% 40%, rgba(11,11,11,0.55) 0%, rgba(11,11,11,0.92) 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        {/* Text column — sits on the left half on PC, full width (left-aligned) on mobile. */}
        <div className="max-w-[560px] lg:max-w-[520px]">
          {/* ① Sub-title — Noto Sans JP Medium, #D4AF37, 0.16em, line-height 1.6 */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7 }}
            className="mb-3 font-[family-name:var(--font-noto-serif)] text-[13px] font-medium leading-[1.6] tracking-[0.16em] text-gold text-shadow-hero sm:text-[14px]"
          >
            {t("マスター・アウリの食卓", "MASTER OWLY'S TABLE")}
          </motion.p>

          {/* ② Main heading — Noto Serif JP Bold, clamp(36,6.2vw,44), 一夜 gold gradient */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-[family-name:var(--font-noto-serif)] font-bold leading-[1.25] tracking-[0.04em] text-foreground text-shadow-hero [font-size:clamp(36px,6.2vw,44px)]"
          >
            {t(
              <>
                八皿に綴られる<br />
                <span style={goldGradientStyle}>一夜</span>の物語
              </>,
              <>
                An evening written<br />
                in <span style={goldGradientStyle}>eight courses</span>
              </>
            )}
          </motion.h2>

          {/* ⑤ Ornate line under heading — 1px rgba(212,175,55,0.25), 24px lower margin */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={inView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 1, delay: 0.25, ease: "easeOut" }}
            aria-hidden="true"
            className="mt-6 mb-6 flex origin-left items-center gap-3"
          >
            <span className="inline-block h-[7px] w-[7px] rotate-45 bg-gold shadow-[0_0_10px_rgba(212,175,55,0.55)]" />
            <span className="h-px w-28 bg-gradient-to-r from-[rgba(212,175,55,0.7)] via-[rgba(212,175,55,0.3)] to-transparent" />
          </motion.div>

          {/* ③ Body paragraph 1 — Noto Sans JP Regular 14–16px, #CBB98A, lh 1.9, 左寄せ */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mb-7 max-w-[720px] font-[family-name:var(--font-noto-serif)] text-[14px] font-normal leading-[1.9] text-gold-soft text-shadow-hero sm:text-[15px] lg:text-[16px]"
          >
            {t(
              "8メートルの檜カウンターに、八つの場面が次々と浮かび上がる九十分の懐石劇場。先付の桜から甘味の宵まで、一皿ごとにマスター・アウリの物語が展開し、その余韻とともに料理をお楽しみいただきます。",
              "A ninety-minute kaiseki theatre where eight scenes unfold across an eight-meter hinoki counter. From the cherry garden of the first course to the lantern-warmth of the last, Master Owly's tales lead each dish to the table."
            )}
          </motion.p>

          {/* ③ Body paragraph 2 */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mb-10 max-w-[720px] font-[family-name:var(--font-noto-serif)] text-[14px] font-normal leading-[1.9] text-gold-soft text-shadow-hero sm:text-[15px] lg:text-[16px]"
          >
            {t(
              "黄金の単眼鏡を掛けた一羽の梟が、桜の庭、寺院の勝手口、深き蒼の海底、夜の焚き火、冬の銀景色を巡ります。見事な登場、可笑しな失敗、魔法のような解決 — 物語が収まるその瞬間、完璧な一皿が目の前に届きます。",
              "A monocled owl with a golden feather pen moves through cherry gardens, temple kitchens, indigo depths, campfires, and silver-snow landscapes. Grand entrance, gentle mishap, magical recovery — and as each tale resolves, the perfect dish lands before you."
            )}
          </motion.p>

          {/* ④ Stats — horizontal 4-col on sm+, 2×2 on mobile, vertical gold dividers between items. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.55 }}
            className="grid grid-cols-2 gap-y-6 pt-[calc(40px-1.25rem)] sm:grid-cols-4 sm:gap-y-0"
          >
            {STATS.map((stat, i) => (
              <div
                key={stat.label.ja}
                className={[
                  "flex flex-col items-center px-2 text-center sm:px-4",
                  // Mobile 2-col: right item of each row gets left border
                  i % 2 === 1
                    ? "border-l border-[rgba(212,175,55,0.25)]"
                    : "",
                  // Desktop 4-col: every item except first gets left border
                  i > 0
                    ? "sm:border-l sm:border-[rgba(212,175,55,0.25)]"
                    : "sm:border-l-0",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <p className="font-[family-name:var(--font-cinzel)] font-medium tracking-[0.04em] text-gold [font-size:clamp(30px,5vw,38px)] [text-shadow:0_0_16px_rgba(212,175,55,0.2)]">
                  {stat.value}
                </p>
                <p className="mt-2 font-[family-name:var(--font-noto-serif)] text-[12px] font-medium tracking-[0.16em] text-gold-soft sm:text-[13px]">
                  {t(stat.label.ja, stat.label.en)}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
