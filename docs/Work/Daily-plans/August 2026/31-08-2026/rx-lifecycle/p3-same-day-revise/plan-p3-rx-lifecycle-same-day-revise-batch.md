# Plan p3 — Rx lifecycle: same-day revise

## 9 Sep 2026 — Batch `rx-lifecycle` / `p3-same-day-revise` (`rxl-19..29`)

> **Status:** **IMPLEMENTED** 2026-09-10 — residuals recorded; not Shipped. Replaces [`../p3-revise-window/`](../p3-revise-window/) (`rxl-11`…`18`).
> **Source thread:** 9 Sep 2026 — founder: one paper slip per OPD visit-day; continue the same draft after labs; after Finish, same-day correction is a timestamped replacement copy, not a 15-minute in-place edit. Capture: [`../../../capture/notes/2026-09-08-rx-edit-return-last-visit.md`](../../../capture/notes/2026-09-08-rx-edit-return-last-visit.md).
> **Product plan:** [`plan-rx-lifecycle.md`](../../../../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…16)
> **Program:** [`../README.md`](../README.md) · Prefix `rxl`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./Tasks/EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
> **Not this program:** field-level value audit, amendment approval / co-sign, queue / token / `visit_payments`, letterhead design.

---

## The OPD slip (the primitive)

One physical slip per visit-day. The doctor keeps writing on it until the day is done.

| When | What happens |
|---|---|
| Patient at 10:00, doctor orders RBS / chest X-ray | Print or send the order. Note stays a **draft**. Nothing attests. |
| Patient returns at 11:30 with the report | Same draft, same appointment. Add diagnosis / medicines. Finish **once**. |
| Same day, after Finish — pharmacist can't fill, or a dose typo | Reopen. Form is fully editable. Re-issue creates **Version 2** as a new row that supersedes Version 1. Footer + filename say which copy is current. |
| A later calendar day | Past-visit: greyed reference + repeat (`lvc`). Not an editable form. |
| Front desk checks the patient in again the same day | Genuine second visit — own token, own fee (RXL-DL-15). |

Three cases that must not collapse into one mechanism:

| Case | Mechanism |
|---|---|
| Labs-and-return (not finished) | Same draft. Print/send do not attest. |
| Genuine correction after Finish, same day | New row that supersedes. Timestamp + reason preset. |
| Altering a past day's record | Refused server-side. Past-visit only. |

---

## Why this is cheaper than the plan it replaces

The old Phase 3 (`rxl-11`…`18`) mutated the attested row in place, so it needed a snapshot PHI table, a 15-minute server window, countdown UI, and per-revision PDF retention. Modelling a revision as a **new row** makes three expensive things fall out:

1. **No snapshot table.** The previous row *is* the snapshot. `rxl-11` / `rxl-12` (Opus, new PHI table + RLS) disappear.
2. **No PDF retention work.** Storage path is `<doctor_id>/<prescription_id>.pdf`. New row → new path. T3-D2's overwrite-on-regen only bites within one row. The `kind: 'frozen'` download path already exists; it re-keys from `sent_to_patient_at` onto issued.
3. **No structural migration for plural notes.** `prescriptions.appointment_id` has an index and no unique constraint.

Net: three or four nullable columns instead of a new table. The window went from 15 minutes to the clinic-local day, so RXL-DL-8 (window and tracing ship together) still binds, and binds harder.

Content lives on the parent `prescriptions` row plus `prescription_medicines` and `prescription_attachments` (migration `026`). Clone-on-reissue is a parent-row copy plus a medicine insert-many.

---

## What changed in the decision lock

