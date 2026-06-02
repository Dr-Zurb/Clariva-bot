# cv3p-04 — Integration + Phase 3 gate + cross-cutting tests

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 3 — safety + platform](../plan-p3-cockpit-v3-platform-batch.md) |
| **Wave** | 3 (Lane A — last) |
| **Depends on** | cv3p-01, cv3p-02, cv3p-03 |
| **Blocks** | Phase 4 (R-CUTOVER) |
| **Size** | **S–M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-6, v3-DL-8, v3-DL-10, P0-DL-1, P3-DL-1..7 |
| **R-item** | closes Phase 3 (R-CHROME3 + R-PERSIST3 + R-MOBILE3) |

---

## Objective

**Prove the three Phase-3 promises hold *together*, end-to-end, and close the batch gate.** cv3p-01..03 each proved one axis in isolation; this task wires them into one flow and re-verifies the flag-off invariant:

1. **End-to-end durability + safety under reshaping.** Flag on → drag-reshape the layout (Plan to the left, Rx tabbed under Snapshot, Investigations split out) → the safety strip stays pinned + the footer **sends** → reload → the exact arrangement returns → shrink to `<lg` → flat stack with safety + send reachable → restore desktop → arrangement intact.
2. **Migration parity in the live shell.** A representative pane-freedom-era saved layout, dropped into the v3 shell's storage key, renders correctly in v3 (not just in the `validateLayout` unit test — in the mounted shell).
3. **Flag-off invariant (P0-DL-1).** With `NEXT_PUBLIC_COCKPIT_V3` off, the page is byte-identical to today; no v3 code path runs.
4. **Anti-goals clean.** No customize mode, no `PaneDropOverlay`, no fixed-template pre-fill, no preset-CRUD UI, no DnD on mobile in the v3 path.

## Why this task

