# Task ui-A5: Brand assets (`public/brand/`) + author `docs/Reference/business/BRAND.md`

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch A (Foundation) — **S item, ~3h**

---

## Task overview

Today, [`frontend/public/`](../../../../../frontend/public/) has zero brand assets — no logo, no favicon, no Open-Graph image. Share previews of any Clariva URL pasted into Slack / WhatsApp / Instagram render as a generic Next.js placeholder, undermining the very channel the product depends on (the IG-DM funnel). Internally there's no canonical brand reference doc, so future UI work has no source of truth for palette, typography, or voice.

This task ships:
1. **Brand assets** at `frontend/public/brand/` — `logo.svg` (full lockup), `logomark.svg` (square mark for header / favicon), `og.png` (1200×630 for social previews), and updates the favicon source.
2. **`docs/Reference/business/BRAND.md`** — single canonical reference: HSL palette values (mirroring A1 tokens), type scale (mirroring A3), iconography rules (mirroring A4), voice & tone for system copy, do/don't examples.
3. **Next metadata wiring** in [`frontend/app/layout.tsx`](../../../../../frontend/app/layout.tsx) so the OG image is referenced for share previews.

**Estimated time:** ~3h. Two phases: (a) author `BRAND.md` + wire metadata (~2h), (b) drop in actual brand asset files (~1h, often blocked on real art).

**Status:** Drafted.

**Hard deps:** A1 (palette tokens — `BRAND.md` documents the same HSLs).

**Soft deps:** A4 (icon convention note in `BRAND.md` references lucide).

**Source:** [U1.5 + U1.6 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u15--brand-assets) (and U6.1 brand identity question).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for `BRAND.md` and metadata wiring; **Composer 2 Fast** for the asset file drop (literally `cp` operations into `public/brand/`).

**Why this tier:** `BRAND.md` is doc work that benefits from light judgment about voice/tone examples — Sonnet handles this cleanly. The file drop is mechanical.

**New chat?** Yes — fresh chat for `BRAND.md` + metadata. The file drop can stay in the same chat.

**Pre-load (paste at start):**

- This task file.
- A1's resolved `frontend/app/globals.css` (palette HSLs).
- The product README's product-vision sentences.
- The brand identity decision from U6.1 in [plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u61--brand-identity-logo-palette-voice). If undecided, note "ship the documented default and iterate later."

**Estimated turns:** 1–2 for the doc + metadata; 0–1 for the file drop.

**Escalate to Opus if:** the user wants a brand sprint (multiple options compared) — that's its own project, not this task. This task documents the default + metadata.

**Composer-OK sub-steps:** the file drop, favicon swap, and `metadata.openGraph` wiring once `BRAND.md` settled the values. Markdown editing of `BRAND.md` itself can also be Composer if you have copy ready to paste.

---

## Acceptance criteria

### `BRAND.md`

- [ ] **`docs/Reference/business/BRAND.md`** authored at the spec'd path. Sections in order:
  - **Identity** — one-line product description; one-line tone statement (e.g., "Clinical, calm, modern. We respect the doctor's time and never patronize the patient.").
  - **Palette** — table with `Token | HSL | Hex | Usage`. Mirrors A1's `:root` block exactly.
  - **Typography** — Inter sans; type scale 12 / 14 / 16 / 20 / 24 / 30; `font-tabular` for numeric tables; default body 14px / 1.5.
  - **Spacing rhythm** — page padding `px-6 py-5`, card padding `p-4`, section gap `gap-4`. From U0.4 / U1.6.
  - **Iconography** — lucide-react only; default size + stroke; named imports only. Mirror A4.
  - **Voice & tone for system copy** — table of do / don't examples:
    | Don't | Do |
    |---|---|
    | "Successfully transmitted prescription to patient via Instagram channel." | "Sent · 2 mins ago" |
    | "An error has occurred. Please try again." | "Couldn't send. Tap to retry." |
    | "Please wait while your data loads." | "Loading…" |
    | "Click here to begin a new consultation." | "Start consult" |
  - **Do not / never** — no emoji in product copy unless brand-sanctioned; no exclamation marks except in toasts; no "please" / "kindly" in clinical UI; no jargon ("ICD-10 coding") in patient-visible surfaces.
  - **Brand assets** — list of files in `frontend/public/brand/` and what they're used for.
  - **Versioning** — date this doc was last touched + who owns updates.

### Brand assets (file drop)

