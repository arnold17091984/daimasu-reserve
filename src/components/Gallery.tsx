"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { GALLERY_IMAGES } from "@/lib/constants";
import { useLang } from "@/lib/language";

function buildSrcSet(src: string): string {
  const base = src.replace(/\.jpg$/, "");
  return `${base}-640.jpg 640w, ${base}-1280.jpg 1280w, ${src} 1920w`;
}

export default function Gallery() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [selected, setSelected] = useState<number | null>(null);
  const { t } = useLang();
  const modalRef = useRef<HTMLDivElement>(null);

  // 17:6 source — keep wide aspects to show Master Owly at readable size on all viewports
  const aspects = ["aspect-[17/8]", "aspect-[17/9]", "aspect-[17/9]", "aspect-[17/8]", "aspect-[17/9]", "aspect-[17/9]"];

  const close = useCallback(() => setSelected(null), []);

  useEffect(() => {
    if (selected === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
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
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 100);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      clearTimeout(timer);
    };
  }, [selected, close]);

  return (
    <section id="journey" className="relative py-20 lg:py-28" ref={ref}>
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="mb-10 text-center md:mb-12">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="mb-4 text-xs tracking-[0.3em] text-gold"
          >
            {t("物語", "STORY")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl"
          >
            {t(
              <>一皿ごとに<span className="text-gold-gradient">綴られる</span>八つの情景</>,
              <>Eight scenes, <span className="text-gold-gradient">one evening</span></>
            )}
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 1, delay: 0.3 }}
            className="gold-line mx-auto mt-6 w-16"
          />
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mt-6 max-w-2xl text-xs leading-relaxed tracking-[0.15em] text-text-secondary"
          >
            {t(
              "桜の庭 → 勝手口 → 深き蒼 → 夜の焚き火 → 冬の銀 → 蒸籠の霧 → 寿司カウンター → 甘味の宵",
              "Cherry Garden → Temple Kitchen → Indigo Depths → Night Fire → Winter Silver → Mist of the Steamer → Sushi Counter → Sweet Evening"
            )}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {GALLERY_IMAGES.map((item, i) => (
            <motion.button
              key={item.src}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.1 }}
              onClick={() => setSelected(i)}
              aria-label={t(item.alt.ja, item.alt.en)}
              className="group relative overflow-hidden border border-border bg-surface transition-all duration-500 hover:border-gold/50"
            >
              <div className={`${aspects[i]} relative`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static export + manual srcset (next/image with unoptimized doesn't emit srcset) */}
                <img
                  src={item.src.replace(/\.jpg$/, "-1280.jpg")}
                  srcSet={buildSrcSet(item.src)}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  alt={t(item.alt.ja, item.alt.en)}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
                {/* Gradient is always visible as caption backdrop (touch-friendly) */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent transition-opacity duration-500" />
                {/* Caption: visible by default on touch devices, fades out on hover-capable devices, returns on hover */}
                <div className="absolute bottom-0 left-0 right-0 p-4 opacity-90 transition-opacity duration-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                  <p className="text-xs tracking-wider text-foreground/95">
                    {t(item.alt.ja, item.alt.en)}
                  </p>
                </div>
              </div>
              <div className="absolute inset-0 bg-gold/0 transition-all duration-500 group-hover:bg-gold/5" />
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected !== null && selected >= 0 && selected < GALLERY_IMAGES.length && (
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={t(GALLERY_IMAGES[selected].alt.ja, GALLERY_IMAGES[selected].alt.en)}
            onClick={close}
          >
            <button
              onClick={close}
              className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center text-text-secondary transition-colors hover:text-foreground sm:right-4 sm:top-4"
              aria-label="Close"
            >
              <X size={28} />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="mx-6 w-full max-w-5xl border border-border bg-surface"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-[17/6]">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export + manual srcset */}
                <img
                  src={GALLERY_IMAGES[selected].src}
                  srcSet={buildSrcSet(GALLERY_IMAGES[selected].src)}
                  sizes="(min-width: 1280px) 1920px, 100vw"
                  alt={t(GALLERY_IMAGES[selected].alt.ja, GALLERY_IMAGES[selected].alt.en)}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <p className="border-t border-border px-6 py-4 text-center text-xs tracking-wider text-text-muted">
                {t(GALLERY_IMAGES[selected].alt.ja, GALLERY_IMAGES[selected].alt.en)}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
