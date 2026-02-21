# Components

Shared components and design token reference for Video Compliance. Use tokens from `tokens/` and Tailwind as needed.

## Color System (Tokens Reference)

### Brand Colors
| Name | Hex | Tailwind | CSS Var |
|------|-----|----------|---------|
| Brand Green | `#00FF00` | `text-brand-green` | `--strand-brand-green` |
| Brand Charcoal | `#1D1C1B` | `text-brand-charcoal` | `--strand-brand-charcoal` |
| Brand White | `#F4F3F3` | `text-brand-white` | `--strand-brand-white` |
| Brand Grey | `#D3D1CF` | `text-brand-grey` | `--strand-brand-grey` |

### Gray Ramp (Figma Variables)
| Step | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Gray 50 | `#F4F3F3` | `bg-gray-50` | Page backgrounds |
| Gray 100 | `#ECECEC` | `bg-gray-100` | Card backgrounds |
| Gray 200 | `#E2E2E2` | `bg-gray-200` | Subtle borders, hover states |
| Gray 300 | `#D3D1CF` | `bg-gray-300` | Line dividers, default borders |
| Gray 400 | `#BDBCBB` | `bg-gray-400` | Disabled text, placeholder borders |
| Gray 500 | `#8F8984` | `text-gray-500` | Muted text, icons |
| Gray 600 | `#45423F` | `text-gray-600` | Secondary text, labels |
| Gray 700 | `#1D1C1B` | `text-gray-700` | Primary text |

### Semantic UI Colors
| Name | Hex | Tailwind | CSS Var |
|------|-----|----------|---------|
| Background | `#F4F3F3` | `bg-background` | `--strand-ui-background` |
| Surface | `#FFFFFF` | `bg-surface` | `--strand-ui-surface` |
| Card | `#ECECEC` | `bg-card` | `--strand-ui-card` |
| Accent | `#00DC82` | `bg-accent` | `--strand-ui-accent` |
| Accent Hover | `#00B86E` | `bg-accent-hover` | `--strand-ui-accent-hover` |
| Highlight | `#60E21B` | `bg-highlight` | `--strand-ui-highlight` |
| Error | `#DC2626` | `text-error` | `--strand-ui-error` |
| Warning | `#F59E0B` | `text-warning` | `--strand-ui-warning` |
| Success | `#00DC82` | `text-success` | `--strand-ui-success` |
| Info | `#3B82F6` | `text-info` | `--strand-ui-info` |
| Destructive | `#E22E22` | `text-destructive` | `--strand-ui-destructive` |

### Product Line Colors
| Product | Dark | Medium | Light |
|---------|------|--------|-------|
| Search (Purple) | `#7B5880` | `#F6AFFF` | `#FBDFFF` |
| Generate (Orange) | `#7D5D0C` | `#FABA17` | `#FDE3A2` |
| Embed (Blue) | `#366B7F` | `#6CD5FD` | `#C4EEFE` |

### Global Colors (Figma Style Mappings)
| Figma Style | Resolved Hex | Maps To |
|-------------|-------------|---------|
| Global/Background | `#F4F3F3` | `gray.50` / `ui.background` |
| Global/Card Colour | `#ECECEC` | `gray.100` / `ui.card` |
| Global/Card Colour2 | `#FFFFFF` | `ui.surface` |
| Global/Line Colour | `#D3D1CF` | `gray.300` / `ui.border` |
| Global/Accent | `#D3D1CF` | `gray.300` (subtle accent for dividers) |
| Global/Text | `#1D1C1B` | `gray.700` / `ui.text.primary` |
| Global/Highlight | `#60E21B` | `ui.highlight` |

## Button Sizes (Figma BUTTONS-V2)

Font: Milling Duplex 1mm (`font-brand`). Source: `tokens/buttons.json`

| Size | Height | Radius | PaddingX | PaddingY | Font Size | Tailwind Radius |
|------|--------|--------|----------|----------|-----------|-----------------|
| mini | 24px | 6px | 6px | 4px | 10px | `rounded-[6px]` |
| small | 28px | 8px | 8px | 6px | 12px | `rounded-md` |
| regular | 32px | 8px | 12px | 6px | 14px | `rounded-md` |
| medium | 40px | 12px | 18px | 8px | 16px | `rounded-lg` |
| large | 48px | 16px | 20px | 10px | 18px | `rounded-[16px]` |
| xlarge | 60px | 20px | 24px | 22px | 24px | `rounded-[20px]` |

