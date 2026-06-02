# Task cc-03: Mount `<CockpitColumnHeader>` on the body and Rx columns

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase B, Lane α step 1 — **S, ~1.5h**

---

## Task overview

cc-02 created the shared `<CockpitColumnHeader>` and migrated the chart rail to use it. The body column ("Consultation") and the Rx column ("Prescription") still have **no header strip** — they render the column content (CenterPane / RxWorkspace) immediately at the top of the resizable panel.

This is visually inconsistent (only the chart column is labeled), and it blocks future tasks that need every column to host a drag handle (cc-07) and a collapse chevron (cc-05). cc-03 mounts `<CockpitColumnHeader>` on the body and Rx columns.

**Architectural decision (CC-D7):** the body column header is **static "Consultation"** — no state chip, no derived label. The body's content already shows state-driven cards (`<ReadyCard>`, `<EndedCard>`, `<ConsultationLauncher>`'s own header), so the column header just identifies the column type.

The Rx column header is **static "Prescription"**. Same reasoning — `<RxWorkspace>` shows the prescription state in its own UI; the header just labels the column.

**Estimated time:** ~1.5h (45 min code, 30 min visual + responsive verification across the 4 cockpit states, 15 min snapshot-test updates).

**Status:** Pending.

**Hard deps:** cc-02 (the `<CockpitColumnHeader>` component must exist).

