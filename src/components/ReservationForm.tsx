"use client";

import { useState, useMemo, useEffect } from "react";
import { MessageCircle, ArrowUpRight, Send, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useLang } from "@/lib/language";
import {
  CONTACT,
  COURSE_PRICE,
  COUNTRY_CODES,
  COUNTRY_OTHER,
} from "@/lib/constants";
import { publicEnv } from "@/lib/env";

const DEPOSIT_REQUIRED = publicEnv.depositRequired;

// End-times surfaced inline so guests can plan their evening before
// booking (UX 2026-05-06 N5). Course is ~90 min; allow ~5 min buffer.
const SEATINGS = [
  { value: "s1" as const, label: { ja: "1部 17:30〜19:00", en: "Seating 1 · 17:30–19:00" } },
  { value: "s2" as const, label: { ja: "2部 20:00〜21:30", en: "Seating 2 · 20:00–21:30" } },
];

type Status = "idle" | "sending" | "redirecting" | "error";

const ViberIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M11.4 0C9.473.028 5.333.344 3.02 2.436 1.302 4.121.696 6.614.63 9.702.569 12.79.49 18.575 6.07 20.14h.005l-.004 2.395s-.037.97.602 1.17c.79.246 1.233-.51 1.978-1.324.409-.447.973-1.103 1.4-1.602 3.814.318 6.747-.41 7.08-.517.77-.25 5.124-.809 5.832-6.585.73-5.954-.353-9.72-2.303-11.418l-.01-.008c-.59-.54-2.952-2.26-8.22-2.28 0 0-.392-.024-1.025-.025Zm.064 1.652c.536 0 .869.021.869.021 4.456.014 6.372 1.352 6.872 1.806 1.649 1.417 2.49 4.81 1.875 9.785-.594 4.822-4.124 5.127-4.776 5.337-.278.09-2.857.726-6.098.515 0 0-2.415 2.91-3.169 3.667-.118.12-.256.164-.348.142-.13-.033-.166-.187-.165-.412.002-.321.02-3.978.02-3.978-.003 0-.003 0 0 0-4.72-1.31-4.445-6.233-4.392-8.811.053-2.577.543-4.69 1.996-6.126 1.957-1.743 5.47-2.002 7.108-2.016.008 0 .112-.01.208-.01Z" />
  </svg>
);