| Existing | Fate |
|---|---|
| **RXL-Q1** — attest on first of finish / send / print | **Reversed 2026-09-09.** Only Finish attests. |
| **RXL-DL-7** — 15-minute fixed window | **Replaced** by RXL-DL-14 (clinic-local day). |
| **RXL-DL-8** — window and tracing ship together | **Survives, binds harder.** |
| **RXL-DL-9** — revision advances on finalize | **Survives.** New row is created at issue time, so autosave cannot bump it. |
| **RXL-DL-10** — retain issued bytes, reverse T3-D2 | **Simplified.** Retention is free (new id). T3-D2 stays. |
| **RXL-DL-11** — slip marker is system text | **Survives.** Copy rewritten for a pharmacist + filename versioning. |
| **RXL-DL-12** — corrections supersede | **Survives, load-bearing.** |
| **RXL-DL-1/2/3** | **Unchanged** (DL-3 restated: no new *appointment*). |
| **RXL-DL-6** — carry subjective, not objective | **Narrowed** to cross-day only. Same-day is the same note. |

New locks (on the product plan): **RXL-DL-13** revision is a new row · **RXL-DL-14** clinic-local day · **RXL-DL-15** who reopens decides · **RXL-DL-16** requisition print is not a prescription.

---

## Cockpit behaviour

| When | Behaviour |
|---|---|
| Same day, not yet finished | Fully editable, no banner. |
| Same day, finished, doctor reopens | Fully editable, plus a strip: "Issued 10:15 AM. Changes will create Version 2." |
| Same day, viewing a superseded version | Read-only, marked superseded, reprintable. |
| Any later day | Past-visit: greyed reference + repeat (`lvc`). |

The version bumps on **re-issue**, never on autosave. Edits after Finish accumulate against the working row; the version advances when the document leaves again (Send / Print / Finish of the revision).

**Slip footer (pharmacist, not engineer-speak):**

> Revised 6:40 PM, 9 Sep 2026 — replaces the slip issued 10:15 AM. Version 2.

System text beside the short id (RXL-DL-11). Filename is `prescription-9sep2026-v2.pdf` (`rxl-27`). Storage key stays `${doctorId}/${prescriptionId}.pdf`.

**Reason on revise:** one-tap presets — dose correction · drug unavailable · clarified for pharmacy · added missed item · other (RXL-Q8).

---

## Phases

| Phase | Theme | Tasks | Gate | Migration? |
|---|---|---|---|---|
| **A** | Unblock the OPD flow | `rxl-19`, `rxl-20` | Labs print does not lock; reopen of a completed visit is an editable continuation | No |
| **B** | Same-day revise | `rxl-21`…`rxl-25` | Re-issuing after Finish creates immutable Version 2 linked to Version 1; a previous day's note refuses writes | Yes |
| **C** | Identify the current copy | `rxl-26`…`rxl-28` | Reprint says it replaces the earlier slip; filename carries the version; history shows both | No |
| **D** | Gate | `rxl-29` | Suites, docs, program close | — |

Phase A ships the lab-return scenario alone. It does not wait on `rxl-10`.

### Phase A — unblock

| ID | Title | Size | Model | Status |
|----|-------|------|-------|--------|
| [`rxl-19`](./Tasks/task-rxl-19-unlock-same-day-continuation.md) | Stop visit-status from overriding the note lock | S–M | Sonnet | **Implemented** 2026-09-09 |
| [`rxl-20`](./Tasks/task-rxl-20-finish-only-attest.md) | Only Finish attests; print and send do not | M | Sonnet | **Implemented** 2026-09-09 |

`rxl-19`: nested `<RxLockProvider>` in `PrescriptionForm` dropped `noteClosed`; `SubjectivePane` and the read-only banner keyed off visit status. Inherit + read the note lock.

`rxl-20`: removed `attestPrescriptionIfUnset` from PDF GET handlers and from send in `notification-service`. Wrap-up still attests via `attestLatestPrescriptionForAppointment`. Preview CTA split ("Send & finish" → three first-class actions) is **not** in A — print-without-finish already exists on the preview pane.

Residual after A: legacy `InvestigationsPane` / `AssessmentStrip` / `InvestigationsAutoMerge` still key off `canEditPrescriptionDraft(visit)`. v3 SOAP columns do not.

