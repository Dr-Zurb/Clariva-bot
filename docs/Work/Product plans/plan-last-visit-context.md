# Last visit context — product plan

> **Source thread:** 2026-09-08 chat, after the frequent-medicine-combo work landed. Real-OPD dogfood: *"last time patient came with cough, medicine syrup dextromethorphan. Now the visit shows cough grey / indicating previous visit. Cough is still there, some more medicine needs to be prescribed. On paper docs write **CST** (continue same treatment)."*
>
> **Recon finding that shapes the whole program:** this capability already exists **six times over**, scattered across six affordances with three different scopes and one dead surface. The job is **one coherent surface plus the one idea that is genuinely missing (repeat / CST)** — not a seventh prior-visit widget.
>
> **Prefix note:** program prefix is `lvc`, decision locks `LVC-DL-N`. The 2026-09-08 planning thread used `lvg` / `LVG-D1..4` informally; `LVC-DL-1..4` below are the same four decisions, renamed so prefix and program slug agree.
>
> **Sibling programs (same dogfood thread, do not merge):** the prescription **edit window** and the **same-day return / interim print** work. Both live in [`plan-rx-lifecycle.md`](plan-rx-lifecycle.md). This program was sequenced first because it is the only one of the three that does not touch attest, the lock, or print. Capture note: [`../capture/notes/2026-09-08-rx-edit-return-last-visit.md`](../capture/notes/2026-09-08-rx-edit-return-last-visit.md).
>
> **Status:** Phases 1, 2, and 4 **in tree** 2026-09-08 (not Committed). Phase 3 **Committed** 2026-09-10 — `lvc-12` implemented. `LVC-Q1` settled: medicine strip sits **above** the capture bar so expanded items never sit under the combo list.
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Out of this program:** attest / lock / edit window / interim print (rx-lifecycle owns those), the medicine combo ranking (`rx-fast-entry` / combos), letterhead and PDF output, patient-facing share links, any `prescriptions` schema change.

---

## North star

> An empty note already knows what happened last time. The last prescription sits in today's note the way a previous **parchi** sits on the desk — last visit's complaints, diagnoses, treatment, and any other visit-scoped section (including custom ones) visible without opening anything. The doctor turns any of it into today's note with one deliberate action, including the whole treatment in one stroke (**CST**). Nothing greyed-out is ever mistaken for something prescribed.

After this program ships:

1. A returning patient's note shows **an expanded grey last-visit strip per section** — date, items, and the action on each row — with no extra click to open it, no side sheet.
2. **Repeat last Rx** brings last visit's medicines into today's plan in one keyboard-reachable action, appending to whatever is already typed, reversible in one undo.
3. Any single item — a complaint, a diagnosis, a drug — can be lifted individually from last visit.
4. There is **one** last-visit data source and one affordance vocabulary. The five legacy prior-visit surfaces either read from it or are retired.

---

## Why this is worth doing now

