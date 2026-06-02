> **🗄️ ARCHIVED — Cockpit v2 program completed 2026-05-24 via [cockpit-v2-decommission](../../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) batch.**
>
> This plan and its roadmap are kept for historical reference. They are no
> longer the source of truth.
>
> Current cockpit work tracked in:
> - **Daily plans** under [`docs/Work/Daily-plans/`](../../Daily-plans/) — search for "cockpit-".
> - **Future cockpit product plan(s)** — TBD when the next major cockpit
>   refactor is scoped.
>
> See [`docs/Reference/product/cockpit/COCKPIT.md`](../../../Reference/product/cockpit/COCKPIT.md) for the
> **current** cockpit reference (DL-5 of the decommission batch promoted
> this to the live single source of truth).

---

# Cockpit v2 — product plan

## Rebuild the cockpit around how a telemed doctor actually sits — patient at eye level, plan beneath the eye line, context flanking

> **Source thread:** 2026-05-17 chat. Picks up where `plan-cockpit-rx-pane.md` (which this plan **supersedes and replaces**; deleted on merge of this plan, recoverable via git history) left off, and activates the reserved-but-unused `PaneDefinition.children` from [`plan-patient-profile-shell-rebuild.md`](./plan-patient-profile-shell-rebuild.md) (ppr DL-5).
>
> **Supersedes:** `plan-cockpit-rx-pane.md` — was `Drafted (live)`, never promoted to a daily-plans batch. Its DL-1 through DL-12 are preserved here verbatim; its R-items survive as **R-RX-POLISH** (Phase 3 here). The old file is deleted on merge of this plan and recoverable via git history.
>
> **Predecessors (do not re-litigate):**
> - [`plan-00-ehr-roadmap.md`](./ehr/plan-00-ehr-roadmap.md) — Decisions E1–E6 are still in force. Autosave (E5), three-mount-surface invariant (E6), AI deferred (E3).
> - [`plan-t2-ehr-speed.md`](./ehr/plan-t2-ehr-speed.md) — T2.7–T2.14 (`drug_master`, autocomplete, structured pickers, templates, copy-from-last-visit, autosave) are **shipped** and load-bearing.
> - [`plan-patient-profile-shell-rebuild.md`](./plan-patient-profile-shell-rebuild.md) — ppr shipped the flat 3-column shell. This plan upgrades it to a nested tree. ppr DL-5 reserved `PaneDefinition.children`; we activate it.
> - EHR Sub-batch C — allergy clash banner, DDI chips, pre-send soft-guard modal are **shipped**. This plan changes where they render, not how they compute.
>
> **Status:** Phase 1 ✅ shipped (2026-05-17) | Phase 2 ✅ shipped (2026-05-24) | Phase 3 — open for planning
> **Phase 2 closure:** 6 of 6 R-items shipped — R-SHELL, R-MOD, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY. Phase 2 gate criteria met (see §6).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## North star

> Doctor opens a telemed patient, eye stays in one column from patient to prescription. Two chip taps, hit Send. 30 seconds.

Clariva is a **telemed-first, social-media-sourced** EHR — bookings originate from IG / WhatsApp DM, consults are video / voice / text. The cockpit must mirror how a doctor sits with a paper pad in front of a patient: patient at eye level, plan beneath the eye line, history glanceable on the side. No eye-darting. No clicks for context.

After this plan ships:

1. **8 default sub-panes** in a nested tree: left column splits Snapshot / History; middle column stacks Body (video / chat) → Assessment strip → Investigations | Plan; right column splits Subjective / Objective. The doctor's hands (writing Plan) and the doctor's eyes (watching patient) sit in the **same vertical column** — no horizontal eye-darting.
2. **4 modality-aware default templates** (Telemed-Video / Telemed-Voice / Telemed-Text / Read-only Review) auto-select on `deriveCockpitState` change. Voice consults reclaim the body-pane real estate today wasted by an always-fat video tile — Plan gets the room instead.
3. **A patient ribbon** runs full-width above all panes — name, age, allergies, chronic, key med count, and a live `🎯 Treating: {Dx}` mirror of the Plan pane's diagnosis field. Critical context never scrolls off, in any pane.
4. **The Rx pane no longer exists as a single column.** The prescription form distributes across four panes via a shared `RxFormContext`. The `PrescriptionForm.tsx` 1,717-LOC monolith splits into `<SubjectiveSection />`, `<ObjectiveSection />`, `<AssessmentSection />`, `<PlanSection />` — each mountable in any pane.
5. **All the polish items from `plan-cockpit-rx-pane.md` still ship** — sticky safety, sticky send, medicine row densification, per-doctor drug frequency, row-favorites, previous-Rx side sheet, keyboard shortcuts — but now in the new shell context, where they fit naturally.
6. **Future auxiliary surfaces are contracted but not built.** Tabs-within-sub-pane, side sheets, floating docks, modals, and Cmd+K all get TypeScript contracts in Phase 1 (R-FUTURE-PROOFING). Adding lab results, medical records, photos, AI summary, AI chat in a later plan requires implementing the contract, not modifying the shell.

---

## Why this is worth doing now

1. **The current 3-column cockpit forces eye-darting.** Today's `PatientProfileShell` defaults are `26% / 48% / 26%` (Chart | Body | Rx). The doctor watches the patient in the middle column, then darts to the right column to write meds. That eye loop is the single biggest ergonomic problem of the current layout, and no amount of Rx-pane polish fixes it because the **problem is column geometry, not pane chrome**.

2. **Doctors spend ~65% of consult time writing Plan.** Medicines + investigations + advice + F/U is where the hands live. Putting that under the patient's video tile — in the same column — is a real ergonomic win, not a layout preference. Voice consults amplify this: today voice gets the same 48% body pane as video, wasting ~30% of the screen on a thin call-control surface.

3. **`PrescriptionForm.tsx` is 1,717 LOC in one file.** The earlier `plan-cockpit-rx-pane.md` already wanted the Strangler Fig split (its R5); this plan **promotes the split from optional polish to architectural prerequisite**. The form must distribute across panes, so it can't stay monolithic. The Strangler Fig is the enabler of every R-item below.

4. **ppr DL-5 already reserved `PaneDefinition.children`** for exactly this work. The shell rebuild plan scoped v1 to "horizontal columns only" but explicitly designed the type to recurse. This plan activates that latent capability — it's not a re-architecture, it's the second half of ppr.

5. **Telemed-first means body pane is load-bearing in all phases.** In an in-clinic-first design, the body pane is dead weight outside a call. In telemed it's the video tile, the voice waveform, or the chat thread — central across `ready`, `live`, and `wrap_up` states. Default layout decisions made for an in-clinic-first app would be exactly wrong here.

6. **`plan-opd-per-day-mode.md` (shipping today) multiplies cockpit traffic.** When a doctor sees 20 patients on a Tuesday queue, the cockpit is opened and closed 20 times. Every second of layout friction multiplies by 20. The plan that improves layout pays dividends across every other queue / slot feature shipping.

7. **The user's "social-media-first" positioning means the body pane has multiple phases.** Pre-call: IG-DM history. Live: video / voice / chat. Post-call: end card. Today's body pane only does the live phase well; this plan's modality templates open the door to richer per-phase content later.

---

## Decision locks (DL-1 .. DL-25)

DLs 1–12 are **preserved verbatim** from the superseded `plan-cockpit-rx-pane.md` (recoverable via git history). They were locked 2026-05-17 in chat and remain in force. DLs 13–25 are new, locked in the 2026-05-17 evening continuation thread.

Re-opening any of these belongs in a new batch decision on the affected R-item, not mid-execution.

### DL-1 .. DL-12 — preserved from the superseded Rx-pane plan

