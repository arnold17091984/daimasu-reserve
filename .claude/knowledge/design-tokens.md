# DAIMASU Design Tokens

Brand source of truth for color / typography / motion across the site.
Defined in `src/app/globals.css` and referenced via CSS custom properties.

## Palette

### Gold ramp (from light to dark)
| Token | Hex | Use |
|---|---|---|
| `--gold-highlight` | `#F2D47A` | Bevel top, shimmer highlight band, light-gold variant |
| `--gold-light` | `#F2D47A` | Button gradient top |
| `--gold` | `#D4AF37` | Primary gold — main body, text, borders |
| `--gold-soft` | `#CBB98A` | Beige text (tagline, supporting copy) |
| `--gold-dark` | `#A68E64` | Deep gold text (muted), bevel bottom |
| `--gold-deep` | `#A68E64` | Alias — gradient bottom stop |

### Neutrals
| Token | Hex | Use |
|---|---|---|
| `--background` | `#0B0B0B` | Page background (near-black) |
| `--brown-dark` | `#1A1206` | Gold-button label color (warm brown, not pure black) |
| `--surface` | `#141414` | Card / elevated surfaces |
| `--card` | `#1A1A1A` | Card base |
| `--border` | `#2A2420` | Default border |
| `--border-gold` | `rgba(212, 175, 55, 0.25)` | Subtle gold border |
| `--foreground` | `#FFFFFF` | Primary text (hero) |
| `--text-secondary` | `#CBB98A` | Secondary beige |
| `--text-muted` | `#A68E64` | Muted warm text |

### Shimmer-specific hex (inline, documented here for reuse)
- `#9D7418` — deep gold edge of shimmer gradient
- `#FFF0AD` — cream highlight (center of gold gradient / bright)
- `#F8DC82` — button top-border edge
- `rgba(86, 54, 0, 0.24)` — button inner-bottom shadow (warm brown)

## Typography

### Font stack (in `layout.tsx`)
```ts
import { Cinzel, Noto_Serif_JP, Noto_Sans_JP } from "next/font/google";
```
Legacy (kept for non-hero components): Cormorant Garamond, Shippori Mincho.

### Hierarchy

| Role | Family | Weight | Tracking |
|---|---|---|---|
| Display (H1) | Noto Serif JP | 700 | 0.02em |
| Primary CTA label | Noto Serif JP | 700 | 0.08em |
| Secondary CTA label | Noto Serif JP | 500 | 0.06em |
| Badge / kicker / limited footnote | Noto Serif JP | 500 | 0.14em |
| Price | Cinzel → Noto Serif JP fallback | 500 | 0.06em |
| Body / lead / scroll link | Noto Serif JP | 400 | 0.06em |

### Rules
- **JP text: Noto Serif JP for everything.** Do NOT mix Noto Sans JP or Shippori Mincho with Noto Serif JP in the same view.
- **Latin numerals (price): Cinzel.** JP glyphs automatically fall through to Noto Serif JP.
- **Tracking 3-tier: `0.02em` / `0.06em` / `0.14em`.** Avoid arbitrary values — pick the closest tier.
- **Weight 3-tier: 700 / 500 / 400.** Skip 300 and 600 unless a new hierarchy level is justified.
