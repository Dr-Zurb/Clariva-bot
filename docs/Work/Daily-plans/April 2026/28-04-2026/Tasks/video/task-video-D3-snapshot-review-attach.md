# Task video-D3: Snapshot review-and-attach (doctor only; consumes C3)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch D (T4 post-call) — **M item, ~1 day**

---

## Task overview

After the call, doctor reviews the snapshots taken in-call (C3) and decides which ones to attach to the clinical record (and to which canonical section: Subjective / Objective / Assessment / Plan / Attachments).

Today: even with C3 capture, snapshots live as orphan attachment rows. T4.29 closes the loop with a doctor-only review surface:

- Gallery thumbnail grid of snapshots from this session.
- Each thumbnail expands to full-size with annotations (C4) overlay.
- Per-snapshot: dropdown to attach to a section + Save button.
- Discard button removes the snapshot from the session record (with audit).

**Estimated time:** ~1 day.

**Status:** ✅ **Shipped (2026-05-01)** — Phase 1 (Phased-MIN). Three doctor-only endpoints (`GET /:sessionId/snapshots`, `POST /:sessionId/snapshots/:snapshotId/attach-to-section`, `POST /:sessionId/snapshots/:snapshotId/discard`) live under the existing `/api/v1/consultation` router. Section persisted on `consultation_messages.metadata.clinical_section`; discard is soft-delete via `metadata.discarded_at`. Greenfield `<SnapshotReviewPanel>` (gallery + modal + section radio + Save / Discard) mounted on (1) `<CallPostCallSummary>` (doctor-only CTA appearing only when `summary.snapshotsCount > 0`) and (2) `<ConsultArtifactsPanel>` (doctor-only block, never rendered for patient mounts). 23 unit tests green. **Reprojection into a clinical-record table is deferred** — see "Audit + scope decision (2026-05-01)" below.

**Depends on:** [task-video-C3](./task-video-C3-snapshot-capture.md) (HARD — consumes capture pipeline) — **shipped.** Snapshots already flow into `consultation_messages` rows with `kind='attachment'` + `metadata.snapshot=true` + `metadata.annotated` + `metadata.dimensions` + `metadata.annotations`. C4 annotations are burned into the JPEG at capture time, so the modal renders the JPEG as-is (no canvas re-composite).

**Source:** [T4 §T4.29](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md); [decision §19](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts).

---

## Audit + scope decision (2026-05-01)

Execution-time audit found **two** spec-vs-reality mismatches that forced a Phase 1 / Phased-MIN scope split:

1. **No separate `snapshots` table.** The C3 spec assumed snapshots would live in their own table with a `clinical_section` column. They actually live as `consultation_messages` rows (Migration 074 — `kind='attachment'`, `system_subtype='snapshot_taken'`, `metadata.snapshot=true`, optional `metadata.annotated=true` + structured `metadata.annotations`). Migration 084 already governs RLS: doctors see all of their session's snapshots; patients see only doctor-attached snapshots in chart view.

2. **No clinical-record SOAP tables exist today.** The spec said attaching a snapshot should "copy into the relevant clinical-record table." There is no such table in this codebase — SOAP-section reprojection is a future infra concern (likely Plan 11 / clinical-record refactor).

**Phased-MIN decisions:**
- **Section persisted on the snapshot row's metadata** (`metadata.clinical_section`) — this is the durable source of truth that any future clinical-record reprojection can read from. We don't lose the doctor's intent waiting for the table to ship.
- **Discard is soft-delete only** — sets `metadata.discarded_at = ISO timestamp` on the same row. Audit trail preserved (the row never leaves `consultation_messages`); the gallery hides discarded rows by default (`includeDiscarded=false` on `GET /:sessionId/snapshots`); restore-from-discard is a v2 affordance.
- **Discard idempotency** — re-discarding preserves the original `discarded_at` timestamp.
- **Doctor-only at the service layer** — `resolveDoctorForSession` requires a doctor Supabase JWT (`admin.auth.getUser`) AND the session's `doctor_id` must match the caller. Patient JWTs and scoped extra-participant JWTs are rejected with `ForbiddenError` regardless of mount.
- **Routes live under existing `/api/v1/consultation/:sessionId/...`** instead of the spec-suggested `/api/v1/snapshots/:id/...`. Reasoning: every snapshot is intrinsically a consultation message, the session-id-in-the-path lets RLS / authorization piggyback off the existing `consultation_sessions` lookup, and the existing controller already has the auth guard plumbing.