### Phase B — same-day revise

| ID | Title | Size | Model | Status |
|----|-------|------|-------|--------|
| [`rxl-21`](./Tasks/task-rxl-21-revision-columns-migration.md) | Migration: `version`, `supersedes_id`, `superseded_by_id`, `revision_reason`, `issued_at`, `printed_at` | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 — `231` applied on dev |
| [`rxl-22`](./Tasks/task-rxl-22-clone-on-reissue.md) | Clone parent + medicines + attachment rows, link, bump, mark superseded | L | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |
| [`rxl-23`](./Tasks/task-rxl-23-same-day-write-guard.md) | Writable iff not superseded AND (not yet issued OR issued today) | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |
| [`rxl-24`](./Tasks/task-rxl-24-load-todays-issued-note.md) | Adopt today's note even when issued; later day / superseded = review | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |
| [`rxl-25`](./Tasks/task-rxl-25-revise-strip-and-reason.md) | Cockpit revise strip + reason presets on re-issue | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |

`rxl-23` replaces the condition in `assertPrescriptionContentWritable`. `attested_at` changes meaning — from "locked forever" to "finished, still revisable today" — audit every reader (`doctor-medicine-combo-service`, `rxLoadDecision`).

`rxl-24` partly reverses `rxl-07`: `continue` on any attested note is wrong for today's note. Same-day issued → `adopt`. Later clinic day / superseded / cancelled → `review` (read-only). `continue` remains only when no clinic clock is passed.

### Phase C — identify the current copy

| ID | Title | Size | Model | Status |
|----|-------|------|-------|--------|
| [`rxl-26`](./Tasks/task-rxl-26-slip-replaces-marker.md) | Slip footer: replaces-line + Version N | S | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |
| [`rxl-27`](./Tasks/task-rxl-27-versioned-pdf-filename.md) | Versioned PDF filename on print and send | S | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |
| [`rxl-28`](./Tasks/task-rxl-28-history-versions.md) | History: versions per visit, superseded marked, reprintable | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |

`rxl-28` depended on `rxl-09` (visit history per note). Both implemented 2026-09-10.

### Phase D — gate

| ID | Title | Size | Model | Status |
|----|-------|------|-------|--------|
| [`rxl-29`](./Tasks/task-rxl-29-phase-3-gate.md) | Suites + docs + close | M | Grok 4.6 (owner override) | **Implemented** 2026-09-10 |

---

## Phase 2 tasks that need re-scoping (do not drop)

- `rxl-08` (carry from a sibling) shrinks — resolve to the current non-superseded version of the last visit.
- `rxl-09` (history per note) survives and gets more important; it is where superseded versions are read.
- `rxl-10` (Phase 2 gate) survives, but no longer blocks Phase A.

---

## Acceptance gate (whole Phase 3)

- [x] RXL-Q7…Q10 recorded. Q7 **locked** (06:00 clinic day). Q8 presets shipped. Q6 prompt shipped (reprint half weak — `printed_at` unset). Q9 share-link out of program. Q10 share-`file_path` + erasure residual.
- [x] Print of a requisition neither attests nor finishes; the note stays editable (`rxl-20`).
- [x] Reopening a completed visit whose newest note is closed is an editable continuation (`rxl-19` + `rxl-24` adopt).
- [x] Patient returns two hours later; doctor opens the same draft, adds medicines, presses Finish once. One document, one attest. (Print/send do not attest.)
- [x] Reopening a finished note the same day is editable on v3 SOAP surfaces (`noteClosed: false`). Legacy panes still visit-gated — residual.
- [x] Re-issuing after Finish creates a new row at Version 2, links it to Version 1, marks Version 1 superseded. Version 1's row and PDF bytes remain retrievable.
- [x] Typing continuously for two minutes after Finish produces Version 2 on re-issue, not Version 47.
- [x] A note issued yesterday refuses writes **server-side**, with a client whose clock says today.
- [x] The Version 2 reprint carries the replaces-line in the footer, surviving a custom letterhead footer and `hideHaloCredit`.
- [x] Two sends produce two distinguishable file names.
- [ ] Opening a previous day's patient shows past-visit reference + repeat (`lvc`), not an editable form. **Not this program.** Server refuses writes; load is `review`. The strip is `lvc`.
- [ ] Front-desk re-check-in still produces a genuine second visit with its own token and fee. **Unchanged; not re-proven this sitting.**
- [ ] No PHI in logs or audit metadata. Typecheck + lint + suites green. **Targeted suites green. Repo-wide tsc/lint still pre-existing dirty — not Shipped.**

