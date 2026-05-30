/**
 * /reservation/confirm — post-booking success page.
 *
 * Two entry paths:
 *  - Deposit flow: Stripe Checkout success redirects here with session_id +
 *    rid. The reservation is `pending_payment` until the webhook flips it.
 *  - Deposit-free flow: the reservation API redirects here with rid only,
 *    and the row is already `confirmed`.
 *
 * The page reads the row's status + deposit_centavos to pick the right
 * copy; both paths share the same shell.
 */
import Link from "next/link";
import { CheckCircle2, Calendar, Users, Wallet } from "lucide-react";
import { adminClient } from "@/lib/db/clients";
import { formatPHP, receiptBreakdown } from "@/lib/domain/reservation";
import { isDepositRequired } from "@/lib/env";
import type { Reservation, RestaurantSettings } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ rid?: string; session_id?: string }>;
}

export default async function ReservationConfirmPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rid = sp.rid;
  if (!rid) return <NotFound />;

  const sb = adminClient();
  const { data: reservation } = await sb
    .from("reservations")
    .select("*")
    .eq("id", rid)
    .maybeSingle<Reservation>();

  if (!reservation) return <NotFound />;

  // Multi-venue: show the booked venue's own cancellation/refund policy,
  // not the hardcoded Bar row.
  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("venue", reservation.venue)
    .maybeSingle<RestaurantSettings>();

  const lang = reservation.guest_lang;
  const t = (ja: string, en: string) => (lang === "ja" ? ja : en);

  const isPending = reservation.status === "pending_payment";

  // BIR-compliant breakdown: course_price is VAT-INCL, 10% SC layered on
  // top at the restaurant. The on-site balance the guest will actually
  // owe is grand_total - deposit_already_paid, NOT the menu-only
  // `balance_centavos` snapshot stored on the reservation row.
  //
  // Deposit-free flow nuance: the reservation row stores
  // `deposit_centavos = 0` / `deposit_pct = 0` because no Stripe charge
  // was taken, but staff still collect 50% out-of-band. The UI copy
  // promises "50% deposit (staff will contact)" + "balance on arrival",
  // so we must compute an IMPLIED 50% deposit instead of letting the
  // 0 leak through (Codex P2 2026-05-27).
  const receipt = receiptBreakdown(
    reservation.course_price_centavos,
    reservation.party_size,
    reservation.deposit_pct,
  );
  const depositFlow = isDepositRequired();
  const impliedDeposit =
    depositFlow
      ? reservation.deposit_centavos
      : Math.floor(reservation.total_centavos / 2);
  const onSiteBalance = receipt.grand_total_centavos - impliedDeposit;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-24 sm:py-32">
        <div className="border border-border bg-surface/50 p-8 sm:p-12">
          {/* badge */}
          <div className="mb-8 flex justify-center">
            <CheckCircle2 size={56} className="text-gold" aria-hidden="true" />
          </div>

          {/* heading — three states:
              - deposit flow + confirmed: "Reservation Confirmed"
              - deposit flow + still pending: "Payment Received" (webhook in flight)
              - deposit-free flow: always "Reservation Confirmed" */}
          <h1 className="mb-3 text-center font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.04em] text-foreground sm:text-4xl">
            {isPending && depositFlow
              ? t("お支払いを受け付けました", "Payment Received")
              : t("ご予約を承りました", "Reservation Confirmed")}
          </h1>
          <p className="mb-10 text-center text-sm leading-relaxed text-text-secondary">
            {isPending && depositFlow
              ? t(
                  "決済を確認中です。確認メールが数十秒以内に届きます。",
                  "Verifying payment. A confirmation email arrives shortly."
                )
              : t(
                  `確認メールを ${reservation.guest_email} にお送りしました。`,
                  `A confirmation email has been sent to ${reservation.guest_email}.`
                )}
          </p>

          {/* details */}
          <dl className="space-y-4 border-t border-border pt-6 text-sm">
            <Row
              icon={<Calendar size={16} aria-hidden="true" />}
              label={t("ご来店日時", "Date & time")}
              value={formatServiceTime(reservation.service_starts_at, lang)}
            />
            <Row
              icon={<Users size={16} aria-hidden="true" />}
              label={t("人数", "Party")}
              value={`${reservation.party_size}`}
            />
            {depositFlow ? (
              <>
                <Row
                  icon={<Wallet size={16} aria-hidden="true" />}
                  label={t("デポジット (お支払済み)", "Deposit (paid)")}
                  value={formatPHP(reservation.deposit_centavos, lang)}
                />
                <Row
                  icon={<Wallet size={16} className="opacity-50" aria-hidden="true" />}
                  label={t(
                    "当日お支払い (サービス料 10% 込)",
                    "Balance on arrival (incl. 10% service charge)"
                  )}
                  value={formatPHP(onSiteBalance, lang)}
                />
              </>
            ) : (
              <>
                <Row
                  icon={<Wallet size={16} aria-hidden="true" />}
                  label={t("50% デポジット (お支払い手続きはスタッフよりご連絡)", "50% deposit (staff will contact)")}
                  value={formatPHP(impliedDeposit, lang)}
                />
                <Row
                  icon={<Wallet size={16} className="opacity-50" aria-hidden="true" />}
                  label={t(
                    "当日お支払い (サービス料 10% 込)",
                    "Balance on arrival (incl. 10% service charge)"
                  )}
                  value={formatPHP(onSiteBalance, lang)}
                />
              </>
            )}
          </dl>

          {/* Deposit-pending note for the manual-collection path. The
              booking is confirmed at the system level but the deposit
              hasn't been collected yet — make that obligation explicit
              so the guest knows to expect staff outreach. */}
          {!depositFlow && (
            <div className="mt-6 flex items-start gap-3 border border-gold/30 bg-gold/[0.04] p-4">
              <Wallet size={18} className="mt-0.5 flex-shrink-0 text-gold" aria-hidden="true" />
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t(
                  "お席の確保にはコース料金の 50% のデポジットを頂戴しております。これはプレミアムダイニングや特別な機会のご予約では一般的な仕組みで、本気でご来店をお考えのお客様のためにお席をお守りするためのものです。お支払い手続き（銀行振込 / GCash / カウンターでの現金など）は、スタッフより別途ご連絡させていただきます。",
                  "A 50% deposit of the course price secures your seat — a quality-control measure standard to premium dining and special-occasion bookings, ensuring your counter seat is held for you. Our staff will contact you separately about the payment procedure (bank transfer / GCash / cash at the counter)."
                )}
              </p>
            </div>
          )}

          {/* policy */}
          <div className="mt-10 border-t border-border pt-6">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold/70">
              {t("キャンセルポリシー", "Cancellation policy")}
            </p>
            <p className="text-xs leading-relaxed text-text-muted">
              {depositFlow
                ? t(
                    `ご来店の ${settings?.refund_full_hours ?? 48} 時間前まで 100% / ${settings?.refund_partial_hours ?? 24} 時間前まで 50% を返金いたします。それ以降のキャンセルは返金いたしかねます。確認メール内のキャンセルリンクから 24 時間 365 日承ります。`,
                    `${settings?.refund_full_hours ?? 48}h+ before arrival: 100% refund. ${settings?.refund_partial_hours ?? 24}h+: 50%. Less: 0%. Manage via the link in your confirmation email.`
                  )
                : t(
                    `ご都合が変わった場合、確認メール内のキャンセルリンクから 24 時間 365 日承ります。${settings?.refund_full_hours ?? 48} 時間前まで 100% / ${settings?.refund_partial_hours ?? 24} 時間前まで 50% のデポジット返金（既にお支払い済みの場合）。`,
                    `Plans change — cancel any time via the link in your confirmation email. Deposit (if already paid) is refunded 100% up to ${settings?.refund_full_hours ?? 48}h before, 50% up to ${settings?.refund_partial_hours ?? 24}h.`
                  )}
            </p>
          </div>

          {/* Repeat-booking shortcut + back home + calendar add. UX
              2026-05-06 (Persona Japanese expat) flagged that quarterly-
              repeat guests had to re-enter everything from the homepage;
              surface a quick CTA to land them straight on the form. The
              .ics download (N3) lets them add the booking to Google /
              Apple Calendar without manual transcription. */}
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={`/api/reservations/${reservation.id}/calendar`}
                className="btn-ornate-ghost inline-flex items-center justify-center gap-2 px-5 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
              >
                {t("カレンダーに追加 (.ics)", "Add to calendar (.ics)")}
              </a>
              <Link
                href="/#reservation"
                className="btn-gold-ornate inline-flex items-center justify-center px-5 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
              >
                {t("もう1件予約する", "Book another night")}
              </Link>
            </div>
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.18em] text-gold/70 transition-colors hover:text-gold"
            >
              {t("← トップへ戻る", "← Back to home")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-4 last:border-b-0">
      <dt className="flex items-center gap-2 text-text-muted">
        <span className="text-gold/60">{icon}</span>
        <span className="tracking-[0.04em]">{label}</span>
      </dt>
      <dd className="text-foreground font-[family-name:var(--font-noto-serif)] tracking-[0.02em]">
        {value}
      </dd>
    </div>
  );
}

function NotFound() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-6 py-32">
        <h1 className="mb-3 text-center font-[family-name:var(--font-noto-serif)] text-2xl text-foreground">
          Reservation not found / 予約が見つかりません
        </h1>
        <p className="text-center text-sm text-text-secondary">
          Please check that the link is correct.
          <br />
          リンクが正しいかご確認ください。
        </p>
        <p className="mt-8 text-center">
          <Link href="/" className="text-xs uppercase tracking-[0.18em] text-gold">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}

function formatServiceTime(iso: string, lang: "ja" | "en"): string {
  return new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