- **DL-1: `Send Rx & finish ▸` stays the only primary blue CTA.** Implementation moves to a sticky footer spanning the Inv + Plan sub-columns (DL-20); visual primacy is unchanged.
- **DL-2: AI auto-draft remains deferred** (re-affirms E3). No LLM calls in any R-item. The favorites ranking in R-RX-POLISH is statistical, not generative.
- **DL-3: Three-mount-surface invariant survives** (re-affirms E6). Every Rx form change keeps appointment-detail / in-call / post-call mounts working. The cockpit-v2 shell is the cockpit mount; the other two mounts continue rendering `PrescriptionForm` (or its v2 successor — see DL-25) as before.
- **DL-4: Autosave contract is untouched** (re-affirms T2-D3 + E5). 1.5s debounce, no "Save draft" button, `SaveStatus` pill remains the single status surface. The new `RxFormContext` (R-RX-FORM) is the **only** abstraction over autosave; section components consume it.
- **DL-5: Strangler Fig (`PrescriptionForm` split) is now a PHASE 1 prerequisite, not a Batch 3 polish item.** Reverses the original DL-5 sequencing because the new shell can't render distributed sections without the split (see DL-25 below for the new lock).
- **DL-6: No backend schema change beyond favorites/usage tables PLUS the SOAP field expansion** (see DL-24). The Rx-pane plan's no-other-schema rule survives; the only addition is migrating `prescription_drafts` for the new structured fields.
- **DL-7: Row-favorites are per-doctor**, not per-doctor-per-complaint (matches T2-D2).
- **DL-8: Previous-Rx supercharge is a side-sheet**, not a popover replacement. Now uses the side-sheet contract from R-FUTURE-PROOFING.
- **DL-9: Allergy banner + DDI chips pin above the form scroll.** Now implemented as a sticky safety strip at the top of the Plan column's bottom row, above the Assessment strip (see §4 layout).
- **DL-10: Keyboard shortcuts are scoped to the focused pane.** The pane registers/unregisters listeners on mount/unmount.
- **DL-11: No changes to the send pipeline, `PrescriptionPreSendCheck`, or attachment upload flow.** Stickiness changes pin them in a new position; behaviour is byte-for-byte preserved.
- **DL-12: Mobile (`<lg`) behaviour is preserved unchanged.** `MobilePillBar` + bottom-sheet flow continues working. R-SHELL's nested tree applies to `lg+` only; mobile renders a flat sequential pane stack.

### DL-13 .. DL-25 — new locks for cockpit v2

- **DL-13: Telemed-first, social-media-sourced.** Clariva's patient-profile cockpit is optimised for video / voice / text / async telemed flows. In-clinic OPD is **out of scope for this plan** and gets its own surface decisions when introduced. Defaults, sizing, and modality templates do not need to accommodate an in-clinic row.

- **DL-14: Cockpit shell upgrades to a nested tree layout.** `PaneDefinition.children` (reserved in ppr DL-5) becomes active. The shell supports **both vertical and horizontal sub-splits** within a pane (a true 2D tree, not just nested-vertical). React-resizable-panels handles this via recursive `PanelGroup`s.

- **DL-15: Default cockpit is 8 sub-panes** as defined in §4. The cap for v1 *defaults* is 8 sub-panes. Doctors may split further via R-LAYOUT-UX up to a soft cap of 10; defaults always reset to 8.

- **DL-16: Working area is sacred.** Auxiliary content (labs, records, photos, AI) **never gets a permanent default pane** — it attaches via tabs-within-pane, side sheets, floating docks, modals, or Cmd+K. This is the principle that prevents "let's add one more pane" creep over time.

- **DL-17: Four built-in layout templates by modality** — `telemed-video`, `telemed-voice`, `telemed-text`, `review`. Auto-switch on `deriveCockpitState` modality change. Manual override persists within the current visit; doctor setting can disable auto-switch globally.

- **DL-18: Drag / split / merge is an escape hatch, not the main interaction.** Defaults must work for ≥ 90% of doctors without dragging. First-run users see a working screen, never an empty arrangement task. Most doctors never touch R-LAYOUT-UX.

- **DL-19: Assessment lives at the top of the bottom row of the middle column** as a sticky strip (~60px tall) and **echoes live** in the patient ribbon (`🎯 Treating: {Dx}`). The strip is the single source of truth; the ribbon is a read-only mirror that updates within 200ms of any Dx field edit.

- **DL-20: Middle column bottom row splits Investigations (~35%) | Plan-Medicines+Advice+F/U (~65%).** The drag handle between them is user-adjustable. The Save + Send Rx & finish footer spans both sub-columns as a unified sticky bar. Narrow monitors (≤ 1366px container width) auto-merge Investigations into a chip row at top of Plan.

- **DL-21: Right column is the "what we know" column** — top sub-pane = **Subjective** (CC, HOPI), bottom sub-pane = **Objective** (vitals, exam, results). Each is contract-ready for future tabs (R-FUTURE-PROOFING) — e.g., Objective gains a Labs tab in a later plan without restructuring.

- **DL-22: Left column splits as Snapshot (top) / History (bottom)** — activates ppr Part 2. Snapshot = allergies, chronic, current meds, recent vitals trends. History = past visit summaries with click-to-expand.

- **DL-23: Patient ribbon strip is always-on, full-width, sits above all panes.** Read-only. Slots: identity (name, age, sex, weight), allergies (chips, max 3 + "more"), chronic (chips, max 3 + "more"), key med count badge, `🎯 Treating: {Dx}` live mirror. Strip never wraps to 2 lines (overflow → "+N more"). No layout shift on data load.

- **DL-24: SOAP field set expands.** New fields: `vitals` (structured BP / HR / Temp / SpO2 / Wt / Ht / BMI), `examination_findings` (general + systemic), `differential_diagnosis` (chip array), `advice` (text), `follow_up_in` (n + unit), `referral` (text + future autocomplete), `test_results` (text — patient-brought results, separate from `investigations_orders`). The existing `investigations` field renames to `investigations_orders` for semantic clarity. Pre-launch → no data migration risk.

- **DL-25: PrescriptionForm Strangler Fig is a Phase 1 prerequisite, not a Phase 3 polish.** This reverses the original DL-5 sequencing. The new shell can't render distributed sections without the split, so `RxFormContext` + the four section components ship in Phase 1. The cockpit shell upgrade (R-SHELL) and the form split (R-RX-FORM) can run in parallel chats; they integrate at Phase 2 start.

---

## What changes vs what stays

The Strangler Fig pattern from ppr applies here too: build the new shell tree side-by-side, port content **by reference** (no rewrites), validate parity, flip the default, delete the old.

### 🟡 Touched (substantive diffs)

- `frontend/lib/patient-profile/types.ts` — `PaneDefinition.children` activates; add `tabs?` / `aiSummarySlot?` / `aiAssistButtonSlot?` contract fields (R-FUTURE-PROOFING).
- `frontend/components/patient-profile/Shell.tsx` — flat `PanelGroup` migrates to recursive PanelGroup tree (R-SHELL).
- `frontend/components/patient-profile/PatientProfilePage.tsx` — `panes` array becomes a `panes` *tree*, sourced from a template (R-SHELL + R-MOD).
- `frontend/components/consultation/PrescriptionForm.tsx` — splits into `<SubjectiveSection />`, `<ObjectiveSection />`, `<AssessmentSection />`, `<PlanSection />`; composition root collapses to ~200 LOC (R-RX-FORM).
- `frontend/lib/consultation/derive-cockpit-state.ts` — adds modality-to-template mapping (R-MOD).
- `backend/migrations/XXX_soap_fields.sql` — new migration: extends `prescription_drafts` with the DL-24 fields; renames `investigations` → `investigations_orders`.

### 🆕 Created (new files)

