"use client";

/**
 * Celebration / surprise booking panel.
 *
 * Shown inside the new-booking form. Collapsed when occasion === "none";
 * expands progressively as the operator picks an occasion → adds surprise
 * details → ticks deliverables.
 *
 * State is "controlled" — the parent owns the celebration object so the
 * review step + final POST see the same shape.
 */
import { Cake, Sparkles, Gift, Camera, Wine, MonitorPlay, Music } from "lucide-react";
import type {
  CelebrationData,
  CelebrationOccasion,
  CelebrantRelation,
  CelebrantGender,
  SurpriseTimingMoment,
  ArrivesFirst,
} from "@/lib/db/types";
import type { AdminLang } from "@/lib/auth/admin-lang";
import { TextFieldButton } from "./text-field-button";

export const EMPTY_CELEBRATION: CelebrationData = {
  occasion: "none",
  is_surprise: false,
  celebrant: { name: "" },
  deliverables: {},
  sns_ok: false,
};

const OCCASIONS: { value: CelebrationOccasion; ja: string; en: string }[] = [
  { value: "none", ja: "通常", en: "None" },
  { value: "birthday", ja: "誕生日", en: "Birthday" },
  { value: "anniversary", ja: "記念日", en: "Anniversary" },
  { value: "proposal", ja: "プロポーズ", en: "Proposal" },
  { value: "milestone_age", ja: "歳祝い", en: "Milestone age" },
  { value: "business", ja: "接待・昇進", en: "Business" },
  { value: "farewell", ja: "送別・歓迎会", en: "Farewell" },
  { value: "other", ja: "その他", en: "Other" },
];

const RELATIONS: { value: CelebrantRelation; ja: string; en: string }[] = [
  { value: "self", ja: "本人", en: "Self" },
  { value: "spouse", ja: "配偶者", en: "Spouse" },
  { value: "partner", ja: "恋人", en: "Partner" },
  { value: "parent", ja: "親", en: "Parent" },
  { value: "child", ja: "子", en: "Child" },
  { value: "friend", ja: "友人", en: "Friend" },
  { value: "colleague", ja: "同僚", en: "Colleague" },
  { value: "other", ja: "その他", en: "Other" },
];

const GENDERS: { value: CelebrantGender; ja: string; en: string }[] = [
  { value: "f", ja: "女性", en: "F" },
  { value: "m", ja: "男性", en: "M" },
  { value: "x", ja: "不問", en: "—" },
];

const TIMINGS: { value: SurpriseTimingMoment; ja: string; en: string }[] = [
  { value: "arrival", ja: "着席直後", en: "On arrival" },
  { value: "mid_course", ja: "途中の一皿で", en: "Mid-course" },
  { value: "dessert", ja: "デザート時", en: "At dessert" },
  { value: "farewell", ja: "お見送り時", en: "On farewell" },
  { value: "custom", ja: "その他 (指定)", en: "Custom" },
];

const ARRIVES: { value: ArrivesFirst; ja: string; en: string }[] = [
  { value: "booker", ja: "予約者が先", en: "Booker first" },
  { value: "celebrant", ja: "主役が先", en: "Celebrant first" },
  { value: "together", ja: "一緒に来店", en: "Together" },
];

type DeliverableId =
  | "cake"
  | "message_plate"
  | "flowers"
  | "champagne"
  | "projection"
  | "photo_service"
  | "bgm";

const DELIVERABLE_DEFS: {
  id: DeliverableId;
  ja: string;
  en: string;
  icon: React.ReactNode;
}[] = [
  { id: "cake", ja: "ホールケーキ", en: "Cake", icon: <Cake size={16} /> },
  { id: "message_plate", ja: "メッセージプレート", en: "Message plate", icon: <Sparkles size={16} /> },
  { id: "flowers", ja: "花束", en: "Flowers", icon: <Gift size={16} /> },
  { id: "champagne", ja: "シャンパン乾杯", en: "Champagne", icon: <Wine size={16} /> },
  { id: "projection", ja: "マッピング演出", en: "Projection", icon: <MonitorPlay size={16} /> },
  { id: "photo_service", ja: "写真撮影", en: "Photo service", icon: <Camera size={16} /> },
  { id: "bgm", ja: "BGM リクエスト", en: "BGM request", icon: <Music size={16} /> },
];

