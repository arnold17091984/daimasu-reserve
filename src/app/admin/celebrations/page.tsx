/**
 * /admin/celebrations — celebration / surprise booking dashboard.
 *
 * Shows upcoming bookings that have celebration metadata, with lead-time
 * alerts (≤ 3 days = needs prep urgently). Operator's daily review tool
 * for the kitchen + flowers + projection-mapping team.
 */
import Link from "next/link";
import { Sparkles, AlertTriangle, ArrowRight, Cake, Wine, Gift, MonitorPlay, Camera, Music, Phone, Package } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/auth/admin";
import { getAdminLang, ti, type AdminLang } from "@/lib/auth/admin-lang";
import { adminClient } from "@/lib/db/clients";
import type { Reservation } from "@/lib/db/types";
import { celebrationLabels } from "../_components/celebration-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CelebrationsPage() {
  const lang = await getAdminLang();
  const today = todayIsoDate();

  await requireAdminOrRedirect();
  const sb = adminClient();
  const { data } = await sb
    .from("reservations")
    .select("*")
    .gte("service_date", today)
    .in("status", ["pending_payment", "confirmed"])
    .not("celebration", "is", null)
    .order("service_date", { ascending: true })
    .returns<Reservation[]>();
  const rows: Reservation[] = (data ?? []).filter(
    (r) => r.celebration && r.celebration.occasion !== "none"
  );

  const labels = celebrationLabels(lang);

  // Group by lead-time buckets
  const todayList = rows.filter((r) => r.service_date === today);
  const next3Days = rows.filter((r) => {
    const days = daysBetween(today, r.service_date);
    return days >= 1 && days <= 3;
  });
  const upcoming = rows.filter((r) => daysBetween(today, r.service_date) >= 4);

  // Aggregate counts
  const stats = {
    total: rows.length,
    surprises: rows.filter((r) => r.celebration?.is_surprise).length,
    cake: rows.filter((r) => r.celebration?.deliverables.cake).length,
    flowers: rows.filter((r) => r.celebration?.deliverables.flowers).length,
    projection: rows.filter((r) => r.celebration?.deliverables.projection).length,
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-[family-name:var(--font-noto-serif)] text-2xl tracking-[0.02em] text-foreground">
          {ti(lang, "お祝い・サプライズ管理", "Celebrations")}
        </h1>
      </div>

      <p className="mb-6 admin-body text-text-secondary">
        {ti(
          lang,
          "誕生日・記念日・サプライズ予約の一覧。3日以内は要準備の警告が出ます。マッピング演出 / ケーキ / 花の手配リードタイムをここで把握。",
          "All upcoming bookings with celebration metadata. ≤ 3 days = urgent prep alert."
        )}
      </p>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={ti(lang, "登録お祝い", "Total")} value={String(stats.total)} accent />
        <Stat label={ti(lang, "サプライズ", "Surprises")} value={String(stats.surprises)} warn={stats.surprises > 0} />
        <Stat label={ti(lang, "ケーキ", "Cakes")} value={String(stats.cake)} icon={<Cake size={14} />} />
        <Stat label={ti(lang, "花束", "Flowers")} value={String(stats.flowers)} icon={<Gift size={14} />} />
        <Stat label={ti(lang, "演出", "Projection")} value={String(stats.projection)} icon={<MonitorPlay size={14} />} />
      </div>

      {/* Today */}
      {todayList.length > 0 && (
        <Section
          title={ti(lang, "本日 — 当日対応", "Today — service day")}
          tone="urgent"
          count={todayList.length}
        >
          {todayList.map((r) => (
            <CelebrationCard key={r.id} reservation={r} lang={lang} labels={labels} />
          ))}
        </Section>
      )}

      {/* Next 3 days = needs prep */}
      {next3Days.length > 0 && (
        <Section
          title={ti(lang, "3日以内 — 要準備", "Within 3 days — prep needed")}
          tone="warn"
          count={next3Days.length}
        >
          {next3Days.map((r) => (
            <CelebrationCard key={r.id} reservation={r} lang={lang} labels={labels} showPrepWarning />
          ))}
        </Section>
      )}

      {/* Beyond 3 days */}
      {upcoming.length > 0 && (
        <Section
          title={ti(lang, "今後の予定", "Upcoming")}
          count={upcoming.length}
        >
          {upcoming.map((r) => (
            <CelebrationCard key={r.id} reservation={r} lang={lang} labels={labels} />
          ))}
        </Section>
      )}

      {rows.length === 0 && (
        <p className="border border-border bg-surface px-4 py-8 text-center admin-body text-text-secondary">
          {ti(lang, "お祝いの予約はありません。", "No celebrations on file.")}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  warn,
  icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {icon}
        {label}
      </p>
      <p
        className={
          warn
            ? "mt-1 font-mono admin-num text-2xl font-semibold text-amber-400"
            : accent
              ? "mt-1 font-mono admin-num text-2xl font-semibold text-gold"
              : "mt-1 font-mono admin-num text-2xl font-semibold text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone?: "urgent" | "warn";
  count: number;
  children: React.ReactNode;
}) {
  const headerCls =
    tone === "urgent"
      ? "mb-3 flex items-center gap-2 admin-section-label !text-red-400"
      : tone === "warn"
        ? "mb-3 flex items-center gap-2 admin-section-label !text-amber-400"
        : "mb-3 flex items-center gap-2 admin-section-label";
  return (
    <section className="mb-8">
      <h2 className={headerCls}>
        {(tone === "urgent" || tone === "warn") && <AlertTriangle size={14} />}
        {tone === undefined && <Sparkles size={14} />}
        {title} <span className="font-mono">({count})</span>
      </h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function CelebrationCard({
  reservation,
  lang,
  labels,
  showPrepWarning,
}: {
  reservation: Reservation;
  lang: AdminLang;
  labels: ReturnType<typeof celebrationLabels>;
  showPrepWarning?: boolean;
}) {
  const c = reservation.celebration!;
  const d = c.deliverables;
  const dt = new Date(reservation.service_starts_at);
  const dateLabel = dt.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  });
  const timeLabel = dt.toLocaleTimeString(lang === "ja" ? "ja-JP" : "en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={
        c.is_surprise
          ? "border-2 border-amber-500/60 bg-amber-500/[0.04] p-4"
          : "border border-gold/40 bg-gold/[0.04] p-4"
      }
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="font-mono admin-num text-base font-medium text-foreground">
            {dateLabel} {timeLabel}
          </span>
          <span className="ml-3 admin-body font-medium text-foreground">
            {reservation.guest_name}
          </span>
          <span className="ml-2 admin-meta">
            {reservation.party_size}
            {ti(lang, "名", " pax")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-gold/60 bg-gold/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-gold">
            {labels.occasion(c.occasion)}
          </span>
          {c.is_surprise && (
            <span className="border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.10em] text-amber-400">
              {ti(lang, "サプライズ", "SURPRISE")}
            </span>
          )}
          {showPrepWarning && (
            <span className="border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.10em] text-red-400">
              {ti(lang, "準備急ぎ", "URGENT PREP")}
            </span>
          )}
        </div>
      </div>

      {c.celebrant.name && (
        <p className="mb-1 text-[13px] text-foreground">
          <span className="text-text-secondary">{ti(lang, "主役: ", "for: ")}</span>
          <span className="font-semibold">{c.celebrant.name}</span>
          {c.celebrant.relation && (
            <span className="ml-2 admin-meta">({labels.relation(c.celebrant.relation)})</span>
          )}
          {c.celebrant.age_label && (
            <span className="ml-2 admin-meta">{c.celebrant.age_label}</span>
          )}
        </p>
      )}

      {/* Deliverables row */}
      <div className="flex flex-wrap gap-1.5 admin-meta">
        {d.cake && (
          <DeliverableTag icon={<Cake size={12} />} label={`${ti(lang, "ケーキ", "cake")} ${d.cake.size ?? ""}${d.cake.message ? ` 「${d.cake.message}」` : ""}`} />
        )}
        {d.message_plate && (
          <DeliverableTag icon={<Sparkles size={12} />} label={`${ti(lang, "プレート", "plate")} 「${d.message_plate.message ?? ""}」`} />
        )}
        {d.flowers && (
          <DeliverableTag
            icon={<Gift size={12} />}
            label={`${ti(lang, "花", "flowers")}${d.flowers.budget_pesos ? ` ₱${d.flowers.budget_pesos}` : ""}${d.flowers.color ? ` ${d.flowers.color}` : ""}`}
          />
        )}
        {d.champagne && (
          <DeliverableTag
            icon={<Wine size={12} />}
            label={`${ti(lang, "シャンパン", "champagne")}${d.champagne.label ? ` ${d.champagne.label}` : ""}`}
          />
        )}
        {d.projection && d.projection.content && (
          <DeliverableTag icon={<MonitorPlay size={12} />} label={`${ti(lang, "演出", "projection")}`} highlight />
        )}
        {d.photo_service && <DeliverableTag icon={<Camera size={12} />} label={ti(lang, "撮影", "photos")} />}
        {d.bgm !== undefined && d.bgm && <DeliverableTag icon={<Music size={12} />} label="BGM" />}
      </div>

      {c.is_surprise && c.surprise && (
        <div className="mt-2 grid gap-1 text-[12px]">
          <div>
            <span className="admin-meta">{ti(lang, "演出タイミング: ", "Timing: ")}</span>
            <span className="text-amber-400">{labels.timing(c.surprise.timing)}</span>
            <span className="ml-3 admin-meta">{ti(lang, "来店順: ", "Arrival: ")}</span>
            <span className="text-amber-400">{labels.arrives(c.surprise.arrives_first)}</span>
          </div>
          {c.surprise.bringing_items && (
            <div className="flex items-start gap-1.5 admin-meta">
              <Package size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                {ti(lang, "持参/預かり: ", "Items: ")}
                <span className="text-foreground">{c.surprise.bringing_items}</span>
              </span>
            </div>
          )}
          {c.surprise.coordination_phone && (
            <div className="flex items-center gap-1.5 admin-meta">
              <Phone size={12} className="shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                {ti(lang, "当日連絡: ", "Coord: ")}
                <span className="text-foreground">{c.surprise.coordination_phone}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {c.notes_celebration && (
        <p className="mt-2 border-t border-gold/20 pt-2 admin-body text-text-secondary">
          {c.notes_celebration}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-3">
        <Link
          href={`/admin/reservations/${reservation.id}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.10em] text-gold hover:text-gold-light"
        >
          {ti(lang, "予約詳細", "View booking")}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function DeliverableTag({
  icon,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={
        highlight
          ? "inline-flex items-center gap-1 border border-gold/60 bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold"
          : "inline-flex items-center gap-1 border border-border bg-background px-2 py-0.5 text-[11px] text-foreground"
      }
    >
      {icon}
      {label}
    </span>
  );
}

function todayIsoDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+08:00`);
  const b = new Date(`${to}T00:00:00+08:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400_000);
}
