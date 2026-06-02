# cpfg-01 — Lift action chrome (footer + safety strip + Rx-actions bridge) to shell-level docks

| | |
|---|---|
| **Batch** | [p4-cockpit-pane-freedom-chrome (Phase 4)](../plan-p4-cockpit-pane-freedom-chrome-batch.md) |
| **Wave / lane** | Wave 1 / lane α (single lane — atomic) |
| **Size** | L |
| **Model** | Auto (optional Opus close-gate review after) |
| **Depends on** | Phases 1-3 merged |
| **Blocks** | cpfg-02, cpfg-03, cpfg-04 |

> **⚠️ This task is atomic and consult-critical.** It must move the provider, add the dock slots, relocate both strips, and slim the `groupWrapper` **in one commit** — any intermediate state would double-render the footer (dock + groupWrapper) or strand its provider. "Send Rx & finish" is how a doctor ends a visit; do not ship a half-lift.

---

## Objective

Lift the three action/cross-cutting chrome wrappers out of `middle-bottom`'s position-bound `groupWrapper` so they survive any layout reshape:

1. **`RxFormActionsBridgeProvider`** → page-root provider stack (P4-DL-2).
2. **`SafetyStickyStrip`** → a desktop-only **top dock** in the shell (P4-DL-1).
3. **`PlanActionFooter`** → a desktop-only **bottom dock** in the shell (P4-DL-1).

…and slim `middle-bottom`'s `groupWrapper` down to **only** its `@container/middle-bottom` responsive `<div>` so `InvestigationsAutoMerge`'s narrow-merge query keeps working (P4-DL-4).

At the default layout the result must be **pixel- and behaviour-identical** to Phase 3 (P4-DL-6). The lift only becomes visible when a doctor moves `plan` / `rx` — at which point the footer/safety stay put instead of vanishing.

---

## Why (context)

`groupWrapper` is a `PaneDefinition` field — `(children) => ReactNode` — consumed in `Shell.tsx`:

```1293:1295:frontend/components/patient-profile/Shell.tsx
                    return node.groupWrapper
                      ? node.groupWrapper(subtree)
                      : subtree;
```

Today `middle-bottom`'s `groupWrapper` carries three action wrappers:

```270:285:frontend/lib/patient-profile/templates.tsx
    groupWrapper: (children) => (
      <RxFormActionsBridgeProvider>
        <div
          className="@container/middle-bottom flex h-full flex-col"
          style={{ containerType: 'inline-size', containerName: 'middle-bottom' }}
        >
          <SafetyStickyStrip appointmentId={appointment.id} />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <PlanActionFooter
            state={ctx.state}
            appointmentId={appointment.id}
            finishBusy={ctx.finishBusy}
          />
        </div>
      </RxFormActionsBridgeProvider>
    ),
```

The problem: this wrapper is nailed to the `middle-bottom` *tree position*. After Phase 2/3 a doctor can drag `plan` (or `rx`) out of `middle-bottom`; the footer + safety strip stay behind. The investigation found the fix is small because the heavy providers are already lifted:

- **`RxFormProvider` + `RxSafetyProvider` already wrap the whole page** (`PatientProfilePage.tsx` lines 1219-1225). So `SafetyStickyStrip` (reads `useRxSafety()`) needs **no provider move**.
- **Only `RxFormActionsBridgeProvider`** (read by the footer via `useRxFormActions()`, registered by `PrescriptionForm` in `RxPane` via `useRegisterRxFormActions()`) is still scoped inside the groupWrapper. Lift it to the page root and both registrar + reader share it regardless of tree position.
- **`MobileShell` never applies `groupWrapper`** — so mobile already doesn't show these (finish-visit on mobile is the header CTA). Desktop-only docks preserve that.

---

## Files to touch

| File | Change |
|---|---|
| `frontend/components/patient-profile/PatientProfilePage.tsx` | Add `RxFormActionsBridgeProvider` to the page-root provider stack; pass `safetyDock` + `actionDock` to `<PatientProfileShell>`. |
| `frontend/components/patient-profile/Shell.tsx` | Add `safetyDock?` + `actionDock?` to `PatientProfileShellProps` + `DesktopShellProps`; render them in `DesktopShell` only, as `shrink-0` siblings around the `flex-1` tree, outside `<DndContext>`. |
| `frontend/lib/patient-profile/templates.tsx` | Slim `middle-bottom`'s `groupWrapper` to only the `@container` `<div>`; drop the three action wrappers + their now-unused imports (`RxFormActionsBridgeProvider`, `SafetyStickyStrip`, `PlanActionFooter`). |

**Do not change** `PlanActionFooter.tsx`, `SafetyStickyStrip.tsx`, or `RxFormActionsContext.tsx` — they keep their props + telemetry; only their mount site moves.

---

