# Task vna-03: In-room audio capture + upload + retention registration

> **Filename:** `task-vna-03-in-room-audio-capture.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — needs `vna-01` + `vna-02` green.** §0 is expected to STOP.
> 🔴 **This is the only task in the program that creates new PHI.** Nothing here is a follow-up ticket.

---

## 📋 Task Overview

Put a microphone in a consulting room, once, deliberately, with a consented patient, and land the audio somewhere the platform's existing retention and erasure machinery already governs.

Two invariants define the task, and both are about what must be **impossible** rather than what must work:

1. The mic cannot be live without a consent record and an explicit human action (VNA-D2).
2. Audio captured for one appointment cannot reach another patient's chart (VNA-D3). A mic left running between two patients in the same room is the most plausible route to a cross-patient PHI leak this product has.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~8 hours
**Status:** ⛔ **BLOCKED — not started**
**Completed:** —

**Change Type:**
- [x] **New feature** — new capture surface, new bucket, new upload path
- [ ] **Update existing**

**Current State:** (checked against the codebase, 2026-08-31)
- ❌ **`MediaRecorder` appears nowhere in this repo.** Browser-side recording is entirely new. Do not assume a helper exists.
- ✅ **What exists:** `getUserMedia` in five places, all **device checks and meters**, never recording — `frontend/lib/audio/mic-meter.ts`, `frontend/lib/consultation/voice-lobby-precall.ts`, `VoiceConsultPreCall.tsx`, `VideoConsultPreCall.tsx`, `frontend/hooks/useCameraDevices.ts`. Read `mic-meter.ts` for the house conventions on acquiring, releasing, and cleaning up a stream — the leak-on-unmount bugs are already solved there.
- ✅ **What exists — the upload pattern:** the backend mints a **signed upload URL** and the client uploads straight to storage. Three precedents: `prescription-attachment-service.ts`, `doctor-verification-service.ts`, `letterhead-service.ts` (all `createSignedUploadUrl`). `consultation-controller.ts` carries a comment explaining multipart was deliberately avoided — *"No new dependency. Multipart parsing requires `multer`"*. **Follow the signed-URL pattern. Do not add `multer`.**
- ✅ **What exists — the bucket pattern:** `068_consultation_transcripts_bucket.sql`, `184_doctor_verification_docs_bucket.sql`, `212_clinic_branding_bucket.sql` — `INSERT INTO storage.buckets (id, name, public) … ON CONFLICT DO NOTHING`, `public = false`, size/MIME limits documented in-file and applied via the dashboard for portability, reverse documented in-file.
- ✅ **What exists:** `recording_artifact_index` (`056`) with the URI convention `'<bucket>/<path>'` — e.g. `recordings/patient_<uuid>/sess_<uuid>/audio.mp4` — split on the first slash by `storage-service.ts`. **This is the registration target (VNA-D4).** Existing kinds: `audio_composition`, `video_composition`, `transcript`, `chat_export`.
- ✅ **What exists:** the arming predicate from `vna-01` and the walk-in session row from `vna-02`.
- ✅ **What exists — the host surface:** the in-clinic visit already has a start (`PatientProfilePage.handleStartConsult` → `postAppointmentCheckIn`) and an end (`wrapUpAppointment`). **Those are the arm/disarm hooks and two of the three hard stops (§3), not new UI to invent.**
- ❌ **What's missing:** everything else — capture surface, bucket, upload route, registration call, hard-stop behaviour.
- 🔴 **Notes — `registerFinalisedComposition` is the wrong entry point.** It is **composition-specific**: it is called from the Twilio composition-status webhook and writes a `twilio-composition:<CompositionSid>` storage URI (not the `<bucket>/<path>` form), and it rejects `artifact_kind='transcript'` (rec-28). Room audio is a Supabase storage object with no composition SID, so it needs **a new `artifact_kind` and its own writer** on `recording-artifact-service.ts`, reusing that module's conventions rather than that function. Establish this at §0.3 — it is the task's real feasibility question.
- ⚠️ **Notes:** transcription enqueue today is **voice-`endSession`-only** (`voice-session-twilio.ts`); the video adapter records audio but never enqueues. So the enqueue call site is per-adapter, and room audio needs its own — `vna-04` owns it, but the hand-off point is decided here.
- ⚠️ **Notes:** `frontend/lib/text/use-speech-recognition.ts` exists for the doctor's own dictation, called today from `VisitDescribeBar.tsx` (the Phase-1 box) and `TextConsultRoom.tsx`. Both are legitimate. **The point is that the capture module must not reach it** (VNA-D7) — and note `VisitDescribeBar` lives in the same Rx page tree, so the assertion is on the capture module's import graph, not on the page.

**Scope Guard:**
- Expected files touched: ≤ 10.
- **No ALTER of `recording_artifact_index`, `archival_history`, `consultation_sessions`, or `consultation_transcripts`.**
- No new retention table, no new deletion worker, no new archival path (VNA-D4). If registration cannot be made to work, **STOP** — do not ship capture with retention as a follow-up.
- No `multer`, no multipart parsing, no new upload dependency.
- No transcription in this task (`vna-04`). No AI (VNA-D5). No streaming STT (VNA-D6).
- No change to the Twilio recording path, `use-speech-recognition.ts`, or Phase 1 / 2 behaviour.
- Any expansion requires explicit approval.

**Reference Documentation:**
- Batch locks VNA-D2, VNA-D3, VNA-D4, VNA-D6, VNA-D7
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-9, VN-DL-10
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [RLS_POLICIES.md](../../../../../../../Reference/engineering/compliance/RLS_POLICIES.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 `vna-01` gate green (consent basis + arming predicate exists)? If not → **STOP**.
- [ ] 0.2 `vna-02` gate green (a walk-in can hold a session row)? If not → **STOP**.
- [ ] 0.3 Establish, by reading `recording-artifact-service.ts`, **how a non-composition artifact gets registered** — a new `artifact_kind`, a new writer, and the `<bucket>/<path>` URI form. Confirm the archival worker and `recording-erasure-service` pick the new kind up **without modification**. If they cannot → **STOP and surface** (VNA-D4). This is the task's real feasibility question and it is answered before any UI is written.
- [ ] 0.4 Read `mic-meter.ts` for stream acquire/release conventions. Read the three `createSignedUploadUrl` services for the upload contract.

### 1. The bucket
- [ ] 1.1 New private bucket following `068` / `184` / `212`: `public = false`, `ON CONFLICT DO NOTHING`, size + MIME limits documented in-file, reverse documented in-file.
- [ ] 1.2 A **hard size limit** derived from the duration cap (§3.3) — not an arbitrary number, and stated as the arithmetic.
- [ ] 1.3 RLS / storage policies proven closed to `anon` and `authenticated`.
- [ ] 1.4 Path convention matching `056`'s URI convention so `storage-service.ts` routes deletes without a special case.

### 2. Capture (frontend)
- [ ] 2.1 Explicit arm action. **Disarmed on mount, every time.** No saved preference, no settings toggle, no auto-arm (VNA-D2).
- [ ] 2.2 Arming is refused client-side **and** server-side when the arming predicate is false. The client check is a courtesy; the server check is the control.
- [ ] 2.3 A non-dismissible live indicator for the entire capture. If it cannot render, capture stops.
- [ ] 2.4 Disarm is always available and takes effect immediately.
- [ ] 2.5 Stream cleanup on unmount, navigation, tab close, and permission revocation — follow `mic-meter.ts`, do not re-solve it.
- [ ] 2.6 **`use-speech-recognition.ts` is not imported, directly or transitively** (VNA-D7).

### 3. The three hard stops (VNA-D3)
- [ ] 3.1 Bound to one appointment id at arm time. The binding is captured once and never re-read from mutable UI state.
- [ ] 3.2 Navigating away from the visit hard-stops capture.
- [ ] 3.3 Visit end hard-stops capture. A duration cap hard-stops capture. **The cap is a constant, not a setting** — a clinic cannot raise it.
- [ ] 3.4 The server rejects an upload whose claimed appointment does not match the armed binding. **Audio armed under appointment A must be unattachable to appointment B — asserted by test, not by construction.**

### 4. Upload + registration
- [ ] 4.1 Signed upload URL minted server-side, scoped to the bound appointment / session, short expiry, single use where the API allows it.
- [ ] 4.2 Register the stored object in `recording_artifact_index` (VNA-D4) with the accepted `artifact_kind` from 0.3. **Unregistered audio is a bug, not a state.**
- [ ] 4.3 Failure paths leave nothing orphaned: a failed or abandoned upload leaves no unregistered object, and a registration failure does not leave audio in the bucket.
- [ ] 4.4 A declined or absent consent leaves **no object and no partial upload** — this is the test that matters most.

### 5. Verification & Testing
- [ ] 5.1 Disarmed-by-default test. Cannot-arm-without-consent test (client **and** route).
- [ ] 5.2 Three hard-stop tests: navigate-away, visit-end, duration-cap.
- [ ] 5.3 Cross-appointment attachment test (3.4).
- [ ] 5.4 Registration test — every stored object is registered; the erasure/archival workers can see it **without modification**.
- [ ] 5.5 Import-graph assertion: `use-speech-recognition` absent from this module's graph.
- [ ] 5.6 `rg` proves no new retention table, no new deletion worker, no `multer`.
- [ ] 5.7 Bucket RLS proven closed to anon + authenticated (**operator** — same environment constraint as `vnt-01` §4).
- [ ] 5.8 No PHI in logs — object ids and byte counts only, never audio, never a filename containing a patient name.
- [ ] 5.9 `npx tsc --noEmit` + lint clean; frontend + backend suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/2NN_<in_room_audio_bucket>.sql
CREATE: backend/src/services/<in-room capture service>          (signed URL + registration)
CREATE: backend/src/routes/api/v1/<capture route>               (arm / sign / finalise)
CREATE: frontend/lib/audio/<in-room capture hook>               (MediaRecorder — new primitive)
CREATE: frontend components for arm/disarm + the live indicator
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md · RLS_POLICIES.md
CREATE: tests — consent gate, three hard stops, cross-appointment, registration, import graph
```

