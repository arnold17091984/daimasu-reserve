# DAIMASU Component Inventory

Reusable patterns specific to the projection-mapping kaiseki brand.
All defined in `src/app/globals.css` and/or `src/components/Hero.tsx`.
Approved for reuse across the site.

## Button — Primary (brass-bevel gold)

**CSS class**: `.btn-gold-ornate` (globals.css)

```tsx
<a className="btn-gold-ornate flex h-[58px] items-center justify-between overflow-hidden px-7 sm:h-16 ...">
  <motion.span /* glint sweep */ />
  <span className="relative flex-1 text-center">ご予約はこちら</span>
  <ChevronRight size={20} strokeWidth={1.6} />
</a>
```

**Anatomy**:
- 2-layer gradient: (1) 35% specular-white top stripe + (2) body gradient `light → main → darker` (`#F2D47A → #D4AF37 → #B58A25`)
- 1px `#F8DC82` top edge border
- Multi-shadow: `0 10px 28px rgba(212,175,55,0.32)` drop glow, `inset 0 1px 0 rgba(255,255,255,0.45)` top bevel, `inset 0 -4px 10px rgba(86,54,0,0.24)` inner warm shadow
- Sharp corners (no border-radius)
- Label color: `#1A1206` (warm brown, NOT pure black)
- Font: Noto Serif JP Bold 700, 0.08em
- Height: 58px mobile / 64px sm+
- `overflow: hidden` required for glint child

## Button — Secondary (ghost, translucent)

**CSS class**: `.btn-ornate-ghost`

```tsx
<a className="btn-ornate-ghost flex h-[58px] items-center justify-between gap-3 px-6 sm:h-16 ...">
  <MessageCircle size={18} />
  <span className="flex-1 text-center">WhatsAppでお問い合わせ</span>
  <ChevronRight size={20} strokeWidth={1.6} />
</a>
```

**Anatomy**:
- `rgba(0,0,0,0.28)` translucent fill + `backdrop-filter: blur(4px)`
- 1px `rgba(212,175,55,0.85)` gold border
- Inset warm tint + outer drop shadow
- Hover: background to `rgba(212,175,55,0.1)` + translateY(-2px)
- Font: Noto Serif JP Medium 500, 0.06em

## Chapter badge

Same visual language as `.btn-ornate-ghost` but used as a non-interactive label:
```tsx
<div className="inline-flex min-w-[214px] items-center justify-center border border-[rgba(212,175,55,0.72)] bg-black/25 px-4 py-2.5 backdrop-blur-[4px] shadow-[inset_0_0_18px_rgba(212,175,55,0.08)] sm:min-w-[250px] sm:px-5 sm:py-3">
  第一章 <span>|</span> マスターの食卓
</div>
```
Text: Noto Serif JP Medium 500, `text-gold`, 0.14em tracking. Sharp corners.

## Ornate divider (180px + 2 inner diamonds)

**CSS class**: `.ornate-divider`

```tsx
<span className="ornate-divider my-7" aria-hidden="true" />
```

**Anatomy**:
- 180px × 1px gold-gradient line (transparent → gold → transparent)
- Two 7×7 rotated squares at `left: 76px` and `right: 76px` via `::before` / `::after` pseudo-elements
- Diamonds have `box-shadow: 0 0 12px rgba(212,175,55,0.7)` glow
- `opacity: 0.85` for subtlety

## Limited-seat frame

**CSS class**: `.limited-frame`

```tsx
<p className="limited-frame mx-auto font-[family-name:var(--font-noto-serif)] text-[15px] font-medium tracking-[0.14em] text-foreground text-shadow-hero sm:text-[17px]">
  カウンター8席限定
</p>
```

**Anatomy**:
- Top + bottom 1px `rgba(212,175,55,0.35)` borders
- 7×7 rotated-square diamond markers at top-center and bottom-center via pseudo-elements (`top: -4px` / `bottom: -4px`)
- `padding: 22px 0`, `max-width: 560px`

Used as a prominent footnote when a single line of copy deserves more than body-text weight.