### Button Variants (Figma-only)

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| black | `#1D1C1B` | white | — |
| white | `#FFFFFF` | charcoal | — |
| gray | `#ECECEC` | charcoal | — |
| ghosted-black | transparent | charcoal | — |
| ghosted-white | transparent | white | — |
| blur | `rgba(255,255,255,0.2)` | white | — |
| black-outline | transparent | charcoal | `#1D1C1B` |
| white-outline | transparent | white | `#FFFFFF` |
| white-outline-blur | `rgba(255,255,255,0.1)` | white | `#FFFFFF` |
| disabled-black | `#BDBCBB` | `#8F8984` | — |
| disabled-white | `#E2E2E2` | `#BDBCBB` | — |
| disabled-outline | transparent | `#BDBCBB` | `#E2E2E2` |

**Note:** No accent, highlight, or destructive button variants exist in Figma BUTTONS-V2.

## Icons (ICONS-PLYG)

Two icon sets, all 16x16 SVG, stroke-based (`currentColor`):

- **Functional** (66 icons): UI primitives — arrows, chevrons, media controls, actions
- **Playground** (68 icons): Product-specific — with Default/Selected state variants

### Extracted Icons (`packages/strand/icons/`)

18 key sidebar/UI icons extracted from Figma:

| Icon | File | Figma Node | Usage |
|------|------|-----------|-------|
| Home | `home.svg` | `16048:26934` | Main nav |
| Indexes | `indexes.svg` | `16048:26940` | Main nav |
| Examples | `examples.svg` | `16048:26946` | Main nav |
| Members | `members.svg` | `16048:27471` | Main nav |
| Organizations | `organizations.svg` | `16048:27445` | Settings |
| API Keys | `api-keys.svg` | `16048:27504` | Settings |
| Billings | `billings.svg` | `16048:27422` | Settings |
| Usage | `usage.svg` | `16048:27482` | Settings |
| Rate Limit | `rate-limit.svg` | `16732:23685` | Settings |
| Webhooks | `webhooks.svg` | `16048:27376` | Settings |
| Profile | `profile.svg` | `16048:27392` | Settings |
| Settings | `settings.svg` | `16048:26960` | Bottom nav |
| Help | `help.svg` | `16048:26992` | Bottom nav |
| Search | `search.svg` | `16048:27022` | Top bar |
| Copy | `copy.svg` | `16048:27103` | Actions |
| Plus | `plus.svg` | `16153:23518` | Actions |
| Close | `close.svg` | `16048:27273` | Actions |
| Info | `info.svg` | `16048:27254` | Actions |

Full manifest: `tokens/icons.json`

## Border Radius (Figma Variables)

| Token | Value | Tailwind | Figma Source |
|-------|-------|----------|-------------|
| sm | 4px | `rounded-sm` | — |
| md | 8px | `rounded-md` | `radius-0pt5` |
| lg | 12px | `rounded-lg` | — |
| xl | 16px | `rounded-xl` | `radius-1` |
| 1.25 | 20px | `rounded-[1.25]` | `radius-1pt25` |
| 2xl | 24px | `rounded-2xl` | `radius-1pt5` |
| full | 9999px | `rounded-full` | — |

## Typography

| Scale | Size | Line Height | Weight | Letter Spacing | Figma Source |
|-------|------|-------------|--------|---------------|-------------|
| jumbo | 64px | 1.1 | 700 | -3px | — |
| h1 | 48px | 1.2 | 700 | -2px | — |
| h2 | 40px | 1.2 | 600 | -2px | Desktop/Headline 4 |
| h3 | 32px | 1.3 | 600 | -1px | — |
| h4 | 24px | 1.33 | 600 | -1px | Desktop/Headline 6 |
| h5 | 20px | 1.4 | 500 | 0 | Subtitle1 |
| h6 | 18px | 1.5 | 500 | 0 | — |
| lg | 16px | 1.5 | 400 | 0 | Body1 |
| base | 14px | 1.43 | 400 | 0 | Body2 |
| sm | 12px | 1.33 | 400 | 0 | Body3 |
| xs | 10px | 1.4 | 500 | 0 | — |

## Adding components

Add reusable React components here and reference design tokens from `../tokens/` and `../css/` as needed.
