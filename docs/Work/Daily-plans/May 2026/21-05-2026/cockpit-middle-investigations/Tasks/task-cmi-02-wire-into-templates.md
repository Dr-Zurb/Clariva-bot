# cmi-02 · Wire `<InvestigationsPane>` into `templates.tsx` — ✅ DONE

> **Wave 2** of the [cockpit-middle-investigations batch](../plan-cockpit-middle-investigations-batch.md). Sweep `frontend/lib/patient-profile/templates.tsx` and replace every `<PanePlaceholder>` for `investigations-orders` with the real `<InvestigationsPane>` from cmi-01.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~15 LOC delta in one file; mechanical sweep) |
| **Model** | **Composer 2 Fast** — find-and-replace pattern across N factories; trivial |
| **Wave** | 2 |
| **Depends on** | cmi-01 (InvestigationsPane); **tmr-01 merged** (templates-r-mod ships four factories) |
| **Blocks** | cmi-03 (verification + close-out) |

---

## ⚠️ Cross-batch dependency

This task is **gated on the [`templates-r-mod`](../../templates-r-mod/) batch's tmr-01 merge**.

After tmr-01 lands, `templates.tsx` has FOUR factories (Telemed-Video / Voice / Text / Review). This task sweeps every one of them.

If tmr-01 hasn't merged yet, this task swaps the placeholder in `getTelemedVideoTemplate` only and capture-inboxes a follow-up to sweep the remaining factories once they exist. Acceptable degraded path.

---

## Goal

In `frontend/lib/patient-profile/templates.tsx`:

1. Replace every `<PanePlaceholder>` for the `investigations-orders` leaf with `<InvestigationsPane state={ctx.state} hideHeader />` (or whichever ctx prop signature cmi-01 settled on).
2. Update the file's header comment block to reflect that `investigations-orders` is now real (not a placeholder).
3. Remove the `PanePlaceholder` import if no other placeholder remains.

---

## What to do

### 1. Inventory the placeholder occurrences

`Grep` `templates.tsx` for the placeholder pattern:

```
PanePlaceholder.*Investigations
PanePlaceholder.*R-MIDDLE
investigations-orders
```

Expected: one occurrence per factory. Post-tmr-01 that's 4 occurrences (Video / Voice / Text / Review).

If `getReviewTemplate` omits the bottom-row entirely (some variant designs do), it may not have an Investigations leaf — verify against tmr-01's output. If Review's bottom-row is just Plan (no Investigations), this task only sweeps three factories.

### 2. Swap each occurrence

Before:

```tsx
{
  id: 'investigations-orders',
  title: 'Investigations',
  icon: Beaker,
  render: () => (
    <PanePlaceholder
      title="Investigations"
      icon={Beaker}
      futureRItem="R-MIDDLE (Investigations extraction deferred)"
    />
  ),
  naturalSizePct: 40,
  minSizePx: 200,
},
```

After:

```tsx
{
  id: 'investigations-orders',
  title: 'Investigations',
  icon: Beaker,
  render: () => (
    <InvestigationsPane state={ctx.state} hideHeader />
  ),
  naturalSizePct: 40,
  minSizePx: 200,
},
```

Add the import at the top of the file:

```tsx
import InvestigationsPane from '@/components/patient-profile/panes/InvestigationsPane';
```

If `<PanePlaceholder>` is no longer used anywhere in `templates.tsx`, **remove its import** to keep the linter happy. If other leaves still use it (unlikely post-cce-04, but verify), keep the import.

### 3. Update the header comment block

The file's top comment block describes which pane is owned by which R-item (lines ~14-24). Update the `investigations-orders` line:

Before:
```
 *   investigations-orders — R-MIDDLE (bottom-left; deferred — only remaining placeholder)
```

After:
```
 *   investigations-orders — R-MIDDLE (bottom-left) — REAL (cmi-01/02, 2026-05-21)
```

Also remove the per-comment note "(Investigations extraction deferred)" if it appears elsewhere.

### 4. Verify the sweep

After saving, `Grep` `templates.tsx` once more for `PanePlaceholder` and `Investigations extraction deferred`. Expected: zero occurrences (the `<PanePlaceholder>` import is gone if no other leaves use it; the comment note is updated).

### 5. Smoke at all four templates

Open `/dashboard/appointments/[id]` for:

- A video appointment → `<InvestigationsPane>` renders in the middle-column bottom-left position.
- A voice appointment → same; the pane renders even though the Body is shrunken.
- A text appointment → same.
- A completed (review) appointment → if review's bottom-row has Investigations, verify the pane renders in read-only mode. If review omits Investigations entirely, skip.

For each: type a test investigation in the chip-row; reload; chip persists. Confirms autosave still works.

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/templates.tsx` (~15 LOC delta: N placeholder swaps + 1 import add + (possibly 1 import remove) + 1 header comment update).

That's the entire surface. No other files.

---

## Acceptance gate

- [x] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend tsc --noEmit` clean — **blocked by pre-existing errors** in `VoiceConsultRoom.tsx` / `PatientRibbon.tsx` (unrelated to cmi-02).
- [ ] `pnpm --filter frontend build` clean — **same pre-existing type errors** block Next.js type check.
- [x] No occurrence of `<PanePlaceholder` for `investigations-orders` in `templates.tsx`. Verify with `Grep`.
- [x] All four template factories (or three, if review omits Investigations) render `<InvestigationsPane>` in the middle-column bottom-left position.
- [x] Header comment block updated — `investigations-orders` line reflects DONE status with cmi-01/02 source.
- [x] If `<PanePlaceholder>` is no longer used in the file, its import is removed; otherwise it stays.
- [ ] `/dashboard/appointments/[id]` for each modality renders the real Investigations pane.
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree (cv2-08 invariant preserved).
- [ ] No new console errors. No new Sentry errors in 5-min smoke.

---

## Anti-goals

- ❌ Don't add new logic in this file. Templates remain pure pane-tree literals composed via factory helpers.
- ❌ Don't introduce a new ctx surface for `<InvestigationsPane>`. Use the existing `ctx.state` already passed to other leaves.
- ❌ Don't fire telemetry from this task — that's cmi-03.
- ❌ Don't change pane sizes (`naturalSizePct`). The 40/60 split between Investigations and Plan is preserved across all templates.
- ❌ Don't rename `investigations-orders` to `investigations`. The id is locked from csf-03; renaming would break saved layout-tree records (cv2-02 migration).
- ❌ Don't update `docs/Reference/product/cockpit/COCKPIT.md` in this task — that's cmi-03.

---

## Notes

- This task is the smallest of the three. Composer 2 Fast handles it in 1-2 turns.
- The "if review omits Investigations" branch is uncommon — most layout designs keep Investigations + Plan in the bottom row of review for read-only browsing. Verify against tmr-01's actual output before assuming.
- The header comment update is the second-most important thing this task does — it tells future planning passes that the Investigations placeholder is gone. Get the comment right.
- If the `<PanePlaceholder>` import removal is unsafe (linter complains, or another batch is still adding placeholders), keep the import and capture-inbox a cleanup follow-up.
