"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, X, Armchair } from "lucide-react";
import type { RestaurantSettings, SeatingSlot } from "@/lib/db/types";
import { autoAllocateSeats, formatPHP } from "@/lib/domain/reservation";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { CelebrationPanel, EMPTY_CELEBRATION } from "../../_components/celebration-panel";
import { CelebrationReview } from "../../_components/celebration-display";
import type { CelebrationData } from "@/lib/db/types";

import { COUNTRY_CODES, COUNTRY_OTHER } from "@/lib/constants";

interface DayCell {
  date: string;
  s1_taken: number;
  s1_seats: number[];
  s1_bookings: { guest_name: string; seats: number[] }[];
  s2_taken: number;
  s2_seats: number[];
  s2_bookings: { guest_name: string; seats: number[] }[];
  closed: boolean;
}

export function ManualBookingForm({
  lang,
  settings,
  grid,
  defaultDate,
  defaultSeating,
}: {
  lang: AdminLang;
  settings: RestaurantSettings;
  grid: DayCell[];
  defaultDate?: string;
  defaultSeating?: SeatingSlot;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const router = useRouter();

  const [date, setDate] = useState(defaultDate ?? grid[0]?.date ?? "");
  const [seating, setSeating] = useState<SeatingSlot>(defaultSeating ?? "s1");
  // Default 0 = "not yet entered" — operator types directly into NumPad.
  const [partySize, setPartySize] = useState(0);
  // offsetDays = which 14-day window to show in the calendar pane.
  // 0 = today..today+13, 7 = next week, 14 = +2 weeks, 30 = next month.
  const [offsetDays, setOffsetDays] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationData>(EMPTY_CELEBRATION);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState<string>("+63");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [email, setEmail] = useState("");
  const [guestLang, setGuestLang] = useState<"ja" | "en">("en");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"phone" | "walkin" | "staff">("phone");
  const [depositReceived, setDepositReceived] = useState(false);
  const [seatMode, setSeatMode] = useState<"auto" | "manual">("auto");
  const [pickedSeats, setPickedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cellAvail = useMemo(() => {
    const c = grid.find((g) => g.date === date);
    if (!c) return null;
    return c;
  }, [grid, date]);

  const seatTaken = cellAvail
    ? seating === "s1"
      ? cellAvail.s1_taken
      : cellAvail.s2_taken
    : 0;
  const takenSeatNumbers: number[] = useMemo(() => {
    if (!cellAvail) return [];
    return seating === "s1" ? cellAvail.s1_seats : cellAvail.s2_seats;
  }, [cellAvail, seating]);
  const slotBookings = useMemo(() => {
    if (!cellAvail) return [];
    return seating === "s1" ? cellAvail.s1_bookings : cellAvail.s2_bookings;
  }, [cellAvail, seating]);
  const takenSet = useMemo(() => new Set(takenSeatNumbers), [takenSeatNumbers]);
  const seatRemaining = Math.max(0, settings.online_seats - seatTaken);
  const dateClosed = cellAvail?.closed ?? false;
  // True if the operator typed a date outside the rendered availability
  // grid (before the first row, after the last row, or any day we don't
  // have an availability snapshot for). Treated as a hard block — without
  // a grid cell we can't check capacity.
  const dateOutOfGrid = date.length > 0 && cellAvail == null;

  const courseTotal = settings.course_price_centavos * partySize;
  const deposit = Math.floor((courseTotal * settings.deposit_pct) / 100);

  // Auto-suggest the seat block (right-back fill) whenever date / seating /
  // partySize changes and the user is in auto mode.
  const autoSuggestion = useMemo(
    () => autoAllocateSeats(settings.online_seats, takenSet, partySize),
    [settings.online_seats, takenSet, partySize]
  );

  // When switching slots, clear manual picks (different occupied set).
  // Using setState-during-render — React's recommended pattern for
  // resetting state on prop change, avoids the setState-in-effect lint.
  const slotKey = `${date}-${seating}`;
  const [lastSlotKey, setLastSlotKey] = useState(slotKey);
  if (lastSlotKey !== slotKey) {
    setLastSlotKey(slotKey);
    setPickedSeats([]);
  }

  function toggleSeat(n: number) {
    if (takenSet.has(n)) return;
    setPickedSeats((prev) => {
      const has = prev.includes(n);
      if (has) return prev.filter((s) => s !== n);
      if (prev.length >= partySize) {
        // Drop the oldest pick to keep length capped.
        return [...prev.slice(1), n];
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  }
  function clearPicks() {
    setPickedSeats([]);
  }
  function fillFromAuto() {
    if (autoSuggestion) setPickedSeats([...autoSuggestion]);
  }

  const manualPickValid =
    seatMode === "manual" &&
    pickedSeats.length === partySize &&
    pickedSeats.every((n) => !takenSet.has(n));

  // Required-field validation. With a real dial code selected, the prefix
  // is added on submit; with COUNTRY_OTHER the operator types the full
  // international number into the local field directly (must start with +).
  const trimmedName = name.trim();
  const trimmedPhoneLocal = phoneLocal.trim();
  const phoneDigits = trimmedPhoneLocal.replace(/\D/g, "");
  const isCustomCountry = countryCode === COUNTRY_OTHER;
  const fullPhone = isCustomCountry
    ? trimmedPhoneLocal
    : `${countryCode} ${trimmedPhoneLocal}`.trim();
  const nameMissing = trimmedName.length === 0;
  // Phone is optional for walk-ins (a tourist with only a hotel card
  // and no local SIM is a real recurring scenario). Online public
  // bookings still require it — this is the admin path only.
  const phoneOptional = source === "walkin" || source === "staff";
  const phoneMissing = !phoneOptional && phoneDigits.length === 0;
  // In custom-country mode the operator must type the leading "+". In
  // listed-country mode "+" anywhere in the local input is invalid (the
  // server regex rejects it; refuse on the client too with a clear message).
  const phoneInvalid = isCustomCountry
    ? !trimmedPhoneLocal.startsWith("+")
    : trimmedPhoneLocal.includes("+");
  // Codex review 2026-05-05 P2: server schema (lib/domain/schemas.ts)
  // caps guest_phone at 30 chars after the dial code is prefixed. Cap
  // the local-number maxLength relative to the chosen country code so
  // the local-only `<input maxLength=30>` cannot produce a 34-char
  // `fullPhone` that the server rejects after the operator already
  // confirmed the review screen.
  const PHONE_MAX = 30;
  // In custom mode the local field IS the full phone, so the cap equals
  // PHONE_MAX. In listed mode the prefix and joining space are added at
  // submit, so subtract them so the server-side cap can never be exceeded.
  const phoneLocalMaxLength = isCustomCountry
    ? PHONE_MAX
    : Math.max(1, PHONE_MAX - (countryCode.length + 1));
  const phoneTooLong = fullPhone.length > PHONE_MAX;
  const partySizeMissing = partySize < 1;

  // Show validation only after the first submit attempt (avoids
  // flashing errors at the user before they touch anything).
  const [showValidation, setShowValidation] = useState(false);

  // Step 1: from edit → review. Runs validation; if it passes, go to
  // the confirmation screen instead of hitting the API right away.
  function goToReview(e: React.FormEvent) {
    e.preventDefault();
    setShowValidation(true);
    if (
      nameMissing ||
      phoneMissing ||
      phoneInvalid ||
      phoneTooLong ||
      partySizeMissing ||
      dateClosed ||
      dateOutOfGrid ||
      partySize > seatRemaining ||
      (seatMode === "manual" && !manualPickValid)
    ) {
      setStatus("error");
      setErrorMsg("validation");
      return;
    }
    setStatus("idle");
    setErrorMsg(null);
    setStep("review");
    // Scroll to top so the operator immediately sees the review header.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Step 2: actually POST to the API. Only reachable from the review
  // screen, so validation has already passed.
  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setStatus("pending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_date: date,
          seating,
          party_size: partySize,
          guest_name: name,
          guest_email: email,
          // Walk-ins / staff entries can omit phone (migration 0019 +
          // schema null path). When empty in those modes, send null so
          // the schema treats the field as absent rather than rejecting
          // a "+63" stub on the regex.
          guest_phone:
            phoneOptional && phoneDigits.length === 0 ? null : fullPhone,
          guest_lang: guestLang,
          notes: notes.trim() || null,
          source,
          deposit_received: depositReceived,
          seat_numbers:
            seatMode === "manual" && pickedSeats.length === partySize
              ? pickedSeats
              : null,
          celebration:
            celebration.occasion === "none" ? null : celebration,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reservation_id?: string;
        error?: { code?: string };
      };
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.error?.code ?? "failed");
        return;
      }
      setStatus("ok");
      if (data.reservation_id) {
        router.push(`/admin/reservations/${data.reservation_id}?confirmed=1`);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network");
    }
  }

  // Render review screen when step === "review"
  if (step === "review") {
    return (
      <ReviewPanel
        lang={lang}
        date={date}
        seating={seating}
        partySize={partySize}
        guestName={trimmedName}
        guestEmail={email.trim()}
        guestPhone={fullPhone}
        guestLang={guestLang}
        notes={notes.trim()}
        source={source}
        depositReceived={depositReceived}
        seatMode={seatMode}
        pickedSeats={pickedSeats}
        autoSuggestion={autoSuggestion}
        coursePriceCentavos={settings.course_price_centavos}
        depositPct={settings.deposit_pct}
        seating1Label={settings.seating_1_label}
        seating2Label={settings.seating_2_label}
        celebration={celebration.occasion === "none" ? null : celebration}
        status={status}
        errorMsg={errorMsg}
        onConfirm={() => submit()}
        onEdit={() => {
          setStep("edit");
          setStatus("idle");
          setErrorMsg(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={goToReview} className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* LEFT — date & seat picker */}
      <div className="border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="admin-section-label">
            {ti("空席状況", "Availability")}
          </p>
          <span className="admin-meta">
            {(() => {
              const visible = grid.slice(offsetDays, offsetDays + 14);
              if (visible.length === 0) return "";
              const first = visible[0]?.date ?? "";
              const last = visible[visible.length - 1]?.date ?? "";
              return ti(
                `${first.slice(5)} 〜 ${last.slice(5)}`,
                `${first.slice(5)} → ${last.slice(5)}`
              );
            })()}
          </span>
        </div>

        {/* Window navigation */}
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setOffsetDays(0)}
            disabled={offsetDays === 0}
            className={
              offsetDays === 0
                ? "border border-gold/60 bg-gold/10 px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-gold"
                : "border border-border bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/40 hover:text-foreground"
            }
          >
            {ti("今日から", "Today")}
          </button>
          <button
            type="button"
            onClick={() => setOffsetDays(Math.max(0, offsetDays - 7))}
            disabled={offsetDays === 0}
            className="border border-border bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ti("← 1週間前", "← 1 week")}
          </button>
          <button
            type="button"
            onClick={() => setOffsetDays(Math.min(46, offsetDays + 7))}
            disabled={offsetDays >= 46}
            className="border border-border bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ti("次の週 →", "Next week →")}
          </button>
          <button
            type="button"
            onClick={() => setOffsetDays(Math.min(46, offsetDays + 30))}
            disabled={offsetDays >= 46}
            className="border border-border bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:border-gold/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ti("次の月 →", "Next month →")}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {grid.slice(offsetDays, offsetDays + 14).map((g) => (
            <DateRow
              key={g.date}
              cell={g}
              total={settings.online_seats}
              selected={g.date === date}
              currentSeating={seating}
              onPick={(d, s) => {
                setDate(d);
                if (s) setSeating(s);
              }}
              lang={lang}
            />
          ))}
        </div>
      </div>

      {/* RIGHT — form fields */}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ti("日付", "Date")}>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                // Always commit the operator's choice so they see the
                // date they picked. Closed-date / out-of-range guards run
                // via dateClosed / dateOutOfGrid below and block submit
                // with a visible message — never silently snap back.
                const next = e.target.value;
                if (next) setDate(next);
              }}
              min={grid[0]?.date}
              max={grid[grid.length - 1]?.date}
              className={inputCls}
            />
          </Field>
          <Field label={ti("時間帯", "Seating")}>
            <div className="grid grid-cols-2 gap-2">
              <SeatingButton
                active={seating === "s1"}
                onClick={() => setSeating("s1")}
                time={settings.seating_1_label}
                label={ti("1部", "Seating 1")}
              />
              <SeatingButton
                active={seating === "s2"}
                onClick={() => setSeating("s2")}
                time={settings.seating_2_label}
                label={ti("2部", "Seating 2")}
              />
            </div>
          </Field>
          <Field label={ti("人数", "Party size")}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.min(20, settings.online_seats)}
              value={partySize === 0 ? "" : String(partySize)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setPartySize(0);
                  return;
                }
                const n = parseInt(raw, 10);
                if (Number.isNaN(n)) return;
                const cap = Math.min(20, settings.online_seats);
                setPartySize(Math.min(Math.max(0, n), cap));
              }}
              placeholder={ti("人数を入力", "Enter party size")}
              className={inputCls}
            />
            {seatRemaining === 0 ? (
              <span className="border border-red-500/60 bg-red-500/[0.10] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.10em] text-red-400">
                {ti(
                  "満席です。別の日時を選んでください。",
                  "FULL — pick another slot."
                )}
              </span>
            ) : partySize === 0 ? (
              <span className="text-[12px] font-medium text-text-secondary">
                {ti(
                  `人数を入力してください (この時間帯は ${seatRemaining} 名分まで)`,
                  `Enter party size (up to ${seatRemaining} for this slot)`
                )}
              </span>
            ) : partySize > seatRemaining ? (
              <span className="border border-red-500/60 bg-red-500/[0.10] px-3 py-1.5 text-[12px] font-medium text-red-400">
                {ti(
                  `${partySize}名は入りません。残り ${seatRemaining} 名分の枠しかありません。`,
                  `${partySize} guests won't fit — only ${seatRemaining} seat${seatRemaining > 1 ? "s" : ""} left in this slot.`
                )}
              </span>
            ) : seatRemaining <= 1 ? (
              <span className="text-[12px] font-medium text-amber-400">
                {ti(`残り ${seatRemaining} 名分のみ`, `Only ${seatRemaining} seat left`)}
              </span>
            ) : (
              <span className="admin-meta normal-case tracking-normal">
                {ti(
                  `この時間帯の残り席: ${seatRemaining} 名分`,
                  `Seats remaining this slot: ${seatRemaining}`
                )}
              </span>
            )}
          </Field>
          <Field label={ti("経路", "Source")}>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className={inputCls}
            >
              <option value="phone">{ti("電話", "Phone")}</option>
              <option value="walkin">{ti("来店", "Walk-in")}</option>
              <option value="staff">{ti("スタッフ手動", "Staff manual")}</option>
            </select>
          </Field>
        </div>

        {/* Seat picker — auto by default, opt-in manual */}
        <div className="border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                {ti("席の指定", "Seat assignment")}
              </p>
              <p className="mt-0.5 admin-meta normal-case tracking-normal">
                {seatMode === "auto"
                  ? autoSuggestion
                    ? ti(
                        `自動: 席 ${autoSuggestion.join(", ")} (右奥から詰めて配置)`,
                        `Auto: seats ${autoSuggestion.join(", ")} (filled from the back)`
                      )
                    : ti("自動: 連続した空き席なし", "Auto: no contiguous block")
                  : ti(
                      `手動: ${pickedSeats.length}/${partySize} 選択中`,
                      `Manual: ${pickedSeats.length}/${partySize} picked`
                    )}
              </p>
            </div>
            <div className="flex items-center gap-1 border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setSeatMode("auto")}
                className={
                  seatMode === "auto"
                    ? "px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.10em] bg-gold text-background"
                    : "px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:text-foreground"
                }
                style={seatMode === "auto" ? { color: "var(--background)" } : undefined}
              >
                {ti("自動", "Auto")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeatMode("manual");
                  if (pickedSeats.length === 0 && autoSuggestion) {
                    setPickedSeats([...autoSuggestion]);
                  }
                }}
                className={
                  seatMode === "manual"
                    ? "px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.10em] bg-gold text-background"
                    : "px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary hover:text-foreground"
                }
                style={seatMode === "manual" ? { color: "var(--background)" } : undefined}
              >
                {ti("手動", "Manual")}
              </button>
            </div>
          </div>

          <SeatPickerGrid
            totalSeats={settings.online_seats}
            takenSet={takenSet}
            pickedSeats={pickedSeats}
            autoSuggestion={seatMode === "auto" ? autoSuggestion : null}
            onToggle={toggleSeat}
            disabled={seatMode === "auto"}
            slotBookings={slotBookings}
            lang={lang}
          />

          {seatMode === "manual" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className={
                pickedSeats.length === 0
                  ? "admin-meta"
                  : manualPickValid
                    ? "text-[12px] font-medium text-foreground"
                    : "text-[12px] font-medium text-amber-400"
              }>
                {pickedSeats.length === 0
                  ? ti("空席をタップして選択", "Tap empty seats to pick")
                  : manualPickValid
                    ? ti(
                        `席 ${pickedSeats.join(", ")} を確保 ✓`,
                        `Seats ${pickedSeats.join(", ")} ready ✓`
                      )
                    : ti(
                        `あと ${partySize - pickedSeats.length} 席選んでください`,
                        `Pick ${partySize - pickedSeats.length} more`
                      )}
              </span>
              <div className="flex gap-2 text-[11px] uppercase tracking-[0.10em]">
                <button
                  type="button"
                  onClick={fillFromAuto}
                  disabled={!autoSuggestion}
                  className="border border-border px-3 py-1.5 text-text-secondary hover:border-gold/40 hover:text-gold disabled:opacity-40"
                >
                  {ti("自動で埋める", "Fill auto")}
                </button>
                <button
                  type="button"
                  onClick={clearPicks}
                  disabled={pickedSeats.length === 0}
                  className="border border-border px-3 py-1.5 text-text-secondary hover:border-gold/40 disabled:opacity-40"
                >
                  {ti("クリア", "Clear")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ti("お客様名 *", "Guest name *")}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ti("例: 山田 太郎", "e.g. Yamada Taro")}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={80}
              required
              className={inputCls}
            />
            {showValidation && nameMissing && (
              <span className="text-[12px] font-medium text-red-400">
                {ti("お客様名が入力されていません", "Guest name is required")}
              </span>
            )}
          </Field>
          <Field
            label={
              phoneOptional
                ? ti("電話番号 (任意)", "Phone (optional)")
                : ti("電話番号 *", "Phone *")
            }
          >
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={inputCls}
                aria-label={ti("国番号", "Country code")}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="tel"
                autoComplete={isCustomCountry ? "tel" : "tel-national"}
                value={phoneLocal}
                onChange={(e) => {
                  // Listed-country mode: strip any "+" the operator pastes
                  // so we never produce `+63 +886...` (Codex 2026-05-06).
                  // Custom mode: preserve the leading "+" since it IS the
                  // country code.
                  const raw = e.target.value;
                  setPhoneLocal(isCustomCountry ? raw : raw.replace(/\+/g, ""));
                }}
                placeholder={
                  isCustomCountry
                    ? "+886 9XX XXX XXXX"
                    : countryCode === "+63"
                      ? "9XX XXX XXXX"
                      : ti("番号を入力", "Phone number")
                }
                maxLength={phoneLocalMaxLength}
                required={!phoneOptional}
                className={inputCls}
              />
            </div>
            <span className="admin-meta normal-case tracking-normal">
              {isCustomCountry
                ? ti(
                    "国番号 (+xxx) から続けて入力してください",
                    "Type the full international number including the country code (+xxx)"
                  )
                : ti(
                    "リスト外の国は「Other / その他」を選んでください",
                    "Pick \"Other\" for countries not in the list"
                  )}
            </span>
            {showValidation && phoneMissing && (
              <span className="text-[12px] font-medium text-red-400">
                {ti("電話番号が入力されていません", "Phone number is required")}
              </span>
            )}
            {showValidation && !phoneMissing && phoneInvalid && (
              <span className="text-[12px] font-medium text-red-400">
                {isCustomCountry
                  ? ti(
                      "国番号 + を先頭に付けてください (例: +886 9171234567)",
                      "Start with a + and country code (e.g. +886 9171234567)"
                    )
                  : ti(
                      "+ を含めず番号のみ入力してください。リスト外の国は「Other」を選んでください",
                      "Don't include +. Pick \"Other\" for countries not listed."
                    )}
              </span>
            )}
            {showValidation && !phoneMissing && !phoneInvalid && phoneTooLong && (
              <span className="text-[12px] font-medium text-red-400">
                {ti(
                  `電話番号は国番号を含めて${PHONE_MAX}文字以内にしてください`,
                  `Phone number must be ${PHONE_MAX} characters or fewer including the country code`,
                )}
              </span>
            )}
          </Field>
          <Field label={ti("メール (任意)", "Email (optional)")}>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guest@example.com"
              maxLength={254}
              className={inputCls}
            />
          </Field>
          <Field label={ti("お客様の言語", "Guest language")}>
            <select
              value={guestLang}
              onChange={(e) => setGuestLang(e.target.value as "ja" | "en")}
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </Field>
        </div>

        <Field label={ti("備考 (アレルギー・記念日など)", "Notes (allergies, occasion)")}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={ti(
              "例: 乳製品アレルギー / 誕生日サプライズ",
              "e.g. dairy allergy, birthday surprise"
            )}
            rows={4}
            maxLength={280}
            className={`${inputCls} resize-y`}
          />
          <span className="admin-meta normal-case tracking-normal">
            {ti(
              "Telegram / メールでスタッフに共有されます。",
              "Visible to staff in Telegram / email."
            )}
          </span>
        </Field>

        <CelebrationPanel
          value={celebration}
          onChange={setCelebration}
          lang={lang}
        />

        <div className="border border-border bg-background/40 p-4">
          <div className="grid gap-1 text-[12px]">
            <PriceRow
              label={ti("コース料金", "Course price")}
              value={`${formatPHP(settings.course_price_centavos, lang)} × ${partySize}`}
            />
            <PriceRow
              label={ti("合計", "Total")}
              value={formatPHP(courseTotal, lang)}
            />
            <PriceRow
              label={ti(`デポジット (${settings.deposit_pct}%)`, `Deposit (${settings.deposit_pct}%)`)}
              value={formatPHP(deposit, lang)}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={depositReceived}
              onChange={(e) => setDepositReceived(e.target.checked)}
              className="accent-gold"
            />
            <span className="text-foreground">
              {ti(
                "現金でデポジットを既に受領済み (記録に追加)",
                "Cash deposit already received (record it)"
              )}
            </span>
          </label>
        </div>

        {dateClosed && (
          <p className="border border-red-500/40 bg-red-500/[0.06] px-3 py-2 text-[13px] font-medium text-red-400">
            {ti(
              "選択した日は休業日に設定されています。",
              "Selected date is marked as closed."
            )}
          </p>
        )}
        {dateOutOfGrid && (
          <p className="border border-red-500/40 bg-red-500/[0.06] px-3 py-2 text-[13px] font-medium text-red-400">
            {ti(
              "選択した日は予約可能期間外です。空席表から日付を選び直してください。",
              "Selected date is outside the bookable window. Pick a date from the availability table."
            )}
          </p>
        )}
        {!dateClosed && !dateOutOfGrid && seatRemaining === 0 && (
          <p className="border border-red-500/60 bg-red-500/[0.10] px-4 py-3 text-[14px] font-bold uppercase tracking-[0.08em] text-red-400">
            {ti(
              "この時間帯は満席です。別の日時を選んでください。",
              "This slot is FULL. Please pick another date or seating."
            )}
          </p>
        )}
        {!dateClosed && !dateOutOfGrid && seatRemaining > 0 && partySize > seatRemaining && (
          <div className="border border-red-500/60 bg-red-500/[0.10] px-4 py-3">
            <p className="text-[14px] font-bold text-red-400">
              {ti(
                `${partySize}名は入りません`,
                `${partySize} guests won't fit`
              )}
            </p>
            <p className="mt-1 text-[13px] text-red-400/90">
              {ti(
                `この時間帯は残り ${seatRemaining} 名分の枠しかありません。人数を ${seatRemaining}名以下に減らすか、別の日時を選んでください。`,
                `This slot has only ${seatRemaining} seat${seatRemaining > 1 ? "s" : ""} left. Reduce party to ${seatRemaining} or pick another slot.`
              )}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={
            status === "pending" ||
            dateClosed ||
            dateOutOfGrid ||
            partySize < 1 ||
            partySize > seatRemaining ||
            (seatMode === "manual" && !manualPickValid)
          }
          className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium tracking-[0.14em] disabled:opacity-50"
        >
          {ti("入力内容を確認する →", "Review entry →")}
        </button>

        {status === "error" && errorMsg === "validation" && (
          <div className="border border-red-500/60 bg-red-500/[0.10] px-4 py-3">
            <p className="text-[14px] font-bold text-red-400">
              {ti(
                "必須項目が入力されていません",
                "Required fields are missing"
              )}
            </p>
            <ul className="mt-1 list-disc pl-5 text-[13px] text-red-400/90">
              {nameMissing && (
                <li>{ti("お客様名", "Guest name")}</li>
              )}
              {phoneMissing && (
                <li>{ti("電話番号", "Phone number")}</li>
              )}
              {!phoneMissing && phoneInvalid && (
                <li>
                  {ti(
                    "電話番号の書式 (国番号と + の扱い)",
                    "Phone format (country code / + usage)"
                  )}
                </li>
              )}
              {partySizeMissing && (
                <li>{ti("人数", "Party size")}</li>
              )}
            </ul>
          </div>
        )}
        {status === "error" && errorMsg !== "validation" && (
          <p className="text-[13px] text-red-400">
            {errorMsg === "capacity_exceeded"
              ? ti(
                  "席が足りません。別の時間帯を選んでください。",
                  "Capacity exceeded. Pick a different slot."
                )
              : errorMsg === "closed_date"
                ? ti("選択した日は休業日です。", "Selected date is closed.")
                : errorMsg === "seat_conflict"
                  ? ti(
                      "選択した席は既に予約されています。再選択してください。",
                      "Selected seats conflict. Please re-pick."
                    )
                  : errorMsg ?? ti("登録に失敗しました。", "Failed to save.")}
          </p>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:border-gold/60 focus:outline-none";

function SeatPickerGrid({
  totalSeats,
  takenSet,
  pickedSeats,
  autoSuggestion,
  onToggle,
  disabled,
  slotBookings,
  lang,
}: {
  totalSeats: number;
  takenSet: Set<number>;
  pickedSeats: number[];
  autoSuggestion: number[] | null;
  onToggle: (n: number) => void;
  disabled: boolean;
  slotBookings: { guest_name: string; seats: number[] }[];
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const pickedSet = new Set(pickedSeats);
  const autoSet = new Set(autoSuggestion ?? []);

  return (
    <div>
      {/* Counter rail */}
      <div className="mb-2 flex items-center justify-between border-y border-gold/40 bg-gold/[0.04] px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
          {ti("檜カウンター 8m (奥 →)", "Hinoki counter (back →)")}
        </span>
        <span className="font-mono admin-num text-[11px] text-text-muted">
          {takenSet.size}/{totalSeats}
        </span>
      </div>

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(totalSeats, 8)}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: totalSeats }, (_, i) => {
          const n = i + 1;
          const isTaken = takenSet.has(n);
          const isPicked = pickedSet.has(n);
          const isAuto = autoSet.has(n);
          const owner = slotBookings.find((b) => b.seats.includes(n));
          let cls =
            "relative flex aspect-square flex-col items-center justify-center border text-[11px] transition-colors";
          if (isTaken) {
            cls +=
              " border-red-500/60 bg-red-500/[0.12] text-red-400 cursor-not-allowed";
          } else if (isPicked) {
            cls +=
              " border-gold bg-gold/20 text-gold font-semibold cursor-pointer";
          } else if (isAuto) {
            cls +=
              " border-gold/50 bg-gold/[0.08] text-gold/80 cursor-default";
          } else {
            cls +=
              " border-border bg-background text-text-secondary cursor-pointer hover:border-gold/40 hover:text-foreground";
          }
          if (disabled && !isTaken) cls += " opacity-90";
          return (
            <button
              key={n}
              type="button"
              disabled={isTaken || disabled}
              onClick={() => onToggle(n)}
              className={cls}
              title={
                isTaken
                  ? `${n}番 — 予約済${owner ? ` (${owner.guest_name})` : ""}`
                  : isPicked
                    ? ti(`${n}番 — 選択中`, `Seat ${n} — picked`)
                    : isAuto
                      ? ti(`${n}番 — 自動候補`, `Seat ${n} — auto`)
                      : ti(`${n}番 — 空席`, `Seat ${n} — open`)
              }
            >
              <span className="absolute left-1 top-0.5 font-mono text-[9px] opacity-70">
                {n}
              </span>
              {isTaken ? (
                <X size={20} strokeWidth={2.5} aria-hidden="true" />
              ) : isPicked ? (
                <Armchair size={20} strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <Armchair size={18} strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 admin-meta">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-3 w-3 items-center justify-center border border-red-500/60 bg-red-500/15">
            <X size={8} strokeWidth={3} className="text-red-400" />
          </span>
          {ti("予約済", "booked")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 border border-gold bg-gold/20" />
          {ti("選択中", "picked")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 border border-gold/50 bg-gold/[0.08]" />
          {ti("自動候補", "auto")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 border border-border bg-background" />
          {ti("空席", "open")}
        </span>
      </div>
    </div>
  );
}

function SeatingButton({
  active,
  onClick,
  time,
  label,
}: {
  active: boolean;
  onClick: () => void;
  time: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex h-14 flex-col items-center justify-center border-2 border-gold bg-gold/[0.08] px-3 text-foreground"
          : "flex h-14 flex-col items-center justify-center border border-border bg-background text-text-secondary hover:border-gold/50 hover:text-foreground"
      }
    >
      <span className="font-mono admin-num text-base font-semibold">
        {time}
      </span>
      <span className="text-[11px] uppercase tracking-[0.10em]">{label}</span>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/30 py-1 last:border-b-0">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function DateRow({
  cell,
  total,
  selected,
  currentSeating,
  onPick,
  lang,
}: {
  cell: DayCell;
  total: number;
  selected: boolean;
  currentSeating: SeatingSlot;
  onPick: (date: string, seating?: SeatingSlot) => void;
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const dt = new Date(`${cell.date}T00:00:00+08:00`);
  const dow = dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
  });
  const monthDay = dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
  });
  const s1Full = cell.s1_taken >= total;
  const s2Full = cell.s2_taken >= total;
  return (
    <button
      type="button"
      onClick={() => onPick(cell.date, currentSeating)}
      disabled={cell.closed}
      className={
        selected
          ? "grid grid-cols-[60px_1fr_1fr] items-center gap-2 border border-gold/60 bg-gold/10 px-3 py-2 text-left text-[12px]"
          : cell.closed
            ? "grid grid-cols-[60px_1fr_1fr] items-center gap-2 border border-border/30 bg-background/20 px-3 py-2 text-left text-[12px] text-text-muted/60"
            : "grid grid-cols-[60px_1fr_1fr] items-center gap-2 border border-border/40 bg-background/30 px-3 py-2 text-left text-[12px] hover:border-gold/40 hover:bg-surface/60"
      }
    >
      <span className="font-mono">
        <span className="block">{monthDay}</span>
        <span className="block text-[11px] text-text-secondary">{dow}</span>
      </span>
      <SlotBadge
        slot="s1"
        taken={cell.s1_taken}
        total={total}
        full={s1Full}
        closed={cell.closed}
        active={selected && currentSeating === "s1"}
        onClick={(e) => {
          e.stopPropagation();
          if (!cell.closed) onPick(cell.date, "s1");
        }}
        label={ti("1部", "S1")}
        lang={lang}
      />
      <SlotBadge
        slot="s2"
        taken={cell.s2_taken}
        total={total}
        full={s2Full}
        closed={cell.closed}
        active={selected && currentSeating === "s2"}
        onClick={(e) => {
          e.stopPropagation();
          if (!cell.closed) onPick(cell.date, "s2");
        }}
        label={ti("2部", "S2")}
        lang={lang}
      />
    </button>
  );
}

function SlotBadge({
  taken,
  total,
  full,
  closed,
  active,
  onClick,
  label,
  lang,
}: {
  slot: SeatingSlot;
  taken: number;
  total: number;
  full: boolean;
  closed: boolean;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  lang: AdminLang;
}) {
  const remaining = Math.max(0, total - taken);
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  return (
    <span
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center justify-between gap-1.5 border border-gold bg-gold/15 px-2 py-1 text-[11px] font-medium text-gold"
          : closed
            ? "inline-flex items-center justify-between gap-1.5 border border-border/40 bg-background/40 px-2 py-1 text-[11px] font-medium text-text-muted"
            : full
              ? "inline-flex items-center justify-between gap-1.5 border border-red-500/60 bg-red-500/15 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-red-400"
              : remaining <= 1
                ? "inline-flex items-center justify-between gap-1.5 border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400"
                : "inline-flex items-center justify-between gap-1.5 border border-border/40 bg-card px-2 py-1 text-[11px] font-medium text-foreground"
      }
    >
      <span className="font-mono">{label}</span>
      {full ? (
        <span className="font-mono uppercase tracking-[0.06em]">
          {ti("満席", "FULL")}
        </span>
      ) : (
        <span className="font-mono admin-num">
          {taken}/{total}
        </span>
      )}
    </span>
  );
}

function ReviewPanel({
  lang,
  date,
  seating,
  partySize,
  guestName,
  guestEmail,
  guestPhone,
  guestLang,
  notes,
  source,
  depositReceived,
  seatMode,
  pickedSeats,
  autoSuggestion,
  coursePriceCentavos,
  depositPct,
  seating1Label,
  seating2Label,
  celebration,
  status,
  errorMsg,
  onConfirm,
  onEdit,
}: {
  lang: AdminLang;
  date: string;
  seating: SeatingSlot;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestLang: "ja" | "en";
  notes: string;
  source: "phone" | "walkin" | "staff";
  depositReceived: boolean;
  seatMode: "auto" | "manual";
  pickedSeats: number[];
  autoSuggestion: number[] | null;
  coursePriceCentavos: number;
  depositPct: number;
  seating1Label: string;
  seating2Label: string;
  celebration: CelebrationData | null;
  status: "idle" | "pending" | "ok" | "error";
  errorMsg: string | null;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const courseTotal = coursePriceCentavos * partySize;
  const deposit = Math.floor((courseTotal * depositPct) / 100);
  const balance = courseTotal - deposit;
  const dateObj = new Date(`${date}T00:00:00+08:00`);
  const dateLabel = dateObj.toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-PH",
    {
      timeZone: "Asia/Manila",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
  const seatLabel =
    seating === "s1"
      ? `${seating1Label} (${ti("1部", "Seating 1")})`
      : `${seating2Label} (${ti("2部", "Seating 2")})`;
  const sourceLabel =
    source === "phone"
      ? ti("電話", "Phone")
      : source === "walkin"
        ? ti("来店", "Walk-in")
        : ti("スタッフ手動", "Staff manual");
  const seatsToShow =
    seatMode === "manual" ? pickedSeats : (autoSuggestion ?? []);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 border-b border-border pb-5">
        <p className="admin-section-label">
          {ti("入力内容の確認", "Review your entry")}
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti("この情報でお間違いないですか?", "Is this information correct?")}
        </h2>
        <p className="mt-2 admin-body text-text-secondary">
          {ti(
            "「これで予約する」を押すと予約が確定します。修正がある場合は下のボタンから入力画面に戻ってください。",
            "Press “Confirm booking” to finalize. Use the edit button below to return to the form."
          )}
        </p>
      </header>

      {/* Booking details */}
      <section className="mb-6 border border-border bg-surface">
        <Row label={ti("日付", "Date")} value={dateLabel} accent />
        <Row label={ti("時間帯", "Seating")} value={seatLabel} accent />
        <Row
          label={ti("人数", "Party size")}
          value={`${partySize} ${ti("名", "guests")}`}
          accent
        />
        <Row
          label={ti("席番号", "Seats")}
          value={
            seatsToShow.length > 0
              ? `${seatsToShow.join(", ")} ${
                  seatMode === "manual"
                    ? ti("(手動指定)", "(manual)")
                    : ti("(自動・右奥から)", "(auto · right-back)")
                }`
              : ti("自動 (送信時に確定)", "Auto (assigned on submit)")
          }
        />
      </section>

      {/* Guest */}
      <section className="mb-6 border border-border bg-surface">
        <Row label={ti("お客様名", "Guest name")} value={guestName} accent />
        <Row label={ti("電話番号", "Phone")} value={guestPhone} accent />
        <Row
          label={ti("メール", "Email")}
          value={guestEmail || ti("(未入力)", "(blank)")}
          dim={!guestEmail}
        />
        <Row
          label={ti("お客様の言語", "Guest language")}
          value={guestLang === "ja" ? "日本語" : "English"}
        />
        <Row label={ti("経路", "Source")} value={sourceLabel} />
        <Row
          label={ti("備考", "Notes")}
          value={notes || ti("(なし)", "(none)")}
          dim={!notes}
          multiline
        />
      </section>

      {celebration && <CelebrationReview celebration={celebration} lang={lang} />}

      {/* Money */}
      <section className="mb-6 border border-border bg-surface">
        <p className="border-b border-border px-4 py-3 admin-section-label">
          {ti("料金内訳", "Pricing breakdown")}
        </p>
        <Row
          label={ti("コース料金", "Course price")}
          value={`${formatPHP(coursePriceCentavos, lang)} × ${partySize}`}
        />
        <Row
          label={ti("合計", "Total")}
          value={formatPHP(courseTotal, lang)}
          accent
        />
        <Row
          label={ti(`デポジット (${depositPct}%)`, `Deposit (${depositPct}%)`)}
          value={
            depositReceived
              ? `${formatPHP(deposit, lang)} ${ti("(現金受領済)", "(cash received)")}`
              : `${formatPHP(deposit, lang)} ${ti("(未受領)", "(not received)")}`
          }
        />
        <Row
          label={ti("店舗精算 (残金)", "Balance on-site")}
          value={formatPHP(balance, lang)}
        />
      </section>

      {status === "error" && errorMsg && errorMsg !== "validation" && (
        <div className="mb-4 border border-red-500/60 bg-red-500/[0.10] px-4 py-3 text-[13px] text-red-400">
          {errorMsg === "capacity_exceeded"
            ? ti(
                "席が足りません。修正してから再送してください。",
                "Capacity exceeded. Please edit and retry."
              )
            : errorMsg === "closed_date"
              ? ti("選択した日は休業日です。", "Selected date is closed.")
              : errorMsg === "seat_conflict"
                ? ti(
                    "選択した席は他の予約と重複しています。",
                    "Selected seats conflict with another booking."
                  )
                : ti(`登録に失敗しました: ${errorMsg}`, `Failed: ${errorMsg}`)}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onEdit}
          disabled={status === "pending"}
          className="inline-flex items-center justify-center border border-border bg-surface px-6 py-3.5 text-sm font-medium text-foreground hover:border-gold/50 disabled:opacity-50"
        >
          {ti("← 予約情報を修正する", "← Edit booking")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={status === "pending"}
          className="btn-gold-ornate inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold tracking-[0.10em] disabled:opacity-60"
        >
          {status === "pending" ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              {ti("予約中...", "Confirming...")}
            </>
          ) : status === "ok" ? (
            <>
              <CheckCircle2 size={16} aria-hidden="true" />
              {ti("予約完了", "Confirmed")}
            </>
          ) : (
            ti("✓ 間違いないからこれで予約する", "✓ Confirm booking")
          )}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  dim,
  multiline,
}: {
  label: string;
  value: string;
  accent?: boolean;
  dim?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      className={
        multiline
          ? "grid grid-cols-[140px_1fr] gap-4 border-b border-border/50 px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr]"
          : "flex items-baseline justify-between gap-4 border-b border-border/50 px-4 py-3 last:border-b-0"
      }
    >
      <span className="text-[12px] font-medium uppercase tracking-[0.10em] text-text-secondary">
        {label}
      </span>
      <span
        className={
          dim
            ? "admin-body text-text-muted"
            : accent
              ? "text-base font-semibold text-foreground"
              : "admin-body text-foreground"
        }
      >
        {multiline ? (
          <span className="whitespace-pre-line break-words">{value}</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
