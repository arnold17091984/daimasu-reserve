"use client";

import { ArrowUpRight, Instagram, Facebook } from "lucide-react";
import { useLang } from "@/lib/language";
import { MAIN_SITE_URL, SOCIAL_LINKS } from "@/lib/constants";

const SOCIAL_ICON: Record<string, React.FC<{ size?: number }>> = {
  Instagram: ({ size = 18 }) => <Instagram size={size} aria-hidden="true" />,
  Facebook: ({ size = 18 }) => <Facebook size={size} aria-hidden="true" />,
};

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="border-t border-border bg-surface/30">
      {/* Final CTA */}
      <div className="py-14 text-center md:py-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <p className="mb-3 font-[family-name:var(--font-noto-serif)] text-2xl font-medium tracking-[0.02em] sm:text-3xl">
            {t(
              "旅の始まりを、ご予約ください",
              "Begin your journey — reserve a table"
            )}
          </p>
          <p className="mb-8 font-[family-name:var(--font-noto-serif)] text-sm tracking-[0.06em] text-gold-soft">
            {t("完全予約制・8席限定", "Reservation only — 8 seats per evening")}
          </p>
          <a
            href="#reservation"
            className="btn-ornate-ghost inline-flex h-[52px] items-center justify-center px-10 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.08em]"
          >
            {t("ご予約はこちら", "Reserve your seat")}
          </a>
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12 md:py-12">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="font-[family-name:var(--font-cinzel)] text-xl font-medium tracking-[0.35em] text-gold">
            DAIMASU
          </span>

          <p className="font-[family-name:var(--font-noto-serif)] text-sm tracking-[0.14em] text-gold-soft">
            {t("お待ちしております。", "Master Owly awaits.")}
          </p>

          <a
            href={MAIN_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm tracking-wider text-text-secondary transition-colors duration-300 hover:text-gold"
          >
            {t("メインサイトへ", "Visit Main Site")}
            <ArrowUpRight size={14} />
          </a>

          <div className="flex items-center gap-6">
            {SOCIAL_LINKS.map((social) => {
              const Icon = SOCIAL_ICON[social.name];
              return (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${social.name} — ${social.handle}`}
                  className="text-text-muted transition-colors duration-300 hover:text-gold"
                >
                  {Icon && <Icon size={18} />}
                </a>
              );
            })}
          </div>

          <div className="gold-line w-16" />

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text-secondary">
            <a href="/privacy" className="transition-colors hover:text-gold">
              {t("プライバシーポリシー", "Privacy Policy")}
            </a>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <a href="/terms" className="transition-colors hover:text-gold">
              {t("ご予約規約", "Terms of Service")}
            </a>
          </div>

          <p className="text-xs text-text-secondary">
            &copy; {new Date().getFullYear()} DAIMASU. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
