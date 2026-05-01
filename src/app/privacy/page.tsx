/**
 * Privacy Policy — required by RA 10173 (Philippines Data Privacy Act).
 * Static rendering. The cookie/marketing-consent UX lives in the cookie
 * banner; this page is the long-form disclosure document.
 *
 * Content reviewed against NPC (National Privacy Commission of the
 * Philippines) Memorandum Circular 18-01 minimum disclosure items:
 * scope, lawful basis, retention, rights, contact, transfer.
 */
import type { Metadata } from "next";
import { CONTACT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy — DAIMASU",
  description: "How DAIMASU 大桝 BAR collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 lg:py-32">
      <h1 className="mb-2 font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm text-text-secondary">
        Last updated: April 29, 2026 · Effective in the Philippines (RA 10173)
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-text-secondary">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">1. Who we are</h2>
          <p>
            DAIMASU 大桝 BAR (&ldquo;DAIMASU&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an 8-seat
            counter Japanese bar located at {CONTACT.address.full.en}. We act as
            a Personal Information Controller under the Philippine Data Privacy
            Act of 2012 (RA 10173). For privacy questions, contact our Data
            Protection Officer at <a href={`mailto:${CONTACT.email}`} className="text-gold underline">{CONTACT.email}</a>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">2. What we collect</h2>
          <ul className="ml-5 list-disc space-y-1.5">
            <li><strong>Reservation data</strong>: name, email, phone, party size, date, dietary notes, language preference.</li>
            <li><strong>Payment data</strong>: handled by Stripe; we receive only a transaction reference + last 4 digits + payment method type. Full card data never reaches our servers.</li>
            <li><strong>Celebration data</strong> (optional): celebrant name, occasion, surprise instructions, when you provide them.</li>
            <li><strong>Technical data</strong>: IP address (rate limiting, fraud), browser language, page views (Google Analytics 4 — anonymized).</li>
            <li><strong>Cookies</strong>: a session cookie for your booking, a language preference cookie, a consent cookie. No third-party advertising cookies.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">3. Why we collect it (lawful basis)</h2>
          <ul className="ml-5 list-disc space-y-1.5">
            <li><strong>Performance of contract</strong>: to honour your reservation, send confirmations, process the deposit and any refund.</li>
            <li><strong>Legal obligation</strong>: tax records (BIR), receipts, accounting kept for 5 years.</li>
            <li><strong>Legitimate interest</strong>: fraud prevention (rate limiting, honeypot), service improvement (anonymous analytics).</li>
            <li><strong>Consent</strong>: marketing emails. You opt in at booking; you can opt out anytime via the unsubscribe link.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">4. How long we keep it</h2>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Reservation + payment records: 5 years (BIR / accounting requirement).</li>
            <li>Marketing list: until you unsubscribe.</li>
            <li>Audit log of administrative actions: 5 years.</li>
            <li>IP-keyed rate-limit state: 1 hour, in memory only.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">5. Who we share it with</h2>
          <p>We share personal data only with these processors, all under Data Sharing Agreements:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li><strong>Stripe, Inc.</strong> (USA) — payment processing; PCI-DSS Level 1.</li>
            <li><strong>Supabase, Inc.</strong> (USA) — database hosting; SOC 2.</li>
            <li><strong>Resend</strong> (USA) — transactional email delivery.</li>
            <li><strong>Telegram Messenger LLP</strong> — restaurant operations notifications.</li>
            <li><strong>Twilio (WhatsApp Business)</strong> — optional reminder channel.</li>
            <li><strong>Vultr Holdings</strong> — application hosting in Asia (Singapore).</li>
          </ul>
          <p className="mt-3">
            We do not sell your data. We do not transfer your data to advertisers or data brokers.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">6. Your rights (RA 10173)</h2>
          <p>You have the right to:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li><strong>Be informed</strong> — this document.</li>
            <li><strong>Object</strong> to processing for marketing.</li>
            <li><strong>Access</strong> a copy of the data we hold about you.</li>
            <li><strong>Rectify</strong> inaccurate or incomplete data.</li>
            <li><strong>Erase or block</strong> data, subject to our 5-year tax-record obligation.</li>
            <li><strong>Damages</strong> if your rights are violated.</li>
            <li><strong>Data portability</strong> — receive a machine-readable copy.</li>
            <li><strong>Lodge a complaint</strong> with the National Privacy Commission (privacy.gov.ph).</li>
          </ul>
          <p className="mt-3">
            Email {" "}
            <a href={`mailto:${CONTACT.email}`} className="text-gold underline">{CONTACT.email}</a>
            {" "} to exercise any right. We respond within 5 business days.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">7. Security measures</h2>
          <p>
            HTTPS-only transport (HSTS preload). Database encrypted at rest (Supabase). Strict Content-Security-Policy. Rate limiting on public endpoints. Stripe webhook signature verification. Audit log on every administrative action. Access to administrative tooling is restricted to named owners on an allowlist, behind an authenticated session.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">8. Children</h2>
          <p>
            DAIMASU does not knowingly collect data from children under 18. Bookings are intended for adults; minors must be accompanied by a parent or guardian who provides the booking data on their behalf.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">9. Updates</h2>
          <p>
            We may revise this policy. Material changes will be flagged on the booking page; the &ldquo;Last updated&rdquo; date above always reflects the current version.
          </p>
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-xs text-text-muted">
            DAIMASU 大桝 BAR · {CONTACT.address.full.en} · {CONTACT.email}
          </p>
        </section>
      </div>
    </main>
  );
}
