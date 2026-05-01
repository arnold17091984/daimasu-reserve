"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  ChevronDown,
  Clock,
  Users,
  Timer,
  Wallet,
  CalendarClock,
  Phone,
  Mail,
  MessageCircle,
  ArrowUpRight,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { useLang } from "@/lib/language";
import { COURSE_PRICE, FAQ_ITEMS, CONTACT, RESTAURANT_INFO } from "@/lib/constants";
import ReservationForm from "@/components/ReservationForm";

type FaqItem = (typeof FAQ_ITEMS)[number];

function LazyMap({
  src,
  title,
  placeholderLabel,
}: {
  src: string;
  title: string;
  placeholderLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldLoad) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[320px] overflow-hidden border border-border bg-surface/50"
    >
      {shouldLoad ? (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0 grayscale-[25%] transition-all duration-500 hover:grayscale-0"
          allowFullScreen
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface/80 via-background/60 to-surface/80">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
            <div className="relative rounded-full border border-gold/40 bg-background/80 p-3">
              <MapPin size={20} className="text-gold/70" aria-hidden="true" strokeWidth={1.5} />
            </div>
          </div>
          <p className="text-[11px] tracking-[0.25em] text-text-secondary uppercase">
            Makati, Metro Manila
          </p>
          <p className="text-[11px] tracking-[0.15em] text-text-muted">
            {placeholderLabel}
          </p>
        </div>
      )}
    </div>
  );
}

const PRACTICAL_INFO = [
  {
    icon: Wallet,
    label: { ja: "コース料金", en: "Course Price" },
    value: {
      ja: `${COURSE_PRICE.amount} / ${COURSE_PRICE.note.ja}`,
      en: `${COURSE_PRICE.amount} ${COURSE_PRICE.note.en}`,
    },
  },
  {
    icon: CalendarClock,
    label: { ja: "カイセキ劇場", en: "Kaiseki Seatings" },
    value: {
      ja: "1部 17:30〜19:00 / 2部 20:00〜21:30",
      en: "Seating 1: 17:30–19:00 · Seating 2: 20:00–21:30",
    },
  },
  {
    icon: Users,
    label: { ja: "席数", en: "Seats" },
    value: { ja: "カウンター8席", en: "8 counter seats" },
  },
  {
    icon: Timer,
    label: { ja: "所要時間", en: "Duration" },
    value: { ja: "約90分 (全8コース)", en: "Approx. 90 minutes (8 courses)" },
  },
];