**Existing Code Status:**
- ✅ `frontend/lib/audio/mic-meter.ts` — EXISTS. Read for conventions; **not modified**.
- ✅ `backend/src/services/prescription-attachment-service.ts` — EXISTS. The signed-URL precedent.
- ✅ `backend/migrations/056_recording_artifact_index.sql` — EXISTS. **Not modified** — registration target only.
- ✅ `frontend/lib/text/use-speech-recognition.ts` — EXISTS. **Must remain unreachable from here.**

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations in numeric order — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The invariants are negative.** "Cannot arm without consent", "cannot cross appointments", "cannot exceed the cap". Test the impossibility, not the happy path.
- **Unregistered audio must not be reachable as a state**, not even transiently on the failure path (VNA-D4).
- **The cap is a constant.** Made configurable, it becomes infinite in practice — and it is also this phase's main cost control.
- **The indicator is a control, not decoration.** No indicator ⇒ no capture.
- **Signed URLs, not multipart.** The codebase already made this call and wrote down why.
- **Never a browser STT API** (VNA-D7).
- No PHI in logs, and no PHI in object paths (`056`'s convention uses ids, not names — keep it that way).

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes — new PHI.** Raw audio of a physical consultation.
  - [ ] **RLS verified?** Bucket private; storage policies closed to anon + authenticated; proven, not assumed.
- [ ] **Any PHI in logs?** Must be **no** — including object paths and filenames.
- [ ] **External API or AI call?** **No** in this task — the audio is stored, not sent anywhere (`vna-04` sends it).
- [ ] **Retention / deletion impact?** **Yes, maximally.** Governed by the existing `rec-*` machinery or it does not ship (VNA-D4).

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] Mic is disarmed on every mount and cannot arm without an affirmative consent record at the active policy version — enforced at the route.
- [ ] A non-dismissible live indicator is present whenever the mic is live.
- [ ] Navigate-away, visit-end, and duration-cap each hard-stop capture — three passing tests.
- [ ] Audio armed under appointment A cannot be attached to appointment B — passing test.
- [ ] Every stored object is registered in `recording_artifact_index` and visible to the existing archival + erasure workers, **with no worker modified**.
- [ ] Declined / absent consent leaves no object and no partial upload.
- [ ] `use-speech-recognition` absent from the capture import graph.
- [ ] New bucket is private, follows the `068`/`184`/`212` pattern, and its RLS is proven closed.
- [ ] No `multer`, no new retention table, no new deletion worker — grepped.
- [ ] Type-check + lint clean; suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

⟨fill as executed⟩

---

## 📝 Notes

- The temptation this task must resist: "ship capture now, wire retention next sprint". Audio of a patient sitting in a room, stored outside the machinery that deletes it, is the exact artifact VN-DL-9 was written to prevent. VNA-D4 makes registration part of this gate for that reason.
- Second temptation: a "keep recording between patients so the doctor doesn't have to re-arm" convenience. That is the cross-patient leak, wearing a UX rationale.
- `056`'s `ON DELETE RESTRICT` means a registered artifact pins its session row. That is intended — it is what stops a delete from bypassing `archival_history`.

---

## 🔗 Related Tasks

- [`task-vna-01-in-room-consent-surface.md`](./task-vna-01-in-room-consent-surface.md) — supplies the arming predicate
- [`task-vna-02-walkin-session-identity.md`](./task-vna-02-walkin-session-identity.md) — supplies the session row registration needs
- [`task-vna-04-non-twilio-transcription.md`](./task-vna-04-non-twilio-transcription.md) — consumes the stored object

---

**Last Updated:** 2026-08-31
**Completed:** —
**Pattern:** Consent-gated explicit capture, signed-URL upload, registered into existing retention
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
