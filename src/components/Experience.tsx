"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { EXPERIENCE_STEPS } from "@/lib/constants";
import { useLang } from "@/lib/language";

export default function Experience() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { t } = useLang();

  return (
    <section id="experience" className="relative py-20 lg:py-28" ref={ref}>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-surface/50 to-background" />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-12 xl:max-w-7xl 2xl:max-w-[1400px]">
        <div className="mb-12 text-center md:mb-16">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="mb-4 text-xs tracking-[0.3em] text-gold"
          >
            {t("体験の流れ", "THE EXPERIENCE")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl"
          >
            {t(
              <>一夜の<span className="text-gold-gradient">旅</span>のすすみかた</>,
              <>How <span className="text-gold-gradient">the evening</span> unfolds</>
            )}
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 1, delay: 0.3 }}
            className="gold-line mx-auto mt-6 w-16"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {EXPERIENCE_STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.15 }}
              className="group relative flex flex-col border border-border bg-surface/50 p-6 transition-all duration-500 hover:border-gold/40 hover:bg-card lg:p-8 xl:p-10 2xl:p-12"
            >
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className="font-[family-name:var(--font-cinzel)] text-5xl font-normal text-gold/45 transition-colors duration-500 group-hover:text-gold/75 xl:text-6xl">
                  {step.number}
                </span>
                {step.thumb && (
                  /* eslint-disable-next-line @next/next/no-img-element -- static export, small decorative thumbnail */
                  <img
                    src={step.thumb}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    width={56}
                    height={56}
                    className="h-14 w-14 flex-shrink-0 rounded-full border border-gold/20 object-cover opacity-70 grayscale-[40%] transition-all duration-500 group-hover:opacity-100 group-hover:grayscale-0 xl:h-16 xl:w-16"
                  />
                )}
              </div>
              <h3 className="mb-2 font-serif text-lg font-medium tracking-wide text-foreground">
                {t(step.title.ja, step.title.en)}
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t(step.description.ja, step.description.en)}
              </p>
              <div className="absolute bottom-0 left-0 h-px w-0 bg-gold/60 transition-all duration-700 group-hover:w-full" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
