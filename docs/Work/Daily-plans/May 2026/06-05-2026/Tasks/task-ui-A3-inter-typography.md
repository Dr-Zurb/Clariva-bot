# Task ui-A3: Wire Inter typography via `next/font` + tabular-nums utility

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch A (Foundation) — **XS item, ~1h**

---

## Task overview

Today the project uses the system font stack (`-apple-system, BlinkMacSystemFont, ...`) — fine for an MVP, but inconsistent across OSes and unprofessional in screenshots. Vitals tables and dosage rows render proportional digits, so columns visibly jitter as values change.

This task wires Inter via `next/font` (Google subset, self-hosted, zero runtime cost) and adds a `font-tabular` utility for numeric contexts. It also locks the type scale at 12 / 14 / 16 / 20 / 24 / 30 — Tailwind's defaults already cover this, but we document it so future work doesn't drift.

**Estimated time:** ~1h.

**Status:** Drafted.

**Hard deps:** none. Can run in parallel with A2 / A4 / A5.

**Soft deps:** none.

**Source:** [U1.4 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u14--inter-typography-via-nextfont--tabular-nums).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or **Composer 2 Fast** if you're chaining it after A4 in the same chat — it's that simple).

**Why this tier:** Tiny scope. Two files, ~20 LOC. No judgment needed beyond reading `next/font` docs.

**New chat?** Optional. **You may batch A3 + A4 in the same chat** since both are XS / mechanical and both edit `app/layout.tsx`. If you do batch them, finish A3 cleanly before starting A4 in the same chat — don't interleave.

**Pre-load (paste at start):**

- This task file.
- Current `frontend/app/layout.tsx`.
- A1's resolved `tailwind.config.ts` (so the agent extends `theme.extend.fontFamily`).

**Estimated turns:** 1.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** any sub-step here is Composer-safe.

---

## Acceptance criteria

### `next/font` wiring

- [ ] **`frontend/app/layout.tsx`** imports `Inter` from `next/font/google`:
  ```ts
  import { Inter } from "next/font/google";
  const inter = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
  });
  ```
- [ ] **`<html>` tag carries `inter.variable`** (and any existing classes preserved):
  ```tsx
  <html lang="en" className={cn(inter.variable, "antialiased")}>
  ```
- [ ] **`<body>` keeps the `antialiased` class** (already there) plus `font-sans` if not already.

### Tailwind config

- [ ] **`frontend/tailwind.config.ts` `theme.extend.fontFamily`** maps `sans` to `var(--font-sans)`:
  ```ts
  fontFamily: {
    sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
  }
  ```
- [ ] System-font fallback chain preserved so a font-load failure doesn't blank the UI.

### Tabular-nums utility

- [ ] **`frontend/app/globals.css`** adds a small utility (one of):
  - Option A — declared in `@layer utilities`:
    ```css
    @layer utilities {
      .font-tabular {
        font-feature-settings: "tnum" on, "lnum" on;
      }
    }
    ```
  - Option B — `tailwind.config.ts` plugin via `addUtilities` (more orthodox, but heavier for one utility — Option A preferred).
- [ ] **Documented usage** in a one-line comment above the utility: "Apply to numeric tables (vitals, dosage rows, queue wait times) so digits don't jitter."

### Smoke test

- [ ] Reload `/dashboard` in dev — heading + body text render in Inter (visually verifiable: rounded `g`, `R` tail, etc.).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx next lint` clean.
- [ ] No CLS regression on cold load (Inter `display: swap` keeps system fallback while loading).

---

## Out of scope

- **Type scale tokens (`--font-size-sm` etc.).** Tailwind defaults (12 / 14 / 16 / 20 / 24 / 30) suffice; documenting in BRAND.md (A5) is enough.
- **Variable-axis font features beyond `tnum`.** Don't enable `cv11`, `salt`, etc. without a brand reason.
- **Self-hosted woff2 file commit.** `next/font` handles hosting via the build; do not check fonts into `public/`.
- **Right-to-left typography prep.** Not in V1.

---

## Files expected to touch

**Frontend:**
- `frontend/app/layout.tsx` — **edit** (~5 LOC: import + `<html>` className).
- `frontend/tailwind.config.ts` — **edit** (~5 LOC: `fontFamily` extend).
- `frontend/app/globals.css` — **edit** (~5 LOC: `.font-tabular` utility).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Why Inter and not Geist / Manrope / IBM Plex.** Inter is the most mature healthcare-friendly modern sans, free to host, well-hinted, has tabular nums, broad weight range. Geist is newer but ties more to Vercel's brand register. No strong reason to deviate.
2. **Why Google subset over self-hosted .woff2.** `next/font/google` self-hosts at build time anyway — there's no runtime fetch from Google. Either path is equivalent; Google subset is one less file to manage.
3. **Tabular nums via class, not default.** Applying `tnum` globally would shift letter-spacing slightly across all text. Limit to numeric contexts.
4. **No `font-display: optional`.** `swap` keeps system fallback during the brief load — acceptable CLS hit for guaranteed visibility.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch A](../plan-ui-system-redesign-batch.md#sub-batch-a--foundation-5-items-15-days)
- **Source item:** [U1.4 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u14--inter-typography-via-nextfont--tabular-nums)
- **`next/font` docs:** https://nextjs.org/docs/app/api-reference/components/font
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
