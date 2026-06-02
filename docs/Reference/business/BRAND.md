# Clariva — Brand Reference

> **Last updated:** 2026-05-06  
> **Owner:** Design / Product (promote to a named person when the team grows).  
> This is the single source of truth for all visual and copy decisions in the dashboard. All new UI work should reference this doc before picking a colour, font size, or writing system copy.

---

## Identity

**Product:** Clariva — digital infrastructure for doctors operating on social media.

**Tone statement:** Clinical, calm, modern. We respect the doctor's time and never patronize the patient. Every word earns its place.

---

## Palette

All values are defined as CSS variables in `frontend/app/globals.css`. The Tailwind config reads them via `hsl(var(--name))`. **Never hard-code hex or rgb values in components** — use the token names.

| Token | HSL | Semantic usage |
|---|---|---|
| `--background` | `0 0% 100%` | Page and card surface (white) |
| `--foreground` | `222 47% 11%` | Primary text — slate-900 weight |
| `--card` | `0 0% 100%` | Card surface (same as background in light mode) |
| `--card-foreground` | `222 47% 11%` | Text on cards |
| `--popover` | `0 0% 100%` | Dropdown / tooltip backgrounds |
| `--popover-foreground` | `222 47% 11%` | Text in popovers |
| `--primary` | `188 70% 30%` | Primary brand color — teal-700-ish. Buttons, links, active states. |
| `--primary-foreground` | `0 0% 100%` | Text on primary surfaces (white) |
| `--secondary` | `210 40% 96%` | Secondary button / tag background — slate-100 |
| `--secondary-foreground` | `222 47% 11%` | Text on secondary surfaces |
| `--muted` | `210 40% 96%` | Muted backgrounds (disabled fields, metadata areas) |
| `--muted-foreground` | `215 16% 47%` | Muted text — slate-500 |
| `--accent` | `38 92% 50%` | Amber-500 — "Sent" pill, completion register. Use sparingly. |
| `--accent-foreground` | `24 10% 10%` | Dark text on accent |
| `--destructive` | `0 72% 51%` | Error / destructive actions — rose-600 |
| `--destructive-foreground` | `0 0% 100%` | White text on destructive |
| `--success` | `142 71% 38%` | Positive outcome — emerald-600 |
| `--success-foreground` | `0 0% 100%` | White text on success |
| `--warning` | `38 92% 50%` | Warning / caution — amber-500 |
| `--warning-foreground` | `24 10% 10%` | Dark text on warning |
| `--info` | `199 89% 48%` | Informational — sky-500 |
| `--info-foreground` | `0 0% 100%` | White text on info |
| `--border` | `214 32% 91%` | Default border — slate-200 |
| `--input` | `214 32% 91%` | Input field border |
| `--ring` | `188 70% 30%` | Focus ring — matches primary |
| `--radius` | `0.5rem` | Base border-radius (cascades to `lg / md / sm` via calc) |

**Status colors** (`--success`, `--warning`, `--info`, `--destructive`) are used in chips and banners only. Never as full-page backgrounds.

**Dark mode:** The `.dark` block in `globals.css` is populated and ready. No UI toggle ships in V1 (deferred to U5.4). Do not add per-component dark overrides — wait for the promoted `.dark` class.

---

## Typography

**Font:** Inter — loaded via `next/font/google` in `frontend/app/layout.tsx`. Self-hosted by Next.js at build time; no runtime Google Fonts request.

**Type scale** (Tailwind defaults — do not introduce custom sizes unless a specific design token is approved):

| Class | Size | Use |
|---|---|---|
| `text-xs` | 12px | Metadata, badges, timestamps |
| `text-sm` | 14px | Default body, form labels, descriptions |
| `text-base` | 16px | Emphasized body, input values |
| `text-lg` | 18px | Small headings |
| `text-xl` | 20px | Section headings |
| `text-2xl` | 24px | Page headings |
| `text-3xl` | 30px | Hero / modal titles |