## Implementation

### Step 1 — Lift `RxFormActionsBridgeProvider` to the page root

In `PatientProfilePage.tsx`, the page already returns a provider stack around `pageContent` (lines ~1218-1226):

```tsx
return (
  <RxFormProvider key={rxProviderKey} {...rxProviderProps}>
    <RxSafetyProvider token={token} patientId={appt.patient_id ?? null}>
      <RxFormActionsBridgeProvider>          {/* ← NEW: lifted from middle-bottom */}
        <PrescriptionFormShellProvider value={rxFormSetup}>
          {pageContent}
        </PrescriptionFormShellProvider>
      </RxFormActionsBridgeProvider>
    </RxSafetyProvider>
  </RxFormProvider>
);
```

Add the import: `import { RxFormActionsBridgeProvider } from "@/components/cockpit/rx/RxFormActionsContext";`

Now any descendant — the `RxPane` registrar (deep in the tree) and the docked footer reader (in `DesktopShell`) — shares the one provider. **React context follows the rendered hierarchy**, so the footer element created in the page and passed as `actionDock` reads this provider from wherever `DesktopShell` renders it (inside `pageContent`, inside this provider). ✓

### Step 2 — Add desktop-only dock slots to the shell

In `Shell.tsx`, extend the props:

```tsx
interface PatientProfileShellProps {
  // …existing…
  /** cpfg-01: shell-level top dock (drug-safety strip). Desktop only. */
  safetyDock?: ReactNode;
  /** cpfg-01: shell-level bottom dock (Rx finish footer). Desktop only. */
  actionDock?: ReactNode;
}
```

Thread them through `PatientProfileShell` → `<DesktopShell … safetyDock={safetyDock} actionDock={actionDock} />`, and add the same two fields to `DesktopShellProps`.

In `DesktopShell`'s return (currently lines ~712-755), wrap the tree:

```tsx
return (
  <CustomizeModeContext.Provider value={customizeMode}>
    <div
      data-testid="patient-profile-shell-desktop"
      className={cn("flex h-full w-full flex-col", className)}
    >
      {safetyDock ? <div className="shrink-0">{safetyDock}</div> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-0 flex-1">
          {renderPaneSubtree({ /* …unchanged… */ })}
        </div>
        <DragOverlay dropAnimation={null}>{/* …unchanged… */}</DragOverlay>
      </DndContext>
      {actionDock ? <div className="shrink-0">{actionDock}</div> : null}
    </div>
  </CustomizeModeContext.Provider>
);
```

Notes:
- Docks are **outside `<DndContext>`** — they are not drag targets, and the footer/safety must never participate in pane DnD.
- The tree is wrapped in `min-h-0 flex-1` so it fills the space between the two `shrink-0` docks and still scrolls internally. (The existing `ResizablePanelGroup` already fills its parent height.)
- The docks render `null`-safe so existing callers/tests that don't pass them are unaffected.
- `MobileShell` is **not** touched — it takes no dock props (P4-DL-5 / DL-7).

### Step 3 — Page passes the docks

At the `<PatientProfileShell>` mount in `PatientProfilePage.tsx` (the `pageContent` JSX, ~line 1121), add:

```tsx
<PatientProfileShell
  ref={shellRef}
  /* …existing props… */
  customizeMode={customizeMode}
  safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
  actionDock={
    <PlanActionFooter
      state={state}
      appointmentId={appt.id}
      finishBusy={finishBusy}
    />
  }
/>
```

Add imports for `SafetyStickyStrip` + `PlanActionFooter` to the page. Use the same `state` / `finishBusy` the page already passes into the template context (`ctx.state` / `ctx.finishBusy`) so behaviour is identical.

### Step 4 — Slim `middle-bottom`'s `groupWrapper`

In `templates.tsx`, reduce the `middle-bottom` `groupWrapper` to only the responsive container (P4-DL-4):

```tsx
groupWrapper: (children) => (
  <div
    className="@container/middle-bottom flex h-full flex-col"
    style={{ containerType: 'inline-size', containerName: 'middle-bottom' }}
  >
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </div>
),
```

Remove the now-unused imports from `templates.tsx`: `RxFormActionsBridgeProvider`, `SafetyStickyStrip`, `PlanActionFooter` (verify nothing else in the file uses them). Keep `InvestigationsAutoMerge` + the `@container` div untouched — the narrow-monitor merge depends on `containerName: 'middle-bottom'`.

> **Why keep the inner `min-h-0 flex-1 overflow-y-auto` div?** It preserves the bottom-row's internal scroll behaviour. The footer/safety used to be siblings of it; now they're at the shell, so the row's children get the full responsive area. Verify the investigations/plan content still scrolls as before.

---

## Tests

Extend the existing suites (no new files needed unless cleaner):

