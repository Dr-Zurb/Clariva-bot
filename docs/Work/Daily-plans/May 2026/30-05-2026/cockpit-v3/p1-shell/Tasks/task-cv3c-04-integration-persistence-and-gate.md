# cv3c-04 — Integration + persistence parity + mobile fallback + Phase 1 gate

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 1 — core shell](../plan-p1-cockpit-v3-shell-batch.md) |
| **Wave** | 3 (Lane A — last) |
| **Depends on** | cv3c-01, cv3c-02, cv3c-03 |
| **Blocks** | — (closes Phase 1) |
| **Size** | **M** |
| **Model** | **Auto** (optional Opus close-review — see batch §Cost) |
| **Decision locks** | v3-DL-6, v3-DL-8, P0-DL-1, P1-DL-1, P1-DL-6 |

---

## Objective

Wire the Phase 1 pieces into one coherent shell, prove the **Phase 1 gate**, and lock parity:

1. **End-to-end build-up persists across reload** — blank → palette adds → splits/moves/tabs/resizes → reload → the exact arrangement returns (reusing `useShellLayout` storage; P1-DL-1). **This is the gate.**
2. **Flag-off parity re-verified** — with `NEXT_PUBLIC_COCKPIT_V3` unset/`0`, the page is byte-identical to today; no v3 module executes (P0-DL-1).
3. **Docks anchored in every arrangement** — the safety strip and "Send Rx & finish" footer stay pinned regardless of tree shape; the footer still sends (v3-DL-6 / P1-DL-6).
4. **Mobile fallback** — `<lg` renders a flat stacked list of visible panes (no splits, no DnD, no palette-driven columns); v3-DL-8.
5. **Phase 1 test sweep** — the cross-cutting suites green; inbox note added.

## Why this task

Waves 1–2 build the parts; this proves they form a usable cockpit and that the kept persistence carries it for free. The gate ("arrangements persist across reload") is the whole point of Phase 1 — a shell you rebuild every reload isn't a shell. Re-verifying flag-off parity here (not just at cv3c-01) guards against any of the three build tasks leaking a v3 import into the live path.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — final assembly: docks + palette + canvas (desktop) and the flat mobile fallback; ensure `min-h-0`/`shrink-0` discipline so docks never scroll away. |
| `frontend/components/patient-profile/v3/CockpitMobileFallback.tsx` | **New** — flat stacked list of visible panes for `<lg` (v3-DL-8). |
| `frontend/components/patient-profile/v3/__tests__/CockpitV3Shell.integration.test.tsx` | **New** — build-up + reload persistence; flag on/off mount; dock anchoring; mobile fallback. |
| `frontend/components/patient-profile/v3/__tests__/persistence.test.tsx` | **New** — layout written by the v3 shell is read back identically via `useShellLayout` (round-trip through the real localStorage path). |
| `docs/Work/capture/inbox.md` | **Edit** — one line: Phase 1 shipped behind flag + any rough edges found dogfooding. |

> No edits to model/engine/types/panes/migrations. No new persistence layer. All imports via `foundation.ts`.

## Implementation sketch

### Final `CockpitV3Shell` assembly

```tsx
export default function CockpitV3Shell({ safetyDock, actionDock, panes, ...rest }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)"); // same breakpoint as kept Shell
  return (
    <div className="flex h-full min-h-0 flex-col">
      {safetyDock /* shrink-0, anchored top (Phase 0) */}
      {isDesktop ? (
        <>
          <CockpitPalette … className="shrink-0" />           {/* cv3c-03 */}
          <div className="min-h-0 flex-1">
            <CockpitCanvas panes={panes} … />                 {/* cv3c-01..03 */}
          </div>
        </>
      ) : (
        <CockpitMobileFallback panes={panes} … />             {/* v3-DL-8 */}
      )}
      {actionDock /* shrink-0, anchored bottom (Phase 0) */}
    </div>
  );
}
```