function formatHumanDate(d: Date | undefined, lang: "ja" | "en"): string {
  if (!d) return "";
  if (lang === "ja") {
    const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${w})`;
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** YYYY-MM-DD in local time (calendar selection is wall-clock, no TZ shift). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * One row of the seat-dots availability panel: a seating label, a row of
 * `total` dots (filled = booked, outline = open), and a remaining-seat
 * count. The currently-selected seating is highlighted. UX 2026-05-21.
 */
function SeatDotRow({
  label,
  total,
  remaining,
  highlighted,
  lang,
}: {
  label: string;
  total: number;
  remaining: number;
  highlighted: boolean;
  lang: "ja" | "en";
}) {
  const taken = Math.max(0, total - remaining);
  const full = remaining === 0;
  const low = remaining > 0 && remaining <= 2;
  const countText = full
    ? lang === "ja"
      ? "満席"
      : "Full"
    : lang === "ja"
      ? `あと${remaining}席`
      : `${remaining} left`;
  return (
    <div
      className={
        highlighted
          ? "flex items-center gap-3 border border-gold/50 bg-gold/[0.06] px-2.5 py-2"
          : "flex items-center gap-3 border border-transparent px-2.5 py-2 opacity-70"
      }
    >
      <span className="w-[116px] shrink-0 font-[family-name:var(--font-noto-serif)] text-[12px] tracking-[0.04em] text-foreground">
        {label}
      </span>
      <span className="flex flex-1 flex-wrap gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={
              i < taken
                ? "h-3 w-3 rounded-full bg-text-muted"
                : "h-3 w-3 rounded-full border border-gold bg-transparent"
            }
          />
        ))}
      </span>
      <span
        className={
          full
            ? "shrink-0 text-[12px] font-bold tracking-[0.04em] text-red-400"
            : low
              ? "shrink-0 text-[12px] font-bold tracking-[0.04em] text-amber-400"
              : "shrink-0 text-[12px] font-medium tracking-[0.04em] text-gold"
        }
      >
        {countText}
      </span>
    </div>
  );
}

interface ApiOk {
  ok: true;
  reservation_id: string;
  cancel_token: string;
  /** Present in the deposit flow — redirect target for Stripe Checkout. */
  checkout_url?: string;
  /** Present in the deposit-free flow — booking is already confirmed. */
  confirmed?: boolean;
}
interface ApiErr {
  ok: false;
  error:
    | { code: "validation"; details?: unknown }
    | { code: "closed_date" }
    | { code: "capacity_exceeded"; tried_seating?: "s1" | "s2" }
    | { code: "reservations_closed" }
    | { code: "internal"; reason?: string };
}

export default function ReservationForm() {
  const { t, lang } = useLang();
  const [name, setName] = useState("");
  // Phone is split into a country dial code (default PH +63) and the
  // local number, matching the admin form. The COUNTRY_OTHER option
  // switches the input into "full international" mode where the guest
  // types `+886 9171234567` directly. UX 2026-05-06 (Persona Tokyo
  // tourist) — the previous single text input was unfriendly to
  // non-PH numbers because the placeholder hard-coded a +63 example.
  const [countryCode, setCountryCode] = useState<string>("+63");
  const [phoneLocal, setPhoneLocal] = useState("");
  const isCustomCountry = countryCode === COUNTRY_OTHER;
  const fullPhone = isCustomCountry
    ? phoneLocal.trim()
    : `${countryCode} ${phoneLocal.trim()}`.trim();
  const phoneInvalid = isCustomCountry
    ? phoneLocal.trim().length > 0 && !phoneLocal.trim().startsWith("+")
    : phoneLocal.includes("+");
  const PHONE_MAX = 30;
  const phoneLocalMaxLength = isCustomCountry
    ? PHONE_MAX
    : Math.max(1, PHONE_MAX - (countryCode.length + 1));
  const [email, setEmail] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [seating, setSeating] = useState<"s1" | "s2">("s1");
  const [party, setParty] = useState("2");
  const [notes, setNotes] = useState("");
  // Dietary info — separated from `notes` so the kitchen can read it at
  // a glance and the confirmation email can echo it back to reassure
  // guests with severe allergies. UX 2026-05-06 (Persona shellfish-allergic
  // Western traveller) flagged the previous free-text-only design as a
  // safety risk.
  const [dietaryType, setDietaryType] = useState<
    "none" | "vegetarian" | "pescatarian" | "halal" | "kosher" | "gluten_free" | "dairy_free" | "other"
  >("none");
  const [allergens, setAllergens] = useState("");
  const [allergySevere, setAllergySevere] = useState(false);
  const [dietaryInstructions, setDietaryInstructions] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot

  const minDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d;
  }, []);

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Per-date seat availability — powers the seat-dots display.
  // Fetched once on mount for the whole bookable window.
  const [availability, setAvailability] = useState<
    Map<string, { s1: number; s2: number; closed: boolean }>
  >(new Map());
  // Total counter seats per seating (8) — needed to render the dot row.
  const [totalSeats, setTotalSeats] = useState(8);

  useEffect(() => {
    const controller = new AbortController();
    const from = toIsoDate(minDate);
    const to = toIsoDate(maxDate);
    fetch(`/api/availability?from=${from}&to=${to}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(
        (data: {
          ok: boolean;
          online_seats?: number;
          days?: {
            date: string;
            s1_remaining: number;
            s2_remaining: number;
            closed: boolean;
          }[];
        }) => {
          if (!data.ok || !data.days) return;
          if (data.online_seats) setTotalSeats(data.online_seats);
          const map = new Map<
            string,
            { s1: number; s2: number; closed: boolean }
          >();
          for (const d of data.days) {
            map.set(d.date, {
              s1: d.s1_remaining,
              s2: d.s2_remaining,
              closed: d.closed,
            });
          }
          setAvailability(map);
        }
      )
      .catch(() => {
        /* availability is advisory — a failed fetch just hides the count */
      });
    return () => controller.abort();
  }, [minDate, maxDate]);

  // Remaining seats for the currently-selected date (null until a date
  // is picked or if availability hasn't loaded).
  const selectedAvail = selectedDate
    ? (availability.get(toIsoDate(selectedDate)) ?? null)
    : null;
  const seatsRemaining = selectedAvail
    ? seating === "s1"
      ? selectedAvail.s1
      : selectedAvail.s2
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending" || status === "redirecting") return;
    setAttemptedSubmit(true);
    if (!selectedDate) {
      document
        .querySelector(".rdp-daimasu")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (phoneInvalid) {
      // Block submit so the server doesn't reject a "+63 +886..." string
      // and silently confuse the guest. The inline message tells them
      // exactly what to fix.
      document
        .getElementById("res-phone")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_date: toIsoDate(selectedDate),
          seating,
          party_size: Number(party),
          guest_name: name.trim(),
          guest_email: email.trim(),
          guest_phone: fullPhone,
          guest_lang: lang,
          notes: notes.trim() || null,
          dietary:
            dietaryType !== "none" ||
            allergens.trim() ||
            allergySevere ||
            dietaryInstructions.trim()
              ? {
                  type: dietaryType,
                  allergens: allergens.trim(),
                  severe: allergySevere,
                  instructions: dietaryInstructions.trim(),
                }
              : null,
          website,
        }),
      });
      const data = (await res.json()) as ApiOk | ApiErr;
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(humanizeErrorCode(data.error.code, lang));
        return;
      }
      setStatus("redirecting");
      // Persist cancel_token in localStorage as backup if email is delayed
      try {
        localStorage.setItem(
          `daimasu:cancel:${data.reservation_id}`,
          data.cancel_token
        );
      } catch {
        /* private mode etc. — ignore */
      }
      // Deposit flow → Stripe Checkout. Deposit-free flow → confirm page.
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        window.location.href = `/reservation/confirm?rid=${encodeURIComponent(data.reservation_id)}`;
      }
    } catch {
      setStatus("error");
      setErrorMsg(
        lang === "ja"
          ? "ネットワークエラー。もう一度お試しください。"
          : "Network error. Please try again."
      );
    }
  };

  const labelClass = "font-[family-name:var(--font-noto-serif)] text-[13px] font-medium tracking-[0.14em] text-gold";
  const inputClass =
    "w-full border border-border bg-background/50 px-4 py-3 text-base text-foreground placeholder:text-text-muted focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40 transition-colors";
  const dateMissing = !selectedDate;
  const submitDisabled = status === "sending" || status === "redirecting";

  return (
    <div className="flex flex-col gap-7 border border-border bg-surface/50 p-6 sm:p-8">
      <div>
        <p className="mb-2 text-xs tracking-[0.3em] text-gold">
          {t("ご予約", "RESERVATIONS")}
        </p>
        <h3 className="mb-3 font-[family-name:var(--font-noto-serif)] text-2xl font-medium tracking-[0.02em] text-foreground">
          {t(
            <>フォームから<span className="text-gold">ご予約</span></>,
            <>Book by <span className="text-gold">filling the form</span></>
          )}
        </h3>
        <p className="text-sm leading-relaxed text-text-secondary">
          {DEPOSIT_REQUIRED
            ? t(
                "ご希望の日・時間・人数をお選びください。お席の確保にはデポジット (50%) のお支払いが必要です。確認メールが即時に届きます。",
                "Pick a date, a seating, and party size. A 50% deposit secures your seat; a confirmation email arrives instantly."
              )
            : t(
                "ご希望の日・時間・人数をお選びください。送信と同時にご予約は確定となり、確認メールが即時に届きます。お席の確保にはコース料金の 50% のデポジットを頂戴しております。これは本気でご来店をお考えのお客様のためにお席をしっかりとお守りする仕組みで、プレミアムダイニングや特別な機会のご予約では広く採用されているものです。お支払い手続き (銀行振込 / GCash / カウンターでの現金など) は、スタッフより別途ご連絡させていただきます。",
                "Pick a date, a seating, and party size. Your reservation is confirmed on submission and a confirmation email arrives instantly. A 50% deposit secures your seat — a quality-control measure that protects genuine reservations and is standard practice for premium dining and special-occasion bookings. Our staff will be in touch separately about the payment procedure (bank transfer / GCash / cash at the counter)."
              )}
        </p>
        {/* Plain-language summary for guests who haven't experienced
            kaiseki before. UX 2026-05-06 (foreign guest personas)
            flagged that "kaiseki" alone wasn't decoded anywhere. */}
        <div className="mt-4 grid gap-1 border border-gold/30 bg-gold/[0.04] px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
          <p>
            <span className="text-gold">
              {t("懐石とは:", "About kaiseki:")}
            </span>{" "}
            {t(
              "8皿構成の伝統的な日本のフルコース。先付から甘味まで、季節の一品ずつをカウンター越しに料理人がお出ししていく90分の流れです。",
              "A traditional Japanese tasting menu of 8 small courses — from the opening sakizuke to a sweet finish — served one at a time across the counter over 90 minutes."
            )}
          </p>
          <p>
            <span className="text-gold">{t("対象:", "Audience:")}</span>{" "}
            {t(
              "12歳以上のお客様に限らせていただきます。スマートカジュアル推奨。",
              "Guests aged 12 and above. Smart casual recommended."
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Honeypot — hidden from humans, bots fill it. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, overflow: "hidden" }}>
          <label htmlFor="res-website">Website</label>
          <input
            id="res-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* Step 1 — Date */}
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            {t("1. ご希望日", "1. Preferred date")}
            <span className="ml-1 text-gold">*</span>
          </label>
          <div
            className="rdp-daimasu flex justify-center border border-border bg-background/40 p-3 sm:p-4"
            aria-live="polite"
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              // Monday is the bar's standing weekly closure — disable it
              // alongside the out-of-window dates so guests can't pick a
              // date the server is just going to reject. dayOfWeek uses
              // JS getDay() semantics: 1 = Monday.
              disabled={[
                { before: minDate, after: maxDate },
                { dayOfWeek: [1] },
              ]}
              weekStartsOn={1}
              numberOfMonths={1}
              showOutsideDays
              required
            />
            <p className="text-[11px] tracking-[0.04em] text-text-muted">
              {t(
                "※ 月曜日は定休日のためご予約いただけません。",
                "Mondays are closed."
              )}
            </p>
          </div>
          {selectedDate ? (
            <div className="flex items-center justify-between border border-gold/40 bg-gold/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="inline-block h-2 w-2 rotate-45 bg-gold" />
                <span className="font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.06em] text-gold">
                  {formatHumanDate(selectedDate, lang)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(undefined)}
                className="text-xs tracking-[0.1em] text-gold/60 underline underline-offset-4 transition-colors hover:text-gold"
              >
                {t("変更", "Change")}
              </button>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed tracking-[0.04em] text-text-secondary">
              {t(
                "本日から3ヶ月先までご予約いただけます。",
                "Available from today up to three months ahead."
              )}
            </p>
          )}
        </div>

        {/* Step 2 — Seating */}
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            {t("2. ご希望時間", "2. Seating")}
            <span className="ml-1 text-gold">*</span>
          </label>
          <div
            role="radiogroup"
            aria-label={t("ご希望時間", "Seating")}
            className="grid grid-cols-2 gap-3"
          >
            {SEATINGS.map((s) => {
              const active = seating === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSeating(s.value)}
                  className={
                    active
                      ? "btn-gold-ornate flex h-14 items-center justify-center font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.1em]"
                      : "btn-ornate-ghost flex h-14 items-center justify-center font-[family-name:var(--font-noto-serif)] text-sm font-medium tracking-[0.1em]"
                  }
                >
                  {t(s.label.ja, s.label.en)}
                </button>
              );
            })}
          </div>

          {/* Seat-dots availability panel — visualises the 8-seat counter
              filling up. Filled = booked, outline = open. Shows both
              seatings so the guest can compare before choosing. UX
              2026-05-21: replaced the easily-missed tiny sub-label. */}
          {selectedDate && selectedAvail === null && (
            <p className="text-[12px] tracking-[0.04em] text-text-muted">
              {t("空席状況を確認中…", "Checking seat availability…")}
            </p>
          )}
          {selectedDate && selectedAvail?.closed && (
            <p className="border border-red-500/50 bg-red-500/[0.08] px-4 py-3 text-[13px] font-medium tracking-[0.04em] text-red-400">
              {t(
                "選択した日は休業日です。別の日をお選びください。",
                "This date is closed. Please choose another day."
              )}
            </p>
          )}
          {selectedDate && selectedAvail && !selectedAvail.closed && (
            <div className="flex flex-col gap-2.5 border border-border bg-background/40 px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">
                {t("カウンター空席状況", "Counter availability")}
              </p>
              {SEATINGS.map((s) => (
                <SeatDotRow
                  key={s.value}
                  label={t(s.label.ja, s.label.en)}
                  total={totalSeats}
                  remaining={
                    s.value === "s1" ? selectedAvail.s1 : selectedAvail.s2
                  }
                  highlighted={seating === s.value}
                  lang={lang}
                />
              ))}
              <p className="text-[10px] tracking-[0.04em] text-text-muted">
                {t(
                  "● 予約済   ○ 空席",
                  "● booked   ○ available"
                )}
              </p>
            </div>
          )}
        </div>

        {/* Step 3 — Party size */}
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            {t("3. 人数", "3. Party size")}
            <span className="ml-1 text-gold">*</span>
          </label>
          <div
            role="radiogroup"
            aria-label={t("人数", "Party size")}
            className="flex flex-wrap gap-2"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
              const v = String(n);
              const active = party === v;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setParty(v)}
                  className={
                    active
                      ? "btn-gold-ornate inline-flex h-12 min-w-12 items-center justify-center px-3 font-[family-name:var(--font-cinzel)] text-base font-medium tracking-[0.04em]"
                      : "btn-ornate-ghost inline-flex h-12 min-w-12 items-center justify-center px-3 font-[family-name:var(--font-cinzel)] text-base font-medium tracking-[0.04em]"
                  }
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] tracking-[0.04em] text-text-muted">
            {t("※ カウンター8席限定・最大8名まで・12歳以上", "Counter seats up to 8 guests · age 12+ only.")}
          </p>
          {/* Over-capacity warning — the party can't fit the seats still
              open for the chosen date + seating. Server still re-checks
              on submit; this is the proactive heads-up. */}
          {seatsRemaining !== null &&
            seatsRemaining > 0 &&
            Number(party) > seatsRemaining && (
              <p className="text-[12px] font-medium tracking-[0.04em] text-amber-400">
                {t(
                  `この時間帯は残り ${seatsRemaining} 席です。人数を ${seatsRemaining} 名以下にするか、別の時間帯・日付をお選びください。`,
                  `Only ${seatsRemaining} seat${seatsRemaining > 1 ? "s" : ""} left for this seating. Reduce the party to ${seatsRemaining} or pick another seating / date.`
                )}
              </p>
            )}
          {/* Live cost estimate — incl. PH 10% service charge + 12% VAT.
              UX 2026-05-06 (Persona Filipino professional / Western
              traveller) flagged the previous "tax & service not
              included" footnote as ambiguous. Surfacing the all-in
              total here removes booking hesitation. */}
          {(() => {
            const n = Number(party) || 0;
            if (n <= 0) return null;
            const menu = COURSE_PRICE.amountCentavos * n;
            const svc = Math.round(menu * 0.1);
            const vat = Math.round((menu + svc) * 0.12);
            const grand = menu + svc + vat;
            const fmt = (c: number) =>
              new Intl.NumberFormat(lang === "ja" ? "ja-JP" : "en-PH", {
                style: "currency",
                currency: "PHP",
                maximumFractionDigits: 0,
              }).format(c / 100);
            return (
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t(
                  `${n}名様 → コース ${fmt(menu)} + サービス料10% ${fmt(svc)} + VAT 12% ${fmt(vat)} = `,
                  `${n} guest${n > 1 ? "s" : ""} → course ${fmt(menu)} + service 10% ${fmt(svc)} + VAT 12% ${fmt(vat)} = `
                )}
                <span className="font-semibold text-gold">{fmt(grand)}</span>
              </p>
            );
          })()}
        </div>

        {/* Step 4 — Contact */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="res-name" className={labelClass}>
              {t("4. お名前", "4. Name")}
              <span className="ml-1 text-gold">*</span>
            </label>
            <input
              id="res-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={inputClass}
              placeholder={lang === "ja" ? "山田 太郎" : "Juan dela Cruz"}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="res-email" className={labelClass}>
              {t("5. メール", "5. Email")}
              <span className="ml-1 text-gold">*</span>
            </label>
            <input
              id="res-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="res-phone" className={labelClass}>
            {t("6. 電話番号", "6. Phone")}
            <span className="ml-1 text-gold">*</span>
          </label>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              aria-label={t("国番号", "Country code")}
              className={inputClass}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              id="res-phone"
              type="tel"
              value={phoneLocal}
              onChange={(e) => {
                // Listed-country mode: strip any "+" the guest pastes
                // so we never produce a `+63 +886...` double prefix.
                // Custom mode: keep the leading "+" since it IS the
                // country code.
                const raw = e.target.value;
                setPhoneLocal(
                  isCustomCountry ? raw : raw.replace(/\+/g, "")
                );
              }}
              required
              autoComplete={isCustomCountry ? "tel" : "tel-national"}
              inputMode="tel"
              maxLength={phoneLocalMaxLength}
              className={inputClass}
              placeholder={
                isCustomCountry
                  ? "+886 9XX XXX XXXX"
                  : countryCode === "+63"
                    ? "9XX XXX XXXX"
                    : t("番号を入力", "Phone number")
              }
            />
          </div>
          <p className="text-[11px] tracking-[0.04em] text-text-muted">
            {isCustomCountry
              ? t(
                  "国番号 (+xxx) から続けて入力してください (例: +886 9171234567)",
                  "Enter the full international number including the country code (e.g. +886 9171234567)"
                )
              : t(
                  "リスト外の国は「Other / その他」を選んでください",
                  'Select "Other" for countries not in the list'
                )}
          </p>
          {attemptedSubmit && phoneInvalid && (
            <p className="text-xs text-red-400">
              {isCustomCountry
                ? t(
                    "国番号 + を先頭に付けてください",
                    "Start with a + and country code"
                  )
                : t(
                    "+ を含めず番号のみ入力してください。リスト外の国は「Other」を選んでください",
                    'Don\'t include +. Pick "Other" for countries not listed.'
                  )}
            </p>
          )}
        </div>

        {/* Dietary restrictions — structured (separate from free-text notes
            so the kitchen sees it at a glance and the confirmation email
            can echo it back). UX 2026-05-06. */}
        <div className="flex flex-col gap-3 border border-border bg-surface/30 p-4">
          <p className={labelClass}>
            {t("食物アレルギー・食事制限 (任意)", "Dietary restrictions (optional)")}
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor="res-dietary-type" className="text-[12px] text-text-secondary">
              {t("食事タイプ", "Dietary type")}
            </label>
            <select
              id="res-dietary-type"
              value={dietaryType}
              onChange={(e) =>
                setDietaryType(e.target.value as typeof dietaryType)
              }
              className={inputClass}
            >
              <option value="none">{t("特になし", "None")}</option>
              <option value="vegetarian">{t("ベジタリアン", "Vegetarian")}</option>
              <option value="pescatarian">{t("ペスカタリアン (魚はOK)", "Pescatarian")}</option>
              <option value="halal">{t("ハラール", "Halal")}</option>
              <option value="kosher">{t("コーシャー", "Kosher")}</option>
              <option value="gluten_free">{t("グルテンフリー", "Gluten-free")}</option>
              <option value="dairy_free">{t("乳製品不可", "Dairy-free")}</option>
              <option value="other">{t("その他", "Other")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="res-allergens" className="text-[12px] text-text-secondary">
              {t("アレルギー (具体的にご記入ください)", "Specific allergens")}
            </label>
            <input
              id="res-allergens"
              type="text"
              value={allergens}
              onChange={(e) => setAllergens(e.target.value)}
              maxLength={140}
              className={inputClass}
              placeholder={
                lang === "ja"
                  ? "例: 甲殻類, 落花生, 蕎麦"
                  : "e.g. shellfish, peanuts, buckwheat"
              }
            />
          </div>

          <label className="flex items-start gap-2 text-[12px] text-text-secondary">
            <input
              type="checkbox"
              checked={allergySevere}
              onChange={(e) => setAllergySevere(e.target.checked)}
              className="mt-0.5 accent-gold"
            />
            <span>
              {t(
                "重度のアレルギー (アナフィラキシー / 病院搬送リスク)。スタッフが事前確認のためご連絡することがあります。",
                "Severe allergy (anaphylaxis / hospital risk). Our staff may contact you to confirm before service."
              )}
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <label htmlFor="res-dietary-instructions" className="text-[12px] text-text-secondary">
              {t("補足 (調理スタッフに伝えたいこと)", "Additional instructions for the kitchen")}
            </label>
            <textarea
              id="res-dietary-instructions"
              value={dietaryInstructions}
              onChange={(e) => setDietaryInstructions(e.target.value)}
              rows={2}
              maxLength={280}
              className={`${inputClass} resize-none`}
              placeholder={
                lang === "ja"
                  ? "例: 出汁の魚も不可 / ドレッシングは別添えで"
                  : "e.g. no fish-based dashi / dressing on the side"
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="res-notes" className={labelClass}>
            {t("備考 (任意)", "Notes (optional)")}
          </label>
          <textarea
            id="res-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder={
              lang === "ja"
                ? "記念日・車椅子利用・座席のご希望など"
                : "Anniversary, wheelchair access, seating preference, etc."
            }
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          {/* Deposit notice (deposit flow) — booking-policy notice (deposit-free flow) */}
          <div className="flex items-start gap-3 border border-gold/30 bg-gold/[0.04] p-4">
            <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-gold" aria-hidden="true" />
            {/* Stack the long deposit copy and the short terms-agreement
                line vertically inside the same notice — the previous
                flex-row layout pushed the terms text into a narrow
                second column and looked unbalanced once the deposit
                copy grew long. */}
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {DEPOSIT_REQUIRED
                  ? t(
                      "次の画面で 50% デポジットのお支払い (Stripe) に進みます。残金は当日現地でお支払いください。48時間前まで100%、24時間前まで50%返金いたします。",
                      "Next: pay a 50% deposit via Stripe. The balance is settled on-site. 100% refund up to 48h before; 50% up to 24h."
                    )
                  : t(
                      "送信と同時にご予約は確定し、確認メールが即時に届きます。お席の確保にはコース料金の 50% のデポジットを頂戴しております——プレミアムダイニングや特別な機会のご予約では一般的な仕組みで、本気でご来店をお考えのお客様のためにお席をお守りするためのものです。お支払い手続き (銀行振込 / GCash / カウンター現金など) は、スタッフより別途ご連絡させていただきます。残金は当日現地でお支払いください。48時間前まで100%、24時間前まで50%返金いたします。",
                      "Your reservation is confirmed on submission and a confirmation email arrives instantly. A 50% deposit of the course price secures your seat — a quality-control measure standard to premium dining and special-occasion bookings, ensuring the counter is held for guests who genuinely intend to dine with us. Our staff will be in touch separately about the payment procedure (bank transfer / GCash / cash at the counter). The balance is settled on-site. 100% refund up to 48h before; 50% up to 24h."
                    )}
              </p>
              <p className="text-[11px] leading-relaxed text-text-muted">
                {t(
                  <>
                    ご予約に進むことで、
                    <a href="/terms" className="text-gold underline underline-offset-2">ご予約規約</a>
                    と
                    <a href="/privacy" className="text-gold underline underline-offset-2">プライバシーポリシー</a>
                    に同意したものとみなされます。
                  </>,
                  <>
                    By proceeding, you agree to our
                    {" "}
                    <a href="/terms" className="text-gold underline underline-offset-2">Terms of Service</a>
                    {" "} and {" "}
                    <a href="/privacy" className="text-gold underline underline-offset-2">Privacy Policy</a>
                    .
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitDisabled}
            aria-disabled={dateMissing}
            className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-8 py-4 font-[family-name:var(--font-noto-serif)] text-base font-medium tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {t("確認中...", "Checking availability...")}
              </>
            ) : status === "redirecting" ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {DEPOSIT_REQUIRED
                  ? t("Stripe へ移動中...", "Redirecting to Stripe...")
                  : t("予約を確定中...", "Finalising reservation...")}
              </>
            ) : (
              <>
                <Send size={16} aria-hidden="true" />
                {DEPOSIT_REQUIRED
                  ? t("お席を確保 → デポジットへ", "Hold seat → Pay deposit")
                  : t("予約を確定する", "Reserve")}
              </>
            )}
          </button>

          {attemptedSubmit && dateMissing && (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm tracking-[0.04em] text-gold"
            >
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rotate-45 bg-gold" />
              {t(
                "まずご希望日をお選びください。",
                "Please pick a date above first."
              )}
            </p>
          )}

          {status === "error" && errorMsg && (
            <div
              role="alert"
              className="flex flex-col gap-3 border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-400"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={18}
                  className="mt-0.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="mb-1 font-medium">
                    {t("送信に失敗しました", "Submission failed")}
                  </p>
                  <p className="text-xs leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              {/* Capacity-specific helper: offer the other seating on the
                  same date as a one-tap swap. UX 2026-05-06 (Persona
                  Japanese expat) flagged that the previous "pick another
                  time or date" message left the user to retry manually. */}
              {errorMsg.includes(t("満席", "full")) && (
                <button
                  type="button"
                  onClick={() => {
                    setSeating(seating === "s1" ? "s2" : "s1");
                    setStatus("idle");
                    setErrorMsg(null);
                  }}
                  className="self-start border border-gold/60 bg-gold/[0.08] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.10em] text-gold hover:bg-gold/[0.20]"
                >
                  {seating === "s1"
                    ? t("→ 第2部 (20:00) で再試行", "→ Try Seating 2 (20:00)")
                    : t("→ 第1部 (17:30) で再試行", "→ Try Seating 1 (17:30)")}
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Backup: direct messaging */}
      <div className="flex flex-col gap-3 border-t border-border/60 pt-5">
        <p className="text-xs tracking-[0.2em] text-gold">
          {t("または直接メッセージ", "OR MESSAGE US DIRECTLY")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={CONTACT.whatsapp.reservationHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ornate-ghost group inline-flex items-center justify-center gap-2 px-6 py-3 font-[family-name:var(--font-noto-serif)] text-xs font-medium tracking-[0.14em]"
          >
            <MessageCircle size={16} aria-hidden="true" />
            WhatsApp
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          <a
            href={CONTACT.viber.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ornate-ghost group inline-flex items-center justify-center gap-2 px-6 py-3 font-[family-name:var(--font-noto-serif)] text-xs font-medium tracking-[0.14em]"
          >
            <ViberIcon size={16} />
            Viber
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed tracking-wide text-text-muted">
        {DEPOSIT_REQUIRED
          ? t(
              `※ コース料金 ${COURSE_PRICE.amount}(お一人様・税サ別)・デポジット50%は Stripe・残金は現地払い(現金 / カード / GCash)。キャンセルは48時間前まで100%返金、24時間前まで50%返金。`,
              `Course ${COURSE_PRICE.amount} per guest (tax & service not included). 50% deposit via Stripe; balance on-site (cash / card / GCash). 100% refund up to 48h, 50% up to 24h.`
            )
          : t(
              `※ コース料金 ${COURSE_PRICE.amount}(お一人様・税サ別)・デポジット50%(予約確認時にスタッフよりご案内)・残金は当日現地払い(現金 / カード / GCash)。月曜定休。キャンセルは48時間前まで100%返金、24時間前まで50%返金。`,
              `Course ${COURSE_PRICE.amount} per guest (tax & service not included). 50% deposit (procedure communicated by our staff at reservation confirmation); balance settled on-site (cash / card / GCash). Closed Mondays. 100% refund up to 48h, 50% up to 24h.`
            )}
      </p>
    </div>
  );
}

function humanizeErrorCode(code: string, lang: "ja" | "en"): string {
  const ja: Record<string, string> = {
    closed_date: "ご指定の日は休業日です。別の日付をお選びください。",
    capacity_exceeded: "ご指定の時間帯は満席です。別のお時間または日付をお選びください。",
    reservations_closed: "現在予約を停止しております。直接お問い合わせください。",
    validation: "入力内容をご確認ください。",
    internal: "システムエラーが発生しました。しばらくしてからお試しください。",
  };
  const en: Record<string, string> = {
    closed_date: "Selected date is closed. Please choose another date.",
    capacity_exceeded: "That seating is full. Please choose another time or date.",
    reservations_closed: "Reservations are paused. Please contact us directly.",
    validation: "Please check your inputs.",
    internal: "System error. Please try again later.",
  };
  const m = lang === "ja" ? ja : en;
  return m[code] ?? m.internal;
}
