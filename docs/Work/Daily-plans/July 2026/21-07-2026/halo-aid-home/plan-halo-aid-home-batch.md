# Halo Aid — Marketing home page (batch spec)

> **Status:** ✅ Complete (2026-07-21). `hah-01`…`hah-04` shipped. `/` renders the Halo Aid landing page; blue is `.halo`-scoped (dashboard still teal); OQ-1 shipped as a `mailto:` placeholder (parked in `capture/inbox.md`).
> **One-line intent:** Replace the placeholder `frontend/app/page.tsx` with a real, blue-branded **Halo Aid** marketing home page that sells "turn patient DMs and comments into booked consultations" — **without** touching the (teal) dashboard theme or doing a full app-wide rename.
>
> **Brand source:** two Instagram creatives in `docs/Work/Media/` — `706946348_…_n.jpg` (the 4-step "How Halo Aid Works" flow) and `707477961_…_n(1).jpg` (the blue orbit-"A" logo + wordmark).

---

## Why this batch

`frontend/app/page.tsx` today is a stub ("Clariva Doctor Dashboard" + a Sign in link + a legal footer). There is no marketing surface. The product now has:

- a new name — **Halo Aid** (the owner finds "Clariva" hard to pronounce),
- a blue logo (royal→sky gradient orbit "A" + navy/blue wordmark),
- two Instagram creatives that already nail the positioning **"Turn patient DMs and comments into booked consultations"** and the 4-step flow.

This batch turns that into a proper landing page at `/`, reusing the existing UI kit, and scoping the new blue brand to the marketing page only so the shipped (teal) dashboard is untouched.

---

## Grounded current state

| Piece | Location | Note |
|---|---|---|
| Placeholder home | `frontend/app/page.tsx` | Bare stub — replaced by this batch. |
| Design tokens | `frontend/app/globals.css` · `frontend/tailwind.config.ts` | **Teal** primary (`--primary: 188 70% 30%`) + amber accent. **Leave untouched** (HAH-D1). |
| UI kit | `frontend/components/ui/*` (`button.tsx`, `card.tsx`), `lucide-react`, Inter via `next/font` | Reuse as-is. |
| Old brand assets | `frontend/public/brand/logo.svg`, `logomark.svg`, `og.svg` | Old teal "C pulse" mark. Header + dashboard still reference these — **do not remove**; add Halo assets alongside. |
| Name references | `frontend/app/layout.tsx` (metadata), `public/manifest.json`, `components/layout/Header.tsx`, `app/privacy|terms|data-deletion/page.tsx` | Say "Clariva" / "Clariva Care". **Out of scope** — separate rename task (HAH-D2). |
| Auth routes (CTA targets) | `frontend/app/(auth)/signup/page.tsx` · `frontend/app/(auth)/login/page.tsx` | Both exist → safe CTA destinations. |
| Brand source images | `docs/Work/Media/706946348_…_n.jpg` (flow) · `docs/Work/Media/707477961_…_n(1).jpg` (logo) | Raster `.jpg`, white background → need transparent/SVG versions for web (HAH-01, OQ-2). |

---

## Decision lock (confirmed with owner 2026-07-21)

| ID | Decision | Rationale / implication |
|---|---|---|
| **HAH-D1** | **Blue on the marketing page only.** Scope Halo Aid blue to the landing page via local CSS variables on a wrapper (e.g. `.halo` scope) or Tailwind arbitrary values. **Do NOT edit the global teal tokens.** | Dashboard is shipped + teal-themed. Divergence is intentional and cheap; app re-theme is a later decision. |
| **HAH-D2** | **Rename limited to the home page.** Full Clariva→Halo Aid rename (metadata, manifest, header, legal) is a separate future task. | "Clariva" appears in ~10 user-facing spots; renaming all of them is cross-cutting and out of this batch's scope. |
| **HAH-D3** | **CTAs:** primary **"Get started" → `/signup`**; secondary **"Book a demo"** → OQ-1 destination. Nav also keeps **"Sign in" → `/login`**. | Both auth routes exist. "Book a demo" needs a real target before ship (no dead links). |
| **HAH-D4** | **Plan doc first, then build.** | Matches the owner's Daily-plans workflow. |
| **HAH-D5** | **Single scrolling page** in `app/page.tsx`, composed from reusable `frontend/components/marketing/*` sections. No new route group. | Simplest structure; the marketing surface is one page today. |
| **HAH-D6** | **No new heavy dependencies.** Reuse `Button`, `Card`, `lucide-react`, Inter, Tailwind. | Keeps the bundle lean; the UI kit already covers everything needed. |

---

## Halo Aid blue tokens (sampled from the logo)

Scoped to the marketing page only (HAH-D1). Define on a `.halo` wrapper in `app/page.tsx` (or a small marketing CSS block) — **not** in `:root`.

```
--halo-blue:  223 79% 50%   /* #1E56E0 royal — primary CTA / links / logomark */
--halo-sky:   210 100% 59%  /* #2E9BFF sky — gradient end / "Aid" accent */
--halo-navy:  220 76% 24%   /* #0F2E6E navy — "Halo" wordmark / headings */
--halo-ink:   222 47% 11%   /* body text (matches existing --foreground) */
--halo-mist:  214 100% 97%  /* very light blue section wash */
```

- **Hero / final-CTA gradient:** `linear-gradient(135deg, hsl(var(--halo-blue)), hsl(var(--halo-sky)))`.
- **Motif:** the orbit-ring + sparkle from the logo as a subtle, low-opacity background flourish behind the hero.

---

## Page section spec (with copy)

