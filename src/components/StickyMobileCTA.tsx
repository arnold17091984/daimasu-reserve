"use client";

import { MessageCircle } from "lucide-react";
import { CONTACT } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useEffect, useState } from "react";

export default function StickyMobileCTA() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  // Hero 지나면 노출, reservation 섹션/Send 버튼 접근 시 숨김
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const sendBtn =
        document.querySelector<HTMLElement>("button[type='submit']");
      const reservation = document.getElementById("reservation");
      const winH = window.innerHeight;

      let shouldHide = false;
      if (sendBtn) {
        const r = sendBtn.getBoundingClientRect();
        // Send 버튼이 뷰포트 진입 영역에 있으면 sticky 숨김 (가림 방지)
        if (r.top < winH - 100 && r.bottom > -50) shouldHide = true;
      }
      if (reservation) {
        const r = reservation.getBoundingClientRect();
        // Reservation 섹션이 뷰포트 중앙 이상 들어오면 숨김
        if (r.top < winH * 0.5) shouldHide = true;
      }

      setVisible(y > 600 && !shouldHide);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-border-gold bg-background/95 p-3 backdrop-blur transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <a
        href="#reservation"
        className="btn-gold-ornate flex flex-1 items-center justify-center px-4 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
      >
        {t("ご予約", "Reserve")}
      </a>
      <a
        href={CONTACT.whatsapp.reservationHref}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ornate-ghost flex items-center justify-center gap-1.5 px-4 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
        aria-label={t("WhatsAppで問い合わせる", "Inquire via WhatsApp")}
      >
        <MessageCircle size={16} aria-hidden="true" />
        WhatsApp
      </a>
    </div>
  );
}