**What's net-new:** backend service + 3 endpoints + frontend panel + 3 API helpers + dual mount surface.
**What's deferred:** reprojection into clinical-record SOAP tables (gated on Plan 11 infra); restore-from-discard UI (v2); annotation editing (immutable per C4 decision); multi-section assignment; bulk select-and-save; the hypothetical patient-facing `/appointments/[id]` route is out of scope (panel is doctor-only by design).

---

## Files actually touched (Phase 1, 2026-05-01)

**Backend:**
- `backend/src/services/snapshot-review-service.ts` — **NEW** (~330 LOC; doctor-only auth + list + attach-to-section + discard + signed-URL minting per snapshot).
- `backend/src/controllers/consultation-controller.ts` — edited (`+~70` lines: `listSnapshotsHandler`, `attachSnapshotToSectionHandler`, `discardSnapshotHandler`).
- `backend/src/routes/api/v1/consultation.ts` — edited (`+~10` lines: 3 routes registered).

**Frontend:**
- `frontend/components/consultation/SnapshotReviewPanel.tsx` — **NEW** (~470 LOC; gallery + modal + section radio + section tallies + Save / Discard).
- `frontend/components/consultation/CallPostCallSummary.tsx` — edited (`+~30` lines: import panel + `snapshotPanelOpen` local state + doctor-only "Review snapshots" CTA on the snapshots row + inline expand mount).
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — edited (`+~7` lines: import + doctor-only mount block above the transcript placeholder).
- `frontend/lib/api.ts` — edited (`+~110` lines: `CLINICAL_SECTIONS` enum + `ClinicalSection` type + `SnapshotReviewItem` + `SnapshotReviewListResponse` + `listConsultSnapshots()` + `attachConsultSnapshotToSection()` + `discardConsultSnapshot()`).

**Tests:**
- `backend/tests/unit/services/snapshot-review-service.test.ts` — **NEW** (~720 LOC; 23 tests; green).

**Migrations:** none. Schema for `metadata.clinical_section` and `metadata.discarded_at` is JSONB-based on top of the existing `consultation_messages.metadata` (Migration 083). When clinical-record SOAP infrastructure ships, the reprojection script will read from `metadata.clinical_section` directly.

---

## Verification (2026-05-01)

- ✅ Backend `tsc --noEmit -p tsconfig.json` — clean.
- ✅ Backend `eslint src/services/snapshot-review-service.ts src/controllers/consultation-controller.ts src/routes/api/v1/consultation.ts` — clean (production source). Test file lint hits a pre-existing parser-project config limitation in `.eslintrc.json` (tests aren't covered by the parser project) — pre-existing, not a D.4 regression.
- ✅ Backend Jest — 23 / 23 green:
  - validation gate (6): missing/non-UUID sessionId, missing bearer, non-UUID snapshotId, bad section enum, non-UUID snapshotId on discard.
  - `isClinicalSection` helper (2): accepts §19 sections; rejects non-string + unknown values.
  - auth (3): rejects unverified bearer, missing session row (NotFoundError), non-owner doctor (ForbiddenError).
  - `listSnapshots` (5): returns signed URLs + parsed metadata; hides discarded by default; surfaces `discardedAt` when included; degrades to empty `signedUrl` when storage mint fails; empty array on no snapshots.
  - `attachSnapshotToSection` (4): writes `metadata.clinical_section`; rejects non-snapshot rows; rejects non-attachment kinds; NotFoundError on cross-session snapshotId.
  - `discardSnapshot` (3): writes `metadata.discarded_at`; idempotent (preserves first timestamp); NotFoundError on cross-session snapshotId.
- ✅ Frontend `tsc --noEmit` — clean.
- ✅ Frontend `eslint components/consultation/CallPostCallSummary.tsx components/consultation/SnapshotReviewPanel.tsx components/consultation/ConsultArtifactsPanel.tsx lib/api.ts` — 0 errors, 0 warnings.

---

## Acceptance criteria

### `<SnapshotReviewPanel>` component

- [ ] **New component** at `frontend/components/consultation/SnapshotReviewPanel.tsx`:
  - **Doctor-only.**
  - Lists all snapshots from this session (queries `consultation_messages` where `system_subtype = 'snapshot_taken'` AND `session_id = X`).
  - Thumbnail grid (3 cols desktop; 2 mobile).
  - Click thumbnail → modal with full-size + annotations rendered + per-snapshot actions.
- [ ] **Per-snapshot actions:**
  - Section dropdown (Subjective / Objective / Assessment / Plan / Attachments).
  - "Save to section" button.
  - "Discard" button (with confirm).

### Backend save-to-section endpoint

- [ ] **`backend/src/routes/api/v1/snapshots.ts`** — extend (or new):
  - `POST /api/v1/snapshots/:id/attach-to-section` body `{ section: 'Subjective' | 'Objective' | 'Assessment' | 'Plan' | 'Attachments' }`.
  - Auth: doctor JWT only.
  - Updates the snapshot row's metadata with `clinical_section` AND copies into the relevant clinical-record table (audit linkage). Don't duplicate the storage object; reference the same signed URL.
  - `POST /api/v1/snapshots/:id/discard` — sets `discarded_at` (soft delete; audit).

### Mount points

- [ ] Reachable from D1 post-call summary CTA "Review snapshots" (visible when `snapshotsCount > 0`).
- [ ] Reachable from `appointments/:id` for the doctor.

### Manual smoke

- [ ] Doctor takes 3 snapshots in-call.
- [ ] After call, opens summary → "Review snapshots (3)" CTA visible.
- [ ] Click → review panel renders 3 thumbnails.
- [ ] Click thumbnail → modal expands; doctor selects "Objective" section; clicks Save.
- [ ] Verify clinical record now references the snapshot under Objective.
- [ ] Discard one snapshot → discarded with audit row.
- [ ] **Patient never sees this panel** (doctor-only authorization).

### `mode='readonly'`

- [ ] Panel renders thumbnails in readonly view; per-snapshot actions are hidden.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] **Decision §14 invariant** — patient cannot see doctor-attached snapshots in their chart view (covered by C3 RLS).

