/**
 * Terms of Service / Booking Conditions.
 *
 * Defines the contract between DAIMASU and the diner, the deposit/refund
 * tiers, no-show charge, and limits of liability. Required for shop-side
 * defensibility under PH consumer law (RA 7394).
 */
import type { Metadata } from "next";
import { CONTACT, COURSE_PRICE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service — DAIMASU",
  description: "Booking conditions, deposit policy, and refund tiers for DAIMASU 大桝 BAR.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 lg:py-32">
      <h1 className="mb-2 font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.02em] sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mb-10 text-sm text-text-secondary">
        Last updated: April 29, 2026
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-text-secondary">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">1. The reservation</h2>
          <p>
            A reservation at DAIMASU 大桝 BAR is a contract between you (the
            diner) and DAIMASU. By submitting the booking form, you confirm that
            the details you provide are accurate and that you agree to these
            terms and to our <a href="/privacy" className="text-gold underline">Privacy Policy</a>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">2. Course and price</h2>
          <p>
            DAIMASU offers an 8-course projection-mapping kaiseki menu of approximately 90 minutes. The menu price is {COURSE_PRICE.amount} PHP per guest. Prices may change seasonally; the price valid for your booking is the price in effect on the day you book and will be shown on the confirmation email.
          </p>
          <p className="mt-2">
            Service charge (10%) and VAT (12%) apply per Philippine law and are itemised on your receipt.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">3. Deposit</h2>
          <p>
            Online bookings require a 50% deposit, charged through Stripe at the time of booking, to confirm the seat. Phone or walk-in bookings may be confirmed by direct payment at the bar.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">4. Refund policy</h2>
          <p>If you need to cancel, the refund tier depends on how far ahead you cancel:</p>
          <table className="mt-3 w-full border border-border text-sm">
            <thead>
              <tr className="bg-surface/50">
                <th className="border-b border-border px-3 py-2 text-left">Cancel window</th>
                <th className="border-b border-border px-3 py-2 text-left">Refund</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-border px-3 py-2">≥ 48 hours before service</td>
                <td className="border-b border-border px-3 py-2">100% refund</td>
              </tr>
              <tr>
                <td className="border-b border-border px-3 py-2">24–48 hours before service</td>
                <td className="border-b border-border px-3 py-2">50% refund</td>
              </tr>
              <tr>
                <td className="border-b border-border px-3 py-2">&lt; 24 hours before service</td>
                <td className="border-b border-border px-3 py-2">No refund</td>
              </tr>
              <tr>
                <td className="px-3 py-2">No-show</td>
                <td className="px-3 py-2">Full menu price charged</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3">
            Refunds, when due, are issued to the original Stripe payment method within 5–10 business days. The owner may, at her discretion, override the standard tier in exceptional circumstances (medical emergency, force majeure).
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">5. Late arrival</h2>
          <p>
            Each seating is 90 minutes long with a fixed start time. If you arrive more than 15 minutes after the start, the kitchen may have moved past one or more courses; we cannot replate them. Arrival more than 30 minutes late may be treated as a no-show at the owner&rsquo;s discretion.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">6. Allergies and dietary restrictions</h2>
          <p>
            DAIMASU&rsquo;s kaiseki menu is fixed and includes seafood, dairy, and gluten-containing dishes. We will accommodate disclosed allergies where possible but cannot guarantee an allergen-free environment. You are responsible for disclosing all allergies at booking; we are not liable for reactions to undisclosed allergens.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">7. Conduct and right to refuse service</h2>
          <p>
            DAIMASU reserves the right to refuse or terminate service for guests who behave in a way that endangers staff or other guests, who arrive intoxicated, or who fail to honour reasonable house rules. Termination for misconduct does not entitle the guest to a refund.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">8. Photography and surprise services</h2>
          <p>
            We may take photographs of the course presentation for our own marketing. Photographs that show identifiable guests are used only with the guest&rsquo;s explicit consent at booking time (the &ldquo;SNS posting&rdquo; toggle). Surprise services (cake, projection, flowers) are subject to lead time and operational feasibility; we will confirm by email or phone.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by Philippine law, DAIMASU&rsquo;s liability for any single booking is limited to the amount you actually paid for that booking. We are not liable for indirect, consequential, or special damages.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">10. Governing law and disputes</h2>
          <p>
            These terms are governed by the laws of the Republic of the Philippines. Any dispute will be heard by the appropriate court in Makati City.
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
