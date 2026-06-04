"use client";

import { MessageCircle } from "lucide-react";
import { CONTACT } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useEffect, useState } from "react";

export default function StickyMobileCTA() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  // Always visible while browsing; hidden only when the reservation form /
  // its submit button is on screen, so the bar never covers the form.
  useEffect(() => {
    const compute = () => {
      const sendBtn =
        document.querySelector<HTMLElement>("button[type='submit']");
      const reservation = document.getElementById("reservation");
      const winH = window.innerHeight;

      let atForm = false;
      if (sendBtn) {
        const r = sendBtn.getBoundingClientRect();
        // Submit button entering the viewport → hide (avoid covering it).
        if (r.top < winH - 100 && r.bottom > -50) atForm = true;
      }
      if (reservation) {
        const r = reservation.getBoundingClientRect();
        // Reservation section past mid-viewport → hide.
        if (r.top < winH * 0.5) atForm = true;
      }

      setVisible(!atForm);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute, { passive: true });
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <div
      className={`fixed left-0 right-0 z-40 flex gap-2 border-t border-border-gold bg-background/95 p-3 backdrop-blur transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{
        // Sit above the cookie banner (which publishes its height) so the two
        // never overlap; drops to the screen edge once consent is dismissed.
        bottom: "var(--cookie-banner-h, 0px)",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
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
