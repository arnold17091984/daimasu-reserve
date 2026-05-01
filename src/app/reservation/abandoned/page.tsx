/**
 * /reservation/abandoned — Stripe Checkout cancel-redirect.
 * The reservation is still pending_payment; either retry from email or
 * just resubmit the form. We do NOT delete here — a Phase-2 cron reaps stale
 * pending_payments after 30 minutes.
 */
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export const runtime = "nodejs";

export default function AbandonedPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-24 sm:py-32">
        <div className="border border-border bg-surface/50 p-8 sm:p-12">
          <div className="mb-8 flex justify-center">
            <AlertCircle size={56} className="text-gold/60" aria-hidden="true" />
          </div>

          <h1 className="mb-3 text-center font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.04em] text-foreground sm:text-4xl">
            お支払いが完了しませんでした
          </h1>
          <p className="mb-2 text-center text-sm tracking-[0.04em] text-text-secondary">
            Payment was not completed.
          </p>
          <p className="mx-auto mb-10 max-w-md text-center text-sm leading-relaxed text-text-muted">
            ご予約は確定しておりません。お席の確保にはデポジットのお支払いが必要です。
            <br />
            Your reservation has not been finalised. The deposit is required to secure the seat.
          </p>

          <div className="flex justify-center">
            <Link
              href="/#reservation"
              className="btn-gold-ornate inline-flex items-center px-8 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
            >
              もう一度試す / Try again
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