| # | Section | Copy / content |
|---|---|---|
| 1 | **Nav** (sticky, translucent) | Halo Aid logomark + wordmark · anchor links (How it works · Features) · **Sign in** (ghost → `/login`) + **Get started** (blue → `/signup`). |
| 2 | **Hero** | H1 **"Turn patient DMs and comments into booked consultations."** · sub **"Built for doctors on social media."** · CTAs **[Get started]** **[Book a demo]** · visual: DM→booking mock card or the orbit-"A" motif. |
| 3 | **How it works** | 4 numbered cards from the infographic: **1. Patient DMs & Comments → 2. Smart Capture & Response → 3. Booking Confirmed → 4. Consultation Happens.** Icons: `MessageCircle`, `CalendarDays`, `CalendarCheck`, `MonitorPlay` (lucide). |
| 4 | **Features** | Grid mapped to real product capabilities: smart capture from Instagram DMs/comments · booking review queue · appointments + OPD queue · teleconsult (text / voice / video) · clinical cockpit + prescriptions · patient records · practice insights · alerts. |
| 5 | **Trust band** | "Built for doctors on social media." + a privacy-first line linking to `/privacy`, `/terms`, `/data-deletion`. **No medical/compliance claims** we can't back. |
| 6 | **Social proof** | Testimonials / trust placeholder (stub — real quotes later). |
| 7 | **Final CTA band** | Blue gradient panel, headline + **Get started**. |
| 8 | **Footer** | Halo Aid brand · legal links (Privacy · Terms · Data Deletion) · copyright. |

Copy tone: confident, plain, doctor-facing. Avoid clinical/compliance claims not yet substantiated.

---

## Assets needed

- Transparent **Halo Aid logo + logomark** (SVG preferred) → `frontend/public/brand/halo-logo.svg`, `frontend/public/brand/halo-logomark.svg`. Either trace an SVG from the reference (HAH-01) or owner supplies vector (OQ-2).
- New **OG image** for the landing page → `frontend/public/brand/halo-og.(svg|png)` (1200×630).

---

## Proposed task list

| Task | Title | Size | Model | Notes |
|---|---|---|---|---|
| `hah-01` | Halo Aid brand assets + marketing-scoped blue tokens | S | Sonnet/Composer | New SVG logo/logomark + `.halo` token scope. No global token edits. |
| `hah-02` | Marketing nav + hero + footer | M | Sonnet | Reusable `components/marketing/*`; CTAs wired. |
| `hah-03` | How-it-works + features + trust + final CTA sections | M | Sonnet | 4-step flow + feature grid + trust/CTA bands. |
| `hah-04` | SEO metadata/OG + responsive & a11y polish + close gate | S | Sonnet/Composer | Landing metadata, OG, mobile pass, verification gate. |

---

## ⚠️ Scope guard

- **Do NOT** edit `globals.css` / `tailwind.config.ts` global tokens (HAH-D1) — blue is marketing-scoped.
- **Do NOT** rename "Clariva" across the app (HAH-D2) — landing-page copy only.
- **Do NOT** remove or repoint the old `public/brand/*` files the header/dashboard still use — add new `halo-*` assets alongside.
- **Do NOT** add new heavy deps (HAH-D6).
- **Do NOT** wire "Book a demo" to a dead link — resolve OQ-1 first.
- All tasks are frontend-only, no PHI / no migration / no RLS → **Sonnet/Composer** (no Opus escalation trigger).

---

## Acceptance gate

- [x] `/` renders the Halo Aid home page (HTTP 200); blue brand; **no teal token changes** (additive `.halo` scope only); dashboard still teal.
- [x] All 8 sections present, responsive (mobile → desktop), accessible (landmark regions, alt text, visible focus states, sufficient contrast).
- [x] CTAs route correctly (`Get started` → `/signup`; `Sign in` → `/login`; `Book a demo` → `mailto:` placeholder pending OQ-1).
- [x] Landing-page SEO metadata (`title.absolute` bypasses the `· Clariva` template) + OG image (`/brand/halo-og.svg`) set.
- [x] `eslint` clean + `tsc` clean **for the slice** (`components/marketing/*`, `app/page.tsx`); no tests reference the home page. **Note:** repo-wide `tsc`/`build` has **pre-existing** errors in unrelated WIP files (`cockpit/rx/*`, `… 2.tsx` duplicates) — untouched by this batch.

---

## Open questions

- **OQ-1:** "Book a demo" destination — `mailto:`, a scheduling link (Calendly-style), or an on-page `#contact` block? **Default until answered:** a `#contact` anchor with a `mailto:` placeholder, flagged `TODO(OQ-1)` so it's not shipped dead.
- **OQ-2:** Owner supplies a vector logo, or trace an SVG from the reference `.jpg` in `hah-01`? **Default:** trace an SVG.
- **OQ-3:** Pricing section — now or later? **Default:** later (not in this batch).

---

## References

- Brand source: `docs/Work/Media/706946348_18085582331113832_420770260453745841_n.jpg` (flow) · `docs/Work/Media/707477961_18084877715113832_5932223935290145295_n(1).jpg` (logo)
- Placeholder to replace: `frontend/app/page.tsx`
- Tokens (do NOT edit): `frontend/app/globals.css` · `frontend/tailwind.config.ts`
- UI kit: `frontend/components/ui/button.tsx` · `frontend/components/ui/card.tsx`
- CTA targets: `frontend/app/(auth)/signup/page.tsx` · `frontend/app/(auth)/login/page.tsx`
- Rules: `.cursor/rules/00-agent-contract.mdc`

---

**Created:** 2026-07-21. **Status:** ✅ Complete (2026-07-21) — `hah-01`…`hah-04` shipped. Follow-ups (full rename HAH-D2, OQ-1 demo link, dogfood smoke) parked in `docs/Work/capture/inbox.md`.
