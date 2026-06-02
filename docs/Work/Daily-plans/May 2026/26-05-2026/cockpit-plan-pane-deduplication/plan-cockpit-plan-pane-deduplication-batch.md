# Cockpit Plan-pane deduplication — 26 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: **zero Opus tasks** — this is a prop-drilling refactor following the existing `dxLifted` / `safetyLifted` precedent (cmr-01/02/06). Four Auto + one Composer 2 Fast close-out.
>
> **Source of issues:** dogfood review on 2026-05-26 (issues #1-5 from the [day README crosswalk](../README.md#issue-to-batch-crosswalk)).
>
> **Predecessor batches:**
> - `cockpit-shell-flip` (csf-04) — mounted `getTelemedVideoTemplate` as the source-of-truth layout for cockpit-v2 video appointments. The duplicate Subjective/Objective sections are a direct consequence of csf-03 wiring real content into the right column's two leaves WITHOUT lifting them out of `PrescriptionFormCompositionRoot`. The lift pattern existed (`dxLifted`, `safetyLifted` from cmr-01/02) but wasn't applied to Subjective/Objective.
> - `cmr-01` / `cmr-02` / `cmr-03` / `cmr-06` — established the lift-and-hide pattern via the props `dxLifted` (Assessment), `safetyLifted` (Safety), `actionsInFooter` (Send/Finish). Today's batch adds two more lifts (`subjectiveLifted`, `objectiveLifted`) and two block-hide flags (`entryModeLifted`, `photoLifted`).
> - `rx-polish-side-sheet` (rxss-03) — shipped 2026-05-25; touches `RxWorkspace.tsx`'s top area. **No conflict** — today's batch touches the same file but adds prop pass-through, not body changes.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-plan-pane-deduplication.md`](./Tasks/EXECUTION-ORDER-cockpit-plan-pane-deduplication.md).

---

## Why this batch

Dogfooding the shipped cockpit-v2 surfaced five correctness issues in the middle-bottom Plan pane:

1. **Subjective section is mounted twice.** The right column's "Subjective" leaf renders `<SubjectivePane>` (which itself reuses the cockpit Subjective inputs). The Plan column then renders `<PrescriptionFormCompositionRoot>` which **also** mounts `<SubjectiveSection>`. Two textareas, both bound to the same `RxFormContext` field — keystrokes appear in both but cursor position diverges and the read order confuses (top vs bottom).
2. **Objective section is mounted twice.** Same story — `<ObjectivePane>` in the right column duplicates the Plan column's `<ObjectiveSection>`. Worse than Subjective because chp-02's General/Systemic split landed in `<ObjectiveSection>`, so the right column shows the old single-textarea Objective while the Plan column shows the new split — same data, two presentations.
3. **Legacy "Prescription type" radio still renders inline in the Plan column.** The radio (Photo only / Both / Structured) is a pre-cockpit affordance from the original `PrescriptionForm`. In cockpit-v2 mode the doctor never needs Photo-only (the cockpit IS the structured surface), but the radio still draws and tab-focuses there.
4. **Photo / attachments stub block is still rendered.** Lines 1136-onwards of `PrescriptionForm.tsx` render the Photo upload UI when `entryMode === "photo" || "both"`. Default `entryMode` may be `"structured"` (so the block is hidden by default), but switching the radio re-exposes it inside the cockpit's Plan pane, which is the wrong surface for that flow (Photo attach belongs in the body-pane / launcher).
5. **PlanActionFooter Send/Finish CTAs are not visible** in the screenshot. cmr-03 shipped the sticky footer, cmr-06 wired it into `makeMiddleBottomRow`, and `<RxPane actionsInFooter>` is set in `templates.tsx`. But the footer either renders behind the Plan-pane scroll, or PrescriptionForm's own actions row still draws (because `actionsInFooter` only suppresses the *header* SaveStatus pill, not the bottom commit row in all states). The doctor cannot send the Rx without scrolling down to find a button that should be sticky.

All five share one cause: the Plan column's `<PrescriptionForm>` is still rendering the **full** legacy surface (header + sections + commit row + photo block) when the cockpit shell has already lifted three of those four surfaces out into dedicated middle-column overlays. The fix is to extend the lift pattern to its logical conclusion: every leaf that already exists somewhere in the cockpit shell must be lifted (hidden) when the cockpit mounts it.

**Visible artifact at the close-gate:** opening `/dashboard/appointments/[id]` shows the Plan column rendering ONLY Medicines + Generals/Investigations (the Rx-specific surfaces). Subjective + Objective are visible **only** in the right column. The radio + Photo block are entirely absent from the Plan column. `<PlanActionFooter>` shows Send Rx / Send & Finish / Finish visit buttons pinned to the bottom of the middle-column.

This batch closes the five highest-severity dedup issues with **5 tasks across 3 waves**, **~5-7h wall-clock single-engineer (~0.75 dev-day)**, **zero new migrations**, **zero Opus tasks**.

---

## Decision lock (frozen for batch duration)

**DL-1: Lift mechanism is additive prop chain, not a "cockpit mode" mega-flag.** Four new boolean props are added: `subjectiveLifted?: boolean`, `objectiveLifted?: boolean`, `entryModeLifted?: boolean`, `photoLifted?: boolean`. All default to `false` — non-cockpit mounts (appointment-detail page, in-call mini panel, post-call summary) see today's behavior unchanged. The cockpit shell (templates.tsx `makeMiddleBottomRow`) sets all four to `true` when it builds the Plan leaf.

**DL-2: Lift props flow templates → RxPane → RxWorkspace → PrescriptionForm → PrescriptionFormCompositionRoot.** Mirrors the existing `dxLifted` / `safetyLifted` chain — no new file paths, no new providers. Every receiver of a lift prop forwards it unchanged to the next layer; only the leaf consumer (the section / block being lifted) checks the bool and conditionally returns null.

**DL-3: `subjectiveLifted` + `objectiveLifted` are checked in `PrescriptionFormCompositionRoot`.** When `subjectiveLifted === true`, the root omits `<SubjectiveSection />`. When `objectiveLifted === true`, it omits `<ObjectiveSection />`. The `sections` JSX block is rewritten as a `<>` fragment with conditional sub-trees, not as an array filter (preserves React key stability for the remaining sections).

**DL-4: `entryModeLifted` + `photoLifted` are checked in `PrescriptionFormBody`.** When `entryModeLifted === true`, the "Prescription type" `<fieldset>` (lines 1083-1107) does NOT render and the `entryMode` state is forced to `"structured"` for the lifetime of the form. When `photoLifted === true`, the photo block (lines 1136-onwards) does NOT render and any pending photo upload work is no-op'd (early return in the upload handler with a console warning in dev).

**DL-5: When cockpit-mounted, default `entryMode = "structured"`.** This is automatic via DL-4 — if the radio is hidden, doctor cannot pick Photo mode. Existing `entryMode` state stays for non-cockpit mounts (they keep the radio + can still switch to Photo). The `useRxFormProviderSetup` hook initializes `entryMode` based on the existing `existingPrescription?.type` value, which already biases toward `"structured"` for new drafts.

**DL-6: `<PlanActionFooter>` MUST render Send Rx + Send & Finish + Finish visit.** Pre-this-batch behavior: footer exists (cmr-03), wired (cmr-06), but the commit-row inside `<PrescriptionForm>` ALSO renders when `actionsInFooter === false` or in legacy paths. Post-this-batch behavior: commit row is fully suppressed when `actionsInFooter === true`, including ALL states (draft / sending / sent / ended), and `<PlanActionFooter>` is the only surface that shows the action buttons inside the cockpit. Verified by `rg "<button[^>]*Send Rx" frontend/components/consultation/PrescriptionForm.tsx` returning the action-row block only.

**DL-7: Read-only / `ended` state still shows the right-column Subjective + Objective.** Even after a visit ends, the doctor reviews the SOAP notes. The lifts only re-route which surface owns the inputs; the data + read-only display still render in the right column's panes.

**DL-8: `<RxPane>` default props unchanged.** The four new props default to `false` — any existing call site of `<RxPane>` (e.g. in dev fixtures or future surfaces) sees today's behavior. Opt-in only.

**DL-9: Telemetry — single event `cockpit_polish.plan_pane_dedup_landed`** fires once per session on first cockpit mount post-batch. Payload: `{ appointmentId, subjectiveLifted: true, objectiveLifted: true, entryModeLifted: true, photoLifted: true }`. Captures rollout coverage.

**DL-10: No backend / no migrations.** Pure prop-drilling + conditional rendering. The `prescription.type` DB column still accepts `"photo" | "structured" | "both"`; this batch only hides the UI for picking `"photo"` in the cockpit surface.

---

## Phases

### Wave 1 — Lift prop scaffolding (1 task, ~1.5h)

- [`task-ppd-01-add-lift-props.md`](./Tasks/task-ppd-01-add-lift-props.md) — **S, Auto** — Add `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted` to: `PrescriptionFormCompositionRootProps`, `PrescriptionFormProps` (PrescriptionForm.tsx), `RxWorkspaceProps`, `RxPaneProps`. Default all four to `false`. Forward unchanged through the chain. **No conditional rendering yet** — just plumbing. Sets up the prop surface; later tasks consume.

### Wave 2 — Conditional rendering at leaves (3 tasks, ~3-4h)

Wave 2 has three lanes; all are independent of each other once Wave 1 props exist. Each lane touches a different leaf and a different region of code, so they can run in three parallel chats / worktrees.

- [`task-ppd-02-hide-soap-duplicates-in-comp-root.md`](./Tasks/task-ppd-02-hide-soap-duplicates-in-comp-root.md) — **S, Auto** — Modify `PrescriptionFormCompositionRoot.tsx` to conditionally omit `<SubjectiveSection />` when `subjectiveLifted === true` and `<ObjectiveSection />` when `objectiveLifted === true`. Tests in new `__tests__/PrescriptionFormCompositionRoot.test.tsx` (~60 LOC) verifying conditional render. **Lane α** — templates.tsx wiring (ppd-03) doesn't read this file's internals; safe to run in parallel with ppd-03 and ppd-04.
- [`task-ppd-03-hide-entry-mode-and-photo.md`](./Tasks/task-ppd-03-hide-entry-mode-and-photo.md) — **M, Auto** — Modify `PrescriptionForm.tsx`. When `entryModeLifted === true`, hide the "Prescription type" `<fieldset>` AND force `entryMode = "structured"` via the existing `setEntryMode` setter (called once on mount in a guarded `useEffect`). When `photoLifted === true`, hide the Photo block + early-return the photo upload handler. Tests in `__tests__/PrescriptionForm.test.tsx` (mod, ~80 LOC). **Lane β** — disjoint from ppd-02 + ppd-04.
- [`task-ppd-04-wire-lifts-in-templates.md`](./Tasks/task-ppd-04-wire-lifts-in-templates.md) — **XS, Auto** — Modify `frontend/lib/patient-profile/templates.tsx` `makeMiddleBottomRow`. The `<RxPane>` JSX gains four new props: `subjectiveLifted objectiveLifted entryModeLifted photoLifted`. **Lane γ** — single file, single JSX block; ~5 LOC change. Tests in templates' existing test file (mod, ~20 LOC) verify the props flow through.

### Wave 3 — PlanActionFooter visibility audit + close-out (1 task, ~1.5-2h)

- [`task-ppd-05-action-footer-visibility-and-close-out.md`](./Tasks/task-ppd-05-action-footer-visibility-and-close-out.md) — **S, Composer 2 Fast** — Audit `<PlanActionFooter>` rendering for the issue #5 visibility regression. Verify the footer shows Send Rx + Send & Finish + Finish visit across all cockpit states (`waiting`, `live`, `wrap_up`, `ended` excluding `terminal`). Confirm `actionsInFooter === true` causes `PrescriptionForm` to suppress its inline commit row fully. Smoke matrix + telemetry wire + COCKPIT.md update + capture-inbox.

---

## Cross-cutting acceptance gate (whole batch)

### Structural

- [x] `<PrescriptionFormCompositionRoot>` accepts `subjectiveLifted` + `objectiveLifted`; both default `false`.
- [x] `<PrescriptionForm>` accepts `entryModeLifted` + `photoLifted`; both default `false`.
- [x] `<RxWorkspace>` + `<RxPane>` forward all four props unchanged.
- [x] `templates.tsx` `makeMiddleBottomRow` sets all four props to `true` on the Plan `<RxPane>`.

### Behavior

- [x] On `/dashboard/appointments/[id]` with a `video` appointment, the Plan column renders Medicines + Assessment-row anchor only; Subjective + Objective are not in the Plan column.
- [x] The right column's `<SubjectivePane>` + `<ObjectivePane>` remain the only Subjective + Objective inputs.
- [x] "Prescription type" radio does NOT render in the cockpit Plan column.
- [x] Photo / attachments block does NOT render in the cockpit Plan column.
- [x] `<PlanActionFooter>` is visible at the bottom of the middle column showing Send Rx + Send & Finish + Finish visit (per cockpit state).
- [x] No commit row buttons render inside `<PrescriptionForm>` when `actionsInFooter === true`.

### Non-cockpit parity

- [x] Appointment-detail page (`/dashboard/appointments/[id]` outside cockpit-v2) still renders the full legacy `<PrescriptionForm>` (radio + Subjective + Objective + Photo block + commit row).
- [x] In-call mini panel mount is unchanged.
- [x] Post-call summary mount is unchanged.

### Form parity

- [x] Typing into the right-column Subjective input updates the `RxFormContext.symptoms` field exactly as before (single source of truth — `RxFormContext`).
- [x] Typing into the right-column Objective input updates `examinationFindings` via the new chp-02 General/Systemic split.
- [x] Send Rx flow end-to-end (draft → validate → send) works from `<PlanActionFooter>`.

### Quality

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test` clean (new comp-root tests + PrescriptionForm tests + templates tests).
- [x] Visual regression: 1366×768 cockpit view — three columns visible without horizontal scroll; Plan column scrolls only inside Medicines if needed; `<PlanActionFooter>` sticky at bottom.
- [x] Telemetry — `cockpit_polish.plan_pane_dedup_landed` fires once per session in cockpit mount.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with the lift table extended (subjective/objective/entryMode/photo added).
- [x] `plan-cockpit-v2-execution-roadmap.md` § Changelog — new line.
- [x] `docs/Work/capture/inbox.md` has 2-3 new lines (follow-ups).

---

## Out-of-scope (rolled forward)

| Item | Where it lands |
|---|---|
| **Surfacing photo-attach as a cockpit-specific affordance** (not via the radio) | Phase 4+ (capture-inbox) — likely a body-pane / launcher feature, not in the Plan column. |
| **Removing `PrescriptionType` from the form's state machine entirely when lifted** | Capture-inbox — DL-4 forces `"structured"` but leaves the state; removing the type union is a wider refactor. |
| **Mobile / narrow-monitor handling of the lifts** | Owned by `cockpit-middle-investigations`'s `InvestigationsAutoMerge` pattern; if needed, follow-up batch. |
| **Per-doctor toggle to re-show the radio in cockpit (advanced users)** | Capture-inbox if dogfooding requests. |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | ppd-01 | 1 | 0 | 0 | ~1.5h |
| 2 | ppd-02, ppd-03, ppd-04 | 3 | 0 | 0 | ~3-4h (3 parallel lanes; ~1.5-2h wall-clock if truly parallel) |
| 3 | ppd-05 | 0 | 1 | 0 | ~1.5-2h |
| **Total** | **5** | **4** | **1** | **0** | **~5-7h (~0.75 dev-day)** |

---

## References

- Source list: [day README crosswalk](../README.md#issue-to-batch-crosswalk).
- Existing lift-pattern precedent: `cmr-01` (AssessmentStrip + `dxLifted`), `cmr-02` (SafetyStickyStrip + `safetyLifted`), `cmr-03` (PlanActionFooter + `actionsInFooter`), `cmr-06` (templates wiring).
- Cockpit shell: [`frontend/lib/patient-profile/templates.tsx`](../../../../../frontend/lib/patient-profile/templates.tsx) — `makeMiddleBottomRow`, `makeRightColumn`.
- Existing comp root: [`frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`](../../../../../frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../process/EXECUTION-ORDER-GUIDELINES.md).
