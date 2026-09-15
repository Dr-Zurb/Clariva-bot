# Desk visit prep — product plan

## The front desk prepares the chart; the doctor reads it and decides

> **Source:** [`capture/inbox.md`](../capture/inbox.md) 2026-09-07 — *"Front desk: basic history + report uploading"* and *"Vitals coming late"*. Founder framing, 2026-09-12: *"almost no doctor likes to upload photos during consultation — the doctor needs to see data and consult, not do manual work."*
>
> **Status:** Phase 1 **in progress** 2026-09-12 (desk documents). Phase 2 **revised 2026-09-12** (desk write-through to chart tables; chip UI matching cockpit catalogs; no accept-cards; why-today omitted; DVP-DL-4 synthetic path removed). Phase 3 **implemented 2026-09-12** (dated list V/H/D flags; intake sequence already pay → vitals → history → documents). Staff capabilities **revised 2026-09-13**: five checkboxes (`front_desk` | `vitals` | `history` | `internal_labs` | `papers`); leftover `previsit` folds into the four prep seats (migration `237` after `236`). JWT stays `receptionist`. Apply `233` → `234` → `235` → `236` → `237` → `238`. Phase 4 **in progress** 2026-09-13 (internal lab order→result loop; per-test close-out on `238`).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Prefix:** `dvp`. Number continuously across phases.

---

## North star

> A patient walks in carrying a lab report and a bag of strips. By the time the doctor opens the visit, the report is already on the chart as labelled pages, and the patient's allergies, current medicines and known conditions are already on the real chart sections. The doctor reads and edits. Nobody clinical photographed anything.

The desk already does the manual work of a visit — finding the patient, booking, taking money, taking vitals. It does not yet do the two manual things that currently land on the doctor mid-consultation: **photographing paper** and **typing history**. This program moves both.

---

## Why this is worth doing now