- `frontend/lib/patient-profile/layout-tree.ts` — recursive layout tree serialisation (R-SHELL).
- `frontend/lib/patient-profile/templates.ts` — the 4 template tree literals (R-MOD).
- `frontend/lib/patient-profile/aux-surfaces.ts` — contract types + hook stubs for the 5 auxiliary patterns (R-FUTURE-PROOFING).
- `frontend/lib/patient-profile/layout-presets.ts` — preset save/load (R-LAYOUT-UX).
- `frontend/components/patient-profile/PatientRibbon.tsx` — always-on ribbon (R-RIBBON).
- `frontend/components/patient-profile/PaneContextMenu.tsx` — right-click split/merge/save (R-LAYOUT-UX).
- `frontend/components/ehr/SnapshotPanel.tsx`, `HistoryPanel.tsx` — chart split (R-CHART).
- `frontend/components/cockpit/middle/BodyZone.tsx`, `AssessmentStrip.tsx`, `InvestigationsZone.tsx`, `PlanZone.tsx`, `PlanActionFooter.tsx`, `SafetyStickyStrip.tsx` — middle column (R-MIDDLE).
- `frontend/components/cockpit/right/SubjectiveZone.tsx`, `ObjectiveZone.tsx` — right column (R-HISTORY).
- `frontend/components/cockpit/rx/RxFormContext.tsx`, `SubjectiveSection.tsx`, `ObjectiveSection.tsx`, `AssessmentSection.tsx`, `PlanSection.tsx` — distributed form (R-RX-FORM).

### 🟢 Preserved unchanged

- `MedicineRow.tsx` — gets densification treatment in R-RX-POLISH but the row primitive itself is preserved.
- `DrugAutocomplete.tsx` — per-doctor frequency ranking (R-RX-POLISH) layers on top; no API change.
- `PrescriptionPreSendCheck` + send pipeline (DL-11).
- `PreviousRxPopover.tsx` → migrates to side-sheet using the R-FUTURE-PROOFING contract (R-RX-POLISH); component stays in place during the contract migration.
- Mobile (`<lg`) `MobilePillBar` flow (DL-12).
- Three appointment-detail / in-call / post-call mount surfaces (DL-3).

### 🗑️ Deleted

- `plan-cockpit-rx-pane.md` — superseded by this file and deleted on merge (recoverable via git history). Its R-items survive as R-RX-POLISH content; its DL-1..12 are inlined above.

---

## 4. Canonical default layout (Telemed-Video template)

```
[ Patient ribbon — full width — 👤 Name · Age · ⚠ Allergies · Chronic · 🎯 Treating: ACS · 💊 5 active ]
┌──────────────┬──────────────────────────────────────────┬─────────────┐
│              │                                          │             │
│  Snapshot    │  Body (video tile)                       │  Subjective │
│  • Allergies │                                          │  • CC       │
│  • Chronic   │                                          │  • HOPI     │
│  • Meds      │                                          │             │
│  • Vitals    │                                          │             │
│              │                                          │             │
│              ├──────────────────────────────────────────┤             │
│              │  Working Dx: [ACS ▾]  DDx: [angina][GERD]│             │
├──────────────├─────────────────┬────────────────────────├─────────────┤
│              │                 │                        │             │
│  History     │  Investigations │  Medicines             │  Objective  │
│              │                 │                        │             │
│  • Visit -1  │  [ECG]          │  • Aspirin 75 · OD ⋮   │  • Vitals   │
│  • Visit -2  │  [Trop-I]       │  • Atorva 40 · HS  ⋮   │  • General  │
│  • Visit -3  │  [+ add inv]    │  [+ add medicine ▾]    │    exam     │
│              │                 │                        │  • Systemic │
│              │                 │  Advice [bed rest…]    │  • Test     │
│              │                 │  F/U   in [3] [days ▾] │    results  │
│              │                 │                        │             │
│              │  ──────────────┴───────────────────────  │             │
│              │  Saved · 12:04   [Save] [Send Rx ▸]      │             │
└──────────────┴──────────────────────────────────────────┴─────────────┘
```

**8 sub-panes:** Snapshot, History, Body, Assessment (sticky strip), Investigations, Plan (Medicines + Advice + F/U), Subjective, Objective.

### Default sizes (Telemed-Video)

- **Left column:** 22% of viewport width
  - Snapshot: 40% of column height
  - History: 60% of column height
- **Middle column:** 56% of viewport width
  - Body: 50% of column height
  - Assessment: ~60px sticky strip (≈ 8% on typical screen)
  - Bottom row: 42% of column height
    - Investigations sub-column: 35% of row width
    - Plan sub-column: 65% of row width
- **Right column:** 22% of viewport width
  - Subjective: 45% of column height
  - Objective: 55% of column height

### Modality template overrides

| Template | Body height | Plan height | Other deltas |
|---|---|---|---|
| `telemed-video` (default) | 50% | 42% | as above |
| `telemed-voice` | 15% (call controls only — mute, end, timer) | 75% | Plan reclaims body's space; Assessment unchanged |
| `telemed-text` | 40% (chat thread, scrollable) | 50% | Body slightly taller for chat readability |
| `review` | 0% (Body hidden — no live channel) | 90% | Plan + S / O become scrollable read-only; Send button hidden (no draft to send post-finish) |

### Narrow-monitor adaptation

Below ~1366px container width (container query, not viewport query):

- Middle column's Inv / Plan split auto-merges → Investigations becomes a chip row at the top of Plan.
- Right column's Subjective / Objective stays split.
- Other sub-panes unaffected.

Above ~1920px container width:

- Right column Objective sub-pane grows to absorb extra width (resolves R-Q1 below — pending lock).

---

## 5. R-Item details

Eight R-items across three phases. Each R-item has Why / What / Acceptance / Effort / Dependencies / Files-touched.

### R-SHELL · Nested pane shell upgrade

**Why:** Today's flat `PanelGroup` can't represent the 8-pane default. Must activate `PaneDefinition.children` recursion and add horizontal sub-splits within vertical sub-panes (true 2D tree).

**What:**

- Migrate `frontend/components/patient-profile/Shell.tsx` from a flat `PanelGroup` to a recursive PanelGroup tree.
- Walk `PaneDefinition.children` recursively to render nested panes; each node carries a `direction: 'horizontal' | 'vertical'`.
- Persist the **full layout tree** (not just sizes) in localStorage under `patient-profile-layout-v2`.
- Add `loadTemplate(templateId)` and `resetToTemplate()` actions.
- Preserve existing pane behaviour: collapse, hotkey navigation, header strip, drag handles.
- Run side-by-side at `/v2-tree` route during build; flip default after Phase 2 gate.

**Acceptance:**

- Telemed-Video template renders all 8 sub-panes correctly with the §4 default sizes.
- All four templates render and switch on modality change.
- Drag handles work on every internal split — horizontal between Snapshot/History, vertical between Body/Assessment/bottom-row, horizontal between Inv/Plan, vertical between Subjective/Objective.
- Layout persists across page reload.
- Existing hotkey navigation, collapse, and pane headers continue working unchanged.
- `/v2-tree` route renders identical content as `/v2` (current shell) when sizes are matched.

**Effort:** 6–8 days (largest single item).

**Dependencies:** ppr DL-5 (`PaneDefinition.children` reservation). R-LAYOUT-UX can ship in parallel behind a flag.

**Files touched:** `frontend/lib/patient-profile/types.ts`, `frontend/components/patient-profile/Shell.tsx`, `frontend/components/patient-profile/PatientProfilePage.tsx`, new `frontend/lib/patient-profile/layout-tree.ts`, new `frontend/lib/patient-profile/templates.ts`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-19 via [cockpit-shell-flip](../Daily-plans/May%202026/19-05-2026/cockpit-shell-flip/) batch — csf-01..06 (production cutover + 8-pane tree).

---

### R-MOD · Modality-aware default templates

**Why:** Today's defaults are one-size-fits-all. Voice consults waste body real estate. Text consults don't give chat enough height.

**What:**

- 4 named templates: `telemed-video`, `telemed-voice`, `telemed-text`, `review` — each a `PaneDefinition` tree literal in `frontend/lib/patient-profile/templates.ts`.
- Auto-select via `deriveCockpitState(state, modality)` → template id.
- Doctor-manual override (template picker in the cockpit header) persists for the current visit; resets to auto on next patient.
- Doctor setting in settings panel: "Always use template X" globally disables auto-switch.
- Body pane content adapts within the template: video tile / voice controls / chat thread / hidden (review).