---

## Risks (phase)

| Risk | Severity | Mitigation |
|---|---|---|
| Doctor prints, never finishes; note stays a draft | **M** | `incomplete` does **not** fire for in-clinic walk-ins (no `consultation_sessions` row). Residual — do not pretend the KPI covers this. `printed_at` records the hand-over without locking. |
| Cloning misses a JSON column or medicine structured field | **H** | Inventory below; assert payload identical except revision fields |
| Two versions share one attachment `file_path`; erasure orphans the other | **M** | RXL-Q10 — flag the erasure/retention worker |
| 06:00 clinic-day vs desk midnight-to-midnight | **M** | RXL-Q7 recon below. Do not reuse `localDayUtcRange` as-is if 06:00 stays. |
| `attested_at` **and** `appointment.status = completed` both refuse writes | **H** | `rxl-23` must relax both for same-day, not-superseded rows. Cancelled / no_show stay locked. |
| Window is now ~14h instead of 15min | **M** | Accepted; RXL-DL-13 is what makes it safe |

---

## Recon — 2026-09-10 (Phase B unblocked on facts, not on Auto)

`rxl-21` / `rxl-22` / `rxl-23` were executed on Grok 4.6 at owner override. This sitting answered the four questions before those tasks landed.

### 1. Timezone (RXL-Q7)

**Source exists.** `doctor_settings.timezone` (IANA). Accessor: `getDoctorTimezone(doctorId)` in `doctor-settings-service.ts` → `settings?.timezone ?? 'Asia/Kolkata'`. Editable on Practice setup (`PracticeInfoClient`). Desk "today" already uses this (`clinic-staff-controller`, `useDeskTodayQuery`).

**Day helper exists, wrong shape for 06:00.** `sessionDateFromAppointmentDate` + `localDayUtcRange` in `opd-queue-service.ts` are **midnight-to-midnight** in the doctor TZ (`DateTime.startOf('day')`). There is no 06:00 clinic-day anywhere.

If Q7 stays "06:00 next morning", `rxl-23` writes a new helper. Reusing `localDayUtcRange` would lock an 11:30 PM Friday note at midnight, which is the case Q7 was meant to save. Trade-off: desk "today" at 1:00 AM Saturday is already Saturday's queue. Record that mismatch; do not silently pick midnight to stay consistent with desk.

### 2. Clone inventory (`rxl-22`)

**Child tables with `prescriptions(id)` FK:** only `prescription_medicines` and `prescription_attachments`. No third table. PDF bytes are storage (`${doctorId}/${prescriptionId}.pdf`), not a row. Attachment "objective / subjective / advice" is a **path segment** (`objective/`), not a column — copying `file_path` keeps the tag.

**Do not copy (identity):** `id`, `created_at`, `updated_at`.

**Copy same visit:** `appointment_id`, `patient_id`, `doctor_id`, `episode_id`, `type`.

**Set, do not blind-copy (revision / delivery):** `version`, `supersedes_id`, `superseded_by_id`, `revision_reason`, `issued_at`, `printed_at`, `attested_at`, `sent_to_patient_at`.

**Copy all clinical payload on the parent** (as of types 2026-09-10):

