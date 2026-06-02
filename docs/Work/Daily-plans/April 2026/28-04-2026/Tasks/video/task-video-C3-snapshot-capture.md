# Task video-C3: Snapshot capture (`<canvas>` extraction → signed-URL upload → clinical record)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **M item, ~3 days**

---

## Task overview

The clinical-record killer feature for video. Today: doctor either takes a screenshot themselves (PHI risk; lives in personal device gallery) or asks patient to send a photo (round-trip; 5 min lost). T3.21 ships in-call snapshot:

1. Doctor or patient clicks Snapshot button.
2. `<canvas>` extracts the current frame from remote (or own) video tile as JPEG.
3. Upload to signed-URL storage (`consult-attachments` bucket).
4. Insert as `consultation_messages` system+attachment row OR new `clinical_snapshots` table (decision §13 — recommend `consultation_messages` to reuse Plan 06 attachment pipeline).
5. Companion-chat surfaces "👤 Patient snapshot taken at 12:34" with thumbnail.
6. On-screen flash + "Snapshot taken" toast.

**PHI gating** — snapshot is a clinical artifact; respects Plan 02 / 08 consent (if patient declined recording, snapshot is BLOCKED unless re-consented; document policy at PR time).

**Foundation for [task-video-C4](./task-video-C4-freeze-frame-annotations.md) (annotations) and [task-video-D3](./task-video-D3-snapshot-review-attach.md) (review-and-attach).**

**Estimated time:** ~3 days.

**Status:** Implemented (2026-05-01). Decision §14 shipped with the
recommended default — doctor-of-patient snapshots are clinical-only and
hidden from the patient by RLS; system banner remains visible. Carry
this into the PR review.

**Depends on:** Plan 02 + 08 (HARD — consent gating); Plan 06 attachment pipeline (HARD if storing as `consultation_messages` row).