export function CelebrationPanel({
  value,
  onChange,
  lang,
}: {
  value: CelebrationData;
  onChange: (next: CelebrationData) => void;
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);

  function setOccasion(occasion: CelebrationOccasion) {
    if (occasion === "none") {
      onChange({ ...EMPTY_CELEBRATION });
    } else {
      onChange({ ...value, occasion });
    }
  }
  function patch(p: Partial<CelebrationData>) {
    onChange({ ...value, ...p });
  }
  function patchCelebrant(p: Partial<CelebrationData["celebrant"]>) {
    onChange({ ...value, celebrant: { ...value.celebrant, ...p } });
  }
  function setSurpriseField<K extends keyof NonNullable<CelebrationData["surprise"]>>(
    key: K,
    v: NonNullable<CelebrationData["surprise"]>[K]
  ) {
    const cur = value.surprise ?? {
      timing: "dessert" as SurpriseTimingMoment,
      arrives_first: "booker" as ArrivesFirst,
    };
    onChange({ ...value, surprise: { ...cur, [key]: v } });
  }
  function toggleSurprise(on: boolean) {
    if (on) {
      onChange({
        ...value,
        is_surprise: true,
        surprise: value.surprise ?? {
          timing: "dessert",
          arrives_first: "booker",
        },
      });
    } else {
      onChange({ ...value, is_surprise: false, surprise: undefined });
    }
  }
  function toggleDeliverable(id: DeliverableId, on: boolean) {
    const d = { ...value.deliverables };
    if (!on) {
      delete d[id];
    } else if (id === "cake") {
      d.cake = d.cake ?? { size: "5号" };
    } else if (id === "message_plate") {
      d.message_plate = d.message_plate ?? { message: "" };
    } else if (id === "flowers") {
      d.flowers = d.flowers ?? {};
    } else if (id === "champagne") {
      d.champagne = d.champagne ?? {};
    } else if (id === "projection") {
      d.projection = d.projection ?? { content: "" };
    } else if (id === "photo_service") {
      d.photo_service = d.photo_service ?? {};
    } else if (id === "bgm") {
      d.bgm = d.bgm ?? "";
    }
    onChange({ ...value, deliverables: d });
  }

  const isActive = value.occasion !== "none";

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
            {ti("お祝い・サプライズ", "Celebration / surprise")}
          </p>
          <p className="mt-0.5 admin-meta normal-case tracking-normal">
            {ti(
              "誕生日や記念日でケーキ・花束・演出が必要な場合に設定",
              "Set when the booking needs cake / flowers / projection"
            )}
          </p>
        </div>
      </div>

      {/* Occasion chips */}
      <div className="flex flex-wrap gap-1.5">
        {OCCASIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOccasion(o.value)}
            className={
              value.occasion === o.value
                ? "border-2 border-gold bg-gold/15 px-3 py-1.5 text-[12px] font-semibold text-gold"
                : "border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:border-gold/40 hover:text-foreground"
            }
          >
            {ti(o.ja, o.en)}
          </button>
        ))}
      </div>

      {value.occasion === "other" && (
        <div className="mt-3">
          <TextFieldButton
            value={value.occasion_other ?? ""}
            onChange={(v) => patch({ occasion_other: v })}
            label={ti("その他のお祝い種別", "Other occasion")}
            placeholder={ti("例: 出産祝い / 卒業祝い", "e.g. baby celebration")}
            maxLength={80}
          />
        </div>
      )}

      {/* Expanded body */}
      {isActive && (
        <div className="mt-5 flex flex-col gap-5 border-t border-border pt-5">
          {/* Surprise toggle */}
          <Toggle
            label={ti("サプライズ (主役は知らない)", "Surprise (recipient unaware)")}
            description={ti(
              "主役は当日まで知らない場合は ON。動線・連絡方法に注意",
              "ON when celebrant doesn't know — affects coordination"
            )}
            checked={value.is_surprise}
            onChange={toggleSurprise}
          />

          {/* Celebrant block */}
          <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
                {ti("主役のお名前", "Celebrant name")}
              </span>
              <TextFieldButton
                value={value.celebrant.name}
                onChange={(v) => patchCelebrant({ name: v })}
                label={ti("主役のお名前", "Celebrant name")}
                placeholder={ti("プレートに書く字", "Name to print on cake/plate")}
                maxLength={80}
                autoCapitalize="words"
              />
            </div>
            <SelectField
              label={ti("関係", "Relation")}
              value={value.celebrant.relation ?? ""}
              onChange={(v) => patchCelebrant({ relation: (v || undefined) as CelebrantRelation })}
              options={[
                { value: "", label: ti("(未設定)", "(unset)") },
                ...RELATIONS.map((r) => ({ value: r.value, label: ti(r.ja, r.en) })),
              ]}
            />
            <SelectField
              label={ti("性別", "Gender")}
              value={value.celebrant.gender ?? ""}
              onChange={(v) => patchCelebrant({ gender: (v || undefined) as CelebrantGender })}
              options={[
                { value: "", label: ti("(未設定)", "(unset)") },
                ...GENDERS.map((g) => ({ value: g.value, label: ti(g.ja, g.en) })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              {ti("年代・節目 (任意)", "Age / milestone (optional)")}
            </span>
            <TextFieldButton
              value={value.celebrant.age_label ?? ""}
              onChange={(v) => patchCelebrant({ age_label: v })}
              label={ti("年代・節目", "Age / milestone")}
              placeholder={ti("例: 30代 / 還暦 / 結婚10周年", "e.g. 30s / 60th / 10th anniversary")}
              maxLength={40}
            />
          </div>

          {/* Surprise details */}
          {value.is_surprise && (
            <div className="border border-amber-500/40 bg-amber-500/[0.05] p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-400">
                {ti("サプライズ詳細", "Surprise logistics")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={ti("演出のタイミング", "Timing")}
                  value={value.surprise?.timing ?? "dessert"}
                  onChange={(v) =>
                    setSurpriseField("timing", v as SurpriseTimingMoment)
                  }
                  options={TIMINGS.map((t) => ({ value: t.value, label: ti(t.ja, t.en) }))}
                />
                <SelectField
                  label={ti("来店順序", "Arrival order")}
                  value={value.surprise?.arrives_first ?? "booker"}
                  onChange={(v) =>
                    setSurpriseField("arrives_first", v as ArrivesFirst)
                  }
                  options={ARRIVES.map((a) => ({ value: a.value, label: ti(a.ja, a.en) }))}
                />
              </div>
              {value.surprise?.timing === "custom" && (
                <div className="mt-3">
                  <TextFieldButton
                    value={value.surprise.timing_custom ?? ""}
                    onChange={(v) => setSurpriseField("timing_custom", v)}
                    label={ti("演出タイミング (自由記述)", "Custom timing")}
                    placeholder={ti(
                      "例: 5皿目「火」のシーンの直後",
                      "e.g. right after the 'Fire' scene"
                    )}
                    maxLength={120}
                  />
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
                    {ti("当日の連絡先 (予約者と違う場合)", "Coordination phone")}
                  </span>
                  <TextFieldButton
                    value={value.surprise?.coordination_phone ?? ""}
                    onChange={(v) => setSurpriseField("coordination_phone", v)}
                    label={ti("当日連絡先", "Coordination phone")}
                    type="tel"
                    inputMode="tel"
                    placeholder="+63 9XX XXX XXXX"
                    maxLength={30}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
                    {ti("持参物・事前預かり", "Items to hold")}
                  </span>
                  <TextFieldButton
                    value={value.surprise?.bringing_items ?? ""}
                    onChange={(v) => setSurpriseField("bringing_items", v)}
                    label={ti("持参物", "Items to hold")}
                    placeholder={ti(
                      "例: 18時までに花束・指輪を持ち込み",
                      "e.g. flowers + ring drop-off by 18:00"
                    )}
                    multiline
                    rows={2}
                    maxLength={280}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Deliverables */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
              {ti("ご用意するもの", "Deliverables")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DELIVERABLE_DEFS.map((d) => {
                const on = !!value.deliverables[d.id];
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDeliverable(d.id, !on)}
                    className={
                      on
                        ? "inline-flex items-center gap-1.5 border-2 border-gold bg-gold/15 px-3 py-1.5 text-[12px] font-semibold text-gold"
                        : "inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:border-gold/40 hover:text-foreground"
                    }
                  >
                    {d.icon}
                    {ti(d.ja, d.en)}
                  </button>
                );
              })}
            </div>

            <DeliverableDetails value={value} onChange={onChange} lang={lang} />
          </div>

          {/* SNS + free notes */}
          <Toggle
            label={ti("SNS掲載 OK", "Allow SNS posting")}
            description={ti(
              "店舗 Instagram 等への写真投稿を許可いただけるか",
              "Permission for the bar's social media"
            )}
            checked={value.sns_ok}
            onChange={(v) => patch({ sns_ok: v })}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              {ti("お祝い特記事項", "Celebration notes")}
            </span>
            <TextFieldButton
              value={value.notes_celebration ?? ""}
              onChange={(v) => patch({ notes_celebration: v })}
              label={ti("お祝い特記事項", "Celebration notes")}
              placeholder={ti(
                "例: 主役は車椅子使用、テーブル高さ調整希望",
                "e.g. wheelchair user, please adjust table height"
              )}
              multiline
              rows={3}
              maxLength={560}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverableDetails({
  value,
  onChange,
  lang,
}: {
  value: CelebrationData;
  onChange: (n: CelebrationData) => void;
  lang: AdminLang;
}) {
  const ti = (ja: string, en: string) => (lang === "ja" ? ja : en);
  const d = value.deliverables;
  const blocks: React.ReactNode[] = [];

  function patchDeliverable<K extends keyof CelebrationData["deliverables"]>(
    key: K,
    next: CelebrationData["deliverables"][K]
  ) {
    onChange({ ...value, deliverables: { ...value.deliverables, [key]: next } });
  }

  if (d.cake) {
    blocks.push(
      <DeliverableBlock key="cake" title={ti("ホールケーキ詳細", "Cake details")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label={ti("サイズ", "Size")}
            value={d.cake.size ?? ""}
            onChange={(v) => patchDeliverable("cake", { ...d.cake, size: v || undefined })}
            options={[
              { value: "", label: ti("(未設定)", "—") },
              { value: "4号", label: ti("4号 (12cm・3-4名)", "4号 (12cm)") },
              { value: "5号", label: ti("5号 (15cm・5-6名)", "5号 (15cm)") },
              { value: "6号", label: ti("6号 (18cm・7-8名)", "6号 (18cm)") },
            ]}
          />
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              {ti("プレートメッセージ", "Cake message")}
            </span>
            <TextFieldButton
              value={d.cake.message ?? ""}
              onChange={(v) => patchDeliverable("cake", { ...d.cake, message: v })}
              label={ti("ケーキメッセージ", "Cake message")}
              placeholder={ti("例: Happy 30th Hanako", "e.g. Happy 30th Hanako")}
              maxLength={140}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
            {ti("アレルギー・食事制限", "Dietary restrictions")}
          </span>
          <TextFieldButton
            value={d.cake.dietary ?? ""}
            onChange={(v) => patchDeliverable("cake", { ...d.cake, dietary: v })}
            label={ti("ケーキのアレルギー", "Cake dietary")}
            placeholder={ti("例: 乳製品アレルギー", "e.g. dairy allergy")}
            maxLength={140}
          />
        </div>
      </DeliverableBlock>
    );
  }
  if (d.message_plate) {
    blocks.push(
      <DeliverableBlock key="plate" title={ti("メッセージプレート", "Message plate")}>
        <TextFieldButton
          value={d.message_plate.message}
          onChange={(v) =>
            patchDeliverable("message_plate", { message: v })
          }
          label={ti("プレート文字", "Plate message")}
          placeholder={ti("例: Happy Birthday Hanako!", "e.g. Happy Birthday Hanako!")}
          maxLength={140}
        />
      </DeliverableBlock>
    );
  }
  if (d.flowers) {
    blocks.push(
      <DeliverableBlock key="flowers" title={ti("花束詳細", "Flowers details")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              {ti("予算 (₱)", "Budget (₱)")}
            </span>
            <TextFieldButton
              value={
                d.flowers.budget_pesos != null
                  ? String(d.flowers.budget_pesos)
                  : ""
              }
              onChange={(v) => {
                const n = v === "" ? undefined : parseInt(v.replace(/[^\d]/g, ""), 10);
                patchDeliverable("flowers", {
                  ...d.flowers,
                  budget_pesos: Number.isFinite(n as number) ? (n as number) : undefined,
                });
              }}
              label={ti("花束の予算", "Flowers budget")}
              inputMode="numeric"
              placeholder="例: 3000"
              maxLength={9}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              {ti("色・希望", "Color / preference")}
            </span>
            <TextFieldButton
              value={d.flowers.color ?? ""}
              onChange={(v) => patchDeliverable("flowers", { ...d.flowers, color: v })}
              label={ti("色", "Color")}
              placeholder={ti("例: 白系、淡いピンク", "e.g. white, pastel pink")}
              maxLength={40}
            />
          </div>
        </div>
      </DeliverableBlock>
    );
  }
  if (d.champagne) {
    blocks.push(
      <DeliverableBlock key="champagne" title={ti("シャンパン", "Champagne")}>
        <TextFieldButton
          value={d.champagne.label ?? ""}
          onChange={(v) => patchDeliverable("champagne", { label: v })}
          label={ti("銘柄希望 (任意)", "Label preference (optional)")}
          placeholder={ti("例: Krug Grande Cuvée", "e.g. Krug Grande Cuvée")}
          maxLength={80}
        />
      </DeliverableBlock>
    );
  }
  if (d.projection) {
    blocks.push(
      <DeliverableBlock key="projection" title={ti("マッピング演出", "Projection mapping")}>
        <TextFieldButton
          value={d.projection.content}
          onChange={(v) => patchDeliverable("projection", { content: v })}
          label={ti("演出内容", "Projection content")}
          placeholder={ti(
            "例: デザートタイムに名前を星空に投影",
            "e.g. project name in starry-sky scene at dessert"
          )}
          multiline
          rows={2}
          maxLength={280}
        />
      </DeliverableBlock>
    );
  }
  if (d.photo_service) {
    blocks.push(
      <DeliverableBlock key="photo" title={ti("写真撮影サービス", "Photo service")}>
        <SelectField
          label={ti("お渡し方法", "Delivery method")}
          value={d.photo_service.delivery_method ?? ""}
          onChange={(v) =>
            patchDeliverable("photo_service", { delivery_method: v || undefined })
          }
          options={[
            { value: "", label: ti("(未設定)", "—") },
            { value: "LINE", label: "LINE" },
            { value: "Email", label: "Email" },
            { value: "AirDrop", label: "AirDrop" },
            { value: "印刷", label: ti("印刷してお渡し", "Print on-site") },
          ]}
        />
      </DeliverableBlock>
    );
  }
  if (d.bgm !== undefined) {
    blocks.push(
      <DeliverableBlock key="bgm" title={ti("BGM リクエスト", "BGM request")}>
        <TextFieldButton
          value={d.bgm}
          onChange={(v) =>
            onChange({
              ...value,
              deliverables: { ...value.deliverables, bgm: v },
            })
          }
          label={ti("BGM 希望", "BGM request")}
          placeholder={ti(
            "例: ハッピーバースデー / 主役の好きな曲: 〇〇",
            "e.g. Happy Birthday song / favorite: ..."
          )}
          maxLength={140}
        />
      </DeliverableBlock>
    );
  }

  if (blocks.length === 0) return null;
  return <div className="mt-3 flex flex-col gap-3">{blocks}</div>;
}

function DeliverableBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-background p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.10em] text-gold">
        {title}
      </p>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border border-border bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 admin-meta normal-case tracking-normal">
            {description}
          </p>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-gold"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-gold/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
