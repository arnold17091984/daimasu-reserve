/**
 * Read-only celebration display blocks. Used by review screen, detail
 * page, customer history, and service sheet (compact + full variants).
 *
 * Pure server-renderable (no client hooks).
 */
import { Sparkles, Cake, Gift, Wine, MonitorPlay, Camera, Music, AlertCircle } from "lucide-react";
import type { CelebrationData } from "@/lib/db/types";
import type { AdminLang } from "@/lib/auth/admin-lang";

export function celebrationLabels(lang: AdminLang) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  return {
    occasion: (o: CelebrationData["occasion"]): string => {
      const map: Record<CelebrationData["occasion"], { ja: string; en: string }> = {
        none: { ja: "通常", en: "None" },
        birthday: { ja: "誕生日", en: "Birthday" },
        anniversary: { ja: "記念日", en: "Anniversary" },
        proposal: { ja: "プロポーズ", en: "Proposal" },
        milestone_age: { ja: "歳祝い", en: "Milestone age" },
        business: { ja: "接待・昇進", en: "Business" },
        farewell: { ja: "送別・歓迎会", en: "Farewell" },
        other: { ja: "その他", en: "Other" },
      };
      return ti(map[o].ja, map[o].en);
    },
    relation: (r?: NonNullable<CelebrationData["celebrant"]["relation"]>): string => {
      if (!r) return ti("(未設定)", "—");
      const map = {
        self: { ja: "本人", en: "Self" },
        spouse: { ja: "配偶者", en: "Spouse" },
        partner: { ja: "恋人", en: "Partner" },
        parent: { ja: "親", en: "Parent" },
        child: { ja: "子", en: "Child" },
        friend: { ja: "友人", en: "Friend" },
        colleague: { ja: "同僚", en: "Colleague" },
        other: { ja: "その他", en: "Other" },
      };
      return ti(map[r].ja, map[r].en);
    },
    gender: (g?: NonNullable<CelebrationData["celebrant"]["gender"]>): string => {
      if (!g) return "—";
      return g === "f" ? ti("女性", "Female") : g === "m" ? ti("男性", "Male") : ti("不問", "—");
    },
    timing: (t: NonNullable<CelebrationData["surprise"]>["timing"]): string => {
      const map = {
        arrival: { ja: "着席直後", en: "On arrival" },
        mid_course: { ja: "途中の一皿で", en: "Mid-course" },
        dessert: { ja: "デザート時", en: "At dessert" },
        farewell: { ja: "お見送り時", en: "On farewell" },
        custom: { ja: "指定タイミング", en: "Custom" },
      };
      return ti(map[t].ja, map[t].en);
    },
    arrives: (a: NonNullable<CelebrationData["surprise"]>["arrives_first"]): string => {
      const map = {
        booker: { ja: "予約者が先", en: "Booker first" },
        celebrant: { ja: "主役が先", en: "Celebrant first" },
        together: { ja: "一緒に来店", en: "Together" },
      };
      return ti(map[a].ja, map[a].en);
    },
  };
}

/** Single-line summary used inside service-sheet rows + customer history. */
export function celebrationSummaryLine(
  c: CelebrationData,
  lang: AdminLang
): string {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const labels = celebrationLabels(lang);
  const parts: string[] = [];
  parts.push(labels.occasion(c.occasion));
  if (c.is_surprise) parts.push(ti("【サプライズ】", "[SURPRISE]"));
  if (c.celebrant.name) parts.push(ti(`主役: ${c.celebrant.name}`, `for: ${c.celebrant.name}`));
  const ds: string[] = [];
  if (c.deliverables.cake) ds.push(ti("ケーキ", "cake"));
  if (c.deliverables.message_plate) ds.push(ti("プレート", "plate"));
  if (c.deliverables.flowers) ds.push(ti("花", "flowers"));
  if (c.deliverables.champagne) ds.push(ti("シャンパン", "champagne"));
  if (c.deliverables.projection) ds.push(ti("演出", "projection"));
  if (c.deliverables.photo_service) ds.push(ti("撮影", "photos"));
  if (c.deliverables.bgm !== undefined && c.deliverables.bgm) ds.push("BGM");
  if (ds.length > 0) parts.push(ti(`要: ${ds.join("/")}`, `needs: ${ds.join(", ")}`));
  if (c.surprise?.timing)
    parts.push(ti(`(${labels.timing(c.surprise.timing)})`, `(${labels.timing(c.surprise.timing)})`));
  return parts.join(" · ");
}

