# Task voice-B5: Post-call summary screen

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **M item, ~2 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

After a call ends (and the [task-voice-A9](./task-voice-A9-disconnect-reason-splash.md) splash dismisses), show a **post-call summary screen** with:

- Call duration.
- Disconnect reason (consumed from A9).
- Recording status — "Recording available" / "Not recorded" / "Processing…" (Plan 07 dependency).
- Attachments count (anything sent via companion chat during call).
- Prescription sent badge (if Rx was issued during call — reuse existing Rx data).
- CTAs: `[Listen to recording]` (gated on Plan 07 — see [task-voice-B6](./task-voice-B6-recording-playback-link.md)), `[View transcript]` (placeholder for future), `[Book follow-up]`, `[Close]`.

Mounted in two places:

1. **As post-call splash** (right after A9 splash dismisses) — primary surface.
2. **Reachable from `/appointments/:id`** (decision §8) — durable historical view.

Backend: a new aggregation endpoint `GET /api/v1/consultations/:id/post-call-summary` reads from existing tables (no new schema).

**Estimated time:** ~2 days.

**Status:** ✅ Shipped (2026-05-20). Backend aggregator + route were already landed for video D1; this PR wires voice B5 mounts and extends the shared `<CallPostCallSummary>` CTAs (transcript placeholder, book follow-up opt-in, recording tooltip, Close).

**Depends on:** [task-voice-A9](./task-voice-A9-disconnect-reason-splash.md) — soft (consumes `reason`).