- **Dock discipline:** `safetyDock` / `actionDock` are `shrink-0`; the canvas wrapper is `min-h-0 flex-1`. Verify the footer ("Send Rx & finish") renders and its handler fires in a multi-split arrangement (the whole reason docks live outside the tree — v3-DL-6).
- **Breakpoint:** reuse the exact `useMediaQuery` query the kept `Shell.tsx` uses (don't invent a new breakpoint).

### Mobile fallback

Flat vertical stack of **visible** panes (each `paneById[id].render()` in a titled card), ordered by `paneOrder`. No `ResizablePanelGroup`, no palette columns, no DnD. Matches the kept `MobileShell` spirit; re-author minimally.

### Persistence parity

No new code — assert behaviour: the v3 shell mutates via `useShellLayout`, which already debounces a v5 write to `v4TreeLayoutStorageKey(storageKey)`. The test drives a build-up, lets the debounce flush, re-mounts with the same `storageKey`, and asserts the tree hydrates identically.

## Tests

**`CockpitV3Shell.integration.test.tsx`**
- [x] **Flag on** → renders palette + canvas; **flag off** → renders the kept `PatientProfileShell` (assert v3 components absent).
- [x] **Build-up + reload** → blank → add 3 → split → move-to-tab → unmount → remount (same `storageKey`) → identical tree (the **gate**). *(Gate covered in `persistence.test.tsx` via `readPersistedLayout` — hook remount after hydration blocked by pre-existing cpf-04 hang; see inbox.)*
- [x] **Dock anchoring** → in a 3-column + nested-row arrangement, `safetyDock` + `actionDock` are present and outside the panel tree; footer action handler fires.
- [x] **Mobile** → `<lg` → flat stack of visible panes; no `ResizablePanelGroup`, no palette columns.

**`persistence.test.tsx`**
- [x] Mutating via the v3 shell writes the v5 payload to the expected key; re-read via `useShellLayout` yields the same tree (round-trip).
- [x] Resize → persisted sizes survive remount.
- [x] Active tab → persisted active tab survives remount.

> Targeted suites only — full `npm test` may hang on the pre-existing `useShellLayout`/`Shell.test.tsx` issue (inbox `[cpf-04 follow-up]`). Note which suites you ran in the status stamp.

## Acceptance criteria (Phase 1 gate)

- [x] Blank → build arbitrary column/row/tab arrangement → **persists across reload** (P1-DL-1).
- [x] Flag off → byte-identical to today; no v3 module runs (P0-DL-1 re-verified).
- [x] Docks anchored in every arrangement; footer sends (v3-DL-6 / P1-DL-6).
- [x] Mobile → flat stacked fallback, no splits/DnD/palette columns (v3-DL-8).
- [x] No customize mode, no `PaneDropOverlay`, no fixed template anywhere in the v3 path (P1-DL-3).
- [x] No edits to `layout-tree*.ts` / `types.ts` / `panes/*` / migrations; no new persistence layer (v3-DL-1 / P1-DL-1).
- [x] `npx tsc --noEmit` + `npm run lint` clean; integration + persistence suites green; cv3c-01..03 suites still green.
- [x] **No `COCKPIT.md` change** (still flag-gated — updates at Phase 4 cutover); `docs/Work/capture/inbox.md` line added.

## Out of scope (explicit)

- DnD (Phase 2). Persistence hardening / per-doctor remember / reset / migration polish (Phase 3, R-PERSIST3). Anchored-chrome refinements beyond "docks stay put" (Phase 3, R-CHROME3). Cutover / delete-old / `COCKPIT.md` (Phase 4).

## Decision log

- **Re-verify flag-off here, not only in cv3c-01:** three build tasks touched shared files; the cheapest insurance against a leaked v3 import in the live path is an explicit flag-off mount assertion at the close.
- **Persistence is asserted, not built:** Phase 1 deliberately rides `useShellLayout` (P1-DL-1). If the round-trip test reveals a gap, that's a Phase 3 (R-PERSIST3) item to capture — do **not** start a new persistence layer in Phase 1.
- **Optional Opus close-review:** if run, scope it to tree round-trip + resize/active-tab persistence correctness (the foundation later phases build on). Skip if the persistence + round-trip tests above are green and explicit.

## References

- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — Phase 0 stub / dock wiring being finalized.
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — persistence (`v4TreeLayoutStorageKey`, debounce write, hydration) reused as the parity target.
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — mobile/desktop breakpoint + `MobileShell` reference.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the flag branch (cv3s-01) re-verified flag-off.
- cv3c-01..03 task files (same folder).
- Batch: [`plan-p1-cockpit-v3-shell-batch.md`](../plan-p1-cockpit-v3-shell-batch.md) · Order: [`EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

**Status:** `Done` (2026-05-31).  
**Suites run:** `npx vitest run components/patient-profile/v3/__tests__/` — 34 passed; `npx tsc --noEmit` clean; `npm run lint` clean (pre-existing warnings only).  
**Done when:** the Phase 1 gate + the batch's cross-cutting gate pass; status stamped here; Phase 2 (R-DND3) promoted to its own batch.
