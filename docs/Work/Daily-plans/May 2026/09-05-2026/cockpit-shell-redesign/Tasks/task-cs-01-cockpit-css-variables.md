# Task cs-01: Centralize cockpit sticky offsets in CSS variables

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase A, Lane α step 0 — **XS, ~1h**

---

## Task overview

Three cockpit components are sticky-positioned at hardcoded offsets that were calibrated for the **single-row** patient header that shipped on 06-05-2026:

| Component | Current offset | Calibrated for | Today's reality |
|---|---|---|---|
| `<CockpitQueueRail>` | `top-[2.75rem]` (44px) | Single-row 44-px header | Two-row 76-px header (cp-09) |
| `<AppointmentChartRail>` (sticky inner shell) | `top-12` (48px) | Single-row header + queue rail | Same drift |
| `<RxRailToggle>` (vertical stub) | `top-12` (48px) | Single-row header + queue rail | Same drift |

After cp-09 made `<CockpitHeader>` a two-row layout (~76px tall, demographics on row 2), all three sticky elements bleed *into* the header band. The user reported this as "see the whole page there is overlapping over a lot of areas".

This task introduces three CSS custom properties on the cockpit shell root, replaces every hardcoded literal with `var(...)` references, and re-measures the new header to lock the values in. **Visual-only change, no behaviour change.**

**Estimated time:** ~1h (15 min code, 30 min visual verification across the four cockpit states, 15 min screenshot diffs).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D4](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability) — sticky-offset CSS variables.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (the shell root — where the inline `style` lives).
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (read-only — confirm current rendered height with DevTools or the cp-09 task spec).
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (replace `top-[2.75rem]`).
- `frontend/components/ehr/AppointmentChartRail.tsx` (replace `top-12`).
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` (replace `top-12`).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### CSS variables defined on the cockpit shell root

- [ ] In `<ConsultationCockpit>`, the **outermost** rendered element (currently a `div` with `-m-4 md:-m-6 …`) gets an inline `style` prop:

  ```tsx
  style={{
    // CS-D4: single source of truth for sticky offsets across the cockpit subtree.
    // Bump these here when the header chrome changes.
    '--app-header-h': '56px',
    '--cockpit-header-h': '76px',
    '--cockpit-queue-h': '44px',
  } as React.CSSProperties}
  ```

  - **Why inline `style`, not `globals.css`?** Scope. These vars are only meaningful inside the cockpit; we don't want them bleeding into the rest of the dashboard. Inline `style` declares them on the cockpit root, where they cascade only to descendants.
  - **Why `as React.CSSProperties`?** TypeScript doesn't accept `--*` keys on `CSSProperties` by default. The cast is the established Next.js / React pattern.

- [ ] **Verify the values empirically.** Open the cockpit in dev mode, use DevTools to measure the rendered height of `<CockpitHeader>` (the post-cp-09 two-row layout). If it's not 76px (±2px), update `--cockpit-header-h` to match. Same for `<CockpitQueueRail>` (currently ~44px after cp-02's 3-chip layout). The placeholder values above are **best estimates**, not constants — adjust to reality.

### Replace literal sticky offsets

- [ ] In `frontend/components/consultation/cockpit/CockpitQueueRail.tsx`, replace:
  ```tsx
  className="sticky top-[2.75rem] z-10 …"
  ```
  with:
  ```tsx
  className="sticky z-10 …"
  style={{ top: 'var(--cockpit-header-h)' }}
  ```

- [ ] In `frontend/components/ehr/AppointmentChartRail.tsx`, replace:
  ```tsx
  className="sticky top-12 …"
  ```
  with:
  ```tsx
  className="sticky …"
  style={{ top: 'calc(var(--cockpit-header-h) + var(--cockpit-queue-h))' }}
  ```

  - The chart rail sits below both the header AND the queue rail when sticky.

- [ ] In `frontend/components/consultation/cockpit/RxRailToggle.tsx`, replace:
  ```tsx
  className="sticky top-12 …"
  ```
  with:
  ```tsx
  className="sticky …"
  style={{ top: 'calc(var(--cockpit-header-h) + var(--cockpit-queue-h))' }}
  ```

  - Same reasoning — sits below header + queue rail.

### Type-check + lint

- [ ] `pnpm --filter frontend tsc --noEmit` is clean.
- [ ] `pnpm --filter frontend lint` — no new warnings on the touched files.

### Manual verification

- [ ] Open `/dashboard/appointments/[id]` for a video appointment in the `inCall` state.
- [ ] Scroll the page. Confirm the header, queue rail, chart rail, and Rx rail toggle all stack edge-to-edge with **zero z-index fighting** and **zero vertical bleed**.
- [ ] Repeat for `idle`, `ready`, and `ended` states.
- [ ] Compare screenshots against the broken state (the user's reported overlap). The header→queue-rail boundary should now be a clean line.

---

## Out of scope

- **Layout structural changes** — Phase B (cs-07) replaces the page-scroll + sticky model entirely. cs-01 is just a polish patch on the *current* model so we have a clean baseline before refactoring.
- **Mobile / tablet (< lg)** — the mobile layout doesn't use these sticky offsets; the `MobilePillBar` lives at the bottom. No change.
- **Adjusting header height itself** — cp-09 set the height; we just need to *measure* it correctly here. Don't restyle the header.
- **Resize handles / collapse buttons** — those are cs-08.

---

## Files expected to touch

**Modified (4 files, ~12 LOC total):**
- `frontend/components/consultation/ConsultationCockpit.tsx` (+5 LOC — inline `style` prop on the root)
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (~2 LOC — replace literal `top-` with `var(...)`)
- `frontend/components/ehr/AppointmentChartRail.tsx` (~2 LOC — same shape)
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` (~2 LOC — same shape)

**New:** none.

**Tests:** none added (visual-only change; no behavioural assertions to add).

---

## Notes / open decisions

1. **Why not Tailwind theme extension instead of inline `style`?** We could add `cockpit-header` to `tailwind.config.ts` `spacing` and use `top-cockpit-header`. Two reasons against: (a) Tailwind config is global; the var would leak into non-cockpit contexts. (b) Composer/agent-driven runtime updates ("the header is actually 78px on this branch") would require regenerating Tailwind, while inline `style` updates are immediate.
2. **Why `calc(...)` for chart-rail / Rx-rail toggle and not a third variable?** Three vars instead of four reads more cleanly when reasoning about the sticky stack. `calc()` makes the relationship "below header + queue rail" explicit at the call site.
3. **Will Phase B (cs-07) make these vars obsolete?** Partially. cs-07 introduces a fixed-height shell where columns scroll independently — sticky `top-…` is unused inside columns. But `--cockpit-header-h` is still needed to compute the column height (`h-[calc(100vh-var(--app-header-h)-var(--cockpit-header-h))]`). So the vars stay; only the sticky offsets they feed go away.
4. **Z-index hygiene.** The current `z-10` on the queue rail is fine — header is at `z-20`, chart rail at `z-0`, queue rail in the middle. No change needed in this task.

---

## References

- **Affected components:**
  - `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (`sticky top-[2.75rem]`)
  - `frontend/components/ehr/AppointmentChartRail.tsx` (`sticky top-12`)
  - `frontend/components/consultation/cockpit/RxRailToggle.tsx` (`sticky top-12`)
  - `frontend/components/consultation/ConsultationCockpit.tsx` (inline `style` target)
- **Header that drove the drift:** [Daily-plans/May 2026/09-05-2026/cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md](../../cockpit-polish/Tasks/task-cp-09-cockpit-header-two-row-layout.md)

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