---

## Out of scope

- **Multi-section assignment** (one snapshot in two sections). Out of scope.
- **Bulk select-and-save.** Out of scope.
- **Edit annotations after capture.** Out of scope (C4 ships annotations at capture time; immutable after).
- **Print snapshot panel.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/SnapshotReviewPanel.tsx` — **new** (~200 LOC).
- `frontend/components/consultation/CallPostCallSummary.tsx` — **edit** (~10 LOC: "Review snapshots" CTA).
- `frontend/app/appointments/[id]/page.tsx` — **edit** (~10 LOC: mount panel for doctor).
- `frontend/lib/api.ts` — **edit** (~30 LOC: list snapshots; attach to section; discard).

**Backend:**
- `backend/src/routes/api/v1/snapshots.ts` — **edit** (~80 LOC: add attach-to-section + discard endpoints).
- `backend/src/services/snapshot-storage-service.ts` — **edit** (~50 LOC: section linkage + discard).

**Migrations:** add `clinical_section TEXT NULL` and `discarded_at TIMESTAMPTZ NULL` columns to the snapshot row schema (or extend `consultation_messages` metadata; coordinate with C3 storage decision §13).

**Tests:**
- `backend/tests/integration/snapshots.test.ts` — **extend** (~80 LOC: attach-to-section + discard + RLS deny patient).

---

## Notes / open decisions

1. **Decision §19** — radio-list of canonical sections (recommended; predictable; analyzable).
2. **Patient visibility** — section-attached snapshots remain doctor-visible only by RLS (C3 decision §14).
3. **Audit log** — every save / discard creates an audit row (existing audit_log if present; otherwise via `consultation_messages` system row metadata).
4. **Section schema** — sections are clinical convention; if the clinical-record schema has its own section enum, align.
5. **Discard != delete** — discarded snapshots stay in `consultation_messages` with `discarded_at` set; not exposed in clinical record but retained for audit.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch D](../Plans/plan-video-consult-selected-features.md#sub-batch-d--post-call-3-days)
- **Source item:** [T4 §T4.29](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
- **Hard dep:** [task-video-C3](./task-video-C3-snapshot-capture.md), [task-video-C4](./task-video-C4-freeze-frame-annotations.md)
- **Decision:** [§19 — section UX](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped (2026-05-01) — Phase 1 (Phased-MIN). Reprojection into clinical-record SOAP tables deferred (gated on Plan 11 / clinical-record infra).