- [ ] **`frontend/public/brand/logo.svg`** — full horizontal lockup. SVG, optimized (no metadata, no inline raster). If the lockup hasn't been designed yet, ship a temporary text-based wordmark using the resolved primary color (per A1). Note the placeholder in `BRAND.md` so it's not forgotten.
- [ ] **`frontend/public/brand/logomark.svg`** — square mark only. Used for sidebar collapsed state, favicon source, future app icon.
- [ ] **`frontend/public/brand/og.png`** — 1200×630 PNG. Title + subtitle + logomark on brand background. Even a simple flat-color version is fine for V1 — we can iterate.
- [ ] **`frontend/app/icon.svg`** (or `frontend/public/favicon.ico` if SVG-icon route is unsupported by your hosting) — favicon source updated to use the logomark. Next 14 supports `app/icon.svg` natively.

### Next metadata wiring

- [ ] **`frontend/app/layout.tsx`** — `metadata` exported includes:
  ```ts
  export const metadata: Metadata = {
    title: { default: "Clariva", template: "%s · Clariva" },
    description: "Digital infrastructure for doctors operating on social media.",
    icons: { icon: "/icon.svg" },                         // or favicon.ico
    openGraph: {
      title: "Clariva",
      description: "...",
      images: [{ url: "/brand/og.png", width: 1200, height: 630 }],
      siteName: "Clariva",
      type: "website",
    },
    twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
  };
  ```
- [ ] **Per-page titles** kept short and descriptive (e.g., dashboard pages set `export const metadata = { title: "Today" }` so the template renders "Today · Clariva").

### Smoke test

- [ ] Open `http://localhost:3000/dashboard` — favicon visible in browser tab, browser tab title shows the new template.
- [ ] Run `https://www.opengraph.xyz/url/<your-staging-url>` (or paste the staging URL into a Slack/WhatsApp DM) — preview renders the OG image after deploy.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx next lint` clean.

---

## Out of scope

- **A 1-week brand sprint** producing multiple logo variants, color explorations, etc. Per U6.1: ship the documented default if undecided. The file paths and metadata wiring are the durable part; the actual artwork can iterate.
- **Print/letterhead branding for prescription PDFs.** That's owned by EHR T3.15 — separate concern, separate file.
- **Mobile app icons / Android adaptive icons.** No native app in V1.
- **Email template branding.** Future work; this batch does dashboard surfaces only.

---

## Files expected to touch

**Frontend:**
- `frontend/public/brand/logo.svg` — **new**.
- `frontend/public/brand/logomark.svg` — **new**.
- `frontend/public/brand/og.png` — **new**.
- `frontend/app/icon.svg` — **new** (or update `frontend/public/favicon.ico`).
- `frontend/app/layout.tsx` — **edit** (metadata block).

**Docs:**
- `docs/Reference/business/BRAND.md` — **new**.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **U6.1 brand identity question.** The source plan flags this as "do you have a logo / palette decided, or do we need to design them?" If unanswered when this task starts, the answer per the source plan is **(a) ship the documented default**: text wordmark "Clariva" in primary teal-600, simple geometric logomark (e.g., a stylized 'C' or pulse mark), iterate later. Don't block A on a brand sprint.
2. **SVG vs raster favicon.** Next 14 supports `app/icon.svg` and auto-generates the `<link rel="icon">`. Use SVG unless your hosting strips it (Vercel doesn't).
3. **OG image template.** A flat-color background with title text is fine for V1. Later: a richer template with the doctor's name dynamically composited (good for share-as-doctor-X flows).
4. **`metadata.metadataBase`.** Set this to `process.env.NEXT_PUBLIC_APP_URL` if defined (avoids relative-URL warnings in production).
5. **Don't ship the brand sprint as part of this task.** If the user wants to evaluate 5 logo variants, that's a separate project; this task ships the default + the durable plumbing.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch A](../plan-ui-system-redesign-batch.md#sub-batch-a--foundation-5-items-15-days)
- **Source items:** [U1.5](../../../../Product%20plans/plan-ui-system-redesign.md#u15--brand-assets), [U1.6](../../../../Product%20plans/plan-ui-system-redesign.md#u16--author-docsreferencebrandmd), [U6.1](../../../../Product%20plans/plan-ui-system-redesign.md#u61--brand-identity-logo-palette-voice).
- **Hard dep:** [task-ui-A1-design-tokens.md](./task-ui-A1-design-tokens.md).
- **Soft dep:** [task-ui-A4-lucide-icons.md](./task-ui-A4-lucide-icons.md).
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
