# Task rec-28: Doctor consult timeline on the patient profile

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 1 (Lane α) — **L, ~6h**

---

## Task overview

REC-D23: **the doctor's durable home for recordings is a consult timeline on the patient profile, not a standalone "Recordings" tab.** This task builds it — a backend aggregate endpoint plus a timeline surface in the existing patient-profile shell, linking to the `EndedCard` drill-down that already exists.

Get the premise right, because the wrong version of it is easy to write and will produce the wrong feature. **The doctor surface is not missing.** Opening any completed appointment renders the cockpit `ended` state (`CenterPane.tsx:76-82`), which mounts `EndedCard`, which mounts `ConsultArtifactsPanel` with the replay player (`EndedCard.tsx:122-127`). Recordings **are** reachable per appointment, and not only in the minutes after a call. What is missing is any **patient-level or cross-consult view**: the doctor must already know which appointment to open, which means the artifact is durable but not navigable.

The clinical mental model is *this patient*, not *this recording*. That is the whole reason REC-D23 rejects a "Recordings" tab: a surveillance-shaped list of recordings, sorted by recording, is a surface a doctor will not use. A visit history for one patient is a surface they already think in.

**Estimated time:** ~6h
**Status:** 🔧 Code shipped 2026-08-20 — founder visual smoke still open. Empty-index entry gate overridden (p1 historical count 0 / 14); empty states are what the timeline will show until the index is populated.
**Hard deps:** **[`p1`](../../p1-artifact-registry/) shipped and backfilled.** This endpoint reads `recording_artifact_index`; against an empty table it renders empty states and looks correct. Confirm a non-zero row count before starting.
**Source:** REC-D23, REC5-D2, REC5-D3.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Sonnet.**

Large but bounded. It is a read-only aggregate over tables whose shapes are already fixed, plus a pane in a shell that already has a pane contract. There is no destructive path, no external provider call, no policy judgement and no schema change. Size is not what earns Opus in this batch — irreversibility and unresolved judgement are, and this task has neither.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) (REC5-D2 and REC5-D3 especially) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D23 row.
- `frontend/app/dashboard/patients-v2/[id]/page.tsx` — **the whole file (81 lines).** It delegates to `PatientDetailHydrated` at **L72-80**; the timeline belongs inside that shell, not as a sibling route.
- `frontend/components/patients-v2/streaming/PatientDetailHydrated.tsx` — the pane contract you are extending.
- `frontend/components/patient-profile/panes/internal/CenterPane.tsx` — **L66-82.** This is the proof that `ended` / `wrap_up` already renders `EndedCard`. Read it before writing any "recordings are unreachable" copy.
- `frontend/components/consultation/cockpit/EndedCard.tsx` — **L18-130.** The drill-down target. `ConsultArtifactsPanel` mounts at **L122-127**. **You link to this; you do not restructure it.**
- `backend/migrations/056_recording_artifact_index.sql` — **the whole file (136 lines).** Column list **L48-90**; `artifact_kind` is free text by design (L22-24), `patient_self_serve_visible` and `hard_deleted_at` both matter to what the timeline should show.
- `backend/src/services/patient-overview-service.ts` — the closest sibling aggregate. Mirror its structure rather than inventing a new one.
- `backend/src/workers/recording-archival-worker.ts` — **L256-291** (`selectLiveArtifactRows`). The `hard_deleted_at IS NULL` filter and the `consultation_sessions!inner` join shape are the read pattern to follow.
- `backend/src/services/recording-track-service.ts` — **L761-820.** Read it to understand what you are deliberately **not** calling per row (REC5-D3).

**Estimated turns:** 6–8.

---

## Acceptance criteria

### 1. The aggregate endpoint

- [x] One endpoint returns a patient's consult history for the requesting doctor, ordered most-recent-first, with pagination or a sane bound — a long-tenured patient must not produce an unbounded response.
- [x] Each entry carries at minimum: consult date, modality, duration, and **which artifacts exist** — recording, transcript, prescription, snapshots.
- [x] **Artifact presence comes from `recording_artifact_index`, and the endpoint makes zero Twilio calls** (REC5-D3). A timeline that calls `listCompositionsForRoom` once per row is N provider round-trips on a page load and will not survive a patient with twenty consults.
- [x] Rows with `hard_deleted_at` set are handled deliberately: decide whether a deleted artifact reads as absent or as "was recorded, since deleted under retention policy", and **write the choice and its reason into this file.** The second is more honest to a clinician and cheap to render; either is acceptable if it is a decision rather than an accident.
- [x] `patient_self_serve_visible` is **not** a doctor-side filter. It gates patient access only, and doctor access runs the full retention period (REC-D25). Confusing the two would hide a doctor's own records at day 91.
- [x] The endpoint is authorised to the requesting doctor and their own patients. A doctor must not be able to read another doctor's consult history by patient ID.
- [x] The controller **orchestrates only** — validate → service → respond. **No DB access in the controller.** Input validated with **Zod**. `asyncHandler`, no try/catch. Typed `AppError` subclasses only. `process.env` never read directly.
- [x] Response follows the canonical contract helpers used by sibling read endpoints. No bespoke envelope.

### 2. The timeline surface

