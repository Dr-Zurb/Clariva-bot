# Rx lifecycle — product plan

> **Source:** 31 Aug 2026 cockpit session. Reported symptom: after "send & finish", returning to the patient leaves the chart half-locked — chief complaints are read-only but medicines, vitals and exam are fully editable. Recon showed this is not a design that was half-applied; it is three ungated surfaces plus a no-op overlay, with no backend guard at all.
>
> **Status:** Phase 1 **Implemented** 2026-08-31. Phase 2 **Implemented** 2026-09-10 with residuals (`rxl-05`…`10`). Phase 3 **Implemented** 2026-09-10 with residuals — 15-minute in-place window (`rxl-11`…`18`) **superseded** by same-day revise (`rxl-19`…`29`). Neither 2 nor 3 is Shipped. Full write-up: [`p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md`](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Out of this program:** queue / token / next-patient behaviour, `visit_payments` and hisab, patient-facing share links, AI parse, letterhead design.

---

## North star

> A prescription is a document, not a form. While the doctor is working it, it is a draft. Finish is the only attest. Print and send hand over a copy without ending the encounter. One slip per clinic-local visit-day: labs-and-return continues the same draft; a same-day correction after Finish is a new row that supersedes the issued one, timestamped, so the pharmacist can tell which copy is current. A later calendar day is a past visit.

After this program ships:

1. Finish attests. Print and send do not. The service-layer write guard still holds — UI grey-out is courtesy.
2. A patient sent for labs and returning the same day continues the **same** draft. No new appointment, no second fee.
3. Reopening a finished note the same day is editable. Re-issuing creates Version N+1 as a new row; Version N stays retrievable and is marked superseded.
4. A later day shows past-visit reference + repeat (`lvc`). A front-desk re-check-in is a genuine second visit.

---

## Why this is worth doing now

1. **The lock the code claims to have does not exist.** `canEditPrescriptionDraft` is consulted by two surfaces out of five. `updatePrescription` checks ownership and nothing else — a completed, sent, printed prescription accepts writes from the API.
2. **The data model already supports the target shape.** `prescriptions.appointment_id` has an index but **no unique constraint**, and `listPrescriptionsByAppointment` already returns an ordered list. Append-a-note needs no structural change.
3. **The freeze mechanism already exists, keyed on the wrong signal.** The PDF service already reminds a stored artifact instead of re-rendering when `sent_to_patient_at` is set (BRD-D4). Print-only prescriptions — the main in-clinic flow — have that column null and re-render on every print.
4. **Lazy creation already exists.** The Rx autosave already creates-if-missing. The append model reuses that path rather than adding one.

---

## What exists today (do not re-derive)

| Surface | State |
|---|---|
| Lock gate | `canEditPrescriptionDraft(state)` in `frontend/lib/patient-profile/state.ts` — false only for `ended` / `terminal`. |
| Subjective | ✅ Gated. `SubjectivePane` passes `disabled={!canEditPrescriptionDraft(ctx.state)}`. |
| Assessment | ✅ Gated. Same expression in `cockpit-tabs.tsx`. |
| Plan (medicines, investigations, follow-up, advice) | ❌ **Ungated.** `PrescriptionForm` passes `disabled={saving}` to `PrescriptionFormCompositionRoot` — an autosave-in-flight flag. Visit state never reaches Plan. |
| Objective (exam, notes, reports, media) | ❌ **Ungated.** `ObjectivePane` has no lock prop; `PrescriptionFormCompositionRoot` mounts `<ObjectiveSection heading={null} />` with no `disabled`. |
| Vitals | ❌ **Ungated twice.** `ObjectiveSection` honours `disabled` everywhere except `vitals: <VitalsGrid />`. `VitalsGrid` accepts `disabled` and threads it correctly — it is simply never passed. |
| Read-only overlay | ❌ **Inert.** `RxWorkspace` renders it with `pointer-events-none`, so every click passes through. Contributes an aria-label only. |
| Backend guard | ❌ **None.** `updatePrescription` verifies `doctor_id` only. No appointment-status, attest, or sent check. |
| Attest stamp | ❌ Missing. Only `sent_to_patient_at` exists; nothing records finish or print. |
| Prescriptions per appointment | ✅ Already plural. No unique constraint; `listPrescriptionsByAppointment` orders `created_at DESC`; the cockpit loads `list[0]`. |
| Lazy create | ✅ Exists. Rx autosave creates-if-missing; `PrescriptionMediaStrip.ensurePrescription` follows the same pattern. |
| Carry-forward | ⚠️ Exists but excludes by **appointment**, so it cannot see a sibling note under the same appointment. |
| PDF freeze | ⚠️ Exists for `sent_to_patient_at` only (BRD-D4). Print-only re-renders and upserts. |
| PDF storage | ⚠️ `overwrite-on-regen — we never accumulate per-version PDFs` (T3-D2). Path built in three places. |
| PDF cache | ⚠️ 5-min in-memory, keyed by prescription id alone; `invalidatePrescriptionPdfCache` fires on every update. |
| Audit trail | ⚠️ `logDataModification` accepts `changedFields` but `updatePrescription` passes none. `audit_logs.metadata` is no-PHI by policy, so it can never hold values. |
| Layout-preference autosave | ⚠️ Section order / collapse / hidden sets and the vitals hidden set all gate on the same `disabled` flag as clinical content. |

**Amended 2026-09-10 (Phase 3 closed, do not re-derive from the Aug 31 rows above):** Print and send do not attest. Finish does. Same-day issued notes are writable; yesterday is refused server-side. Re-issue clones a new row (Version N+1). Footer replaces-line + versioned filename shipped. History lists notes and versions. Service-layer guard is `not superseded AND (not issued OR issued today)`. Filename is `prescription-9sep2026-vN.pdf`. Legacy panes still visit-gated. `lvc` later-day strip is not this program.

---

## Decision lock (RXL-DL-1 … RXL-DL-12)

- **RXL-DL-1 — Attest is the lock boundary, not appointment status.** A prescription locks when it is attested, recorded by a stamp on the prescription row. Appointment status stays a queue and billing concern. Reading the lock off `completed` is what made the current gate both too coarse and unenforceable.
- **RXL-DL-2 — One gate, read from context.** Every editable surface derives its lock from a single source it reads itself. No surface receives an ad-hoc `disabled` boolean assembled by a parent. Forgetting to wire a new section must fail **closed**, which is precisely how Objective and vitals ended up editable.
- **RXL-DL-3 — A same-day return never creates an appointment.** Labs-and-return continues the same draft. A same-day correction after Finish is a new *row* under the same appointment (RXL-DL-13), not a new visit. Tokens, queue and `visit_payments` stay untouched. A genuine second encounter is a front-desk check-in.
- **RXL-DL-4 — The continuation note is created lazily, on the first user edit.** Opening a finished chart to read must write nothing. Doctors browse completed charts constantly; eager creation would fill visit history with empty documents.
- **RXL-DL-5 — Seeding is not editing.** Initial hydration, desk-vitals seeding and carry-forward travel a non-dirtying path. Only a user-originated field change marks the form dirty or schedules a save. Without this, RXL-DL-4 is unimplementable — the desk-vitals seeder alone would create a note on every glance.
- **RXL-DL-6 — Carry subjective, not objective.** Complaints, history and diagnosis carry into a continuation note. Vitals and exam findings start empty. They are point-in-time measurements; copying a reading forward into a document that then gets printed as today's would be a false record.
- **RXL-DL-7 — Replaced 2026-09-09 by RXL-DL-14.** The 15-minute clock is killed. Same-day revise is the clinic-local day.
- **RXL-DL-8 — The window and its tracing ship together.** No phase may permit a post-attest edit that is not captured. Until Phase 3-B lands, an attested note stays hard-locked at the service layer. This is a sequencing lock, not a preference.
- **RXL-DL-9 — A revision is a finalized state, not a save.** The version advances when the document is re-issued — never per autosave.
- **RXL-DL-10 — Issued bytes are retained.** A revision is a new row, so the storage path (`<doctor>/<rx_id>.pdf`) never overwrites the issued file. T3-D2 stays as written. Re-rendering an old revision from payload is still not acceptable.
- **RXL-DL-11 — The slip marker is system text.** It renders in the PDF footer beside the existing short id and generated-at line, never inside the doctor-configurable letterhead footer. A branding setting must not be able to suppress a medico-legal marker.
- **RXL-DL-12 — Corrections supersede, they do not replace.** A correction points at what it supersedes and carries a required reason (presets). Two documents where one is silently wrong is worse than no history.
- **RXL-DL-13 — A revision is a new row, never an in-place mutation.** Each issued version is its own immutable `prescriptions` row. The previous row is the snapshot — no snapshot table.
- **RXL-DL-14 — The revise window is the clinic-local day, not a clock.** One slip per visit-day. Boundary: RXL-Q7.
- **RXL-DL-15 — Who reopens decides.** Doctor reopening the chart continues today's slip. Front-desk check-in is a new visit.
- **RXL-DL-16 — A requisition print is not a prescription.** Printing or sending a copy neither attests nor finishes.

---

## Open questions — recommended defaults

| ID | Question | Recommendation | Status |
|---|---|---|---|
| **RXL-Q1** | What sets the attest stamp? | **Finish only** (reversed 2026-09-09). Print and send record delivery; they do not end the encounter. | **Relocked** 2026-09-09 |
| **RXL-Q2** | Do the doctor's private `clinical_notes` lock with the document? | **Yes.** Medico-legally they are part of the encounter record. A doctor who wants a mutable scratchpad should get a non-record surface, not an editable hole in an attested note. | **Locked** 2026-08-31 |
| **RXL-Q3** | Layout-preference autosaves share the content `disabled` flag. Freeze them too? | **No — split them.** Section order, collapse state, hidden sets and the vitals hidden set are doctor UI preferences, not patient data. Splitting is in scope for `rxl-01`. | **Locked** 2026-08-31 |
| **RXL-Q4** | Per-revision PDF retention against the 7-year policy — storage budget? | Keep all revisions. A revision is a new row, so each version already has its own path. Revisit only if volume shows otherwise. | Recommended |
| **RXL-Q5** | Does visit history show a field-level diff inline, or list revisions with compare on demand? | List revisions with compare on demand. Inline diffs on every history row will bury the clinical content. | Recommended |
| **RXL-Q6** | Should a same-day revise after a delivery prompt a reprint / resend? | Yes — a prompt, never an automatic resend. Prompt shipped (`rxl-25`). Reprint half is weak because `printed_at` is never written. | Recommended — residual |
| **RXL-Q7** | Where does the clinic-local day end? | 06:00 next morning in `doctor_settings.timezone` (`getDoctorTimezone`, fallback `Asia/Kolkata`). Implemented in `rxl-23`. Desk "today" stays midnight-to-midnight. | **Locked** 2026-09-10 |
| **RXL-Q8** | Reason on revise — required? | Required as one-tap presets: **treatment change · item added · other**. Statement, not a question. Relocked 2026-09-11 after dogfood: no “why”, no “wrong dose”, no pharmacy row. | **Relocked** 2026-09-11 |
| **RXL-Q9** | Does a superseded version stay on the patient share link? | Yes, marked superseded. | Recommended — out of program |
| **RXL-Q10** | Attachments on a cloned version — copy rows or duplicate storage? | Copy rows, share `file_path`. Flag the erasure worker. | Recommended — erasure residual |

---

## Phase table

| Phase | Theme | Tasks | Gate (one sentence) | Status | Folder |
|---|---|---|---|---|---|
| 1 | Lock integrity | `rxl-01..04` | An attested visit is genuinely read-only on all five SOAP surfaces including vitals, and opening a finished chart writes nothing | **Implemented** 2026-08-31 | [`p1-lock-integrity/`](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p1-lock-integrity/) |
| 2 | Append notes | `rxl-05..10` | Returning to a finished patient starts a new dated note; the previous one is immutable, visible in visit history, and the queue and hisab never moved | **Implemented** 2026-09-10 — same-day adopt (`rxl-24`) amends "always empty"; residuals; not Shipped | [`p2-append-notes/`](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p2-append-notes/) |
| 3 (old) | Revise window | `rxl-11..18` | 15-minute in-place window + snapshot table | **Superseded** 2026-09-09 | [`p3-revise-window/`](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-revise-window/) |
| 3 | Same-day revise | `rxl-19..29` | Print/send do not attest; same-day reopen is editable; re-issue creates an immutable Version N+1; a later day is past-visit | **Implemented** 2026-09-10 — residuals; not Shipped | [`p3-same-day-revise/`](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-same-day-revise/) |

**Prefix:** `rxl`. Number continuously across phases.

**Plan rules:** When Phase 1 R-items / locks are accepted, promote to `Committed` in the dated folder above. Later phases are sibling `p{N}-` subfolders in the same `rx-lifecycle/` folder, not under a later day's date.

---

## Why the phases are in this order

Phase 1 is a **bug fix against the rule the code already claims**, so it landed independently.

Phase 2 depends on Phase 1's seed-versus-edit separation (RXL-DL-5) — lazy creation is unimplementable while a seeder can dirty the form.

Phase 3-A (`rxl-19`/`rxl-20`) does **not** wait on Phase 2's gate. It unblocks labs-and-return: print/send stop attesting, and the continuation note is actually editable.

Phase 3-B needs the attest stamp (Phase 2) and a PHI migration. Until 3-B, an attested note stays hard-locked at the **service layer** (RXL-DL-8) even though the cockpit may show an editable continuation for a *new* unminted note.

---

## Acceptance gate (program)

Phase 3 detail lives on the [same-day revise batch](../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md). Headline:

- [x] Print / send do not attest. Finish / wrap-up does (`rxl-20`).
- [x] Reopening a completed visit starts an editable continuation, not a dead-end banner (`rxl-19`).
- [x] Same-day re-issue after Finish is a new row that supersedes; issued bytes of Version 1 remain retrievable.
- [x] A previous day's note refuses writes server-side.
- [x] Reprint and filename identify the current copy.
- [ ] Later day is past-visit (`lvc`). Front-desk re-check-in is a new visit. **`lvc` not started. Desk check-in unchanged, not re-proven.**
- [ ] No PHI in logs or audit metadata. Type-check + lint + suites green. **Targeted suites green. Repo-wide tsc/lint pre-existing dirty.**

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Attested prescription still writable through the API | **H** | RXL-DL-1 — service-layer guard is the feature; UI is courtesy |
| Editing an attested Rx destroys the PDF already handed over | **H** | RXL-DL-10 — re-key the existing freeze to attest; retain per-revision bytes |
| Post-attest edits permitted before tracing exists | **H** | RXL-DL-8 — no same-day mutate of an attested row until `rxl-21`…`23` |
| Desk-vitals seeder silently creates notes on every chart view | **H** | RXL-DL-5 — seed-vs-edit (Phase 1) |
| Same-day return double-charges or takes a second token | **H** | RXL-DL-3 — no new appointment; `visit_payments` untouched |
| A future section forgets the gate and ships editable | **M** | RXL-DL-2 — context-read gate, fails closed |
| Revision counter driven by debounced autosave | **M** | RXL-DL-9 / DL-13 — new row at re-issue only |
| Two slips in circulation, indistinguishable | **M** | RXL-DL-11 — replaces-line + versioned filename (`rxl-26`/`rxl-27`) |
| Clone drops a child table or JSON column | **H** | `rxl-22` column inventory + byte-identical assert |
| Day boundary timezone-naive | **M** | RXL-Q7 recon before `rxl-23` |
| Doctor's layout preferences freeze on finished visits | **L** | RXL-Q3 — split prefs from content in `rxl-01` |
| Program grows into full EMR versioning | **M** | Scope guard: no field-level value audit, no version tree, no amendment workflow beyond supersede |

---

## Residuals (not this program)

- Field-level value audit trail. `audit_logs` is no-PHI by policy; passing `changedFields` (names only) to `logDataModification` from `updatePrescription` is in scope for `rxl-06`, but storing before/after **values** outside a revision snapshot is not.
- Amendment approval workflows, co-signing, supervising-physician attestation.
- Patient-visible revision history on the share link.
- Retention / purge worker changes for per-revision PDFs.
- Splitting `templates.tsx`'s legacy pane copies (`cv3x-03` owns that). Legacy `InvestigationsPane` / `AssessmentStrip` / `InvestigationsAutoMerge` still use `canEditPrescriptionDraft(visit)`.
- Any change to queue, token, pipeline or `visit_payments` behaviour.
- `lvc` later-day past-visit strip + repeat.
- Attachment erasure worker when two versions share `file_path` (RXL-Q10).
- Writing `printed_at` on print (RXL-Q6 reprint prompt).
- Live queue / OPD / `visit_payments` isolation was proven at source level only (`rxl-10`).
- Repo-wide typecheck / lint clean.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-09-11 (RXL-Q8 relocked — treatment change / item added / other; no “why”)