**Source:** [T4 §T4.25](../../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md); [decision §8](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### Backend: aggregation service + endpoint

- [x] **`backend/src/services/post-call-summary-service.ts`** — new:
  - `getPostCallSummary(sessionId, requestingUserId): Promise<PostCallSummaryDto>`.
  - Aggregates from existing tables:
    - `consultation_sessions` → duration, status.
    - `consultation_messages` → attachments count.
    - `prescriptions` (or equivalent) → was an Rx sent during the call?
    - `recordings` (Plan 07 owns) → recording-available status; degrades to `'not-available'` if Plan 07 hasn't shipped.
  - DTO shape:
    ```ts
    type PostCallSummaryDto = {
      sessionId: string;
      duration: { startedAt: string, endedAt: string, secondsTotal: number };
      disconnectReason: 'local' | 'remote' | 'connection_lost' | 'timeout' | 'token_expired' | 'unknown' | null;
      recordingStatus: 'available' | 'processing' | 'not-recorded' | 'not-available';
      recordingUrl?: string;          // populated if Plan 07 ready + status==='available'
      attachmentsCount: number;
      prescriptionSent: boolean;
      counterparty: { name: string, role: 'doctor' | 'patient' };
    };
    ```
- [x] **`backend/src/routes/api/v1/post-call-summary.ts`** — new route:
  - `GET /api/v1/consultations/:id/post-call-summary`.
  - Auth: doctor JWT OR patient HMAC (same patterns as text-token endpoint).
  - RLS: requesting user must be a participant in the session.
  - Returns the DTO.

### Frontend: `<CallPostCallSummary>` (modality-agnostic; voice B5 uses shared component per video D1)

- [x] **Component** at `frontend/components/consultation/CallPostCallSummary.tsx`:
  - Props: `summary: PostCallSummaryDto`, `mountContext: 'post-call-splash' | 'history-detail'`.
  - Renders:
    - Header: "Call summary"
    - Counterparty + duration (e.g. "Call with Dr. Sharma · 24:13")
    - Disconnect reason as a small subline
    - Stats grid: recording, attachments, Rx (icons + counts).
    - CTAs:
      - `[Listen to recording]` — disabled if `recordingStatus !== 'available'`; tooltip explains why. **Wired by [task-voice-B6](./task-voice-B6-recording-playback-link.md)**.
      - `[View transcript]` — disabled placeholder ("Coming soon — needs Plan 10").
      - `[Book follow-up]` — links to existing `/book` flow with prefilled doctor.
      - `[Close]` — closes splash (post-call mount only) or navigates back (history mount).

### Frontend: API client

- [x] **`frontend/lib/api.ts`** — add `getPostCallSummary(sessionId): Promise<PostCallSummaryDto>`.

### Mount in two places

- [x] **Post-call splash:** in `<VoiceConsultRoom>`'s ended-state, after A9 splash dismisses, mount `<CallPostCallSummary mountContext='post-call' />` fetching the summary on mount.
- [x] **History detail:** `frontend/components/consultation/cockpit/EndedCard.tsx` on `dashboard/appointments/[id]` for ended consults (all modalities). Decision §8: reachable indefinitely.

### Manual smoke

- [ ] End a voice call → A9 splash → 5s later A9 dismisses → summary screen appears.
- [ ] Summary shows correct duration, disconnect reason, attachment count.
- [ ] Click `[Close]` → returns to dashboard / app home.
- [ ] Open `/appointments/:id` for an ended consult → same summary renders (durable).
- [ ] When Plan 07 hasn't shipped: `[Listen to recording]` is disabled with tooltip "Recording will be available soon".
- [ ] When Plan 07 has shipped + recording available: button enabled, click opens [task-voice-B6](./task-voice-B6-recording-playback-link.md) player.

### General

- [x] Type-check + lint clean (frontend + backend).
- [x] No PHI in logs.
- [x] Backend endpoint returns 401 if requester isn't a participant.
- [x] Backend endpoint returns 200 even for ended sessions (post-call IS the use case).

---

## Out of scope

- **Recording playback player itself** — [task-voice-B6](./task-voice-B6-recording-playback-link.md) ships the actual player.
- **Transcript surface** — Plan 10 (deferred); button is a disabled placeholder.
- **Patient rating / review surface** — T4.26 (deferred).
- **Auto-emailed summary** — out of scope.
- **Summary editing by doctor** — out of scope; Plan 10 (SOAP draft) covers that.

---

## Files expected to touch

**Backend:**

- `backend/src/services/post-call-summary-service.ts` — **new** (~150 LOC).
- `backend/src/routes/api/v1/post-call-summary.ts` — **new** (~80 LOC).
- `backend/src/types/...` — **new DTO type** (~20 LOC).

**Frontend:**

- `frontend/components/consultation/VoicePostCallSummary.tsx` — **new** (~200 LOC).
- `frontend/lib/api.ts` — **edit** (~15 LOC: getPostCallSummary).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~20 LOC: ended-state mount).
- `frontend/app/appointments/[id]/page.tsx` (or equivalent) — **edit** (~30 LOC: detail mount for ended consults).

**Migrations:** none (aggregation reads from existing tables).

**Tests:**

- `backend/tests/integration/post-call-summary.test.ts` — **new** (~80 LOC; happy path + auth).

---

## Notes / open decisions

1. **Why aggregation in backend** — keeps frontend dumb. RLS-aware aggregation prevents accidentally exposing data the requester shouldn't see.
2. **Decision §8 LOCKED** — durable, mounted twice. Don't accidentally tear down summary state when navigating.
3. **Plan 07 graceful degradation** — when recording table doesn't exist or query fails, return `recordingStatus: 'not-available'`. Don't 500.
4. **Why Rx detection from existing prescriptions table** — reuse; don't double-track.
5. **Counterparty name on doctor side** — patient name is sometimes empty; fall back to "Patient".
6. **Caching** — endpoint is idempotent; no rate concern. If load becomes a concern, add `Cache-Control: max-age=60`.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)
- **Source item:** [T4 §T4.25](../../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md)
- **Decision:** [§8 — durable + dual-mount](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts)
- **Soft dep:** [task-voice-A9](./task-voice-A9-disconnect-reason-splash.md).
- **Sibling:** [task-voice-B6](./task-voice-B6-recording-playback-link.md) — wires the recording CTA.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** ✅ Shipped (2026-05-20).