**Acceptance:**

- Visit starts with the correct template based on the cockpit state + modality.
- Modality change during call (e.g., escalating text → voice → video) auto-switches the template, unless the doctor manually overrode it.
- Settings "always use X" honoured globally.
- Switching templates does not lose in-flight Rx form data (autosave is template-independent).

**Effort:** 2–3 days.

**Dependencies:** R-SHELL (provides `loadTemplate` API).

**Files touched:** new `frontend/lib/patient-profile/templates.ts`, `frontend/lib/consultation/derive-cockpit-state.ts`, `frontend/components/patient-profile/PatientProfilePage.tsx`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-23 via [templates-r-mod](../Daily-plans/May%202026/21-05-2026/templates-r-mod/) batch — tmr-01..05.

---

### R-CHART · Chart pane vertical split (Snapshot + History)

**Why:** ppr DL-5 reserved this; locked here in DL-22. Snapshot + History is the natural divide of the chart pane's existing content.

**What:**

- Split `frontend/components/ehr/AppointmentChartRail.tsx` content into a Snapshot sub-pane (top) and a History sub-pane (bottom).
- Snapshot = allergies, chronic conditions, current medications, recent vitals trend (last 3 readings with chip-status).
- History = past visit summaries (most recent first) with click-to-expand for full visit detail.
- Each becomes a child `PaneDefinition` in the left column's tree.

**Acceptance:**

- Both sub-panes render with their respective content.
- Each is independently resizable and collapsible.
- Snapshot always available even when History collapsed (its content is the most safety-critical).
- Click on a history visit-card opens its detail in a side sheet (uses R-FUTURE-PROOFING contract).

**Effort:** 2 days.

**Dependencies:** R-SHELL.

**Files touched:** `frontend/components/ehr/AppointmentChartRail.tsx`, `frontend/components/ehr/PatientChartPanel.tsx`, new `frontend/components/ehr/SnapshotPanel.tsx`, new `frontend/components/ehr/HistoryPanel.tsx`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-20 via [cockpit-chart-extraction](../Daily-plans/May%202026/20-05-2026/cockpit-chart-extraction/) batch — cce-01..05.

---

### R-RIBBON · Patient ribbon strip

**Why:** Always-visible patient context across all panes. Critical safety + clinical anchor that the current cockpit lacks. Even more important in voice / text consults where the doctor has minimal visual context of the patient.

**What:**

- Thin (~48–56px) full-width strip above all panes, between the top header and the pane grid.
- Slots, left → right: identity (name, age, sex, weight), allergies (chips, max 3 + "+N more"), chronic conditions (chips, max 3 + "+N more"), key meds count badge (`💊 5 active`), `🎯 Treating: {Dx}` live mirror.
- Read-only display. Click any chip → tooltip with detail. Click `🎯` → focuses Dx field in the Assessment strip.
- Mirror updates within 200ms of any edit to Plan pane's Dx field (DL-19 + DL-23).
- Never wraps to 2 lines; overflow chips collapse to "+N more" pill.
- Skeleton renders without layout shift while patient data loads.

**Acceptance:**

- Strip visible across all 4 templates.
- `🎯 Treating` updates within 200ms (measured with `performance.mark`).
- No layout shift (`CLS = 0`) on patient data load.
- Skeleton state visible during 300ms+ load.
- Click chip → tooltip; click 🎯 → focus moves to Dx field.

**Effort:** 2 days.

**Dependencies:** R-SHELL (for the ribbon slot in shell), R-MIDDLE (for the Dx field to mirror).

**Files touched:** new `frontend/components/patient-profile/PatientRibbon.tsx`, refactor `frontend/components/patient-profile/PatientProfileHeader.tsx`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-21 via [cockpit-ribbon](../Daily-plans/May%202026/21-05-2026/cockpit-ribbon/) batch — crb-01..04.

---

### R-MIDDLE · Middle column rebuild

**Why:** Heart of the new layout. The doctor's primary visual anchor (Body — patient) and primary action (Plan — medicines) live in the same vertical column. Assessment bridges them as a sticky strip.

**What:**

- Body sub-pane (top): wraps existing `<ConsultationBodyPane>`; reacts to template (video tile / voice controls / chat thread / hidden).
- Assessment sticky strip (~60px): Working Dx field (text input + autocomplete placeholder per R-Q4) + DDx chip row (collapsible "+ DDx" affordance when empty).
- Bottom row: horizontal split.
  - Investigations sub-pane (left): chips for ordered tests, `[+ add]` chip with autocomplete, free-text override field.
  - Plan sub-pane (right): medicine rows (uses `<MedicineRow>` from R-RX-POLISH), Advice textarea, F/U (n + unit picker).
- Sticky safety strip at top of bottom row (above Assessment): allergy clash banner + DDI chips, pinned (resolves the long-standing TODO β-1 in `RxWorkspace.tsx` — DL-9).
- Sticky action footer at bottom of bottom row (spans Inv + Plan): `Saved · {time}  |  [Save]  [Send Rx & finish ▸]`.
- Narrow monitor (≤ 1366px container) auto-merges Investigations into a chip row at top of Plan.

**Acceptance:**

- All four sub-zones (Body, Assessment, Investigations, Plan) render and resize correctly.
- Dx field edits propagate to Patient ribbon within 200ms.
- Safety strip pins on scroll; never overlaps content below.
- Send button always reachable without scrolling, in all templates that show it.
- Narrow-monitor mode auto-merges Inv into Plan; rebalances Plan internal layout to fit chip row.

**Effort:** 5–6 days.

**Dependencies:** R-SHELL, R-RX-FORM (Plan needs the section components).

**Files touched:** new `frontend/components/cockpit/middle/BodyZone.tsx`, `AssessmentStrip.tsx`, `InvestigationsZone.tsx`, `PlanZone.tsx`, `PlanActionFooter.tsx`, `SafetyStickyStrip.tsx`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-23 via [cockpit-middle-investigations](../Daily-plans/May%202026/21-05-2026/cockpit-middle-investigations/) + [cockpit-middle-rebuild](../Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/) batches — cmi-01..03 + cmr-01..07.

---

### R-HISTORY · Right column rebuild (Subjective / Objective)

**Why:** Reorganise the current Rx pane's S + O content into the right column with a vertical split. Clean separation between "what the patient told us" (Subjective) and "what we measured / found" (Objective).

**What:**

- Subjective sub-pane (top, ~45%): CC field, HOPI textarea. Reserved slot (R-FUTURE-PROOFING) for future photo thumbnail strip + AI summary card.
- Objective sub-pane (bottom, ~55%): Vitals chip-grid (BP / HR / Temp / SpO2 / Wt / Ht / BMI auto), General exam textarea, Systemic exam textarea, Test results textarea (patient-brought results).
- Both sub-panes scroll independently when content exceeds height.
- Tab-contract slots reserved (R-FUTURE-PROOFING) for: future Labs tab in Objective, future photo thumbnail strip in Subjective.

**Acceptance:**

- All fields render and edit correctly via `RxFormContext`.
- Autosave works identically to today (1.5s debounce, single SaveStatus pill).
- Sub-pane sizes resize independently via drag handle.
- New DL-24 fields (vitals structured, examination_findings, test_results) persist and round-trip.

**Effort:** 3–4 days.

**Dependencies:** R-SHELL, R-RX-FORM.

**Files touched:** new `frontend/components/cockpit/right/SubjectiveZone.tsx`, `ObjectiveZone.tsx`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-24 via [cockpit-history-pane](../Daily-plans/May%202026/21-05-2026/cockpit-history-pane/) batch — chp-01..05.

---

### R-RX-FORM · PrescriptionForm Strangler Fig (PHASE 1 prerequisite)

**Why:** `PrescriptionForm.tsx` is 1,717 LOC in one file. The new layout distributes the form across 5 surfaces (Subjective, Objective, Assessment, Investigations, Plan). Cannot stay monolithic. DL-25 promotes this from polish to prerequisite.

**What:**

