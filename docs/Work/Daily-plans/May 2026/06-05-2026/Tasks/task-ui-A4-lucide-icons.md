# Task ui-A4: Adopt `lucide-react` + replace inline SVGs

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch A (Foundation) — **XS item, ~2h**

---

## Task overview

Today the codebase has 3-4 hand-rolled inline `<svg>` blocks scattered across components — see the "View conversation" icon in [`appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/%5Bid%5D/page.tsx), the menu icon in [`Header.tsx`](../../../../../frontend/components/layout/Header.tsx), and similar inline SVGs in consultation components. shadcn's primitives (A2) expect `lucide-react` for their default icon needs (`X` close, `ChevronDown`, `Check`, etc.) and the Sidebar redesign (B2) wants a per-nav-item icon set.

This task adds `lucide-react` as a dep, replaces the existing inline SVGs with their lucide equivalents, and establishes the import convention (`import { ChevronDown } from "lucide-react"`).

**Estimated time:** ~2h.

**Status:** Drafted.

**Hard deps:** none. Can run in parallel with A2 / A3 / A5.

**Soft deps:** none.

**Source:** [U1.3 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u13--adopt-lucide-react-for-iconography).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (mostly find-and-replace).

**Why this tier:** Bounded; needs to identify each inline SVG and pick the right lucide name. Composer would miss subtle stroke/size differences.

**New chat?** Optional — can batch with A3 in the same chat (both small, both touch `app/layout.tsx` adjacent files). If batched, finish A3 cleanly before starting A4.

**Pre-load (paste at start):**

- This task file.
- The output of: `rg "<svg" frontend/components/ frontend/app/ --type tsx -l` (list of files with inline SVGs — agent should run this first if not pasted).

**Estimated turns:** 1–2.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** the dep install + the `package.json` edit can be Composer; the SVG replacements should stay on Sonnet because picking the right lucide icon name takes a moment of judgment per icon.

---

## Acceptance criteria

### Dep install

- [ ] **`npm install lucide-react`** in `frontend/`. Pin to a recent stable version; lucide is stable.
- [ ] `frontend/package.json` and `package-lock.json` reflect the install.
- [ ] Bundle size impact verified: lucide-react is fully tree-shakable; only used icons ship. No `import * as Icon from "lucide-react"` patterns allowed.

### SVG sweep + replacement

- [ ] **Run a sweep:**
  ```
  rg "<svg" frontend/components/ frontend/app/ --type tsx -l
  ```
- [ ] **For each file in the result, replace inline SVGs with lucide equivalents** where there's a clear semantic match. Examples:
  | Inline SVG | lucide replacement |
  |---|---|
  | "View conversation" speech bubble in [`appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/%5Bid%5D/page.tsx) | `<MessageSquare className="h-4 w-4" />` |
  | Menu hamburger in [`Header.tsx`](../../../../../frontend/components/layout/Header.tsx) | `<Menu className="h-5 w-5" />` |
  | Close (X) buttons | `<X className="h-4 w-4" />` |
  | Check / done | `<Check className="h-4 w-4" />` |
  | Chevrons | `<ChevronDown />` / `<ChevronRight />` |
- [ ] **Don't replace decorative SVGs** that are clearly bespoke (logo, illustration). Only the iconographic ones.
- [ ] **Match size + stroke** to the original via Tailwind classes (`h-4 w-4` for 16px, `h-5 w-5` for 20px, etc.). Lucide's default stroke is 2; if the original was thinner, pass `strokeWidth={1.5}`.

### Convention doc

- [ ] **Add a one-paragraph note** at the top of `docs/Reference/business/BRAND.md` (or in the A5 task if BRAND.md doesn't exist yet — coordinate with A5):
  ```
  ## Icons — lucide-react only
  Import per-icon: `import { Bell, Menu, MessageSquare } from "lucide-react"`.
  Default size: h-4 w-4 (inline) or h-5 w-5 (button-sized).
  Default stroke: 2 (lucide default). Use 1.5 for finer lines in chart-rail headers.
  No inline <svg> for new icons; no other icon library.
  ```
  If BRAND.md doesn't exist yet, leave a TODO in this task's notes and let A5 absorb it.

### Smoke test

- [ ] Pages with replaced icons render visually identical at the same sizes.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx next lint` clean.
- [ ] Bundle visualization (optional but recommended): run `npx @next/bundle-analyzer` if already configured; verify lucide adds <30KB gz.

---

## Out of scope

- **Adding sidebar / cockpit icons.** B2 (sidebar regrouping) and C* (cockpit) own their per-component icon imports. This task only does the existing inline-SVG sweep.
- **Replacing logo / brand SVGs.** Those are in A5.
- **Custom icon set.** Lucide is the standard; no Heroicons / Tabler / Phosphor mixing.

---

## Files expected to touch

**Frontend:**
- `frontend/package.json` + `package-lock.json` — **edit** (lucide-react add).
- `frontend/components/layout/Header.tsx` — **edit** (menu icon).
- `frontend/app/dashboard/appointments/[id]/page.tsx` — **edit** ("View conversation" icon).
- Any other file caught by the `rg "<svg"` sweep — **edit** as appropriate.
- `docs/Reference/business/BRAND.md` — **edit** if it exists (A5 may create it; if not, defer the convention note).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Why lucide over Heroicons / Tabler.** shadcn ships with lucide as the canonical icon set; Tabler is heavier; Heroicons has fewer icons in the medical/healthcare register. Sticking with the shadcn-blessed default keeps the system coherent.
2. **Tree-shaking guarantee.** Webpack/Turbopack should tree-shake `lucide-react` automatically when imports are named (not `*`). Verify by checking the build output if you're paranoid.
3. **Stroke uniformity.** Lucide defaults to stroke-width 2 across all icons; this is what the system expects. Don't mix strokes within the same surface.
4. **Don't import the whole library.** `import * as Icons from "lucide-react"` defeats tree-shaking; use named imports only.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch A](../plan-ui-system-redesign-batch.md#sub-batch-a--foundation-5-items-15-days)
- **Source item:** [U1.3 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u13--adopt-lucide-react-for-iconography)
- **lucide docs:** https://lucide.dev/icons/
- **Consumers:** B2 (sidebar nav icons), every component using icons downstream.
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).

**Icon convention (for BRAND.md — A5 will absorb):**

> ## Icons — lucide-react only
> Import per-icon: `import { Bell, Menu, MessageSquare } from "lucide-react"`.
> Default size: h-4 w-4 (inline) or h-5 w-5 (button-sized).
> Default stroke: 2 (lucide default). Use 1.5 for finer lines in chart-rail headers.
> No inline `<svg>` for new icons; no other icon library.