/** Full block used on review screen + detail page + dashboard. */
export function CelebrationReview({
  celebration,
  lang,
}: {
  celebration: CelebrationData;
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const labels = celebrationLabels(lang);
  const c = celebration;
  const d = c.deliverables;

  return (
    <section className="mb-6 border-2 border-gold/60 bg-gold/[0.05]">
      <header className="flex items-center gap-2 border-b border-gold/40 px-4 py-3">
        <Sparkles size={16} className="text-gold" aria-hidden="true" />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
          {ti("お祝い・サプライズ", "Celebration / surprise")}
        </p>
        {c.is_surprise && (
          <span className="border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.10em] text-amber-400">
            {ti("サプライズ", "SURPRISE")}
          </span>
        )}
      </header>

      <div className="grid gap-px bg-border/30 sm:grid-cols-2">
        <Cell label={ti("お祝いの種類", "Occasion")} value={labels.occasion(c.occasion)} accent />
        <Cell
          label={ti("主役のお名前", "Celebrant")}
          value={c.celebrant.name || ti("(未入力)", "(blank)")}
          accent={!!c.celebrant.name}
        />
        <Cell label={ti("関係", "Relation")} value={labels.relation(c.celebrant.relation)} />
        <Cell label={ti("性別", "Gender")} value={labels.gender(c.celebrant.gender)} />
        <Cell
          label={ti("年代・節目", "Age / milestone")}
          value={c.celebrant.age_label ?? "—"}
        />
        {c.occasion === "other" && (
          <Cell
            label={ti("お祝いの内容", "Occasion detail")}
            value={c.occasion_other ?? "—"}
          />
        )}
      </div>

      {/* Surprise logistics */}
      {c.is_surprise && c.surprise && (
        <div className="border-t-2 border-amber-500/40 bg-amber-500/[0.05]">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">
            {ti("サプライズ詳細", "Surprise logistics")}
          </p>
          <div className="grid gap-px bg-border/30 sm:grid-cols-2">
            <Cell label={ti("演出のタイミング", "Timing")} value={labels.timing(c.surprise.timing)} />
            <Cell label={ti("来店順序", "Arrival order")} value={labels.arrives(c.surprise.arrives_first)} />
            {c.surprise.timing === "custom" && c.surprise.timing_custom && (
              <Cell
                label={ti("タイミング詳細", "Timing detail")}
                value={c.surprise.timing_custom}
              />
            )}
            {c.surprise.coordination_phone && (
              <Cell
                label={ti("当日連絡先", "Coordination phone")}
                value={c.surprise.coordination_phone}
              />
            )}
            {c.surprise.bringing_items && (
              <Cell
                label={ti("持参物", "Items to hold")}
                value={c.surprise.bringing_items}
                fullWidth
              />
            )}
          </div>
        </div>
      )}

      {/* Deliverables */}
      {(d.cake || d.message_plate || d.flowers || d.champagne || d.projection || d.photo_service || d.bgm) && (
        <div className="border-t border-gold/40">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
            {ti("ご用意するもの", "Deliverables")}
          </p>
          <ul className="divide-y divide-border/30">
            {d.cake && (
              <DeliverableLi icon={<Cake size={16} />}>
                <strong>{ti("ホールケーキ", "Cake")}</strong>
                {d.cake.size && <> · {d.cake.size}</>}
                {d.cake.message && <> · 「{d.cake.message}」</>}
                {d.cake.dietary && (
                  <span className="ml-1 inline-flex items-center gap-1 text-amber-400">
                    <span>·</span>
                    <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                    {d.cake.dietary}
                  </span>
                )}
              </DeliverableLi>
            )}
            {d.message_plate && (
              <DeliverableLi icon={<Sparkles size={16} />}>
                <strong>{ti("メッセージプレート", "Message plate")}</strong>
                {d.message_plate.message && <> · 「{d.message_plate.message}」</>}
              </DeliverableLi>
            )}
            {d.flowers && (
              <DeliverableLi icon={<Gift size={16} />}>
                <strong>{ti("花束", "Flowers")}</strong>
                {d.flowers.budget_pesos && <> · 予算 ₱{d.flowers.budget_pesos.toLocaleString()}</>}
                {d.flowers.color && <> · {d.flowers.color}</>}
              </DeliverableLi>
            )}
            {d.champagne && (
              <DeliverableLi icon={<Wine size={16} />}>
                <strong>{ti("シャンパン", "Champagne")}</strong>
                {d.champagne.label && <> · {d.champagne.label}</>}
              </DeliverableLi>
            )}
            {d.projection && d.projection.content && (
              <DeliverableLi icon={<MonitorPlay size={16} />}>
                <strong>{ti("マッピング演出", "Projection")}</strong> · {d.projection.content}
              </DeliverableLi>
            )}
            {d.photo_service && (
              <DeliverableLi icon={<Camera size={16} />}>
                <strong>{ti("写真撮影", "Photo service")}</strong>
                {d.photo_service.delivery_method && <> · {d.photo_service.delivery_method}</>}
              </DeliverableLi>
            )}
            {d.bgm !== undefined && d.bgm && (
              <DeliverableLi icon={<Music size={16} />}>
                <strong>BGM</strong> · {d.bgm}
              </DeliverableLi>
            )}
          </ul>
        </div>
      )}

      {/* SNS + free notes */}
      <div className="grid gap-px bg-border/30 sm:grid-cols-2">
        <Cell label={ti("SNS掲載", "SNS posting")} value={c.sns_ok ? "OK" : "NG"} />
      </div>

      {c.notes_celebration && (
        <div className="border-t border-gold/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-text-secondary">
            {ti("お祝い特記事項", "Celebration notes")}
          </p>
          <p className="mt-1 admin-body whitespace-pre-line text-foreground">
            {c.notes_celebration}
          </p>
        </div>
      )}
    </section>
  );
}

function Cell({
  label,
  value,
  accent,
  fullWidth,
}: {
  label: string;
  value: string;
  accent?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={
        fullWidth
          ? "sm:col-span-2 flex items-baseline justify-between gap-3 bg-surface px-4 py-2.5"
          : "flex items-baseline justify-between gap-3 bg-surface px-4 py-2.5"
      }
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
        {label}
      </span>
      <span
        className={
          accent
            ? "text-right text-[14px] font-semibold text-foreground"
            : "text-right admin-body text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function DeliverableLi({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5 admin-body">
      <span className="mt-0.5 shrink-0 text-gold">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