1. **The consultation is the most expensive minute in the clinic.** Photographing a four-page report costs the doctor ~60 seconds of a ~7-minute consult, and it happens with the patient watching. The desk has dead time; the consult has none.
2. **The desk is already a staffed, reliable surface.** `/desk` ships with search, register, book, check-in, payment, vitals, cancel, reschedule, left and hisab (receptionist-portal P1–P5). Adding two steps to an existing flow is cheaper than inventing a channel.
3. **The chart spine already exists.** `patient_allergies` (`087`), `patient_chronic_conditions` (`087`), `patient_medications` (`128`), the NKDA flag (`222`), and the whole Objective → Reports strip. Nothing clinical needs inventing — only a writer and a review step.
4. **The trust model for the desk matches vitals.** A trusted receptionist writes the same doctor-scoped chart tables the doctor would. The sidecar remains as this-visit provenance. The patient-facing form in [`plan-history-link.md`](./plan-history-link.md) still uses sidecar + accept if it is built later.
5. **A patient-fills-it-on-their-phone form has worse odds than a receptionist asking.** In an Indian OPD waiting room, a staffed desk gets a higher completion rate than a DM link. That reverses the build order in `plan-history-link.md` — see [Relationship to existing programs](#relationship-to-existing-programs).

---

## What exists today — do not re-derive

| Surface | State |
|---|---|
| Desk portal | `/desk`, `/desk/today`, `/desk/account`. `DeskShell`, staff-scoped `frontend/lib/desk/api.ts` (never imports `@/lib/api`). |
| Staff auth chain | `staffCapability(...)` → `authenticateToken` → `resolveActingDoctor`. Active `clinic_staff` row is authoritative; JWT claim is a routing hint (RQ2). Capabilities on the row decide the `/desk` step set. |
| Desk write precedent | `desk-vitals-service.ts` — writes doctor-scoped `patient_vitals` via the service-role client, `doctor_id` = acting doctor, `actorId` audited separately. **This is the template for every write in this program.** |
| Cockpit report upload | Objective tab → Reports → `ObjectiveMediaStrip` + `PrescriptionMediaStrip`. File-picker only, no drag-drop, no camera hint. `image/jpeg\|png\|webp` + `application/pdf`, **10 MB/file**, 24 files. |
| Attachment storage | Private bucket `prescription-attachments` (`027`). Path `{doctor_id}/{prescription_id}/objective/{uuid}-{filename}`. Category lives **only in the path**, not a column. Access is service-role signed URLs gated by `verifyPrescriptionOwnership()`. |
| Attachment table | `prescription_attachments` (`026`): `prescription_id` **NOT NULL** FK. `prescriptions.appointment_id` **NOT NULL**. The prescription row does not exist until the doctor's `ensurePrescription()` fires. |
| Lab extraction | `POST /prescriptions/:id/attachments/:attachmentId/extract-lab`. Suggestion-only, writes nothing. PDF path is deterministic (`pdfjs`); photo path is OpenAI vision behind `OPENAI_LAB_VISION_ENABLED`. Doctor verifies in `LabExtractVerifyDialog` before anything lands. |
| Allergy safety | `frontend/lib/ehr/match-allergens.ts` reads **`patient_allergies`** and draft Rx medicines; surfaces via `AllergyClashBanner`, `PatientRibbon`, and the `pre-send-warnings.ts` gate. |
| History chart tables | Doctor-scoped, RLS `auth.uid() = doctor_id`, soft delete via `archived_at`. `patient_medications.source` already allows `self` (`130`). `patient_allergies_section_notes.no_known_allergies` exists (`222`). |
| Visit-scoped history | `family_history` / `social_history` / `past_surgical_history` (+ `_structured` JSONB) live on `prescriptions` — **no row until the doctor opens the note.** Wrong target for desk input. |
| Booking intake | `appointments.reason_for_visit` (`016`) — patient's main complaint at booking time. Desk does not ask why-today at the public counter. |
| Patient-authored clinical text | Sidecar `patient_history_submissions` (`234`) exists. Desk upsert also writes `patient_allergies` / NKDA / `patient_medications` (`source='self'`) / `patient_chronic_conditions`. Doctor archives or edits to reject. |
| Latest migration | `234`. This program's migrations are `233`+. |

---

## Relationship to existing programs

**This is a new program, not a phase of either parent** — new north star, new decision lock, and it spans the desk *and* the cockpit, which [`receptionist-portal`](./receptionist-portal/plan-00-receptionist-portal-roadmap.md) deliberately never touched.

### It reverses one locked out-of-scope row — narrowly

The receptionist-portal roadmap lists *"Patient photo capture, ID/Aadhaar scan, document upload at desk — adds DPDP surface area for no pilot value."* That row bundles three unlike things. **Only clinical document upload is reversed**, and the pilot value is now concrete (doctor time in-consult). **Patient face photos, Aadhaar/ID scans and insurance cards stay out of scope** — same DPDP surface, still no clinical payoff. See `DVP-DL-8`.

### It inverts the build order of `plan-history-link.md`

That plan's Phase 1 is the patient-facing public form and Phase 2 is "desk send". This program builds **the sidecar and the doctor's accept UI first, with the desk as the first writer**; the public patient form becomes a *second writer* into the same sidecar later. Its decision lock is **inherited, not re-derived** — HL-DL-1 (sidecar first), HL-DL-3 (why-today is visit-scoped, the other three patient-scoped), HL-DL-8 (never pre-fill with existing chart PHI), HL-DL-10 (versioned collection notice), and the field→column map in that doc's "Field → column map (v1)" all stand unchanged.

> **Hand-off to record at promote:** `plan-history-link.md` needs one line marking its Phase 1 public form as *superseded in order* by this program, and its Phase 2 "Desk send" as *absorbed here*. Do not create a second sidecar table under any circumstances.

---

## Decision lock (DVP-DL-1 … DVP-DL-14)

- **DVP-DL-1 — Desk documents attach to the appointment, not the prescription.** New table (`visit_documents`, name locked at promote) keyed `(doctor_id, patient_id, appointment_id)`. **Do not make `prescription_attachments.prescription_id` nullable.** `FilesTab`, `filterObjectiveAttachments()`, the `mediaCount` in `getResultsTimeline()` and `createAttachmentSignedUrlForDelivery()` all assume a parent prescription; a nullable FK turns a two-file feature into a cross-surface refactor.
- **DVP-DL-2 — Same bucket, new path prefix.** Reuse the private `prescription-attachments` bucket at `{doctor_id}/desk/{appointment_id}/{uuid}-{filename}`. Inherits the existing service-role signed-URL model. No new bucket, no public object, no storage RLS policy.
- **DVP-DL-3 — Desk history writes the chart (reopened 2026-09-12).** Same trust as desk vitals: upsert writes `patient_allergies` / NKDA / `patient_medications` / `patient_chronic_conditions` as the acting doctor, audited with the staff `actor_id` on the sidecar. Doctor rejects by archiving or editing the chart row. The patient-form path, if built later, stays sidecar + accept.
- **DVP-DL-4 — Killed 2026-09-12.** Write-through puts named allergies on `patient_allergies`, so the existing clash banner and send gate see them as real chart rows. The synthetic "reported at desk, not confirmed" path is removed.
- **DVP-DL-5 — Reopened 2026-09-13.** Staff may extract and confirm lab values on Check-in. Confirmed rows persist on `visit_documents.extracted_results` (not a desk-created prescription; DVP-DL-1 stands). The doctor opens Objective with those rows already in Reports and may still edit. No impression, no diagnosis. Auto-extract on upload stays off (DVP-Q5).
- **DVP-DL-6 — Every sidecar row and document is stamped with its source and actor.** `source ∈ ('front_desk', 'patient', 'assistant')` plus the real `actor_id`. A desk-typed answer, an assistant-typed answer, and a patient-typed answer must be distinguishable forever. Audit attributes the actor, never the acting doctor (receptionist-portal R7, inherited). JWT role stays `receptionist` for `/desk` routing; `clinic_staff.role` is `assistant` when the login has no `front_desk` seat.
- **DVP-DL-7 — Check-in becomes one sequence.** Arrive → pay → vitals → history → documents, each step skippable, with a completeness indicator on the `/desk/today` queue row. This is the fix for the *"vitals coming late"* capture: vitals are skipped today because they are an optional step *after* check-in rather than part of it. Receptionist-portal principle 7 still binds — the added steps must not lengthen the ~30-second new-patient path when skipped.
- **DVP-DL-8 — Clinical documents only.** Lab report · imaging · discharge summary · old prescription · referral letter · other. **Not** patient face photos, **not** Aadhaar/ID, **not** insurance cards.
- **DVP-DL-9 — The desk is a point of collection and needs the notice.** Versioned notice slot + `notice_version` snapshot on the submission row (HL-DL-10, inherited). The receptionist shows or reads it before asking. Wording is `⟨fill — counsel⟩`. Do not ship a `DRAFT-*` notice to production; do not reuse the retired recording-consent `v1.0`.
- **DVP-DL-10 — Desk submissions are correctable until the doctor engages; patient submissions are not.** HL-DL-6 ("one submit, append-only") was written for a patient who submits and walks away. A receptionist who fat-fingers a drug name is standing right there. **Desk-sourced submissions stay editable by the desk until the first doctor accept or the visit is opened, whichever is first;** after that the doctor owns the chart. Patient-sourced submissions keep the one-shot rule unchanged. *Reopenable if the audit story proves harder than the typo.*
- **DVP-DL-11 — The lab seat reads a projection, never the prescription.** A purpose-built endpoint returns only `{ orderId, label, kind }`. No diagnosis, no medicines, no chief complaint, no notes. `/api/v1/prescriptions/*` stays doctor-only and **no `staffAllowed` is added anywhere.** This is how DVP-Q8's "brushes principle 6" is settled: the desk gains one narrow purpose-built read, not reach into a clinical route.
- **DVP-DL-12 — Orders appear at attest, not on autosave.** Gate on `attested_at IS NOT NULL`. Ungated, the collector would watch half-typed test names appear and vanish. Wrap-up attests, so orders are final before the patient reaches the collector.
- **DVP-DL-13 — Reopened 2026-09-13.** Pending stays derived (no fulfillment row). Closed = every attested order is `uploaded` (covering `visit_documents` id) or `not_done` (reason). One file may cover many orders. `report_uploaded` on the pending list means the loop is complete, not that any file exists.
- **DVP-DL-14 — A mode on the existing queue, not a new route.** Receptionist-portal **R13** names `/desk/labs` specifically as forbidden. The pending list is a filter mode on `/desk/today` that switches off date-scoping. Same login, same shell, capability-filtered. APIs only this phase.

---

## Open questions — recommended defaults

| ID | Question | Recommendation | Status |
|---|---|---|---|
| **DVP-Q1** | Does desk history replace the patient link, or complement it? | Complement, desk first. The desk is the v1 writer; the public form lands later as a second writer into the same sidecar. Both stamp `source` (DVP-DL-6). | Recommended — confirm at promote |
| **DVP-Q2** | Do desk documents appear in the patient-level `FilesTab`, or only on the visit? | Both. `FilesTab` becomes a read-side union over the two stores, grouped by visit as it is today. Read-only there, as it is today. | Recommended |
| **DVP-Q3** | `LabReport.attachmentIds` currently holds `prescription_attachments` ids. How does it reference a desk document? | **Do not change the JSONB.** P1 shows desk documents as their own group. Extract stays on prescription attachments; promote-on-extract (copy into `objective/`) is a follow-up, not a schema change. | **Closed — no `lab_reports_json` change** |
| **DVP-Q4** | Phone photos routinely exceed the 10 MB per-file cap. Raise the cap or downscale? | Downscale client-side before upload; keep the 10 MB server cap unchanged. Raising it inflates storage and the extract path's 10 MB download ceiling. | Recommended |
| **DVP-Q5** | Auto-extract lab values when the desk uploads, so rows are pre-matched and waiting? | **No.** Staff must press Extract and confirm. That is a deliberate PHI-to-model call, not an upload side-effect. | **Closed — staff-triggered only** |
| **DVP-Q6** | Pregnancy / breastfeeding status — worth asking at the desk? | Clinically yes, but **no target column exists** on any chart table today, and it is specialty-dependent. Do not invent a column inside this program. Capture to `inbox.md` and decide separately. | **Deferred out** |
| **DVP-Q7** | Who can delete a desk-uploaded document? | Desk may delete its own upload until the visit is opened (mis-scan, wrong patient); doctor-only after. Mirrors DVP-DL-10's engagement boundary. | Recommended |
| **DVP-Q8** | Does the desk see that a test was ordered last visit, so it knows to ask for the result? | Yes — purpose-built order projection + derived pending list (DVP-DL-11…14). Not a prescription read. | **Selected — Phase 4 in progress** |
| **DVP-Q9** | Which `InvestigationOrderKind` values belong on the collector's list? Imaging with CT/MRI requisitions goes to a diagnostic centre, not your collector. | Show all kinds in v1 with the kind labelled. A per-order in-house/outside marker is a cockpit change — defer until it actually misfires. | Selected |
| **DVP-Q10** | How far back does pending go? An order that never gets a result sits forever. | Rolling window of the last 60 days of appointments. Manual dismiss is a follow-up, not this phase. | Selected |
| **DVP-Q11** | A result arriving 3 days later lands on an attested Rx and a `completed` appointment, where `evaluatePrescriptionWriteGuard` returns `appointment_locked`. Where do *you* read it? | Desk upload stays on `visit_documents` (DVP-DL-1). Verify late-result cockpit readability on a dummy patient before treating this as a blocker. | Recommended |

---

## Phase table

| Phase | Theme | Gate (one sentence) | Migration | Status | Folder |
|---|---|---|---|---|---|
| 1 | Desk documents | A report photographed at the desk shows up in the doctor's Objective → Reports strip, grouped as "From front desk", with type and report date, on the right visit | 1 (`233`) | **In progress** | — |
| 2 | Desk history → chart | Allergies, medicines and conditions typed at the desk land in the real chart sections and the ribbon; NKDA sets the existing flag; why-today is not asked at the desk | 1 (`234`) | **Revised 2026-09-12** (write-through + chip UI) | — |
| 3 | Check-in as one sequence | Vitals, history and documents capture rates rise, with no regression to the 30-second new-patient path | None | **Implemented 2026-09-12** (list flags light V/H/D; skippable sequence already shipped with P1/P2) | — |
| 4 | Internal lab order→result loop | A login holding only `internal_labs` can see which tests the doctor ordered, find every visit still waiting on a result without knowing its date, and close the loop by uploading the report | `238` | **In progress** 2026-09-13 (lab-only upload is a dialog on `/desk/today`; each attested test is uploaded or not-done with a reason) | — |

**Sequencing rationale.** P1 before P2 deliberately: documents are a new table, a storage path and one cockpit read — self-contained, no safety surface, no consent question. P2 drags in the sidecar, the accept UI, the safety-warning change and the collection notice. Shipping P1 first proves the desk-writes-to-visit pattern before the harder feature bets on it. P3 is a flow change over both and is worthless before they exist.

**Plan rules.** When all Phase 1 R-items have a `Decision:` ticked (DVP-Q3 in particular), this plan promotes to a dated batch under `docs/Work/Daily-plans/<Month YYYY>/<DD-MM-YYYY>/desk-visit-prep/p1-documents/plan-p1-desk-visit-prep-documents-batch.md` and becomes `Committed`. **Later phases promote as sibling subfolders under the same `desk-visit-prep/` folder** (the one created on the start date), not under the later day's date. See [`PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md).

---

## What the desk captures

### Per document (P1)

| Field | Values | Why the desk and not the doctor |
|---|---|---|
| Document type | Lab report · Imaging · Discharge summary · Old prescription · Referral letter · Other | Undifferentiated pixels just move the sorting work into the consult. "Old prescription" is its own type because medication reconciliation depends on it. |
| Report date | The date on the paper, not today | The doctor orders by recency; today's upload date is the wrong axis. |
| Ordered by | Us · Outside | Decides whether it answers a test the doctor ordered last visit. |

Capture UX must add what the cockpit strip lacks: `capture="environment"`, a multi-shot loop that stays open between pages, client-side downscale (DVP-Q4), and page reorder. Keep the 24-file ceiling.

### Per visit (P2)

Four questions, per HL-DL-2 — **the field→column map in [`plan-history-link.md`](./plan-history-link.md) governs and is not restated here.** Desk-specific deltas only:

- Asked aloud by the receptionist and typed, rather than self-served. Allergies, current medicines, known conditions. `source = 'front_desk'`.
- **Why today is not asked at the desk** (public counter / privacy). Booking already stamps `appointments.reason_for_visit` (`"Walk-in"` / `"Front desk booking"`). Desk upsert does not seed `prescriptions.cc`.
- **Current medicines** may be answered by pointing at a strip or an old prescription — that becomes a P1 document of type "old prescription", linked to the submission rather than transcribed.
- Desk capture uses the same catalog chips as the cockpit (common allergens, PMH ICD shortcuts, a static OPD medicine list). It does not mount the full SOAP editors.

---

## Acceptance gate (program)

- [ ] A desk upload lands in `{doctor_id}/desk/{appointment_id}/…` and is readable in the cockpit on that visit only, via a signed URL gated by acting-doctor ownership.
- [ ] `prescription_attachments.prescription_id` is still `NOT NULL`; no existing attachment surface changed behaviour.
- [ ] Desk history writes the sidecar **and** the mapped chart tables on save. Allergy "none" sets `no_known_allergies` when the chart has no named allergies; medicine/condition "none" creates no row. Case-insensitive duplicates are skipped, never duplicated.
- [ ] Desk does not seed `prescriptions.cc`. Why-today is optional and omitted from the desk UI.
- [ ] Cockpit Subjective has no accept-card stack. Allergies and PMH show the desk-written chart rows. The ribbon can mention "From desk".
- [ ] Doctors with no desk staff see byte-identical behaviour everywhere (receptionist-portal principle 1).
- [ ] Desk cannot reach any clinical route it cannot reach today; route-level enforcement, not hidden UI (principle 6).
- [ ] Logs carry appointment id, document counts and types only — no filenames with patient names, no answers, no PHI.
- [ ] Skipping every new step leaves the new-patient path at ~30 seconds (principle 7).
- [ ] Typecheck + lint + new suites green; affected canonical docs synchronized.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Desk-typed allergy silently never reaches the safety check | **H** | Write-through to `patient_allergies` — same clash banner as doctor-entered rows |
| Receptionist input becomes doctor-asserted chart data | **H** | Accepted: same as desk vitals. Doctor archives or edits to reject. |
| Nullable-FK refactor on `prescription_attachments` spreads across five surfaces | **H** | DVP-DL-1 — sibling table, read-side union |
| Health data collected at the desk with no notice | **H** | DVP-DL-9 — versioned notice + snapshot; counsel wording before ship |
| `lab_reports_json` shape change breaks saved reports | **M** | DVP-Q3 closed before P1 promote; one-way migration with a validator update |
| Two sidecars, one from each parent program | **M** | Hand-off line recorded in `plan-history-link.md` at promote |
| Desk steps slow the queue and staff revert to paper | **M** | DVP-DL-7 — every step skippable; principle 7 is an acceptance criterion |
| Wrong patient's report uploaded | **M** | DVP-Q7 — desk delete until the visit is opened; upload is appointment-bound, not patient-bound |
| Scope creep into a clinic-management product | **M** | DVP-DL-8 — clinical documents only; no identity scan. DVP-DL-5 now allows extract+confirm of lab values, not diagnosis |

---

## Explicitly out of scope

| Idea | Why not |
|---|---|
| Patient face photo, Aadhaar/ID scan, insurance card | DVP-DL-8. DPDP surface, no clinical payoff. The receptionist-portal row stands for these. |
| Desk inventing an impression or diagnosis | Clinical judgment. Extract+confirm is values only. |
| Auto-extract on desk upload | DVP-Q5. Staff must press Extract. |
| Family / social / surgical history at the desk | Visit-scoped JSONB on `prescriptions` with structured catalogs and scored instruments (CAGE, AUDIT-C). No row exists before the note. Doctor-driven. |
| Diagnosis or ICD coding at the desk | Clinical judgment. |
| Desk-side duplicate merge | Doctor-only today, correctly. Unchanged. |
| Pregnancy / breastfeeding status | DVP-Q6 — no target column exists. Decide separately, do not invent one here. |
| Insurance / TPA / scheme fields | No table at all; a real build, not a form field. Receptionist-portal already excludes it. |

---

## Residuals (not this program)

- Collection-notice wording — `⟨fill — counsel⟩`, blocks P2 ship. Notice version slot exists (`notice_version` nullable); no DRAFT copy shipped.
- Apply `236` after `235` for desk-confirmed lab rows (`visit_documents.extracted_results`). Apply `237` after `236` so existing `previsit` rows become the four prep seats.
- Deleting every desk-confirmed panel and saving the Rx may re-hydrate those rows on the next open (no dismiss flag).
- **Parked 2026-09-12.** Separate staff UI opening prep from a Today row. Prep-only logins now use Check-in search (register/pay/book hidden). Inbox: 2026-09-12 desk parked item.
- Pending-report chase (DVP-Q8) is Phase 4 in progress — order projection + derived pending list, not a residual of P1–P3.
- Attendant present / interpreter / language preference at the desk.
- Demographics completeness nudges (DOB vs age, address) and referral source.
- Drug-class allergy mapping (penicillin → amoxicillin) — a pre-existing gap in `match-allergens.ts`.
- Patient-facing public history form — [`plan-history-link.md`](./plan-history-link.md) Phase 1, after this program's sidecar exists.

---

## Model routing

Per [`.cursor/rules/00-agent-contract.mdc`](../../../.cursor/rules/00-agent-contract.mdc), this program is on the hard-rules list on four counts: **two new migrations**, **PHI columns**, **RLS policies on a new table**, and **consent/collection-notice surface**. P2 additionally modifies the **prescribing safety gate**. Surface these for an Opus turn; do not let an Auto model write the migrations, the RLS block, or the `pre-send-warnings.ts` change. Tables mirror `patient_vitals` (`087`): doctor RLS `auth.uid() = doctor_id` as defence in depth, all desk writes through the service-role client per receptionist-portal **R6** — no RLS rewrite.

---

**Created:** 2026-09-12.
**Owner:** Founder (product).
**One-liner:** The desk photographs the paper and chips the history onto the chart; the doctor opens a visit that is already prepared.
