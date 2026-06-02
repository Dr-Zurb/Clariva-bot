# Task ui-A1: Design tokens (CSS vars + Tailwind theme extension)

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch A (Foundation) — **S item, ~3h**

---

## Task overview

Today, [`frontend/app/globals.css`](../../../../../frontend/app/globals.css) is the bare three `@tailwind` lines and [`frontend/tailwind.config.ts`](../../../../../frontend/tailwind.config.ts) has `theme: { extend: {} }`. Every page rolls its own colors via raw classes (`bg-blue-600`, `text-gray-700`, `border-amber-500`, etc.). Result: there is no single point of brand control and any palette change requires hunting through 60+ files.

This task establishes the canonical token layer so the rest of Sub-batch A and everything downstream has semantic colors to compose against. It writes (a) light + dark CSS variable blocks in `globals.css` using HSL triples, and (b) a `theme.extend.colors` map in `tailwind.config.ts` that reads those vars via `hsl(var(--name))`. Follows the standard shadcn/ui token pattern so A2 (shadcn bootstrap) fits in cleanly.

This is the **single most leveraged change in the batch** — every later task assumes these tokens exist.

**Estimated time:** ~3h.

**Status:** Shipped (2026-05-06).

**Hard deps:** none.

**Soft deps:** A5 (brand decision in U6.1) — if the brand palette is undecided, ship the documented default (slate + teal-600 primary + amber-500 accent) and migrate later by editing only the HSL triples.

**Source:** [U1.2 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u12--add-css-var-token-layer-in-globalscss--tailwind-theme-extension).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded scope; pattern is well-known (shadcn convention); two files to touch; concrete deliverable. No security/PHI surface, no architectural calls.

**New chat?** Yes — fresh chat for this task. Do NOT roll over context from any earlier conversation.

**Pre-load (paste at start):**

- This task file (full).
- Current contents of [`frontend/app/globals.css`](../../../../../frontend/app/globals.css) (3 lines — paste literally).
- Current contents of [`frontend/tailwind.config.ts`](../../../../../frontend/tailwind.config.ts).
- One sentence about the brand palette decision (default or chosen).

**Estimated turns:** 1–2.

**Escalate to Opus if:** the agent gets stuck on token naming OR the dark theme palette becomes a discussion. The default is to ship light-only with `.dark` block prepared but not populated; if the agent insists on populating it, escalate.

**Composer-OK sub-steps:** none in this task. (Composer is fine for the post-ship status sync only.)

---

## Acceptance criteria

### Token names (canonical shadcn set)

- [ ] **`frontend/app/globals.css` declares `:root` with the following HSL-triple variables.** No alpha values; let opacity utilities handle transparency.
  ```
  --background, --foreground
  --card, --card-foreground
  --popover, --popover-foreground
  --primary, --primary-foreground
  --secondary, --secondary-foreground
  --muted, --muted-foreground
  --accent, --accent-foreground
  --destructive, --destructive-foreground
  --border, --input, --ring
  --radius                                 // single radius token, e.g. 0.5rem
  ```
- [ ] **Status tokens (in addition to shadcn defaults):**
  ```
  --success, --success-foreground
  --warning, --warning-foreground
  --info, --info-foreground
  ```
- [ ] **`.dark` block is declared but commented as "deferred — populate in U5.4 if promoted".** Same variable names as `:root`. This makes future dark-mode promotion a one-block edit.

### Tailwind theme extension

- [ ] **`frontend/tailwind.config.ts` `theme.extend.colors`** reads each var via `hsl(var(--name))` (or `hsl(var(--name) / <alpha-value>)` for opacity-aware) and exposes it under the canonical name. Pattern:
  ```ts
  colors: {
    background: "hsl(var(--background))",
    foreground: "hsl(var(--foreground))",
    primary: {
      DEFAULT: "hsl(var(--primary))",
      foreground: "hsl(var(--primary-foreground))",
    },
    // ... same for card, popover, secondary, muted, accent, destructive, success, warning, info
    border: "hsl(var(--border))",
    input: "hsl(var(--input))",
    ring: "hsl(var(--ring))",
  }
  ```