- [x] The timeline lives **inside the existing patient-profile shell** reached from `patients-v2/[id]`, as a pane. **No new top-level route, and no "Recordings" tab anywhere** (REC-D23).
- [x] Each entry shows date, modality, duration, and the artifact set **together** — a doctor scanning the list should see at a glance which consults have a recording and which have a transcript, without opening anything.
- [x] Clicking an entry navigates to the existing appointment detail, which renders the cockpit `ended` state and therefore `EndedCard` → `ConsultArtifactsPanel` → the player. **The drill-down is reused, not rebuilt.**
- [x] A patient with no consults, and a patient with consults but no artifacts, both render honest empty states — not an error, and not a spinner that never resolves.
- [x] Loading and error states match the shell's existing conventions (see `PatientDetailSkeleton` and the error block at `patients-v2/[id]/page.tsx:46-68`).
- [x] No doctor-facing delete, hide or "remove recording" affordance anywhere on this surface. **REC-D5 is permanent** — a doctor can never delete a recording, and this is the surface where someone would most plausibly try to add one.
- [x] The surface is read-only. It triggers no replay mint on render — a mint writes an audit row and fires a patient notification, so a timeline that pre-warms URLs would notify the patient of a replay that never happened.

### 3. Performance and shape

- [x] The endpoint issues a bounded number of queries regardless of consult count — no N+1 across sessions, artifacts, prescriptions or snapshots.
- [x] There is a test asserting **zero Twilio calls**, ideally by configuring the Twilio seam to throw and confirming the endpoint still succeeds.
- [x] Payload size is bounded. Do not return signed URLs, composition SIDs the client has no use for, or full artifact rows where a presence flag suffices.

### 4. Observability

- [x] **No PHI in any log line.** Patient IDs, session IDs, doctor IDs, artifact kinds and counts are fine. Patient names, phone numbers and dates of birth are not — and note that the response body legitimately carries clinical context, so the temptation to log it for debugging is real. Don't.
- [x] Every log line carries the correlation ID.

### Out of scope

- **Restructuring `EndedCard.tsx` or `ConsultArtifactsPanel.tsx`** (REC5-D2). Link to them; leave them alone.
- **The replay player's multi-composition handling** — that is [`rec-29`](./task-rec-29-multi-composition-replay-player.md).
- **Any patient-facing surface.** [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md) owns the patient's durable home. No patient route, no patient token, no `/my-health` work here.
- Replay notification behaviour — [`rec-30`](./task-rec-30-symmetric-replay-notification.md).
- Retention, deletion, erasure — [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md), [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md).
- The 90-day patient window and the video OTP gate (REC-D25).
- Backfilling or writing registry rows (p1). Consent (p2), pause (p3), escalation (p4).
- Any AI summarisation of the timeline. Not in this program.

---

## Scope Guard

- **Expected files touched: 6–8.** One backend service, one controller, one route registration, one new frontend timeline component, one pane registration in the profile shell, one frontend API helper, plus tests.
- **DO NOT** modify `EndedCard.tsx`, `ConsultArtifactsPanel.tsx`, `RecordingReplayPlayer.tsx`, or `CenterPane.tsx`. Read them; they are the drill-down and they already work.
- **DO NOT** modify `recording-track-service.ts` or `twilio-compositions.ts`. This task calls neither.
- **DO NOT** modify `recording-access-service.ts`. The timeline does not mint.
- **DO NOT** add a patient-facing route, a patient token path, or anything under `frontend/app/my-health/` or `frontend/app/c/`.
- **DO NOT** add a doctor-facing delete or hide control. REC-D5.
- **DO NOT** write a migration. `recording_artifact_index` (056) has everything this reads. **STOP and surface** if you conclude otherwise.
- **DO NOT** change `patient_self_serve_visible` semantics or the 90-day arithmetic.

---

## Global safety gate

- **Data touched?** Read-only. No writes anywhere. RLS unchanged — the endpoint reads through the service-role path with an explicit doctor-ownership check in the service, matching sibling read endpoints.
- **Any PHI in logs?** **No.** IDs, kinds and counts only. The response body carries clinical context; logs do not.
- **External API call?** **No.** That is a hard criterion, not an incidental — see REC5-D3 and criterion 3.
- **Retention / deletion impact?** None. This task reads `hard_deleted_at` and `patient_self_serve_visible`; it writes neither and changes no policy.

---

## Done when

- A doctor opens a patient profile and sees that patient's consults in one place, with date, modality, duration and artifact presence together; clicking through lands on the existing `EndedCard` drill-down; the endpoint makes zero Twilio calls (proven by a test); empty and error states are honest; no patient-facing route and no doctor-facing delete affordance exists; the `hard_deleted_at` display decision is written into this file; no migration; frontend and backend typecheck, lint and tests green; no PHI in logs.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D23, REC-D25, REC-D5
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Blocking dependency: [`p1 — artifact registry`](../../p1-artifact-registry/plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Sibling in this wave: [`rec-29`](./task-rec-29-multi-composition-replay-player.md)
- Consumer of this shape: [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md) — see [`rec-34`](./task-rec-34-program-close-gate.md)'s hand-off note

---

**Last Updated:** 2026-08-20.

---

## Notes (2026-08-20)

### `hard_deleted_at` display decision

A composition with `hard_deleted_at` set is **not** treated as absent. The aggregate returns `recordingDeleted: true` (and `hasRecording: false` unless a live composition still exists on the same session). The pane renders **“Recording deleted (retention)”**.

Reason: a clinician who remembers recording that consult should see that the record existed and was later removed under retention, not a silent gap that looks like “never recorded.” `patient_self_serve_visible` is not selected and is not a doctor-side filter (REC-D25).

### Placement

Mounted as a full-width card on **Overview** (`OverviewTab`), not a new “Recordings” tab (REC-D23) and not a rewrite of `VisitsTab`. Drill-down is `buildCockpitAppointmentPath(..., "patients-v2", { patientId })` → existing `EndedCard`.

### Entry gate

p1 index is still historically empty (0 / 14). Empty states are what this surface will show until backfill. No migration and no backfill from this task.

### Founder smoke still open

Open a patient with ended consults and confirm the Consults card, empty/no-artifact copy, and click-through to `EndedCard`. Do not mark p5 or the program Closed.