| Group | Columns |
|---|---|
| Subjective | `cc`, `hopi`, `complaints`, `family_history`, `family_history_structured`, `social_history`, `social_history_structured`, `past_surgical_history`, `past_surgical_history_structured`, `custom_subsections` |
| Assessment | `provisional_diagnosis`, `diagnoses_json`, `differential_diagnosis`, `assessment_note`, `assessment_acuity`, `assessment_custom_sections` |
| Objective | `vitals_bp_systolic`, `vitals_bp_diastolic`, `vitals_hr`, `vitals_temp_c`, `vitals_spo2`, `vitals_wt_kg`, `vitals_ht_cm`, `vitals_rr`, `vitals_pain_score`, `vitals_glucose_mg_dl`, `vitals_gcs_total`, `vitals_bp_posture`, `vitals_bp_limb`, `vitals_head_circumference_cm`, `vitals_muac_cm`, `vitals_waist_cm`, `vitals_json`, `examination_findings`, `examination_json`, `test_results`, `test_results_json`, `lab_reports_json` |
| Plan | `investigations_orders`, `investigations_orders_json`, `follow_up`, `follow_up_value`, `follow_up_unit`, `advice`, `referral`, `patient_education`, `clinical_notes`, `plan_custom_sections` |

**`prescription_medicines` copy:** `medicine_name`, `dosage`, `route`, `frequency`, `duration`, `instructions`, `sort_order`, `drug_master_id`, `frequency_code`, `duration_value`, `duration_unit`, `route_code`, `dose_qty`, `dose_unit`, `form`, `food_timing`. New `id` / `prescription_id` / `created_at`. CHECKs widened in `229` (QOD, ophthalmic, otic) — copy values through; do not re-validate against the old 090 list.

**`prescription_attachments` copy:** `file_path`, `file_type`, `caption`. New `id` / `prescription_id` / `uploaded_at`. Share storage object (RXL-Q10).

Migration head as of this recon: **`230`**. Next number is **`231`** if still unclaimed at write time. `226` still says "no revision columns — those are rxl-11"; that comment is stale.

### 3. `attested_at` readers

| Reader | Treats stamp as | `rxl-23` / `rxl-24` |
|---|---|---|
| `assertPrescriptionContentWritable` | **Hard lock** — any non-null stamp refuses | **Must change.** Sentence: not superseded AND (not issued OR issued today). |
| Same function, second gate | Appointment `completed` / `cancelled` / `no_show` → `appointment_locked` even when stamp is null | **Must change for `completed`.** Finish already completes the visit. Same-day revise of the adopted row will hit this even after the stamp is relaxed. `cancelled` / `no_show` stay locked. |
| `isClosedNote` / `resolveRxLoadDecision` | Stamp (or locked appointment) → `continue` (fresh form) | **Done (`rxl-24`).** Adopt today's issued note. Later day / superseded → `review`. |
| `doctor-medicine-combo-service` | Stamp = "this was a real issued Rx" for habit ranking | **Leave.** Not a write lock. Later may key off `issued_at` once it exists; do not treat "still editable today" as "not a combo." |
| `attestPrescriptionIfUnset` | Writes the stamp; comment still says finish/send/print | Comment-only stale (Q1 already reversed). Not a reader-as-lock. |

Phase 3-A leftover (not lock readers): legacy `InvestigationsPane`, `AssessmentStrip`, `InvestigationsAutoMerge`, `templates.tsx` still use `canEditPrescriptionDraft(visit)`.

### 4. Incomplete lifecycle on walk-ins

**Does not fire.** `deriveLifecycle` → `incomplete` only when a `consultation_sessions` row has started. In-clinic start is `postAppointmentCheckIn` only — no session (`consultation_modality` is text/voice/video). Documented in `vna-02` and task-36. Print-then-leave walk-ins stay `scheduled` (maybe `late` on timing). The batch risk that named this KPI as mitigation is **wrong** for the primary OPD path.

---

**Created:** 2026-09-09.
**Last Updated:** 2026-09-10 (`rxl-19`…`29` implemented; residuals on the gate).