- [ ] **`borderRadius` extends with token-driven sizes:** `lg: var(--radius)`, `md: calc(var(--radius) - 2px)`, `sm: calc(var(--radius) - 4px)`. Standard shadcn pattern.
- [ ] **`darkMode: "class"`** added to the config (so `.dark` class on `<html>` flips the palette later).
- [ ] **`tailwindcss-animate` plugin** registered in `plugins: []` (shadcn's `Sheet` / `Dialog` need it; ship it now to unblock A2).

### Default palette (use unless brand says otherwise)

- [ ] **`:root` populated with the documented default** until U6.1 (brand) is decided:
  - Background: `0 0% 100%` (white)
  - Foreground: `222 47% 11%` (slate-900-ish)
  - Primary: `173 80% 36%` (teal-600 in HSL — clinical-calm-modern register from U0.2)
  - Primary-foreground: `0 0% 100%` (white on teal)
  - Accent: `38 92% 50%` (amber-500 — warm "Sent" register, used sparingly)
  - Muted / muted-foreground / border / input: standard slate-100 / slate-500 / slate-200 / slate-200 mappings
  - Destructive: `0 84% 60%` (red-500-ish)
  - Success: `142 71% 45%` (green-600-ish)
  - Warning: `38 92% 50%` (amber-500-ish; can share with accent)
  - Info: `217 91% 60%` (blue-500-ish)
  - `--radius: 0.5rem`
- [ ] Comment block at the top of the `:root` block lists each token with a one-line semantic ("Background of all cards / surfaces — never use `--muted` for cards"). Copy-pasta from BRAND.md when A5 lands; for now, write inline.

### General

- [ ] `npx tsc --noEmit` and `npx next lint` clean from the `frontend/` directory.
- [ ] `npm run dev` boots without theme-related errors.
- [ ] Existing pages still render — they're using raw `bg-blue-600` etc., which is unaffected. Token migration of existing pages happens in B/C/D, not here.
- [ ] No new runtime deps in this task. (`tailwindcss-animate` is a build-time plugin, but is added here to unblock A2.)

---

## Out of scope

- **Migrating existing pages to use tokens.** That's piecemeal across B / C / D and the post-batch migration playbook.
- **Populating the `.dark` palette.** Deferred per U5.4 unless promoted.
- **Typography / spacing tokens.** A3 ships type via `next/font`; spacing stays Tailwind defaults per U0.4 / U1.6.
- **Component-level tokens.** No `--button-bg` etc. — semantic tokens only; components compose from the semantic set.
- **Author `BRAND.md`.** That's A5 — this task may copy palette comments inline; A5 owns the canonical document.

---

## Files expected to touch

**Frontend:**
- `frontend/app/globals.css` — **edit** (~80 LOC added: `:root`, `.dark` placeholder, optional component-base layer for `body` defaults).
- `frontend/tailwind.config.ts` — **edit** (~40 LOC added: `darkMode`, `theme.extend.colors`, `theme.extend.borderRadius`, `plugins`).
- `frontend/package.json` — **edit** (add `tailwindcss-animate` as dev dep; A2 will add the rest of shadcn deps).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **HSL vs OKLCH.** shadcn's canonical pattern is HSL triples. OKLCH is more perceptually uniform but Tailwind's `hsl(var(--…))` interpolation is the well-trodden path. **Stick with HSL** unless a brand reason emerges later. Conversion later is one find-replace.
2. **Why teal-600 over slate-blue or indigo.** Per U0.2 in the source plan: clinical-but-modern, distinct from generic Practo/Halemind blue, healthcare-coded without being "hospital generic." If the user produces a different brand color, swap the `--primary` triple — that's the only line that changes.
3. **Why one `--radius` token.** shadcn cascades it to `lg / md / sm` via calc. Single source of truth for corner-rounding feel; 0.5rem is the modern-but-not-cartoonish default.
4. **`.dark` placeholder vs full dark palette now.** Promoting U5.4 (dim mode) is its own batch — populating dark now means double-maintaining two palettes that haven't been brand-validated. Ship the structure (`.dark { … }` block exists), leave variables empty / commented.
5. **Status colors reusing accent.** `--warning` and `--accent` may share the same amber HSL today; that's fine. Diverge only when a real visual conflict emerges.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch A](../plan-ui-system-redesign-batch.md#sub-batch-a--foundation-5-items-15-days)
- **Source item:** [U1.2 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u12--add-css-var-token-layer-in-globalscss--tailwind-theme-extension)
- **Consumer:** A2 (shadcn primitives), every component touched in B/C/D.
- **shadcn token reference:** https://ui.shadcn.com/docs/theming
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; ready for pickup.