**Source:** [plan-cockpit-customization-batch.md § Phase B / CC-D7](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **No** — stitch onto cc-02 in the same chat. Both tasks touch `<ConsultationCockpit>` and the columns; same mental model.

If you do start a fresh chat, pre-load:
- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (the desktop branch's panel children — where you'll mount the headers).
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (the cc-02 component).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (read-only — confirm it doesn't render its own column heading; if it does, drop it like cc-01 dropped the panel's heading).
- Existing snapshot test files: `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`.

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Mount the header on the body column

- [ ] In `frontend/components/consultation/ConsultationCockpit.tsx`, find the body `<ResizablePanel id="cockpit-col-body">` (currently wraps `<CenterPane>` directly). Wrap the panel's children in a flex column where the header is the first row and `<CenterPane>` fills the rest:

  ```tsx
  <ResizablePanel
    id="cockpit-col-body"
    defaultSize={showChartPanel ? 48 : 74}
    minSize={35}
    className="h-full min-w-0 overflow-hidden"  // NOTE: overflow moves down to the body wrapper
  >
    <div className="flex h-full flex-col">
      <CockpitColumnHeader title="Consultation" titleId="cockpit-body-title" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CenterPane
          state={state}
          appointment={appt}
          token={token}
          launcherRef={launcherRef}
          onRxSent={handleRxSent}
          onMarkNoShow={handleMarkNoShow}
        />
      </div>
    </div>
  </ResizablePanel>
  ```

  - **Why move `overflow-y-auto` from the `<ResizablePanel>` className to the inner body wrapper?** The panel needs to be `overflow-hidden` so the header stays pinned at the top; the body region below the header gets its own scroll context. Without this swap, the header would scroll away with the content.
  - **Why `min-h-0 flex-1`?** Standard Tailwind/flex pattern for "fill the remaining height inside a flex column without forcing the parent to grow". Without `min-h-0` the body wrapper would refuse to scroll because flex children default to `min-height: auto`.

### Mount the header on the Rx column

- [ ] Same pattern for the Rx panel `<ResizablePanel id="cockpit-col-rx">`:

  ```tsx
  <ResizablePanel
    id="cockpit-col-rx"
    panelRef={rxPanelRef}
    defaultSize={26}
    minSize={22}
    collapsible
    collapsedSize={5}
    onResize={handleRxResize}
    className="h-full overflow-hidden bg-background"  // overflow-hidden, not overflow-y-auto
  >
    {rxCollapsed ? (
      <RailCollapsedStub
        side="right"
        label="Prescription"
        onExpand={handleRxExpand}
        ariaKeyShortcuts="]"
      />
    ) : (
      <div className="flex h-full flex-col">
        <CockpitColumnHeader title="Prescription" titleId="cockpit-rx-title" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RxWorkspace
            appointmentId={appt.id}
            patientId={appt.patient_id ?? null}
            token={token}
            state={state}
            onSent={handleRxSent}
            onFinish={() => void handleFinishVisit()}
            onCollapse={handleRxCollapse}
          />
        </div>
      </div>
    )}
  </ResizablePanel>
  ```

  - The collapsed branch (`<RailCollapsedStub>`) is unchanged — when collapsed the column doesn't need a header; the stub IS the header.
  - The expanded branch wraps `<RxWorkspace>` in the same flex-column-with-scroll-region pattern as the body.

### Inspect `<RxWorkspace>` for an existing top-level heading

- [ ] Open `frontend/components/consultation/cockpit/RxWorkspace.tsx` and search for any top-level `<h1>`, `<h2>`, `<h3>`, or "Prescription" / "Rx" string at the top of the rendered tree.
- [ ] If `<RxWorkspace>` already renders a "Prescription" heading, **remove it** (same pattern as cc-01 dropped the chart panel's `<h2>`). The new `<CockpitColumnHeader>` above is the canonical heading.
- [ ] If `<RxWorkspace>` renders a different heading (e.g. the section nav from cs-11), keep that — it's section navigation, not a column heading. The two coexist.

### Body column visual regression check

- [ ] The body column hosts state-driven cards. Verify each renders correctly with the new header above:
  - **Ready / Lobby:** `<ReadyCard>` should sit immediately below the new "Consultation" header. The card's own internal heading (e.g. "Ready to start") becomes the second-level heading.
  - **Live:** `<ConsultationLauncher>` mounts directly. Its own room (Video / Voice / Text) renders below the header. Confirm the room's `h-full` parent calculations still work — the new wrapper preserves the body's full available height minus the header.
  - **Ended / Wrap-up:** `<EndedCard>` sits below the header.
  - **Terminal:** `<TerminalCard>` sits below the header.

### Snapshot tests

- [ ] In `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`, update any existing snapshots that capture the body / Rx panel structure. The new header rows are now part of the DOM tree.
- [ ] Add an it-block: "renders a column header on each of the three columns when chart is present". Assert headings "Patient chart", "Consultation", "Prescription" all appear.
- [ ] Add an it-block for the walk-in case (no chart panel): "renders headers only on body and Rx when chart is hidden".
- [ ] Existing tests pass; `pnpm --filter frontend tsc --noEmit` clean; lint clean for changed files.

### Manual verification

- [ ] Open `/dashboard/appointments/[id]` for an appointment with a patient (chart panel present). Confirm three header strips at the top of the three columns: "Patient chart" · "Consultation" · "Prescription".
- [ ] Open a walk-in appointment (no patient_id, two-pane layout). Confirm two header strips: "Consultation" · "Prescription".
- [ ] Drag the body↔Rx resize handle. Confirm both column contents reflow correctly without the headers moving.
- [ ] Collapse the chart rail (click chevron). Chart column collapses to the stub; body and Rx headers stay rendered.
- [ ] Mobile (≤1023px): the new headers are NOT rendered (the desktop branch isn't taken on mobile). Confirm no visual change vs pre-cc-03.

---

## Out of scope

- **Drag handles inside the headers** — that's cc-07.
- **Slot-based collapse chevron in body / Rx headers** — body never collapses (CC-D2); Rx's collapse stays driven by the existing chevron pattern from cs-08 (until cc-05 unifies it).
- **State-driven body header text** — explicitly rejected via CC-D7. Header is static "Consultation".
- **Mobile header parity** — mobile uses `MobilePillBar`; the desktop column-header model doesn't apply.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~30 LOC delta — wrap two panel children in the new flex pattern).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~5 LOC delta IF an existing top-level heading is found and dropped; otherwise no change).
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` (~30 LOC delta — snapshot updates + 2 new it-blocks).

**New:** none.

---

## Notes / open decisions

1. **Why mount the header in `<ConsultationCockpit>` and not inside `<RxWorkspace>` / `<CenterPane>`?** Two reasons. (a) Symmetry — the chart-rail header is hosted by `<AppointmentChartRail>` (which wraps `<PatientChartPanel>`); the body header should be hosted by the cockpit (which wraps `<CenterPane>`). The cockpit owns the column structure; the children own the column content. (b) cc-07 will need the drag handle on the header, and the drag context (`@dnd-kit/core` `DndContext`) lives at the cockpit level — the header has to be sibling to the drag context.
2. **Why a single label for the body across all states?** CC-D7 lock. Doctor sees state-driven content (Ready card / Live room / Ended card) inside the column; the header just identifies the *column*, not the state. A state-driven label was considered and rejected as "noisy when the body content already shows the state".
3. **What about i18n?** "Patient chart" / "Consultation" / "Prescription" stay as English literals for now — same as the rest of the cockpit. When the i18n pass lands, these go through the same `t(...)` flow as everything else.

---

## References

- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx` (the desktop branch's panel children)
  - `frontend/components/consultation/cockpit/RxWorkspace.tsx` (only if a top-level heading exists today)
- **Component used:** [`task-cc-02-cockpit-column-header-component.md`](./task-cc-02-cockpit-column-header-component.md) — must ship first.
- **Style precedent:** [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md § CS-D7](../../../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) — the per-column header decision is a 2026-05-10 extension of yesterday's CS-D7 (which only added a chart-rail header).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