function AccordionItem({
  item,
  index,
  inView,
}: {
  item: FaqItem;
  index: number;
  inView: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.3 + index * 0.08 }}
      className="border-b border-border last:border-b-0"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors duration-300 hover:text-gold"
        aria-expanded={open}
      >
        <span className="font-serif text-sm font-normal tracking-[0.04em] sm:text-base">
          {t(item.q.ja, item.q.en)}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="flex-shrink-0 text-gold/60"
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed text-text-secondary">
              {t(item.a.ja, item.a.en)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Info() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { t } = useLang();

  return (
    <section id="info" className="relative pt-10 pb-20 lg:pt-16 lg:pb-28" ref={ref}>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-surface/50 to-background" />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-12">
        {/* Section heading */}
        <div className="mb-8 text-center md:mb-12">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="mb-4 text-xs tracking-[0.3em] text-gold"
          >
            {t("ご案内", "INFORMATION")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl"
          >
            {t(
              <>
                ご来店の<span className="text-gold-gradient">ご案内</span>
              </>,
              <>
                <span className="text-gold-gradient">Visitor</span> Guide
              </>
            )}
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 1, delay: 0.3 }}
            className="gold-line mx-auto mt-6 w-16"
          />
        </div>

        {/* Practical info grid */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRACTICAL_INFO.map((info, i) => {
            const Icon = info.icon;
            const valueText = t(info.value.ja, info.value.en);

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.15 + i * 0.1 }}
                className="group flex items-start gap-4 border border-border bg-surface/50 p-6 transition-all duration-500 hover:border-gold/40 hover:bg-card"
              >
                <span className="mt-0.5 text-gold/50 transition-colors duration-500 group-hover:text-gold/80">
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <div>
                  <p className="mb-1 text-xs tracking-[0.2em] text-gold">
                    {t(info.label.ja, info.label.en)}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {valueText}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Reservation form */}
        <motion.div
          id="reservation"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mb-12 scroll-mt-24"
        >
          <ReservationForm />
        </motion.div>

        {/* Contact + Map */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-20 grid gap-6 lg:grid-cols-2"
        >
          {/* Contact block */}
          <div className="flex flex-col justify-between gap-8 border border-border bg-surface/50 p-8">
            <div>
              <p className="mb-4 text-xs tracking-[0.3em] text-gold">
                {t("お問い合わせ", "CONTACT")}
              </p>
              <p className="mb-2 text-sm leading-loose text-foreground">
                {t(CONTACT.address.full.ja, CONTACT.address.full.en)}
              </p>
              <p className="mb-6 inline-flex items-center gap-2 text-xs tracking-wide text-gold-soft">
                <Clock size={12} strokeWidth={1.5} aria-hidden="true" />
                {t(CONTACT.restaurantHours.ja, CONTACT.restaurantHours.en)}
              </p>

              <div className="flex flex-col gap-3 text-sm">
                <a
                  href={`tel:${CONTACT.phone.landline.tel}`}
                  className="group flex items-center gap-3 text-text-secondary transition-colors duration-300 hover:text-gold"
                >
                  <Phone size={16} strokeWidth={1.5} className="text-gold/60 group-hover:text-gold" />
                  <span className="tracking-wide">
                    {CONTACT.phone.landline.label}
                    <span className="ml-2 text-xs text-text-secondary">({t("固定電話", "landline")})</span>
                  </span>
                </a>
                <a
                  href={`tel:${CONTACT.phone.mobile.tel}`}
                  className="group flex items-center gap-3 text-text-secondary transition-colors duration-300 hover:text-gold"
                >
                  <Phone size={16} strokeWidth={1.5} className="text-gold/60 group-hover:text-gold" />
                  <span className="tracking-wide">
                    {CONTACT.phone.mobile.label}
                    <span className="ml-2 text-xs text-text-secondary">(Globe)</span>
                  </span>
                </a>
                <a
                  href={CONTACT.whatsapp.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 text-text-secondary transition-colors duration-300 hover:text-gold"
                >
                  <MessageCircle size={16} strokeWidth={1.5} className="text-gold/60 group-hover:text-gold" />
                  <span className="tracking-wide">{t("WhatsApp でメッセージ", "Message on WhatsApp")}</span>
                  <ArrowUpRight size={12} className="text-gold/40 group-hover:text-gold/80" aria-hidden="true" />
                </a>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="group flex items-center gap-3 text-text-secondary transition-colors duration-300 hover:text-gold"
                >
                  <Mail size={16} strokeWidth={1.5} className="text-gold/60 group-hover:text-gold" />
                  <span className="tracking-wide">{CONTACT.email}</span>
                </a>
              </div>

              <div className="mt-6 flex items-start gap-3 border-t border-border pt-5 text-xs leading-relaxed text-text-secondary">
                <ShieldCheck
                  size={14}
                  strokeWidth={1.5}
                  className="mt-0.5 flex-shrink-0 text-gold/60"
                  aria-hidden="true"
                />
                <span className="tracking-wide">
                  {t(
                    RESTAURANT_INFO.cancellation.ja,
                    RESTAURANT_INFO.cancellation.en
                  )}
                </span>
              </div>
            </div>

            <a
              href={CONTACT.mapLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ornate-ghost inline-flex items-center gap-2 self-start px-5 py-2.5 font-[family-name:var(--font-noto-serif)] text-xs font-medium tracking-[0.14em]"
            >
              {t("Google マップで開く", "Open in Google Maps")}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>

          {/* Google Maps embed (deferred — only mounts when scrolled into view) */}
          <LazyMap
            src={CONTACT.mapEmbedUrl}
            title={t("DAIMASU マカティ店の地図", "Map — DAIMASU Makati")}
            placeholderLabel={t("地図を読み込み中…", "Loading map…")}
          />
        </motion.div>

        {/* FAQ accordion */}
        <div className="mx-auto max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 text-center text-xs tracking-[0.3em] text-gold"
          >
            {t("よくあるご質問", "FREQUENTLY ASKED QUESTIONS")}
          </motion.p>

          <div className="border-t border-border">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} item={item} index={i} inView={inView} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
