# DAIMASU Visual Invariants

Rules that MUST hold on every new screen / component.
If a design violates one of these, it's off-brand for the projection-mapping kaiseki theatre.

## Invariants

1. **Gold is the only accent color.** No other accent hue anywhere. Semantic error/success = a muted variant of gold or beige, not red/green.
2. **Corners are sharp on primary CTAs and frames.** Soft corners (>4px radius) only appear on cards in list/grid contexts, never on hero CTAs, badges, or ornamental frames.
3. **No gradient is used for color except the gold bevel + gold shimmer patterns.** No purple/pink/blue gradients anywhere. No "gradient text" for anything other than the 食卓-style accent.
4. **Hero-over-video text always has `.text-shadow-hero`.** Because the owl video has highlight zones that destroy legibility.
5. **JP text is Noto Serif JP, Latin numerals are Cinzel.** Noto Sans JP, Shippori Mincho, Cormorant Garamond are legacy and not to be used on new surfaces.
6. **Shimmer/glint animations are rare.** Reserve for the most important 1–2 elements per screen. Every screen having shimmer = nothing is shimmering.
7. **Ornament motif is the rotated square (◆).** No circles, no stars, no other decorative glyphs.
8. **Black backgrounds only** (`#0B0B0B`). No dark blue, no dark green. Warm brown (`#1A1206`) is ONLY for gold-button labels.
9. **Diamond markers are 7×7px with gold glow shadow.** Do not change size or remove the glow — it's the brand signature.

## Forbidden patterns

- ❌ Purple / pink / blue gradient anywhere
- ❌ Rounded-full on non-avatar elements
- ❌ Shadow-2xl or larger on cards
- ❌ Multi-color palettes (more than one accent)
- ❌ Emoji as decoration
- ❌ Any font other than Noto Serif JP / Noto Sans JP (legacy pages only) / Cinzel / system fallback
- ❌ Shiny / glossy / 3D skeuomorphic buttons (bevel gold is intentional — it's not skeuomorphism, it's brass)

## Checklist (before shipping a new screen)
- [ ] Accent color: gold only?
- [ ] Corners: sharp on CTA / badge / frame?
- [ ] Text over video: `.text-shadow-hero` applied?
- [ ] Font: Noto Serif JP for JP?
- [ ] Animations: at most 1–2 shimmer/glint elements?
- [ ] Decorative motif: rotated squares only?