1. **`templates.test.ts`** — assert `middle-bottom`'s `groupWrapper` output no longer contains `PlanActionFooter` / `SafetyStickyStrip` / `RxFormActionsBridgeProvider` (render the wrapper, query by `data-testid` / role: no `plan-action-footer`, no `safety-sticky-strip`). Assert the `@container/middle-bottom` div is still present.
2. **`Shell` test** — render `<PatientProfileShell safetyDock={<div data-testid="dock-safety"/>} actionDock={<div data-testid="dock-action"/>} …/>` on a desktop viewport; assert both docks render as siblings of the tree; assert they are **absent** on the mobile branch (`patient-profile-shell-mobile`).
3. **`PlanActionFooter.test.tsx` / `SafetyStickyStrip.test.tsx`** — unchanged; confirm still green (the components didn't change).
4. **Provider-scope regression** — a test (in the Shell or page test) that renders the footer in a dock and a fake registrar elsewhere, both under one `RxFormActionsBridgeProvider`, and asserts the footer reads the registered `sendAndFinish`. (This is the consult-critical invariant.)

Run:

```bash
cd frontend
npx tsc --noEmit
npm test -- lib/patient-profile/__tests__/templates.test.ts \
  components/cockpit/middle/__tests__/PlanActionFooter.test.tsx \
  components/cockpit/middle/__tests__/SafetyStickyStrip.test.tsx
```

---

## Acceptance criteria

- [x] `RxFormActionsBridgeProvider` mounted at page root; removed from `middle-bottom`'s `groupWrapper` (P4-DL-2).
- [x] `PatientProfileShell` + `DesktopShell` accept `safetyDock` + `actionDock`; rendered **desktop-only**, `shrink-0` siblings of the `flex-1` tree, outside `<DndContext>` (P4-DL-1, P4-DL-5).
- [x] `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) render in the docks; removed from the groupWrapper. No double-render.
- [x] `middle-bottom`'s `groupWrapper` slimmed to only the `@container/middle-bottom` responsive `<div>`; `InvestigationsAutoMerge` narrow-merge still works (P4-DL-4).
- [x] **Default layout: zero visual + behavioural diff** (P4-DL-6) — manually compare against Phase 3.
- [x] Drag `plan` to the left column → footer still present at shell bottom, still sends.
- [x] Drag `rx` into another container → footer still reads its send handlers (provider lift verified).
- [x] Drug-allergy clash → safety strip pins to shell top regardless of `plan` position.
- [x] `<MobileShell>` renders no docks (DL-7).
- [x] Footer visibility across `ready/lobby/live/wrap_up/ended/terminal` unchanged (`canSendPrescription`); DL-8 live-`body` guard intact.
- [x] Existing landed-telemetry still fires once at the new sites (`r_middle_footer_landed`, `r_middle_safety_landed`).
- [x] `npx tsc --noEmit` + targeted tests clean.

---

## Out of scope

- Chart-rail empty-state leaf-anchor → **cpfg-02**.
- Template-invariant guard + re-parent regression suite → **cpfg-03**.
- Removing the `groupWrapper` field entirely → out (the responsive `<div>` still uses it; P4-DL-4).
- Any change to `PlanActionFooter` / `SafetyStickyStrip` / `RxFormActionsContext` internals.

---

## Decision log

- **Atomic, not split.** Adding dock slots and relocating the strips in separate tasks would double-render the footer between them. One commit, one task.
- **Only one provider lifts.** `RxFormProvider` / `RxSafetyProvider` are already page-root; lifting just `RxFormActionsBridgeProvider` is the minimal correct move.
- **Docks live in `DesktopShell`, not `pageContent`.** Putting them in the shell (not the page wrapper) makes desktop-only-ness free (mobile uses `MobileShell`) and keeps the page from re-implementing the mobile/desktop branch.
- **Keep the responsive `<div>`.** It's pure layout and load-bearing for the narrow-merge query — exactly the "pure layout only" `groupWrapper` P4-DL-4 permits.

---

## References

- [Phase 4 plan](../plan-p4-cockpit-pane-freedom-chrome-batch.md) · [Execution order](./EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md)
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../../frontend/lib/patient-profile/templates.tsx)
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../../frontend/components/patient-profile/Shell.tsx)
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx)
- [`frontend/components/cockpit/middle/PlanActionFooter.tsx`](../../../../../../../frontend/components/cockpit/middle/PlanActionFooter.tsx)
- [`frontend/components/cockpit/middle/SafetyStickyStrip.tsx`](../../../../../../../frontend/components/cockpit/middle/SafetyStickyStrip.tsx)
- [`frontend/components/cockpit/rx/RxFormActionsContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormActionsContext.tsx)
- Next: [cpfg-02](./task-cpfg-02-chart-rail-leaf-anchor.md)