- Extract `RxFormContext` — single source of truth for all SOAP field state + autosave dispatch. Sections subscribe to slices via selectors.
- Refactor `PrescriptionForm.tsx` into per-section components: `<SubjectiveSection />`, `<ObjectiveSection />`, `<AssessmentSection />`, `<PlanSection />`. Each consumes `RxFormContext` and renders just its slice of fields.
- Each section is renderable in any pane — verified by R-MIDDLE / R-HISTORY mounting them in their respective sub-panes.
- Autosave dispatch unchanged from the doctor's perspective (one save per draft row; sections share state).
- New SOAP fields per DL-24: `vitals` (structured object), `examination_findings`, `differential_diagnosis` (string array), `advice`, `follow_up_in` (`{n: number, unit: 'days'|'weeks'|'months'}`), `referral`, `test_results`.
- Existing `investigations` renames to `investigations_orders`.
- Backend migration: extend `prescription_drafts` schema with new columns; rename `investigations` column. Pre-launch — no data to migrate.
- For non-cockpit mounts (appointment-detail standalone, in-call mini-panel, post-call summary — DL-3), keep a thin `<PrescriptionForm />` composition root (~200 LOC) that mounts all four sections in a single column — preserves the existing layout for those surfaces.

**Acceptance:**

- All section components render correctly when mounted in any pane.
- Autosave continues to work across distributed mounts; verified by E2E test that edits CC in Subjective (right column), Dx in Assessment (middle), and a medicine in Plan (middle), confirms a single `prescription_drafts` row updates with all three changes.
- All DL-24 new fields persist and round-trip.
- Non-cockpit mounts (appointment-detail / in-call / post-call) render the composition root and continue working unchanged (DL-3).
- LOC in `PrescriptionForm.tsx` falls to ≤ 200 (composition root only).

**Effort:** 4–5 days.

**Dependencies:** None — runs in parallel with R-SHELL during Phase 1.

**Files touched:** split `frontend/components/consultation/PrescriptionForm.tsx`, new `frontend/components/cockpit/rx/RxFormContext.tsx`, `SubjectiveSection.tsx`, `ObjectiveSection.tsx`, `AssessmentSection.tsx`, `PlanSection.tsx`, new backend migration `backend/migrations/XXX_soap_fields_expansion.sql`.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-17 via [cockpit-v2](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) batch — cv2-04..07 (`RxFormContext` + four section components + migration 103).

---

### R-RX-POLISH · Rx polish items (rolled forward from superseded plan)

**Why:** All R-items from the superseded `plan-cockpit-rx-pane.md` still ship; they now run in the new shell context where they fit naturally.

**What:**

Items preserved verbatim from the superseded plan (refer to that file's full R-item details if needed for acceptance criteria — they're inlined into the daily-plans batch when promoted):

- **R-RX-POLISH/1.1** Sticky safety strip (now top of bottom row, above Assessment strip) — implements DL-9 via the new shell context.
- **R-RX-POLISH/1.2** Sticky action footer (now bottom of bottom row, spans both sub-columns) — implements DL-1's stickiness.
- **R-RX-POLISH/1.3** Drop duplicate Rx heading (pane headers handle this naturally in the v2 shell — was R1.3 in old plan).
- **R-RX-POLISH/2.1** Medicine row densification — two-state mode: summary-mode collapse when row is complete + valid; editor expands on tap-to-edit. Resolves the "3 medicines and diagnosis is gone" vertical problem.
- **R-RX-POLISH/2.2** Drug autocomplete per-doctor frequency ranking — adds `doctor_drug_usage` table + service tweak. Personal-score-first sort, today's ranking as tiebreaker. Cold-start = today's behaviour.
- **R-RX-POLISH/2.3** Per-row favorite chips — `doctor_drug_favorites` table; "PCM 500mg TID 5d after meals" applies in one tap.
- **R-RX-POLISH/3.x** Keyboard shortcuts scoped to focused pane (DL-10): `Cmd/Ctrl+Enter` → Send Rx & finish, `Cmd/Ctrl+M` → add medicine, `Cmd/Ctrl+Shift+T` → templates, `Cmd/Ctrl+Shift+P` → preview.
- **R-RX-POLISH/4.x** Previous-Rx side sheet (DL-8) — promotes `PreviousRxPopover` to a side sheet using R-FUTURE-PROOFING contract; filter chips, search-by-medicine, one-tap Apply with diff vs. current draft.

**Acceptance per item:** see the superseded `plan-cockpit-rx-pane.md` for full criteria — preserved into the daily-plans batch when promoted.

