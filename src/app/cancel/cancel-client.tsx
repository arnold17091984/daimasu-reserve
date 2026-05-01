"use client";

/**
 * Cancel UI: GET preview → confirm → POST execute.
 * Anti-goal #3: refund tier is informational here; the server recomputes it.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

interface PreviewOk {
  ok: true;
  preview: {
    tier: "full" | "partial" | "late";
    hours_remaining: number;
    refund_centavos: number;
    refund_display: string;
    deposit_centavos: number;
    deposit_display: string;
    starts_at: string;
  };
}
interface PreviewErr {
  ok: false;
  error: string;
}

type Status = "loading" | "ready" | "executing" | "done" | "error";

export function CancelClient({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [preview, setPreview] = useState<PreviewOk["preview"] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reservations/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "preview", token }),
        });
        const data = (await res.json()) as PreviewOk | PreviewErr;
        if (cancelled) return;
        if (!data.ok) {
          setErrorCode(data.error);
          setStatus("error");
        } else {
          setPreview(data.preview);
          setStatus("ready");
        }
      } catch {
        setErrorCode("network");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function execute() {
    setStatus("executing");
    try {
      const res = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "execute", token }),
      });
      const data = (await res.json()) as
        | { ok: true; cancelled: { tier: "full" | "partial" | "late"; refund_centavos: number } }
        | { ok: false; error: string };
      if (!data.ok) {
        setErrorCode(data.error);
        setStatus("error");
        return;
      }
      const refund = data.cancelled.refund_centavos;
      setDoneMsg(
        refund > 0
          ? `キャンセルを承りました。返金処理を開始しております。`
          : `キャンセルを承りました。`
      );
      setStatus("done");
    } catch {
      setErrorCode("network");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <Card>
        <Loader2 className="mx-auto mb-4 animate-spin text-gold" size={36} aria-hidden="true" />
        <p className="text-center text-sm text-text-secondary">確認中... / Verifying...</p>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <AlertCircle className="mx-auto mb-4 text-red-400" size={48} aria-hidden="true" />
        <h1 className="mb-3 text-center font-[family-name:var(--font-noto-serif)] text-2xl text-foreground">
          {humanizeError(errorCode)}
        </h1>
        <p className="text-center text-sm text-text-secondary">
          お手数ですが、店舗まで直接ご連絡ください。
          <br />
          Please contact us directly.
        </p>
      </Card>
    );
  }

  if (status === "done") {
    return (
      <Card>
        <CheckCircle2 className="mx-auto mb-4 text-gold" size={56} aria-hidden="true" />
        <h1 className="mb-3 text-center font-[family-name:var(--font-noto-serif)] text-2xl text-foreground">
          キャンセル完了 / Cancellation Complete
        </h1>
        <p className="mb-6 text-center text-sm text-text-secondary">{doneMsg}</p>
        <p className="text-center">
          <Link href="/" className="text-xs uppercase tracking-[0.18em] text-gold/70 hover:text-gold">
            ← Back to home
          </Link>
        </p>
      </Card>
    );
  }

  // ready
  if (!preview) return null;
  const tier = preview.tier;
  const startsAt = new Date(preview.starts_at).toLocaleString("ja-JP", {
    timeZone: "Asia/Manila",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card>
      <div className="mb-6 flex justify-center">
        <Clock size={48} className="text-gold/60" aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-center font-[family-name:var(--font-noto-serif)] text-3xl font-medium tracking-[0.04em] text-foreground">
        ご予約のキャンセル
      </h1>
      <p className="mb-10 text-center text-sm text-text-secondary">
        Cancel your reservation
      </p>

      <dl className="space-y-3 border-y border-border py-5 text-sm">
        <Row label="ご来店予定 / Booked for" value={startsAt} />
        <Row label="お預かりデポジット / Deposit" value={preview.deposit_display} />
        <Row
          label={tierLabel(tier)}
          value={preview.refund_display}
          highlight={tier === "full" || tier === "partial"}
        />
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        {tier === "full" &&
          "48時間前までのキャンセルにつき、デポジット全額を返金いたします。"}
        {tier === "partial" &&
          "24時間前までのキャンセルにつき、デポジットの50%を返金いたします。"}
        {tier === "late" &&
          "恐れ入りますが、当日キャンセルにつき返金はございません (キャンセルポリシー)。"}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={execute}
          disabled={status === "executing"}
          className="btn-gold-ornate flex-1 inline-flex items-center justify-center px-6 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em] disabled:opacity-60"
        >
          {status === "executing" ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={16} aria-hidden="true" />
              処理中...
            </>
          ) : (
            "キャンセルを確定 / Confirm cancellation"
          )}
        </button>
        <Link
          href="/"
          className="btn-ornate-ghost flex-1 inline-flex items-center justify-center px-6 py-3 font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.14em]"
        >
          戻る / Keep my reservation
        </Link>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border bg-surface/50 p-8 sm:p-12">{children}</div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-muted tracking-[0.04em]">{label}</dt>
      <dd
        className={
          highlight
            ? "font-[family-name:var(--font-noto-serif)] text-gold"
            : "font-[family-name:var(--font-noto-serif)] text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function tierLabel(tier: "full" | "partial" | "late"): string {
  switch (tier) {
    case "full":
      return "返金額 / Refund (100%)";
    case "partial":
      return "返金額 / Refund (50%)";
    case "late":
      return "返金額 / Refund";
  }
}

function humanizeError(code: string | null): string {
  switch (code) {
    case "expired":
      return "リンクの有効期限が切れています";
    case "bad_signature":
    case "invalid":
      return "リンクが無効です";
    case "token_rotated":
      return "リンクが既に使用されています";
    case "already_cancelled":
      return "ご予約は既にキャンセルされています";
    case "non_cancellable":
      return "このご予約はキャンセルできません";
    case "not_found":
      return "予約が見つかりません";
    case "refund_failed":
      return "返金処理に失敗しました";
    default:
      return "エラーが発生しました";
  }
}