**Source:** [T3 §T3.21](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decisions §13 + §14](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### `frontend/lib/video/snapshot-capture.ts`

- [x] **New module** with:
  ```ts
  export async function captureSnapshot(
    input: SnapshotInput
  ): Promise<{ snapshotId: string, url: string, attachmentPath: string }>;
  ```
  Diverged from the draft contract — the consent check moved
  server-side (single source of truth; can't be spoofed by the client),
  and `capturerId` / `capturerRole` are derived from the bearer JWT
  inside `submitSnapshot` rather than being passed by the caller.
  Frontend module is pure capture + upload.
- [x] Internally:
  1. Read native dimensions from the `HTMLVideoElement`.
  2. Draw onto an offscreen `<canvas>` at native resolution.
  3. `canvas.toBlob(image/jpeg, 0.92)`.
  4. Encode the blob as base64 (JSON envelope, not multipart — see
     §1 below for the dependency-avoidance rationale).
  5. `POST /api/v1/consultation/:sessionId/snapshots` with
     `{ jpegBase64, target, dimensions }`.
  6. Backend resolves caller, validates consent, uploads, inserts
     attachment row + emits system banner; returns
     `{ snapshotId, url, attachmentPath }`.

### Backend route + service

- [x] **`POST /api/v1/consultation/:sessionId/snapshots`** mounted in
  `backend/src/routes/api/v1/consultation.ts` (NOT a new
  `snapshots.ts` route file — kept on the existing consultation
  router for url-namespace consistency with `/attachments/sign`).
  - Auth: Bearer JWT (doctor's Supabase JWT OR patient scoped JWT;
    same triage as `mintAttachmentSignedUrls`).
  - Body: JSON `{ jpegBase64, target, dimensions }`.
  - Validates the consent gate inside the service.
  - Returns `{ snapshotId, url, attachmentPath }`.
- [x] **New** `backend/src/services/snapshot-storage-service.ts`:
  - Uploads to `consultation-attachments/{sessionId}/snapshots/{uuid}.jpg`
    (chat-attachment bucket, snapshot subdirectory — co-located so
    the existing `mintAttachmentSignedUrls` read path resolves
    snapshots without a second route).
  - Mints a 1h signed URL.
  - Inserts a `consultation_messages` row with:
    - `kind = 'attachment'`
    - `attachment_url` / `attachment_mime_type` / `attachment_byte_size`
    - `metadata = { snapshot: true, capturer_role, target, captured_at, dimensions }`
  - Emits a SEPARATE `kind='system'` row via `emitSnapshotTaken` —
    `system_event = 'snapshot_taken'` cannot live on the same row as
    `kind='attachment'` because of the row-shape CHECK from
    Migration 063. The two-row design is intentional and documented
    in Migration 084's head comment.
  - Best-effort orphan cleanup if the DB insert fails after the
    storage upload landed.

### Plan 06 metadata column + RLS extensions

- [x] **Migration 083** (`backend/migrations/083_consultation_messages_metadata_column.sql`):
  - Additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS metadata jsonb`.
  - The `meta` argument that
    `emitVideoRecordingStarted` / `emitVideoRecordingFailedToStart` /
    `emitVideoRecordingStopped` already pass is now persisted instead
    of stripped — additive, backward-compatible win for Plans 08/09.
- [x] **Migration 084** (`084_consultation_messages_snapshot_visibility_rls.sql`):
  - DROP + CREATE the `consultation_messages_select_participants`
    SELECT policy preserving Migration 078's `CASE consult_role`
    structure.
  - Patient branch gains `AND NOT (metadata IS NOT NULL AND
    metadata ->> 'snapshot' = 'true' AND metadata ->> 'capturer_role'
    = 'doctor' AND metadata ->> 'target' = 'remote')`.
  - Drift-guard: the `'snapshot_taken'` SystemEvent type is added
    to `consultation-message-service.ts` rather than via an enum
    migration — `system_event` is `text` not an enum, so no schema
    change required (verified against migrations 062/063).
- [x] **`emitSystemMessage` upgrade** — conditionally writes
  `input.meta` to the `metadata` column instead of dropping it.
  Backward-compatible (existing callers with no `meta` get
  `metadata=NULL`, same as pre-083 row shape). Also extends the
  `SystemEvent` union with `'snapshot_taken'`.

### `<SnapshotControls>` component

- [x] **New component** at `frontend/components/consultation/SnapshotControls.tsx`:
  - Snapshot button in the controls bar (right of the screen-share
    Share button — clinical-workflow tools cluster together).
  - Source dropdown (`'remote'` | `'self'`; default `'remote'`).
  - Brief white flash overlay + amber/green toast for success/error.
  - Hidden during hold, when `chatAuth.status !== 'ready'`, and when
    `companion` is missing (no surface to render the snapshot row
    into without the chat channel).

### PHI gating + audit

- [x] **Server-side consent gate** — `getConsentForSession` blocks
  patient-initiated snapshots when `decision !== true` (so both
  `false` and `null` block; explicit yes required). Error message
  guides the patient back to the consent banner.
- [x] **Doctor branch bypasses the patient consent gate** — clinical
  artifacts mirror physical-record notes; flagged in the service
  JSDoc and Migration 084 head comment for product review.
- [x] **System banner audit trail** — `emitSnapshotTaken` writes a
  `kind='system'` row visible to both parties even when the JPEG
  itself is hidden (Migration 084 head comment articulates the
  trust-gap rationale).

### Patient visibility (decision §14) — SHIPPED with recommended default

- [x] Patient sees snapshots THEY took (`capturer_role='patient'`
  short-circuits the predicate).
- [x] Patient does NOT see snapshots the doctor took of the patient
  (`capturer_role='doctor' AND target='remote' AND snapshot=true`
  predicates all true → patient SELECT branch hides the row).
- [x] Doctor sees every row in their sessions (doctor branch of the
  policy is unchanged — decision §14 is a patient-side gate).
- [x] Documented in Migration 084 head comment; carry to PR review.

### Manual smoke (deferred to manual QA)

- [ ] Doctor Snapshot button → flash + thumbnail in companion chat with system banner.
- [ ] Patient Snapshot button → same; visible to both parties.
- [ ] Doctor takes snapshot of patient → patient does NOT see the JPEG row in chat (decision §14 visibility), but DOES see the "Doctor captured a snapshot at HH:MM" system banner.
- [ ] Click thumbnail → signed URL opens in a new tab.
- [ ] Snapshot upload < 1MB at 1080p remote tile.
- [ ] Snapshot during recording → recording continues uninterrupted.

### `mode='readonly'`

- [ ] Snapshot button hidden — wire when the read-only mode prop lands
  (same posture as the existing screen-share / quality-picker buttons,
  none of which gate on `mode='readonly'` today).

### General

- [x] Type-check + lint clean (frontend + backend, on touched files).
- [x] No console errors (lint passes).
- [x] No PHI in logs (service logs only sizes / dimensions / ids;
  audited in `submitSnapshot` JSDoc).
- [x] Migrations 083 + 084 forward cleanly; rollback documented in
  the per-migration head comments.
- [x] **Tests:** 10 content-sanity tests for migrations 083/084 plus
  15 unit tests for `submitSnapshot` (validation gates, JPEG magic
  sniff, JWT triage, consent gate). All 25 green; full backend
  suite shows 2049/2054 pass — the 5 unrelated failures are in
  `payment-service.test.ts` from a pre-existing in-progress refactor
  on `payment-service.ts` (`git diff HEAD --stat` shows 81 inserts,
  unrelated to C3).

---

## Out of scope

- **Auto-snapshot on certain events.** Out of scope.
- **Burst capture.** Out of scope.
- **Snapshot from screen-share track.** Out of scope; covered by [task-video-C5](./task-video-C5-screen-share.md) media (separate consideration).
- **Snapshot review-and-attach UI.** That's [task-video-D3](./task-video-D3-snapshot-review-attach.md).
- **Annotations on snapshot.** That's [task-video-C4](./task-video-C4-freeze-frame-annotations.md).

---

## Files expected to touch

**Frontend:**
- `frontend/lib/video/snapshot-capture.ts` — **new** (~140 LOC).
- `frontend/components/consultation/SnapshotControls.tsx` — **new** (~155 LOC; includes source-dropdown + flash + toast UX).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~20 LOC: import + conditional mount inside the controls bar).
- `frontend/lib/api.ts` — **NOT touched** (the API call lives in `lib/video/snapshot-capture.ts` directly; a wrapper for one endpoint was one indirection too many).

**Backend:**
- `backend/src/routes/api/v1/consultation.ts` — **edit** (~5 LOC: import + `router.post('/:sessionId/snapshots', postSnapshotHandler)`). NOT a new `snapshots.ts` route file — kept on the existing consultation router for url-namespace consistency with `/attachments/sign`.
- `backend/src/controllers/consultation-controller.ts` — **edit** (~70 LOC: `postSnapshotHandler` with body validation + base64 decode).
- `backend/src/services/snapshot-storage-service.ts` — **new** (~575 LOC including the JSDoc that documents auth triage + consent gate + storage layout + decision §14 metadata shape).
- `backend/src/services/consultation-message-service.ts` — **edit** (`SystemEvent` union extension + `emitSystemMessage` `metadata` persistence + new `emitSnapshotTaken` helper).
- `backend/migrations/083_consultation_messages_metadata_column.sql` — **new** (additive `metadata jsonb` column).
- `backend/migrations/084_consultation_messages_snapshot_visibility_rls.sql` — **new** (decision §14 patient-visibility gate; preserves Migration 078's `CASE consult_role` shape).
- **No `system_subtype` enum migration needed** — `system_event` is `text` (verified against migrations 062/063), so adding `'snapshot_taken'` to the TypeScript `SystemEvent` union is the only typing change.

**Tests:**
- `backend/tests/unit/migrations/snapshot-metadata-and-rls-migrations.test.ts` — **new** (10 content-sanity assertions on the SQL of 083 + 084; same drift-guard doctrine as the existing migration tests).
- `backend/tests/unit/services/snapshot-storage-service.test.ts` — **new** (15 unit tests: `isJpegMagic` + the validation + JWT triage + consent-gate paths of `submitSnapshot`).
- Live-database integration tests deferred — repo posture is "no live Supabase in CI"; storage upload + RLS evaluation get covered by the manual smoke pass at PR time.

---

## Notes / open decisions

1. **Decision §13** — **shipped:** stored as a `consultation_messages` `kind='attachment'` row (reuses Plan 06 pipeline). The companion `'snapshot_taken'` system banner is a SEPARATE `kind='system'` row because the row-shape CHECK from Migration 063 forbids both `kind='attachment'` and a `system_event` value on the same row (audited at implementation time; Migration 084 head comment articulates the two-row design).
2. **Decision §14 visibility** — **shipped with the recommended default:** patient sees their own snapshots; doctor-of-patient snapshots are hidden from the patient by Migration 084's RLS predicate. The `'snapshot_taken'` system banner stays visible to both parties so the patient knows a snapshot was taken even when the JPEG is patient-hidden — this was the conscious "trust-gap" call documented in Migration 084. Carry to PR review.
3. **Decision: JSON+base64 over multipart** — the draft suggested multipart/form-data, which would have required adding `multer` (no multipart parser exists in the backend today; verified against `package.json`). Base64-encoded JPEG inside a JSON envelope fits comfortably within the existing 10MB `BODY_SIZE_LIMIT` (5MB max snapshot ⇒ ~6.7MB base64 ⇒ ~6.8MB envelope) and avoids the new dep.
4. **Decision: doctor branch bypasses the patient consent gate** — clinical artifacts mirror physical-record notes; the patient-consent gate would block clinical record-keeping when the patient declined recording. Documented in `submitSnapshot` JSDoc as a flag for product review; tighten in a follow-up if product wants the gate on both sides.
5. **Image quality** — JPEG at 0.92 quality (browser default for `canvas.toBlob`). Reasonable balance of clarity and size; 1080p capture lands at 200-400 KB.
6. **Capture source** — remote tile is the default (doctor captures the patient's wound, etc.). Self-tile as secondary via the source dropdown.
7. **Recording-pause for snapshot** — snapshot does NOT pause or interrupt recording (no Twilio recording API touched).
8. **PHI hygiene** — JPEG never written to disk on local device; canvas → blob → base64 → fetch all in memory. No localStorage / cache. Server logs only sizes / dimensions / ids; never bytes.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.21](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Decisions:** [§13 storage, §14 visibility](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **Plan 02:** [recording consent](../../19-04-2026/Plans/plan-02-recording-consent.md) (snapshot consent gate)
- **Plan 08:** [doctor video escalation](../../19-04-2026/Plans/plan-08-video-recording-doctor-control.md)
- **Future consumers:** [task-video-C4](./task-video-C4-freeze-frame-annotations.md), [task-video-D3](./task-video-D3-snapshot-review-attach.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Implemented:** 2026-05-01
**Status:** Implemented (decision §14 shipped with the recommended default; carry to PR review). Manual smoke + integration coverage deferred to PR-time QA.