**Default body:** 14px (`text-sm`) / 1.5 line-height. Set globally on `<body>` in `globals.css`.

**Numeric tables:** Apply `font-tabular` utility class (defined in `globals.css`) to vitals tables, dosage rows, and queue wait-time counters. This enables `tnum` + `lnum` OpenType features so digits don't jitter as values update.

---

## Spacing rhythm

Source: U0.4 / U1.6 in `plan-ui-system-redesign.md`. Do not deviate without a product decision.

| Context | Value |
|---|---|
| Page horizontal padding | `px-6` |
| Page vertical padding | `py-5` |
| Card internal padding | `p-4` |
| Section / stack gap | `gap-4` |
| Inline icon gap | `gap-2` |

---

## Iconography

**Library:** `lucide-react` only. No Heroicons, Tabler, Phosphor, or other icon libraries.

**Import pattern — named imports only:**
```ts
import { Bell, Menu, MessageSquare } from "lucide-react";
```
Never `import * as Icons from "lucide-react"` — defeats tree-shaking.

**Default sizes:**

| Context | Class |
|---|---|
| Inline (next to text) | `h-4 w-4` (16 px) |
| Button-sized | `h-5 w-5` (20 px) |
| Card header / section | `h-6 w-6` (24 px) |

**Default stroke:** `2` (lucide default). Use `strokeWidth={1.5}` for finer lines in chart-rail headers only.

**No new inline `<svg>` blocks.** If a lucide icon doesn't exist for a use case, open a ticket to evaluate — don't roll an inline SVG.

---

## Voice & tone for system copy

Write for a doctor who has 10 seconds. Prefer verbs over nouns. Drop filler. Respect clinical register without being cold.

| ❌ Don't | ✅ Do |
|---|---|
| "Successfully transmitted prescription to patient via Instagram channel." | "Sent · 2 mins ago" |
| "An error has occurred. Please try again later." | "Couldn't send. Tap to retry." |
| "Please wait while your data is loading." | "Loading…" |
| "Click here to begin a new consultation session." | "Start consult" |
| "Your changes have been saved successfully!" | "Saved" |
| "No appointments found for this date range." | "No appointments" |
| "The patient has not yet provided consent." | "Awaiting consent" |

**Do not / never:**
- No emoji in product copy unless brand-sanctioned (only `✓`, `·` separators, and status glyphs are allowed in V1).
- No exclamation marks except in positive toast confirmations (`Sent!`).
- No "please" or "kindly" in clinical UI — the interface is a tool, not a request.
- No medical jargon (`ICD-10 coding`, `SOAP note`) in patient-visible surfaces.
- No passive voice for error states — "Couldn't send" not "Prescription could not be sent".

---

## Brand assets

Located in `frontend/public/brand/`. Referenced from `frontend/app/layout.tsx` metadata.

| File | Use | Status |
|---|---|---|
| `logo.svg` | Full horizontal lockup (C-pulse mark + "Clariva" wordmark). Header, marketing pages. | Placeholder — text wordmark in teal, pending final artwork from design. |
| `logomark.svg` | Square mark only (C-pulse on teal square). Sidebar collapsed, tab favicon source. | Placeholder — same as above. |
| `og.svg` / `og.png` | 1200×630 social preview image. Referenced in `<meta property="og:image">`. | V1 SVG placeholder. Export to PNG before launch for maximum Twitter/WhatsApp compatibility. |
| `app/icon.svg` | Browser tab favicon, PWA icon source. Next 14 auto-generates `<link rel="icon">`. | Logomark on teal — V1 placeholder. |

**When final artwork arrives:** replace files at the same paths. No code changes required — metadata and import paths are stable.

---

## Versioning

| Date | Change | By |
|---|---|---|
| 2026-05-06 | Initial version — authored during Sub-batch A (UI redesign batch). Default palette, typography, spacing, iconography, voice/tone. | Agent (UI sub-batch A execution) |

Promote updates here when any brand decision changes. Three-way sync: this file → `globals.css` CSS vars → `tailwind.config.ts` theme extension.