1. **The doctor is already asking for it in paper vocabulary.** CST is not a feature request, it is a 40-year-old convention the software currently makes cost six interactions.
2. **Everything needed already exists, in the wrong shape.** Two APIs, a proven ghost pattern, an append/dedupe medicine differ, and a complaint-attribute suggestion engine are all shipped. Almost no new mechanism is required — only one payload and one UI primitive.
3. **The mouse is the regression risk we just removed.** Deterministic medicine parsing landed days ago specifically so the doctor's hands never leave the keyboard. Every current prior-visit surface costs a mouse trip, so in practice none of them get used during a busy OPD.
4. **It is the only one of the three dogfood asks with no lifecycle coupling.** No attest, no lock, no print, no migration. It can land while `rx-lifecycle` Phase 2 is still open.
5. **The scatter is actively getting worse.** One prior-visit surface is already dead code (`PreviousRxPopover`'s copy button), and a cockpit open can fire four overlapping prior-visit fetches. Left alone, the next feature adds a seventh.

---

## What exists today (do not re-derive)

### The six prior-visit surfaces

| Surface | Shows | Scope | Affordance | Write path |
|---|---|---|---|---|
| `CarryForwardButton` — "Same as last visit" | Subjective only (complaints + 3 histories) | **Patient** | Dropdown, per-field checkboxes, copy-all or pick | Dirty (`SET_COMPLAINTS`, `SET_*_STRUCTURED`) |
| `PreviousRxSideSheet` + `usePriorRxList` | Medicines only | **Patient**, all Rx | Side sheet → pick row → Append/Replace → diff preview → Confirm | Dirty (`SET_MEDICINES` + `fromPrescriptionId`) |
| `PreviousRxPopover` | Medicines, last 3 | **Patient** | Dropdown chip | ❌ **Retired** 2026-09-10 (`lvc-12`) |
| "Copy from last visit" (`PrescriptionForm`) | Dx + plan scalars + medicines | **Episode** | Header button + `window.confirm` | Dirty (`setField` + `SET_MEDICINES`) |
| `ComplaintCard` prior pool | Complaint **attributes** only | **Patient** | ❌ **Removed** 2026-09-08 (dogfood) — "Apply from history" banner | — |
| Vitals ghosts (`LastVisitVitalGhost`) | Column vitals | **Episode** | Inline grey line below input + placeholder | Dirty (`setField`) |

Plus a **seventh, invisible one**: continuation notes auto-seed subjective on load via `applySubjectiveCarrySeed` (`rxLoadDecision.ts`) — a non-dirtying `RESET` seed, complaints/histories/diagnoses only (RXL-DL-6).

### The data layer

| Piece | Scope | Returns medicines? | Notes |
|---|---|---|---|
| `getLastSubjectiveForPatient` | Patient, excludes current appointment | ❌ | Scans 10 newest, picks first with structured subjective. `GET /prescriptions/last-subjective` |
| `getLastPrescriptionInEpisode` | **Episode**, excludes current appointment | ✅ full | **Returns `null` when `episode_id` is unset** — silent-empty failure mode. `GET /prescriptions/last-in-episode` |
| `listPrescriptionsByPatient` | Patient, all | ✅ full | Heavy: every Rx ever, medicines + attachments embedded. Powers the side sheet |
| `listRecentPrescriptionsByPatient` | Patient | ❌ count only | Lightweight summary, limit 3 (max 25) |

There is **no** endpoint returning complaints + diagnoses + medicines in one lightweight payload. That gap is `lvc-01`.

### Reusable mechanisms (build on these, do not reinvent)

| Need | Existing |
|---|---|
| Grey clickable prior value | `LastVisitVitalGhost.tsx` — styling + a11y label pattern |
| React Query + prefetch | `lastVisitVitalsQueryOptions`, `queryKeys.consult(appointmentId)`, `STALE.CLINICAL`; `prefetchConsultVitalsQueries` and `prefetchNextConsult` already warm on **OPD queue hover** |
| Medicine append with dedupe + diff | `rx-diff.ts` — `applyMode(current, prior, "append")`, `diffMedicines` (dedupes on `medicineName\|dosage`) |
| Subjective bulk carry | `buildSubjectiveCarryForwardActions` (`carry-forward-subjective.ts`) |
| Complaint attribute defaults from history | `ComplaintCard` `priorPool` + `complaint-defaults.ts` |
| Non-dirtying seed | `seedFields` → `SEED_FIELDS` (leaves `isDirty` untouched); autosave is `enabled: autosaveEnabled && reducerState.isDirty` |

### Correction to earlier notes

The vitals ghost **click dirties** — `onApply={() => setField(vitalKey, …)}` in `VitalsExtended.tsx`. It does **not** use `seedFields`. Only desk-vitals auto-seed (`DeskVitalsSectionNoteSeed`) and hydrate/`RESET` take the non-dirtying path. LVC-DL-5 keeps the dirtying behaviour deliberately.

---

## Decision lock (LVC-DL-1 … LVC-DL-10)

Locked in the 2026-09-08 planning thread. Re-opening any of them belongs in a new `Decision:` block, not mid-execution.

- **LVC-DL-1 — Strip stays expanded.** Reopened 2026-09-08 after dogfood: the doctor needs last visit visible without a click — it is the handy reference, not chrome to hide. Header is a label, not a toggle. (Original lock was collapsed-by-default to keep a blank note looking blank; that hid the feature.)

- **LVC-DL-2 — "Last visit" is patient-scoped.** The most recent prescription for this patient with this doctor, excluding the current appointment. **Not** episode-scoped: `episode_id` is a system construct, and `getLastPrescriptionInEpisode` returns `null` when it is unset, which would make the program's primary surface silently vanish on exactly the patients who need it. The clinical question is "what did I do last time I saw this person".

- **LVC-DL-3 — Repeat appends; it never silently replaces.** CST in practice is "same **plus**" — the source thread's own example is *continue the dextromethorphan and add something*. Repeat merges into whatever is already typed, deduped, and is reversible in **one** action. A repeat that brings six drugs must not cost six deletions to undo.

- **LVC-DL-4 — A carried complaint drops its time-relative fields; a repeated medicine keeps its duration.** Carrying last visit's `duration` onto a complaint writes a false record — "cough, 5 days" is not today's truth when it has been going twelve. `onset` and `duration` clear and take focus; name, character, location, severity, laterality carry. Medicines are the opposite case: continuing the same treatment usually means the same course, so carry the sig unchanged and let the doctor edit. Course on a complaint is **Improving / Unchanged / Worsening** written into `notes` — not a Repeat action (Repeat / CST stays on medicines).

- **LVC-DL-5 — Display writes nothing; the click is a real edit.** Rendering a ghost must not mark dirty, must not schedule an autosave, and must never mint a prescription row (RXL-DL-4 — a doctor browsing a chart must write nothing). Applying one **is** a user-originated change and takes the dirtying path, exactly as the vitals ghost already does. The line is display-versus-action, not last-visit-versus-desk.

- **LVC-DL-6 — One canonical source.** New surfaces read the unified last-visit payload. Legacy surfaces are repointed or retired in Phase 3 — never forked. Any phase that adds a prior-visit fetch alongside the existing four has failed regardless of how the UI looks.

- **LVC-DL-7 — A ghost is never reachable from the capture bar's commit path.** Not in its tab order, and `Enter` in a capture bar can never commit a ghost. The doctor types at speed with their eyes on the patient; a phantom row one keystroke away from becoming a real prescription is the single worst outcome this program could produce.

- **LVC-DL-8 — A ghost is structurally distinct from a committed row, not merely lighter.** Different chrome — border, indent, absence of row controls. Opacity alone is not an adequate signal for the difference between *prescribed* and *not prescribed*.

- **LVC-DL-9 — Recall and repeat are separate jobs from fast typing.** The medicine combo list serves *typing faster*; this program serves *not having to remember* and *not having to type at all*. Do not fold last-visit medicines into the combo ranking — it would make one list answer three questions and rank none of them well.

- **LVC-DL-10 — No migration.** Everything needed is already stored on `prescriptions` and `prescription_medicines`. A phase that reaches for a schema change has mis-scoped.

- **LVC-DL-11 — Previous parchi.** Last visit is the previous slip sitting on the desk while today's note is written. Every **visit-scoped** section that had content last time gets the same always-open strip and one apply verb — including doctor-defined custom sections. Display still writes nothing (LVC-DL-5). First visit still renders nothing (LVC-Q5). **Not** last visit: chart-level surfaces (allergies, known conditions, patient background / PMH). Vitals keep the existing per-field ghosts; do not add a second strip. Custom-section match: same `id` first (doctor defaults preserve ids), then case-insensitive title; a last-visit-only custom section still appears so the doctor can Add it onto today.

---

## Open questions — recommended defaults

| ID | Question | Recommendation | Status |
|---|---|---|---|
| **LVC-Q1** | Where does the medicine strip go? `MedicineCaptureBar` already renders combo suggestions directly beneath it; two grey lists under one input will fight. | **Above the capture bar.** Expanded items stay above the input; combo suggestions stay below it. Locked in `lvc-05` 2026-09-08. | **Locked** 2026-09-08 |
| **LVC-Q2** | Once `rx-lifecycle` Phase 2 lands and one appointment can hold two notes, does a same-day sibling note count as "last visit"? | **No.** The RBS interim slip written at 10am is not a previous visit for the note written at 5pm. `getLastVisitSummary` stays appointment-scoped. Carry-forward (`rxl-08`) may see the sibling; last-visit must not. | **Locked** 2026-09-10 |
| **LVC-Q3** | Should carried medicines be visually marked as carried while editing? | **Not in v1.** It helps the at-a-glance picture but adds per-row state to the medicine list for a benefit the grey strip already mostly delivers. Revisit after dogfood. | Recommended |
| **LVC-Q4** | Retire `PreviousRxPopover` or wire its dead copy button? | **Retire.** Plan entry is `PreviousRxPlanTrigger` + side sheet. `lvc-12` deletes the popover. | **Locked** 2026-09-10 |
| **LVC-Q5** | Does the strip appear on a patient's **first** visit (no prior Rx)? | **Render nothing** — no empty state, no "no previous visit" line. A first-visit note should be visually identical to today's blank note. | Recommended |

---

## Phase table

| Phase | Theme | Tasks | Gate (one sentence) | Status | Folder |
|---|---|---|---|---|---|
| 1 | Recall + repeat spine | `lvc-01..07` | A returning patient's note shows one grey last-visit line for complaints and medicines, any single item can be lifted, and **Repeat last Rx** appends last visit's treatment in one keyboard-reachable, single-undo action | **In tree** 2026-09-08 — promote to Daily-plans when dogfood is happy | ⟨promote⟩ |
| 2 | Remaining sections | `lvc-08..11` | Diagnoses, investigations, advice and follow-up carry the same strip and the same per-item apply vocabulary | **In tree** 2026-09-08 — dogfood vocab: diagnoses **Improving / Stable / Worsening** (acuity); investigations **Repeat**; advice **Add**; follow-up **Use**; strips stay expanded | ⟨promote⟩ |
| 3 | Consolidation | `lvc-12..15` | Exactly one last-visit fetch and one affordance vocabulary remain; the legacy surfaces are repointed or deleted | **Committed** 2026-09-10 — `lvc-12` in progress | [`../Daily-plans/September 2026/08-09-2026/last-visit-context/p3-consolidation/`](../Daily-plans/September%202026/08-09-2026/last-visit-context/p3-consolidation/) |
| 4 | Previous parchi (LVC-DL-11) | `lvc-16..20` | Remaining visit-scoped sections and custom sections show the same strip; the last prescription is readable while filing today | **In tree** 2026-09-08 — objective custom sections skipped (bodies derive into exam, no visit column) | ⟨promote⟩ |

**Prefix:** `lvc`. Number continuously across phases.

**Plan rules:** When Phase 1's `LVC-Q1` is settled, this plan promotes to a dated batch under `docs/Work/Daily-plans/<Month>/<date>/last-visit-context/p1-recall-repeat/plan-p1-last-visit-context-recall-repeat-batch.md` and becomes `Committed`. Later phases promote as sibling subfolders under the **same** `last-visit-context/` program folder created on the start date, not under the later day's date.

### Phase 1 task shape (`lvc-01..07`)

| ID | Title | Size | Model |
|---|---|---|---|
| `lvc-01` | `GET /patients/:id/last-visit-summary` — lightweight payload, patient-scoped | M | Sonnet |
| `lvc-02` | Query options + prefetch wiring (`queryKeys.consult`, `STALE.CLINICAL`, queue-hover warm) | S | Sonnet |
| `lvc-03` | `LastVisitSectionStrip` primitive — collapsed line, expand, per-item apply | M | Sonnet |
| `lvc-04` | Complaints wiring + LVC-DL-4 field clearing | M | Sonnet |
| `lvc-05` | Medicines wiring + **Repeat last Rx** (settles `LVC-Q1`) | L | Sonnet |
| `lvc-06` | Single-action undo for repeat | S | Sonnet |
| `lvc-07` | Suites + docs + gate | M | Sonnet |

### Phase 2 task shape (`lvc-08..11`)

| ID | Title | Size | Model |
|---|---|---|---|
| `lvc-08` | Diagnoses strip — **Improving / Stable / Worsening** writes `acuity`. First tap adds the card; later taps only update. No Resolved card. | M | Sonnet |
| `lvc-09` | Investigations strip — per-order **Repeat**, append + dedupe | S | Sonnet |
| `lvc-10` | Advice strip — **Add**, append unique | S | Sonnet |
| `lvc-11` | Follow-up strip — **Use** copies interval | S | Sonnet |

No new PHI column, no migration, no RLS change — Phase 1 does not require Opus.

### Phase 3 task shape (`lvc-12..15`)

| ID | Title | Size | Model |
|---|---|---|---|
| `lvc-12` | Retire `PreviousRxPopover` (LVC-Q4) | S | Sonnet |
| `lvc-13` | `CarryForwardButton` reads last-visit-summary | M | Sonnet |
| `lvc-14` | Drop `last-in-episode` from cockpit (vitals + copy CTA) | M | Sonnet |
| `lvc-15` | Suites + docs + one-fetch gate | M | Sonnet |

### Phase 4 task shape (`lvc-16..20`) — previous parchi

Dogfood 2026-09-08: the last prescription should keep living in the current visit, the way a paper OPD keeps the previous parchi on the desk. Same primitive, same fetch (grow the payload — do not add a second endpoint). **Opus** — payload + four SOAP tabs + custom-section matching.

| ID | Title | Size | Model |
|---|---|---|---|
| `lvc-16` | Grow `last-visit-summary` with remaining visit-scoped fields + four custom-section arrays (no new column) | M | Opus |
| `lvc-17` | Generic text / structured-history strip — **Use** (family, social, past surgical, HOPI/free-text, assessment notes, clinical notes, referral, exam, objective notes) | M | Opus |
| `lvc-18` | Custom-section strip — match by id then title; **Add** body (and mint the section if today does not have it) | L | Opus |
| `lvc-19` | Wire Subjective / Objective / Assessment / Plan, including custom blocks | L | Opus |
| `lvc-20` | Suites + docs + gate | M | Opus |

---

## Why the phases are in this order

Phase 1 delivers the felt benefit — the grey line and CST — on the two sections the source thread actually named (complaints, medicines). It is also the phase that establishes the canonical payload and the UI primitive, so Phases 2 and 3 are extension and deletion rather than design.

Phase 2 is deliberately **after** the doctor has used Phase 1 in a real OPD. Which remaining sections deserve a strip is a question dogfood answers better than planning does — ghosting all of them is explicitly what LVC-DL-1 rejects.

Phase 3 is last because consolidation has no felt benefit and the agent contract forbids opportunistic refactors. It is not optional, though: building Phase 1 on the unified endpoint is what makes Phase 3 a deletion instead of a migration.

---

## Acceptance gate (program)

- [ ] A returning patient's empty note shows an expanded grey last-visit strip per participating section, with no extra click to open it.
- [ ] Rendering the strip creates no prescription row, sets no dirty flag, and schedules no autosave. Opening a chart and leaving still writes nothing.
- [ ] Applying a single item marks the form dirty exactly as typing it would.
- [ ] **Repeat last Rx** is reachable without the mouse, appends without discarding typed rows, dedupes, and reverses in one undo.
- [ ] A repeated complaint arrives with `onset` / `duration` empty and focused; a repeated medicine arrives with its sig intact.
- [ ] `Enter` in the medicine capture bar cannot commit a ghost, and no ghost is in the capture bar's tab order.
- [ ] A ghost is distinguishable from a committed row by more than colour, verified with the theme's lowest-contrast setting.
- [ ] The strip renders nothing on a patient's first visit.
- [ ] Ghosts are not clickable when the note is content-locked.
- [ ] Opening a cockpit fires **one** last-visit fetch, served from cache after a queue-hover prefetch.
- [ ] `PreviousRxPopover`'s dead copy path is gone, and the legacy carry surfaces read the canonical payload.
- [ ] No PHI in logs, query keys, or telemetry. Type-check + lint + suites green.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| A ghost medicine becomes a real prescription via a stray keystroke | **H** | LVC-DL-7 — never in the capture bar's commit path or tab order |
| A ghost is read as prescribed at a glance | **H** | LVC-DL-8 — structural distinction, not opacity; contrast-checked |
| Repeated complaint duration writes a false clinical record | **H** | LVC-DL-4 — time-relative fields clear and take focus |
| This ships as prior-visit surface number seven | **H** | LVC-DL-6 — canonical payload from day one; Phase 3 retires the rest |
| Ghost rendering mints empty notes from chart browsing | **H** | LVC-DL-5 — display is a pure read; only clicks dirty |
| Grey text everywhere makes an empty note unreadable | **M** | LVC-DL-1 — expanded on purpose after dogfood; keep structural ghost chrome (LVC-DL-8) so it is never read as today's note |
| Medicine strip fights the combo suggestion list | **M** | LVC-Q1 — settled by prototype inside `lvc-05`, not on paper |
| Repeat brings six drugs the doctor did not want | **M** | LVC-DL-3 — one-action undo |
| Episode-scoped source silently returns nothing | **M** | LVC-DL-2 — patient-scoped, so no `episode_id` dependency |
| Program grows into a full visit-diff / EMR history viewer | **M** | Scope guard: no field-level diff UI, no revision compare (that is RXL-Q5) |

---

## Residuals (not this program)

- Field-level diff between last visit and today (`RXL-Q5` recommends list-with-compare-on-demand for visit history; this program shows reference, not diff).
- Carried-versus-new medicine marking in the editing surface (`LVC-Q3`).
- Folding last-visit medicines into combo ranking (`LVC-DL-9` forbids it).
- Chart-level carry (allergies, known conditions, patient background / PMH) — not last visit; they are the chart (LVC-DL-11).
- Vitals: keep the existing per-field ghosts; no second last-visit strip (LVC-DL-11).
- Anything in `rx-lifecycle`: attest trigger, interim / requisition print, the 15-minute edit window, sibling-note carry (`rxl-08`).
- Patient-facing "your last visit" surfaces on the share link.

---

**Created:** 2026-09-08.
**Last Updated:** 2026-09-10 (Phase 3 committed — `lvc-12` retires `PreviousRxPopover`. LVC-Q2 / Q4 locked.)