## Gold shimmer (character accent)

**Pattern**: inline React.CSSProperties + framer-motion `backgroundPosition` animate.

```tsx
const goldShimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, #9d7418 0%, #d4af37 28%, #fff0ad 50%, #d4af37 72%, #9d7418 100%)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  textShadow: "none",
  display: "inline-block",
};

<motion.span
  style={goldShimmerStyle}
  animate={{ backgroundPosition: ["0% center", "200% center"] }}
  transition={{ duration: 3.2, ease: "linear", repeat: Infinity }}
>
  食卓
</motion.span>
```

**When to use**: single character or short accent (NOT paragraphs) that you want to feel like gold leaf with a sweep of light.

**Why inline**: `.text-gold-gradient-title` and similar single-use classes in `globals.css` get silently dropped from the compiled stylesheet under this project's Tailwind v4 + Turbopack setup (see [lessons/tailwind-v4-custom-class-purge.md](../../knowledge/lessons/tailwind-v4-custom-class-purge.md) if captured globally). Inline style is purge-proof. Animation name doesn't matter — framer-motion runs in JS.

## Button glint sweep

**Pattern**: `overflow-hidden` parent + absolutely-positioned `motion.span` with diagonal gradient translated across.

```tsx
<a className="btn-gold-ornate relative flex ... overflow-hidden ...">
  <motion.span
    aria-hidden="true"
    className="pointer-events-none absolute inset-y-0 w-[42%]"
    style={{
      background: "linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%)",
    }}
    initial={{ x: "-160%" }}
    animate={{ x: "360%" }}
    transition={{
      duration: 2.4,
      ease: "easeInOut",
      repeat: Infinity,
      repeatDelay: 2.6,
    }}
  />
  {/* button children with `relative` to stack above glint */}
</a>
```

**When to use**: primary CTAs, premium buttons, "high-value" interactive targets. Use `repeatDelay` of ~2.5s so it doesn't feel spammy.

**Why translateX, not backgroundPosition**: GPU-accelerated, doesn't trip over `backdrop-filter` or stacking-context quirks.

## Text-shadow — dark gaussian halo

### `.text-shadow-hero` — for white/light text over hero video
```css
text-shadow:
  0 0 32px rgba(0, 0, 0, 0.95),
  0 0 16px rgba(0, 0, 0, 0.85),
  0 2px 6px rgba(0, 0, 0, 0.75);
```
3 layers. Wide-to-narrow blur stack. Separates text from ANY busy backdrop (owl fur, highlights, video).

### `.text-shadow-hero-gold` — for gold text that also needs a warm glow
```css
text-shadow:
  0 0 20px rgba(0, 0, 0, 0.9),
  0 0 10px rgba(0, 0, 0, 0.75),
  0 0 16px rgba(212, 175, 55, 0.35),
  0 2px 4px rgba(0, 0, 0, 0.6);
```
Combines dark halo + gold glow without the gold washing out legibility.

### H1-specific (inline, because the scale wants bigger blur)
```
[text-shadow:0_0_40px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.85),0_4px_8px_rgba(0,0,0,0.75),0_0_22px_rgba(255,255,255,0.12)]
```
Last layer is a subtle white glow that makes the heading feel illuminated (kaiseki theatre feel).

## Hero-floatdown (scroll-cue animation)

**CSS class**: `.hero-float-down` + `@keyframes hero-floatdown` in globals.css.
Applied to the bottom ChevronDown. Pure CSS (no framer-motion).

## Global rules for reuse
- **Do not introduce a second gold shade** — stick to `--gold` + the 4 named variants above.
- **Do not use `rounded-md` / `rounded-lg` on CTAs.** Hero CTAs are sharp corners; product listings / cards may use `rounded-[2px]` or `rounded-[4px]` at most.
- **Shimmer + glint animations are premium signals.** Reserve them for the most important 1–2 elements per screen. Over-use cheapens them.
- **Always pair bright/white text over the hero video with `.text-shadow-hero`.** No exceptions — the owl video has highlight zones that destroy legibility otherwise.
