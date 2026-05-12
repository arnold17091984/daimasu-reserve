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
import { formatPHP } from "@/lib/domain/reservation";
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

  const { data: settings } = await sb
    .from("restaurant_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle<RestaurantSettings>();

  const lang = reservation.guest_lang;
  const t = (ja: string, en: string) => (lang === "ja" ? ja : en);

  const depositFlow = isDepositRequired();
  const isPending = reservation.status === "pending_payment";

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
                  label={t("当日お支払い", "Balance on arrival")}
                  value={formatPHP(reservation.balance_centavos, lang)}
                />
              </>
            ) : (
              <Row
                icon={<Wallet size={16} aria-hidden="true" />}
                label={t("当日お支払い", "Payment on arrival")}
                value={formatPHP(reservation.total_centavos, lang)}
              />
            )}
          </dl>

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
                    "ご都合が変わった場合、確認メール内のキャンセルリンクから 24 時間 365 日承ります。お支払いは当日現地のため返金処理はございません。",
                    "Plans change — cancel any time via the link in your confirmation email. Since payment is on-site there is no refund step."
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
