# Task csf-04: Flip the production appointment-detail page to the 8-pane factory

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 3, Lane α step 0 — **S, ~2h**

---

## Task overview

After csf-03, `getTelemedVideoTemplate(ctx)` returns a tree of real components (5 leaves) plus 2 deferred placeholders. But no production page consumes it. `/dashboard/appointments/[id]` still renders the legacy 3-pane chart/body/rx layout via the `builtInPanes` array in `frontend/components/patient-profile/PatientProfilePage.tsx` lines 292–358.

This task is **the user-visible flip**. After it ships:

- `/dashboard/appointments/[id]` (no query string) renders the 8-pane Telemed-Video layout by default.
- The legacy 3-pane `builtInPanes` array is renamed `legacyBuiltInPanes` and stays in the file (csf-05's kill-switch needs it).
- Walk-in branch (`!showChart`, `appointment.patient_id == null`) keeps the 2-pane fallback (DL-5).
- Storage namespace bumps from `patient-profile:v1:layout` to `patient-profile:v2:telemed-video-layout`.
- The cv2-02 layout-tree migrator continues to read old keys silently and translate column widths where possible.
- Mobile (`<lg`) is unchanged — `MobilePillBar` keeps mounting (DL-12 from cv2).

This is the moment doctors first see the new 8-pane layout in production.

**Estimated time:** ~2h (1h for the cutover + storage rename, 1h for the smoke matrix on real appointments).

**Status:** Done.

**Hard deps:** csf-03 (the factory's leaves return real content; otherwise the cutover would render placeholders to doctors).

**Source:** [plan-cockpit-shell-flip-batch.md § Wave 3](../plan-cockpit-shell-flip-batch.md#wave-3--production-cutover--kill-switch-2-tasks-3h-single-sequential-lane), [plan-cockpit-v2.md § "Phase 2 gate"](../../../../Product%20plans/plan-cockpit-v2.md), DL-12 (mobile preserved).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Hook swap inside `PatientProfilePage`; storage key rename; walk-in fallback preservation. Pattern is well-established.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- post-csf-03 — `frontend/lib/patient-profile/templates.tsx` (the wired factory).
- `frontend/components/patient-profile/PatientProfilePage.tsx` — read lines 292–360 carefully (the `builtInPanes` array being renamed) and lines 524–642 (the JSX root).
- `frontend/lib/patient-profile/types.ts` (`flattenPaneDefinitions` + `PaneDefinition` from cv2-01 — already walks recursive children).
- `frontend/lib/patient-profile/layout-tree.ts` (the v3→v4 migrator from cv2-02; this task adds a v4→v5 noop or reads existing v3/v4 silently).
- `frontend/components/patient-profile/PaneToggleBar.tsx` (consumer of `toggleBarPanes` — already walks the tree post-cv2).
- The cv2-08 verification report for the regression baseline.
- The csf-02 + csf-03 task files (sibling).

**Estimated turns:** 3–5 turns.

---

## Acceptance criteria

### Step 1 — Rename `builtInPanes` to `legacyBuiltInPanes`

- [x] In `frontend/components/patient-profile/PatientProfilePage.tsx`, rename the existing `builtInPanes` `useMemo` to `legacyBuiltInPanes`. Keep the array intact — csf-05 short-circuits to it from the kill-switch path.
- [x] Update its top-of-array comment to "Legacy 3-pane layout, kept for the `?v1=1` kill-switch (csf-05). Phase 3 deletes this array after the 4-week soak window — see `docs/Work/capture/inbox.md`."
- [x] Tsc clean.

### Step 2 — Add the `useTelemedVideoTemplate` hook (or inline `useMemo`)

- [x] Inside `PatientProfilePage`, add a `useMemo` (or a small custom hook `useTelemedVideoTemplate(ctx)` if the team prefers; the inline `useMemo` is fine for a one-call site):

  ```tsx
  const telemedVideoTemplate = useMemo(
    () =>
      getTelemedVideoTemplate({
        appointment,
        token,
        state: cockpitState,
        launcherRef,
        hideHeader: true,
        onRxSent: handleRxSent,
        onMarkNoShow: handleMarkNoShow,
        onFinishVisit: handleFinishVisit,
        onMedicineCountChange: handleMedicineCountChange,
        finishBusy: finishingVisit,
      }),
    [
      appointment,
      token,
      cockpitState,
      launcherRef,
      handleRxSent,
      handleMarkNoShow,
      handleFinishVisit,
      handleMedicineCountChange,
      finishingVisit,
    ]
  );
  ```

- [x] Verify all referenced variables exist in `PatientProfilePage`'s scope today. Most do — `appointment`, `token`, `cockpitState`, `launcherRef`, `finishingVisit`, the four handlers. If any are missing, lift them from inside the existing `builtInPanes`/`legacyBuiltInPanes` `useMemo` body to component scope.

### Step 3 — Choose between Telemed-Video and walk-in fallback

- [x] Add a derived `panesToMount`:
  ```tsx
  const panesToMount = useMemo(() => {
    if (!showChart) {
      // Walk-in fallback (DL-5): legacy 2-pane horizontal layout, body + rx.
      return legacyBuiltInPanes.filter(p => p.id !== 'chart');
    }
    return telemedVideoTemplate;
  }, [showChart, legacyBuiltInPanes, telemedVideoTemplate]);
  ```
  `showChart` is the existing variable indicating a known patient (per the existing logic in `PatientProfilePage`).
- [x] Pass `panesToMount` to `<PatientProfileShell>` instead of the existing `builtInPanes`.

### Step 4 — Preserve mobile branch (DL-12 from cv2)

- [x] Verify the `<lg` viewport branch (the `MobilePillBar` mount) is unchanged. The mobile branch should already gate on a viewport-size hook outside the shell tree; the new `panesToMount` only feeds the desktop branch.

### Step 5 — Update storage namespace

- [x] In `frontend/lib/patient-profile/PatientProfilePage.tsx` (or wherever the localStorage key is computed — it lives in the seed loader / persist effect), change the active key from `patient-profile:v1:layout` (post-cv2) to `patient-profile:v2:telemed-video-layout`.
- [x] **Do not delete the old key on read** — leave it in localStorage so the cv2-02 migrator can read it. The new key starts empty; first-mount writes it.
- [x] Verify the cv2-02 `readLegacyLayoutOnce` / `migrateLegacyTreeToCurrent` paths handle the case where an old v3/v4 payload exists under the old key but the new key is empty. If translation is feasible (column widths in v4 → outer-horizontal sizes in the new tree), apply it; otherwise the new tree falls back to defaults.

### Step 6 — Tsc + lint + build sweep

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.

### Step 7 — Smoke matrix on real appointments

- [ ] Open a real telemed appointment in dev. The 8-pane layout renders.
- [ ] Drag handles work at every nesting level (cv2-01 already proved this on the deleted `/v2-tree`; this gate confirms it survives in production).
- [ ] Cascade handles respect each leaf's `minSizePct` + `minSizePx` per cv2-01.
- [ ] Reload the page — layout persists (under the new storage key).
- [ ] Open a walk-in appointment (anonymous patient). The 2-pane horizontal layout (body + rx) renders.
- [ ] Open a real telemed appointment on a `<lg` viewport (DevTools mobile emulation). The MobilePillBar flow renders unchanged.

### Step 8 — Delete the smoke route from csf-03 (if Option B)

- [x] If csf-03 added `frontend/app/dashboard/_dev/cockpit-v2-flip-smoke/page.tsx` for its smoke pass, delete it now. Verify `rg "cockpit-v2-flip-smoke"` returns zero matches in `frontend/`.

---

## Out of scope

- **The kill-switch `?v1=1` reader.** csf-05 owns it. csf-04 only renames `builtInPanes` to `legacyBuiltInPanes`; csf-05 wires the conditional.
- **Adding R-MOD modality auto-switch.** R-MOD-full follow-up batch.
- **Adding the patient ribbon.** R-RIBBON follow-up batch.
- **Tuning per-leaf `naturalSizePct` / `minSizePx` numbers.** Use whatever cv2-03 set; tuning is a follow-up batch's call.
- **Migrating doctor preset rows in the database** to the new tree shape. Per DL-8, doctor presets continue to apply through `<CockpitHeader>`'s preset dropdown via the existing cc-08 / cc-10 path, unchanged. The presets table doesn't need migration — its payloads describe layout state that the new shell can read or ignore.

---

## Files expected to touch

**Modified:**

- `frontend/components/patient-profile/PatientProfilePage.tsx` — rename array, add factory hook, add `panesToMount`, swap shell prop, update storage key (~30 LOC delta).
- (conditional) `frontend/lib/patient-profile/layout-tree.ts` — verify the migrator handles the v4→empty-new-tree fallback. May need a one-line addition.

**Created / Deleted:**

- (conditional) Delete `frontend/app/dashboard/_dev/cockpit-v2-flip-smoke/page.tsx` if csf-03 created it.

---

## Notes / open decisions

1. **Why keep `legacyBuiltInPanes` in the file rather than a separate module?** Two reasons: (a) the kill-switch is a 4-week temporary path, not a permanent fork — file co-location signals impermanence, (b) extracting to a separate module would require another layer of imports and another follow-up to clean up. Inline + comment + capture-inbox follow-up is cleaner.

2. **What if the new tree's defaults look bad on common monitor sizes?** Tune per-leaf `naturalSizePct` / `minSizePx` in csf-06's verification step or in a follow-up batch. Don't tune in csf-04 — keep the cutover focused on structure.

3. **What if doctors with saved presets see broken layouts?** The presets-apply path runs through `<CockpitHeader>`'s preset dropdown via `usePatientProfilePresets` (cc-10). Each preset is a flat-tree v3/v4 payload describing chart/body/rx widths. The new tree ignores those because the structure is different — doctors keep their preset records but applying them on the new shell silently falls back to defaults. **Capture an inbox line** for "Phase 3: migrate cockpit_layout_presets payloads to v5 tree shape post-flip" — but don't block this batch on it.

4. **Why `hideHeader: true` in the `ctx`?** The new shell renders pane-level chrome (drag handles, collapse buttons, pane title strip from cc-02). The internal H2 inside each component would double up. csf-03 uses `hideHeader` to hide the section's own H2 in the wrapper.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § "Phase 2 gate"](../../../../Product%20plans/plan-cockpit-v2.md), DL-12 (mobile preserved).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-3-gate-after-csf-04--csf-05).
- **Predecessor:** [`task-csf-03-wire-real-content-into-leaves.md`](./task-csf-03-wire-real-content-into-leaves.md).
- **Successor:** [`task-csf-05-v1-kill-switch.md`](./task-csf-05-v1-kill-switch.md).

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Done
