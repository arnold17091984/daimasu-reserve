"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MENU_COURSES } from "@/lib/constants";
import { useLang } from "@/lib/language";

// Per-course mood label. Emoji icons + per-mood hues were removed
// (brand-invariant: gold is the only accent color; no emoji decoration).
// All mood labels now share `text-gold-soft`, preserving the JP/EN naming
// as the only source of mood differentiation.
const TIME_OF_DAY: { ja: string; en: string }[] = [
  { ja: "桜色", en: "Cherry" },
  { ja: "燈明", en: "Candle" },
  { ja: "深藍", en: "Indigo" },
  { ja: "焔", en: "Flame" },
  { ja: "雪銀", en: "Silver" },
  { ja: "霞", en: "Mist" },
  { ja: "檜光", en: "Hinoki" },
  { ja: "宵闇", en: "Twilight" },
];

export default function MenuSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { t } = useLang();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const card = el.querySelector<HTMLElement>("li");
      if (!card) return;
      const step = card.offsetWidth + 16; // gap-4 = 16px
      const idx = Math.round(el.scrollLeft / step);
      setActiveIdx(Math.max(0, Math.min(MENU_COURSES.length - 1, idx)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="menu" className="relative pt-20 pb-10 lg:pt-28 lg:pb-16" ref={ref}>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-surface/30 to-background" />

      <div className="relative mx-auto max-w-4xl px-6 lg:px-12 xl:max-w-6xl 2xl:max-w-[1400px]">
        {/* Header */}
        <div className="mb-12 text-center md:mb-16">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.96 }}
            className="mb-4 text-xs tracking-[0.3em] text-gold"
          >
            {t("お品書き", "THE COURSES")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.96, delay: 0.12 }}
            className="font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl"
          >
            {t(
              <>八つの<span className="text-gold-gradient">情景</span>、八つの皿</>,
              <>Eight scenes, <span className="text-gold-gradient">eight servings</span></>
            )}
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 1.2, delay: 0.36 }}
            className="gold-line mx-auto mt-6 w-16"
          />
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.96, delay: 0.48 }}
            className="mx-auto mt-8 max-w-lg text-sm leading-relaxed text-text-secondary"
          >
            {t(
              "桜の庭から甘味の宵まで — 一皿ごとに展開する物語と、その場面に寄り添う懐石の一品をお楽しみください",
              "From the opening cherry garden to the final sweet lantern-light — each course paired with its scene, each scene with its dish."
            )}
          </motion.p>
        </div>

        {/* Course dot navigator — sticky on scroll within Menu section (desktop) */}
        <motion.nav
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          aria-label={t("コース早送り", "Jump to course")}
          className="sticky top-20 z-30 mb-10 -mx-2 hidden justify-center lg:flex"
        >
          <ul className="flex items-center gap-2 border border-[rgba(212,175,55,0.35)] bg-black/50 px-4 py-2 backdrop-blur-md">
            {MENU_COURSES.map((c, i) => {
              const num = String(i + 1).padStart(2, "0");
              return (
                <li key={c.name.ja}>
                  <a
                    href={`#course-${num}`}
                    aria-label={`Course ${num} — ${t(c.name.ja, c.name.en)}`}
                    className="group inline-flex h-6 w-6 items-center justify-center"
                  >
                    <span className="block h-1.5 w-1.5 rotate-45 bg-gold/35 transition-all duration-300 group-hover:h-2 group-hover:w-2 group-hover:bg-gold group-focus-visible:h-2 group-focus-visible:w-2 group-focus-visible:bg-gold" />
                  </a>
                </li>
              );
            })}
          </ul>
        </motion.nav>

        {/* Mobile/tablet horizontal carousel */}
        <div className="lg:hidden">
          <div
            ref={carouselRef}
            className="-mx-6 overflow-x-auto snap-x snap-mandatory scroll-smooth"
          >
            <ul className="flex gap-4 px-6 pb-4">
              {MENU_COURSES.map((course, i) => {
                const sceneNum = String(i + 1).padStart(2, "0");
                const time = TIME_OF_DAY[i];
                return (
                  <li
                    key={course.name.ja}
                    className="min-w-[88%] max-w-[88%] shrink-0 snap-center sm:min-w-[60%] sm:max-w-[60%]"
                  >
                    <article className="flex h-full min-w-0 flex-col overflow-hidden border border-border bg-surface/60 p-5 transition-colors duration-500 hover:border-gold/40 sm:p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <span className="font-serif text-lg tracking-widest text-gold">
                          Course {sceneNum}
                        </span>
                        <span aria-hidden="true" className="text-xs text-gold/50">—</span>
                        <span className="text-xs tracking-[0.15em] text-gold-soft">
                          {t(time.ja, time.en)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="ml-auto inline-block h-1.5 w-1.5 rotate-45 bg-gold/60"
                        />
                      </div>
                      <div className="mb-2 flex min-w-0 items-center gap-1.5">
                        <svg
                          className="h-3 w-3 shrink-0 text-gold/60"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="min-w-0 text-xs tracking-wider break-words text-gold-soft">
                          {t(course.craft.ja, course.craft.en)}
                        </span>
                      </div>
                      <h3 className="max-w-full font-serif text-xl font-medium break-words text-foreground">
                        {t(course.name.ja, course.name.en)}
                      </h3>
                      <p className="mt-3 max-w-full text-sm leading-relaxed break-words text-text-secondary">
                        {t(course.description.ja, course.description.en)}
                      </p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* Dots indicator */}
          <div
            className="mt-5 flex justify-center gap-2"
            role="tablist"
            aria-label={t("コース位置", "Course position")}
          >
            {MENU_COURSES.map((_, i) => (
              <span
                key={i}
                aria-current={i === activeIdx ? "true" : undefined}
                className={
                  i === activeIdx
                    ? "h-[2px] w-6 bg-gold transition-all duration-300"
                    : "h-1.5 w-1.5 rotate-45 bg-gold/35 transition-all duration-300"
                }
              />
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] tracking-[0.25em] text-text-secondary">
            {t("← スワイプで次のコース →", "← swipe for next course →")}
          </p>
        </div>

        {/* Desktop vertical timeline (lg only) */}
        <div className="relative hidden lg:block xl:hidden">
          {/* Vertical timeline line */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ duration: 2.4, delay: 0.6, ease: "easeOut" }}
            className="absolute left-[23px] top-0 bottom-0 w-px origin-top bg-gradient-to-b from-gold/40 via-gold/20 to-gold/40 sm:left-[27px]"
          />

          {MENU_COURSES.map((course, i) => {
            const sceneNum = String(i + 1).padStart(2, "0");
            const time = TIME_OF_DAY[i];
            const isLast = i === MENU_COURSES.length - 1;

            return (
              <motion.div
                key={course.name.ja}
                id={`course-${sceneNum}`}
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                className="group relative scroll-mt-28 pb-8 last:pb-0"
              >
                {/* Timeline node */}
                <div className="absolute left-0 top-1 sm:left-1">
                  <div className="relative flex h-[46px] w-[46px] items-center justify-center sm:h-[54px] sm:w-[54px]">
                    {/* Outer ring */}
                    <div className="absolute inset-0 rounded-full border border-gold/20 transition-colors duration-600 group-hover:border-gold/50" />
                    {/* Inner dot */}
                    <div className="h-2 w-2 rounded-full bg-gold/40 transition-colors duration-600 group-hover:bg-gold/80" />
                  </div>
                </div>

                {/* Course content */}
                <div className="ml-16 sm:ml-20">
                  {/* Course number + mood */}
                  <div className="mb-2 flex items-center gap-3">
                    <span className="font-serif text-lg tracking-widest text-gold sm:text-xl">
                      Course {sceneNum}
                    </span>
                    <span aria-hidden="true" className="text-xs tracking-[0.2em] uppercase text-gold/60">
                      —
                    </span>
                    <span className="text-xs tracking-[0.15em] text-gold-soft">
                      {t(time.ja, time.en)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 w-1.5 rotate-45 bg-gold/60"
                    />
                  </div>

                  {/* Location */}
                  <div className="mb-2 flex items-center gap-1.5">
                    <svg
                      className="h-3 w-3 text-gold/60"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-xs tracking-wider text-gold-soft">
                      {t(course.craft.ja, course.craft.en)}
                    </span>
                  </div>

                  {/* Course name */}
                  <h3 className="font-serif text-lg font-medium text-foreground transition-colors duration-600 group-hover:text-gold-light sm:text-xl">
                    {t(course.name.ja, course.name.en)}
                  </h3>

                  {/* Description */}
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
                    {t(course.description.ja, course.description.en)}
                  </p>

                  {/* Decorative hover line */}
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-px w-0 bg-gold/0 transition-all duration-600 group-hover:w-12 group-hover:bg-gold/30" />
                    <div className="h-1 w-1 rounded-full bg-gold/0 transition-colors duration-600 group-hover:bg-gold/40" />
                  </div>

                  {/* Separator — thin gold connector between cards */}
                  {!isLast && (
                    <div className="mt-6 ml-0">
                      <div className="h-px w-16 bg-gradient-to-r from-gold/20 to-transparent" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Widescreen 2-column grid (xl+) — 8 courses split left/right */}
        <div className="hidden xl:grid xl:grid-cols-2 xl:gap-x-14 2xl:gap-x-20">
          {MENU_COURSES.map((course, i) => {
            const sceneNum = String(i + 1).padStart(2, "0");
            const time = TIME_OF_DAY[i];

            return (
              <motion.article
                key={course.name.ja}
                id={`course-xl-${sceneNum}`}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                className="group relative mb-6 flex flex-col border border-border bg-surface/50 p-6 transition-all duration-500 hover:border-gold/40 hover:bg-card lg:p-8 2xl:p-10"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-serif text-xl tracking-widest text-gold">
                    Course {sceneNum}
                  </span>
                  <span aria-hidden="true" className="text-xs text-gold/50">—</span>
                  <span className="text-xs tracking-[0.15em] text-gold-soft">
                    {t(time.ja, time.en)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-auto inline-block h-2 w-2 rotate-45 bg-gold/60"
                  />
                </div>

                <div className="mb-3 flex items-center gap-1.5">
                  <svg
                    className="h-3 w-3 text-gold/60"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-xs tracking-wider text-gold-soft">
                    {t(course.craft.ja, course.craft.en)}
                  </span>
                </div>

                <h3 className="font-serif text-xl font-medium text-foreground transition-colors duration-500 group-hover:text-gold-light 2xl:text-2xl">
                  {t(course.name.ja, course.name.en)}
                </h3>

                <p className="mt-3 text-sm leading-relaxed text-text-secondary 2xl:text-[15px]">
                  {t(course.description.ja, course.description.en)}
                </p>

                <div className="absolute bottom-0 left-0 h-px w-0 bg-gold/60 transition-all duration-700 group-hover:w-full" />
              </motion.article>
            );
          })}
        </div>

        {/* Journey summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 1.0 }}
          className="mt-10 text-center md:mt-12"
        >
          <div className="gold-line mx-auto mb-6 w-24" />
          <p className="font-serif text-sm tracking-widest text-gold">
            {t(
              "全8コース、約90分の懐石劇場",
              "8 courses, approximately 90 minutes"
            )}
          </p>
        </motion.div>

        {/* Seasonal note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="mt-6 text-center"
        >
          <p className="text-xs text-text-secondary">
            {t(
              "※ 季節やテーマにより内容が変更になる場合がございます",
              "* Courses may evolve with the season"
            )}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