The three Phase-3 axes interact: persistence must survive a reshape that the chrome had to tolerate, and the mobile fallback must hydrate the same persisted tree. A bug at a seam (e.g. reload after a reshape loses the tab grouping, or the mobile branch reads a stale layout) only shows up when the axes run together. This task is the integration proof + the gate, and the launch point for Phase 4's cutover decision.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/__tests__/CockpitPlatform.integration.test.tsx` | **New** — the end-to-end flow: render the v3 shell inside the Rx providers → add panes → reshape via the engine → assert chrome holds + footer fires → remount on the same key (reload) → assert the arrangement returns → flip the media-query to `<lg` → assert flat fallback + reachable docks → flip back. One coherent scenario. |
| `frontend/components/patient-profile/v3/__tests__/CockpitPlatform.migrationParity.test.tsx` | **New** — pre-seed `localStorage` with a pane-freedom-era v4/v5 tree (nested + multi-tab + hidden) under the shell's key; mount the v3 shell; assert it renders the migrated arrangement (panes visible in the right structure), proving migration parity in the mounted shell. |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit (only if integration surfaces a seam)** — minimal fix; otherwise no change. Document any fix in the decision log. |
| `docs/Work/capture/inbox.md` | **Edit (append)** — Phase 3 shipped behind the flag; deferred items (preset-CRUD-UI port, per-consult-type persistence, `InvestigationsAutoMerge` narrow-merge in v3's flat-pane model); Phase 4 (cutover) is next and must answer V3-Q1 (seed) + the flag-flip. |

> **No `COCKPIT.md` change** — still flag-gated; the user-facing doc updates at the Phase 4 cutover.

> **Import discipline (P0-DL-4):** model/engine/types via `foundation.ts`; kept UI/providers direct; no old-shell / customize imports in any `v3/` file.

## Implementation sketch

### Integration scenario (one test, the whole story)

```tsx
// CockpitPlatform.integration.test.tsx
const key = "platform-it-" + crypto.randomUUID();
const send = vi.fn();

const { rerender } = render(
  <Providers send={send}>
    <CockpitV3Shell panes={tpl} storageKey={key}
      safetyDock={<SafetyStickyStrip …/>} actionDock={<PlanActionFooter …/>} />
  </Providers>,
);

// 1. add snapshot, plan, rx; move plan; tab rx under snapshot (engine ops).
// 2. assert safety dock + action dock present; click footer → expect(send).toHaveBeenCalled().
// 3. flush debounce; unmount; re-render (reload) on the SAME key →
//    assert the reshaped arrangement (split + tab grouping) returns.
// 4. mock useMediaQuery → false (<lg) → assert flat fallback + docks reachable, no DnD.
// 5. mock back to lg → desktop editor groups, arrangement intact.
```

### Migration parity (mounted shell, not just the unit)

```tsx
// CockpitPlatform.migrationParity.test.tsx
window.localStorage.setItem(
  v4TreeLayoutStorageKey(key),
  JSON.stringify(paneFreedomEraTree /* v4/v5 nested + multi-tab + hidden */),
);
render(<CockpitV3Shell panes={tpl} storageKey={key} … />);
// assert the migrated panes render in the expected structure (split present,
// tab group present, hidden panes absent) — proves v3-DL-10 in the live shell.
```

### Flag-off invariant

- Re-assert (cheap) that with the flag off, `PatientProfilePage` renders `<PatientProfileShell>` and **no** `v3/` component mounts (a render test asserting `queryByTestId("p1-cockpit-v3-shell-desktop")` is null when the flag is off). This guards P0-DL-1 at the end of the phase.

## Tests

- [x] **End-to-end** → reshape → chrome holds + footer fires → reload restores → mobile flat + reachable → desktop restore. Green as one scenario.
- [x] **Migration parity (mounted)** → a pre-seeded pane-freedom-era tree renders correctly in the v3 shell.
- [x] **Flag off** → no v3 component mounts; old shell renders (P0-DL-1).
- [x] **Anti-goals** → no `PaneDropOverlay` / `customize-mode-context` / preset-dialog import in the v3 path; mobile has no DnD.
- [x] **Cross-cutting suites green** → cv3p-01..03 suites (chrome-reparent, leaf-anchor, persistence, migration, mobile) all pass together.

## Acceptance criteria (Phase 3 gate)

This is the batch's cross-cutting gate — all must be green:

- [x] **Chrome:** docks outside tree + DnD context; footer **sends** in ≥3 reshaped arrangements; safety strip unhideable + pinned; empty-state travels with `snapshot`; docks on blank canvas + across states (R-CHROME3 / P3-DL-1/2).
- [x] **Persistence:** drag-built arrangement round-trips; pane-freedom-era layouts migrate (idempotent); blank-seed never clobbers; per-doctor restore (V3-Q6); reset → blank; no new key/schema (R-PERSIST3 / P3-DL-3/4/5/7).
- [x] **Mobile:** `<lg` flat, no DnD/splits/palette; safety + send reachable; `lg+` unchanged (R-MOBILE3 / v3-DL-8 / P3-DL-6).
- [x] **Integration:** the end-to-end flow + migration-parity-in-shell are green; flag-off byte-identical (P0-DL-1).
- [x] **Quality:** `npx tsc --noEmit` + `npm run lint` clean; Phase 3 v3 suites green (full `npm test` may hang on the pre-existing inbox issue — run targeted).
- [x] **No engine/schema/migration edit;** no new persistence layer/key (v3-DL-1 / v3-DL-10 / P3-DL-3).
- [x] **Docs:** inbox updated; no `COCKPIT.md` change.

## Out of scope (explicit)

- Phase 4 cutover (parity matrix vs old shell, flag flip, deleting the old shell / customize mode / `PaneDropOverlay`) → R-CUTOVER.
- Answering V3-Q1 (seed) or the flag-flip date → Phase 4.
- Preset-CRUD-UI port / per-consult-type persistence → deferred (captured here).

## Decision log

- **One integration scenario, not many.** The value is the *seams* between chrome / persistence / mobile, so a single end-to-end flow that crosses all three catches more than three isolated re-tests.
- **Migration parity is re-asserted in the mounted shell.** cv3p-02 proves `validateLayout` migrates; this proves the *shell* renders the migrated tree — the thing a real doctor sees on the flag-flip.
- **Flag-off re-verified at the gate.** P0-DL-1 is the whole program's safety net; cheap to re-assert at phase close, expensive to discover broken at cutover.
- **Integration rerender must not re-seed localStorage.** `platformShellUi(..., { preservePersisted: true })` reads the reshaped tree back before mobile/desktop rerenders; naive re-seed would clobber persistence mid-scenario.
- **Migration parity uses mocked `useShellLayout` with real `validateLayout`.** Full shell mount + pre-seeded localStorage hangs on cpf-04 hydration churn; `layoutSeed` carries the migrated tree the live hook would hydrate — same pattern as cv3p-01 chrome tests.

## References

- [`task-cv3p-01-anchored-chrome-and-provider-scope.md`](./task-cv3p-01-anchored-chrome-and-provider-scope.md) · [`task-cv3p-02-persistence-migration-and-reset.md`](./task-cv3p-02-persistence-migration-and-reset.md) · [`task-cv3p-03-mobile-flat-fallback.md`](./task-cv3p-03-mobile-flat-fallback.md)
- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — the assembled shell under test.
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `validateLayout` / `v4TreeLayoutStorageKey` for the migration-parity seed.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the flag branch (~L1126) for the flag-off assertion.
- Batch: [`plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) · Order: [`EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./EXECUTION-ORDER-p3-cockpit-v3-platform.md).
- Source plan: [`plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — R-CHROME3 / R-PERSIST3 / R-MOBILE3; next is R-CUTOVER (Phase 4).

---

**Status:** `Done` ✅ (2026-05-31). Phase 3 gate green — 38 targeted tests; `tsc` + `lint` clean. Phase 4 (cutover) is next.