**Effort:** 5–6 days total (rolled forward from the superseded plan's 2.5 + 1.5 + 0.5 day estimates).

**Dependencies:** R-MIDDLE, R-HISTORY, R-RX-FORM, R-FUTURE-PROOFING (side-sheet contract for R-RX-POLISH/4.x).

**Files touched:** various — see superseded plan's per-R-item file lists, adjusted for v2 component paths.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-LAYOUT-UX · Split / merge / preset escape hatch

**Why:** Power-user freedom per DL-18. Doctors who want a different arrangement can build one; most never will.

**What:**

- Right-click on any pane header → context menu: `Split horizontally`, `Split vertically`, `Merge with sibling`, `Collapse`, `Hide`.
- Drag any pane handle to resize (today's behaviour, extended to nested handles).
- "Save current layout as preset" → stores the tree to `cockpit_layout_presets` table (extend schema from the May 10 cockpit-customization batch — currently stores flat sizes; extend to store the layout tree JSON).
- "Reset to template default" per preset — re-applies the modality template tree.
- Built-in presets (Telemed-Video, Telemed-Voice, Telemed-Text, Read-only Review) visible alongside the doctor's custom presets in the preset picker.

**Acceptance:**

- Split actions add new sub-panes correctly (verified for both horizontal and vertical, at all tree depths).
- Merge actions clean up the tree without orphans or zero-size panes.
- Saved presets restore identical layouts on reload.
- Reset works without page reload.
- Soft cap of 10 sub-panes enforced (further splits show a friendly "Layout limit reached" tooltip).

**Effort:** 3–4 days.

**Dependencies:** R-SHELL (provides the tree API).

**Files touched:** new `frontend/components/patient-profile/PaneContextMenu.tsx`, new `frontend/lib/patient-profile/layout-presets.ts`, backend extension to `cockpit_layout_presets` schema.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-FUTURE-PROOFING · Contracts for future auxiliary surfaces

**Why:** Explicit user direction in chat 2026-05-17: "for now we are not adding extra things, just keep these things in mind … make our structure for now accordingly." Structure the shell so future labs / records / photos / AI plug in without rework.

**What — contracts only, no implementations:**

1. **Tab contract for sub-panes.** Extend `PaneDefinition` with optional `tabs?: PaneTabDefinition[]`. When set, the sub-pane renders a tab strip in its header and the shell handles tab state. Phase-1 sub-panes ship with `tabs: undefined` (single content). Future use: `Objective` sub-pane adds Vitals / Exam / Labs / Results tabs without restructuring.

2. **Side-sheet contract.** Add a `useSideSheet()` hook in the shell that registers side sheets globally. Side sheet content components live in their own folders; the shell only knows the contract — `id`, `title`, `content: ComponentType`, `defaultWidth`, `canDock: boolean`. Phase 1 uses this for the Previous-Rx side sheet (R-RX-POLISH/4.x) as the contract's first real user.

3. **Floating dock contract.** Add a `useFloatingDock()` hook with the same shape as side sheets plus draggable position + pin/unpin state. Phase 1 ships no floats; reserved for future AI chat panel.

4. **Modal contract.** Standard modal patterns already exist in the app (shadcn `<Dialog>`); document which auxiliary content will use modals (referral generator, consent capture, billing) in `aux-surfaces.ts` comments. No new modal infrastructure needed.

5. **Cmd+K contract.** Reserve `Cmd / Ctrl + K` keybinding at the shell level. Ship a no-op handler that opens a placeholder bar saying "Coming soon — AI assist, drug lookup, jump-to." Reserves the keystroke and signals intent.

6. **AI surface slots.** Designate slots in `PaneDefinition` for future AI augmentation: `aiSummarySlot?: SlotRenderer` (renders above pane content), `aiAssistButtonSlot?: SlotRenderer` (renders in pane header). Phase 1 leaves them all `undefined`. Future plans implement specific renderers.

**Acceptance:**

- All six contracts have TypeScript interfaces defined and exported from `aux-surfaces.ts`.
- Each contract has at least one Phase 1 user OR a documented no-op placeholder.
- The Cmd+K keybinding opens the "Coming soon" placeholder bar.
- The Previous-Rx side sheet (R-RX-POLISH) demonstrates the side-sheet contract works end-to-end.
- A simple smoke test confirms a future contributor can add a `tabs` field to one sub-pane and it renders correctly — without modifying `Shell.tsx`.

**Effort:** 2 days (contracts only).

**Dependencies:** R-SHELL.

**Files touched:** `frontend/lib/patient-profile/types.ts`, new `frontend/lib/patient-profile/aux-surfaces.ts`, Cmd+K keybinding stub, R-RX-POLISH side-sheet usage.

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-17 via [cockpit-v2](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) batch — cv2-09 (`aux-surfaces.ts` contracts + Cmd+K stub).

---

## 6. Sequencing

Three phases. Within each phase, items can run in parallel chats.

### Phase 1 — Foundation (parallelisable)

| R-item | Effort | Notes |
|---|---|---|
| R-SHELL | 6–8 days | Builds at `/v2-tree` route; doesn't replace `/v2` until Phase 2 gate |
| R-RX-FORM | 4–5 days | Independent of R-SHELL; ships RxFormContext + 4 section components + backend migration |
| R-FUTURE-PROOFING | 2 days | Contracts only; lightest item |

**Phase 1 gate:**
- Shell renders 8-pane tree with the Telemed-Video template at `/v2-tree`.
- `PrescriptionForm` split into 4 section components consuming `RxFormContext`.
- All six R-FUTURE-PROOFING contracts in place.
- Non-cockpit mounts (DL-3) continue working with the composition-root `PrescriptionForm`.

### Phase 2 — Content rebuild (parallelisable)

| R-item | Effort | Notes |
|---|---|---|
| R-MOD | 2–3 days | Wires templates to `deriveCockpitState` |
| R-CHART | 2 days | Left column split |
| R-RIBBON | 2 days | Above all panes |
| R-MIDDLE | 5–6 days | Largest content rebuild — Body + Assessment + Inv + Plan |
| R-HISTORY | 3–4 days | Right column with Subjective + Objective |

**Phase 2 gate:**
- All four templates render correctly with real content at `/v2-tree`.
- Modality switching auto-selects template, manual override persists within visit.
- Ribbon `🎯 Treating` live-syncs with Dx field edits.
- `/v2-tree` flipped to be the default `/v2` route; old shell kept at `?v1=1` for one release window as a kill-switch (matches ppr Strangler Fig pattern).

**Phase 2 gate — verified 2026-05-24:**

1. **8 default sub-panes in a nested tree** ✅ — shipped via [cockpit-shell-flip](../Daily-plans/May%202026/19-05-2026/cockpit-shell-flip/) (Snapshot / History) + [cockpit-chart-extraction](../Daily-plans/May%202026/20-05-2026/cockpit-chart-extraction/) (left column split) + [cockpit-middle-investigations](../Daily-plans/May%202026/21-05-2026/cockpit-middle-investigations/) (Investigations) + [cockpit-middle-rebuild](../Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/) (Body / Assessment / Plan strips) + [cockpit-history-pane](../Daily-plans/May%202026/21-05-2026/cockpit-history-pane/) (Subjective / Objective).
2. **4 modality-aware default templates** ✅ — shipped via [templates-r-mod](../Daily-plans/May%202026/21-05-2026/templates-r-mod/) (R-MOD-full).
3. **A patient ribbon runs full-width above all panes** ✅ — shipped via [cockpit-ribbon](../Daily-plans/May%202026/21-05-2026/cockpit-ribbon/) (R-RIBBON).
4. **The Rx pane no longer exists as a single column** ✅ — distributed across Subjective / Objective / Assessment / Investigations / Plan via cv2-06 + R-MIDDLE + R-HISTORY.
5. **All polish items from `plan-cockpit-rx-pane.md` still ship** ⏳ Phase 3 — R-RX-POLISH not yet planned; tracked in [plan-cockpit-v2-execution-roadmap.md](./plan-cockpit-v2-execution-roadmap.md) §6 `[NEXT]`.
6. **Future auxiliary surfaces contracted but not built** ✅ — shipped via cv2-09 (`aux-surfaces.ts` + `types.ts` `tabs?`).

### Phase 3 — Polish + power (parallelisable)

| R-item | Effort | Notes |
|---|---|---|
| R-RX-POLISH | 5–6 days | All polish items from superseded plan, now in v2 shell |
| R-LAYOUT-UX | 3–4 days | Right-click split / merge / preset escape hatch |

**Phase 3 gate:**
- Medicine row densification + drug autocomplete enhancements + keyboard shortcuts work.
- Right-click split / merge + save preset + reset to template work end-to-end.
- Old shell (`?v1=1`) removed.

### Total effort estimate

**~30–35 days of focused work.** Sequenced: 5–6 weeks for one engineer; 3–4 weeks with two engineers parallelising across Phase 1 and Phase 2.

---

## 7. Success criteria

| Metric | Today | Target after Phase 3 |
|---|---|---|
| Median time from "open patient profile" → "Send Rx" (returning patient, 2-medicine Rx) | not measured | ≤ 30s |
| Number of distinct pane regions input focus moves between per consult (measured via `focusin` events) | not measured | ≤ 4 |
| Vertical chrome above "Chief complaint" in narrow mode | ~220px | ≤ 80px |
| LOC in `PrescriptionForm.tsx` (composition root) | 1,717 | ≤ 200 |
| Vertical per medicine row (filled, summary state) | ~260px | ≤ 48px |
| Allergy / DDI banner visible during medicines edit | No (scrolls off) | Yes (pinned at top of bottom row) |
| Send button visible during medicines edit | No (scrolls off) | Yes (sticky footer spans Inv + Plan) |
| `Send Rx & finish ▸` visual primacy | Primary blue | Primary blue (unchanged — DL-1) |
| `🎯 Treating` ribbon mirror latency from Dx edit | n/a | ≤ 200ms |
| Cockpit state machine LOC (`Shell.tsx` + helpers) | (after ppr) ~600 LOC | ≤ 800 LOC despite nested tree (preserves ppr's clean separation) |
| % of consults running on auto-selected template (no manual override) | n/a | ≥ 80% |
| % of doctors with ≥ 1 custom layout preset saved (first month) | n/a | ≥ 10% (signal of power-user discovery) |
| P95 autosave roundtrip latency | (baseline measured pre-rebuild) | within 5% of baseline |
| All existing E2E tests pass (consult start, autosave, send Rx, finish visit) | yes | yes |
| Mouse-free send (`Cmd/Ctrl+Enter`) | No | Yes (R-RX-POLISH/3.x) |
| Three mount surfaces (DL-3) all still work | Yes | Yes (composition root `PrescriptionForm` preserved) |
| AI auto-draft anywhere | No (E3 deferred) | No (DL-2 reaffirmed) |
| Any auxiliary surface (labs, records, photos, AI) implemented | n/a | n/a (DL-16 — contracts only, no implementations in this plan) |

---

## 8. Open questions (live — answer in chat, then lock here)

### V2-Q1 — Wide-monitor (≥ 1920px) right column behaviour

**Question:** Does the right column stay at 22% width even on wide monitors, or grow to absorb extra width?

**Notes:** Lean **grow** — at 2560px, right column at 22% is 563px which is more than enough for S + O. But "extra width" should probably go to the middle column (Plan grows = more meds visible) rather than uniformly. Concrete proposal: middle column absorbs 60% of any width above 1920px, right column absorbs 40%, left column stays 22%. Lock before R-MOD.

### V2-Q2 — Voice template body collapse direction

**Question:** In `telemed-voice`, Body collapses to ~15% — does it sit at the top of the middle column (familiar position) or bottom (closer to call-end action)?

**Notes:** Lean **top** — keeps positional consistency across templates so muscle memory survives modality switches. Bottom would feel "more telephone-like" but the cost of relocating Body between templates is doctor disorientation. Lock before R-MOD.

### V2-Q3 — Review template Send button

**Question:** In `review` (no active call / wrap-up / cancelled), is the Send button visible-but-disabled, or hidden entirely?

**Notes:** Lean **hidden** — `review` means the consult is finished or never happened; Send has nothing to do. A disabled button raises questions ("why is it greyed out?"). Lock before R-MOD.

### V2-Q4 — Assessment field autocomplete in v1

**Question:** Working Dx field — autocomplete from the doctor's past Dx list in v1, or freetext only (autocomplete deferred to T6 ICD-10)?

**Notes:** Lean **autocomplete from past Dx** (per-doctor, no LLM, just a query against past `prescriptions.provisional_diagnosis`). Cheap to ship and dramatically reduces typing for repeat conditions. ICD-10 is a much bigger lift; defer. Lock before R-MIDDLE.

### V2-Q5 — DDx max chip count

**Question:** Differential diagnosis chip array — limit to 3, 5, or unlimited?

**Notes:** Lean **5 with "+ add more" overflow into a small popover** — 99% of cases have ≤ 3, but specialist consults occasionally have 5–7. Unlimited risks the strip wrapping and ballooning vertical. Lock before R-MIDDLE.

### V2-Q6 — Vitals structured fields required vs optional

**Question:** Which vitals are required vs optional in the new structured `vitals` object? (BP, HR, Temp, SpO2, Wt, Ht, BMI?)

**Notes:** Lean **all optional** — telemed often skips vitals, especially in voice / text consults. Doctor types what they have; missing fields render as blank. BMI auto-computes from Wt + Ht when both present. Lock before R-RX-FORM.

### V2-Q7 — Follow-up units

**Question:** F/U `unit` enum — days / weeks / months only, or also include "PRN" / "as needed" / "next IG-DM"?

**Notes:** Lean **days / weeks / months + "as needed"** (4 values). "Next IG-DM" feels niche; doctors can use Advice field for that. Lock before R-RX-FORM.

### V2-Q8 — Sub-pane minimum sizes

**Question:** Universal 200px min, or per-sub-pane (e.g., Body min 320px to keep video tile usable, Assessment min 60px to keep strip readable)?

**Notes:** Lean **per-sub-pane** — Body and Plan deserve larger mins (300px+) because their content has minimum viable sizes; Assessment and ribbon can be much smaller. Document in `templates.ts` alongside the default sizes. Lock before R-SHELL.

### V2-Q9 — Container query polyfill

**Question:** Container queries (the narrow-mode auto-merge trigger) — polyfill for older Safari, or accept gracefully degrading to no auto-merge in those browsers?

**Notes:** Lean **polyfill** (`@container-query-polyfill` is already viable). Without it, doctors on older browsers see Investigations and Plan cramped on small monitors. Cost: one npm dependency + ~3KB. Lock before R-SHELL.

### V2-Q10 — Layout preset name uniqueness

**Question:** Layout preset names — unique per-doctor, or globally unique across all doctors?

**Notes:** Lean **per-doctor**. Doctors don't share preset names; per-doctor enforcement is the obvious one. Lock before R-LAYOUT-UX.

### V2-Q11 — Modal vs side-sheet for Previous Rx

**Question:** Previous Rx — side-sheet per DL-8 (already locked), or revisit as a modal given the new shell?

**Notes:** **Locked as side-sheet (DL-8)** — included here just to confirm DL-8 still holds in the new shell context. Side-sheet uses R-FUTURE-PROOFING contract, which is the right pattern. No action required unless someone wants to re-litigate.

---

## 9. Deferred — explicitly out of scope for this plan

Items intentionally NOT in this plan but captured for future work.

- **V2-D1: AI Summary card** (Subjective sub-pane top) — needs AI pipeline + source surfacing. Slot reserved via R-FUTURE-PROOFING `aiSummarySlot?`.
- **V2-D2: AI Chat dock** (floating, dockable) — needs Cmd+K + chat backend. Slot reserved via floating-dock contract.
- **V2-D3: AI Cmd+K functionality** — keybinding reserved + placeholder bar shipped; actual AI integration deferred.
- **V2-D4: Lab results browser** (side sheet) — side-sheet contract ready, content deferred.
- **V2-D5: Medical records library** (side sheet) — same as V2-D4.
- **V2-D6: Imaging viewer** (pane-on-demand replacing Body) — contract exists in R-SHELL's tree API; UI deferred.
- **V2-D7: Patient photo viewer** (overlay anchored to Subjective) — thumbnail strip slot reserved in `<SubjectiveZone>`; viewer deferred.
- **V2-D8: Patient SMS / DM composer** (side sheet) — deferred to a separate communication plan.
- **V2-D9: Referral letter generator** (modal) — deferred; modal contract is standard so no infrastructure work needed when ready.
- **V2-D10: Consent capture** (modal) — same as V2-D9.
- **V2-D11: Billing / invoice surfaces** — deferred to a separate billing plan.
- **V2-D12: Drug reference / dose calculator** — deferred; envisioned as Cmd+K result + side sheet.
- **V2-D13: AI auto-draft Rx** (E3 — fills Plan from CC + history) — re-affirms E3 and DL-2.
- **V2-D14: ICD-10 autocomplete on Working Dx** — V2-Q4 lean is past-Dx autocomplete only in v1; ICD-10 is a T6 area.
- **V2-D15: Promote-side-sheet-to-pane affordance** — power-user feature; needs UX research. Deferred.
- **V2-D16: In-clinic-specific layout templates** — DL-13 makes this out of scope. When in-clinic ships, it gets its own templates.
- **V2-D17: Mobile (`<lg`) redesign** — DL-12. Continues with MobilePillBar fallback.
- **V2-D18: Pre-call body pane DM history surface** — the body pane in `ready` state today shows just `<ReadyCard>`. A richer pre-call surface showing IG / WA DM thread that led to the booking is a separate, telemed-first follow-up plan.
- **V2-D19: Complaint-conditioned drug favorites** — reaffirms RX-D2 from superseded plan. Schema additive when reopened.
- **V2-D20: Cross-doctor / clinic-wide template sharing** — reaffirms RX-D3 from superseded plan.

---

## 10. Risk register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| V2-R1 | Shell tree migration (R-SHELL) breaks existing layouts | **High** | Strangler Fig: build at `/v2-tree`, run side-by-side with `/v2`, validate parity, flip default at Phase 2 gate, keep `?v1=1` kill-switch for one release window. Matches ppr's proven pattern. |
| V2-R2 | PrescriptionForm split (R-RX-FORM) breaks autosave | **High** | Ship `RxFormContext` first; migrate one section at a time; full E2E test (edit field in 3 different sections → verify single draft row updates correctly) after each section migration. Mount-surface check (DL-3) re-runs after each. |
| V2-R3 | Container queries fail in older browsers | Med | Polyfill via `@container-query-polyfill` per V2-Q9; matrix-test on Safari 15, Chrome 100, Firefox 110. |
| V2-R4 | 8-pane on small monitors (1366×768) feels cramped | **High** | Narrow-mode auto-merge in R-SHELL + R-MIDDLE shrinks Inv into Plan chip row; tested at 1280px and 1366px before Phase 2 gate. |
| V2-R5 | Doctors confused by new layout → churn | **High** | First-session onboarding overlay highlighting the 8-pane structure. "Switch to old layout" toggle (`?v1=1`) available for 4 weeks post-launch. Default modality template auto-selects → most doctors never see a layout-picker. |
| V2-R6 | Modality template auto-switch annoys doctors mid-visit | Med | Manual override persists within visit (R-MOD acceptance); doctor setting "Always use template X" disables auto-switch globally. |
| V2-R7 | Backend migration on `prescription_drafts` fails / partially applies | Low | Pre-launch so no production data; standard migration tooling with explicit `BEGIN; … COMMIT;` block. Test on a fresh DB + a copy of the dev DB. |
| V2-R8 | Effort underestimate (30–35d creeps to 50+) | Med | Phase gates enforce scope; defer R-LAYOUT-UX or R-RX-POLISH if Phase 1 or 2 overruns. R-RX-POLISH is the most natural cut because it's largely polish on the new shell. |
| V2-R9 | `RxFormContext` becomes a perf bottleneck (re-renders all sections on any change) | Med | Use slice-selector pattern (Zustand-style or fine-grained signals); each section subscribes to only its field slice. Profile with React DevTools after R-RX-FORM lands. |
| V2-R10 | Layout-tree localStorage migration from flat to nested breaks user's existing saved layouts | Low | Detect `v1` localStorage key on first load; convert flat sizes to a default-template tree with the user's sizes overlaid; write new `v2-tree` key. One-shot migration. |
| V2-R11 | Cmd+K placeholder makes doctors think we shipped AI when we didn't | Low | Placeholder bar copy is explicit: "Coming soon — AI assist, drug lookup, jump-to". |
| V2-R12 | The 8-pane default genuinely doesn't fit some specialists' workflow (e.g., dentists who need full-screen patient photos) | Med | R-LAYOUT-UX gives them split/merge/save-preset escape hatch; soft cap of 10 sub-panes accommodates the rare power user. Per-specialty templates are a deferred follow-up. |

---

## 11. Future-proofing checklist (apply to every R-item)

Before any R-item ships, verify:

- [ ] Does this design accommodate a future tab inside this sub-pane (R-FUTURE-PROOFING tab contract)?
- [ ] Does this design accommodate a future side sheet opening over it (R-FUTURE-PROOFING side-sheet contract)?
- [ ] Does this design accommodate a future floating dock above it (R-FUTURE-PROOFING dock contract)?
- [ ] Is the AI summary slot reserved if this is a content pane (`aiSummarySlot?`)?
- [ ] Is the Cmd+K placeholder hooked at the shell level (single registration)?
- [ ] Does the layout-tree serialiser handle this pane correctly (round-trip test)?

The checklist runs as part of each Phase gate.

---

## 12. Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Three phases across 9 R-items; **zero Opus tasks** anticipated (no PHI columns added, no RLS redesign beyond the existing `prescription_drafts` policies, no novel security). Sonnet 4.6 Medium is the right tier throughout. Composer 2 is sufficient for the simplest items (R-FUTURE-PROOFING contracts, R-CHART left-column split).

**Estimated wall-clock:** ~30–35 dev-days serial → ~22–26 days with two engineers parallelising across phases.

| Phase | R-items | Effort (serial) | Notes |
|---|---|---|---|
| Phase 1 — Foundation | R-SHELL + R-RX-FORM + R-FUTURE-PROOFING | ~12–15d | Largest phase; R-SHELL and R-RX-FORM can parallelise from day 1 |
| Phase 2 — Content rebuild | R-MOD + R-CHART + R-RIBBON + R-MIDDLE + R-HISTORY | ~14–17d | Many items; R-CHART + R-RIBBON + R-MOD can ship in any order; R-MIDDLE + R-HISTORY block on R-RX-FORM |
| Phase 3 — Polish + power | R-RX-POLISH + R-LAYOUT-UX | ~8–10d | Both can parallelise |

---

## 13. Plan rules (pre-ship workflow)

These apply while the plan is `Drafted` / `Selected`.

1. **Editing this file is welcome under any `Notes:` line.** Don't edit headers, R-IDs, or DL-IDs.
2. **Don't renumber items.** R-IDs and DL-IDs are stable. New items take the next available number; killed items keep their ID and gain `[KILLED]` suffix with a one-line reason.
3. **DL-IDs are locked.** Reopening one requires a new `Decision:` block on the affected R-item with `Modify` ticked and a written rationale.
4. **When all Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch** under `docs/Work/Daily-plans/May 2026/{date}/cockpit-v2/plan-cockpit-v2-batch.md` and becomes `Committed`. Phases 2 and 3 promote to their own dated batches once Phase 1 ships.
5. **Implementation MUST NOT start until promotion.** R-IDs are decided here; the daily-plans batch derives the per-task files from those IDs.
6. **The three-mount-surface check (DL-3) re-runs at the end of each phase**, not just Phase 1.
7. **The future-proofing checklist (§11) runs as part of each phase gate.**

---

## 14. References

### Plans
- `plan-cockpit-rx-pane.md` — **superseded by this plan**, deleted on merge of this plan (recoverable via git history). R-items rolled forward as R-RX-POLISH.
- [plan-patient-profile-shell-rebuild.md](./plan-patient-profile-shell-rebuild.md) — ppr; this plan activates DL-5 (`PaneDefinition.children`).
- [plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md) — Decisions E1–E6 still in force; E3 (AI deferred), E5 (autosave), E6 (three-mount-surface).
- [plan-t2-ehr-speed.md](./ehr/plan-t2-ehr-speed.md) — shipped foundation (drug autocomplete, structured pickers, templates, autosave, copy-from-last-visit).
- [plan-t4-ehr-safety.md](./ehr/plan-t4-ehr-safety.md) — shipped foundation (allergy clash banner, DDI chips, pre-send modal).
- [plan-opd-per-day-mode.md](./plan-opd-per-day-mode.md) — concurrent batch; multiplies cockpit traffic, raising the value of this plan.
- [plan-sidebar-restructure.md](./plan-sidebar-restructure.md) — orthogonal; not a dependency.

### Code surfaces touched (top-level)
- [frontend/lib/patient-profile/types.ts](../../frontend/lib/patient-profile/types.ts) — `PaneDefinition` extension (R-SHELL + R-FUTURE-PROOFING).
- [frontend/components/patient-profile/Shell.tsx](../../frontend/components/patient-profile/Shell.tsx) — nested PanelGroup tree (R-SHELL).
- [frontend/components/patient-profile/PatientProfilePage.tsx](../../frontend/components/patient-profile/PatientProfilePage.tsx) — template-driven `panes` tree (R-SHELL + R-MOD).
- [frontend/components/patient-profile/PatientProfileHeader.tsx](../../frontend/components/patient-profile/PatientProfileHeader.tsx) — refactor into ribbon (R-RIBBON).
- [frontend/components/patient-profile/panes/RxPane.tsx](../../frontend/components/patient-profile/panes/RxPane.tsx) — deprecated by R-MIDDLE + R-HISTORY (content moves out to new zones).
- [frontend/components/consultation/cockpit/RxWorkspace.tsx](../../frontend/components/consultation/cockpit/RxWorkspace.tsx) — deprecated by R-MIDDLE.
- [frontend/components/consultation/PrescriptionForm.tsx](../../frontend/components/consultation/PrescriptionForm.tsx) — Strangler Fig split (R-RX-FORM).
- [frontend/components/consultation/MedicineRow.tsx](../../frontend/components/consultation/MedicineRow.tsx) — densification (R-RX-POLISH).
- [frontend/components/ehr/AppointmentChartRail.tsx](../../frontend/components/ehr/AppointmentChartRail.tsx) — split into Snapshot + History (R-CHART).
- [frontend/lib/consultation/derive-cockpit-state.ts](../../frontend/lib/consultation/derive-cockpit-state.ts) — modality → template mapping (R-MOD).
- [backend/migrations/](../../backend/migrations/) — new migration for DL-24 SOAP field expansion (R-RX-FORM).

---

**Created:** 2026-05-17.  
**Status:** `Drafted (live)`.  
**Owner:** TBD.  
**Promoted to:** _(daily-plans batch TBD once Phase 1 R-items are all decided)_.  
**Supersedes:** `plan-cockpit-rx-pane.md` (deleted on merge of this plan).
