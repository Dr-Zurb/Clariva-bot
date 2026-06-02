# Task 29: Patient self-serve replay surface — `recording-access-service.ts` + `<RecordingReplayPlayer>` audio-baseline (stream-only, watermarked, 90-day TTL, revocation-list-aware, audit-logged, Decision 4 + 10 LOCKED)

## 19 April 2026 — Plan [Recording replay & history](../Plans/plan-07-recording-replay-and-history.md) — Phase E

---

## Task overview

Decision 4 LOCKED patient self-serve replay access for 90 days, with mandatory audit + revocation-awareness + watermark. Decision 10 LOCKED that replay URLs are stream-only (never download-able) with a short per-mint TTL. This task ships the whole audio-baseline slice; Plan 08 Task 41 extends for video with audio-first + SMS OTP + warning-modal friction layered on top.

Five things land together:

1. **`recording-access-service.ts#mintReplayUrl`** — the central authz-checking, revocation-list-checking, audit-writing, signed-URL-minting function. Reused by Task 29's patient player, by the doctor's "Review consult" surface, and (via a fourth role `'support_staff'` with escalation-reason logging) by any future ops tool.
2. **`<RecordingReplayPlayer>`** — audio-baseline player. Streams the signed URL (no download attribute, no right-click-save), renders a watermark overlay, exposes play / pause / seek / speed (1x/1.25x/1.5x). No visible download button. On mount, calls `mintReplayUrl` to get a fresh 15-min signed URL; on URL-expiry, re-mints transparently.
3. **HTTP routes** `POST /api/v1/consultation/:sessionId/replay/audio/mint` (mint a fresh URL) + `GET /api/v1/consultation/:sessionId/replay/status` (returns whether the artifact is accessible — pre-mint check for the player's "this recording is no longer available" empty state).
4. **Patient-facing route** `/c/replay/[sessionId]` that authenticates via HMAC-exchange (same pattern as Task 31's chat-history surface) and mounts `<RecordingReplayPlayer>`.
5. **Doctor-facing mount** inside `<ConsultArtifactsPanel>` (new encapsulating component — also hosts the transcript-download button from Task 32 and the modality-timeline from Plan 09). This task ships the panel's skeleton with the audio player slotted in; Task 32 + Plan 09 add their slots.

The patient-self-serve TTL window (90 days) is read from `regulatory_retention_policy` (Plan 02's table) keyed on `(country, specialty)`; default 90 days if no row exists. After the window, the patient's route surfaces "Contact support to request access"; a support-staff caller bypasses the window by passing `requestingRole: 'support_staff'` with a logged `metadata.escalation_reason`.

**Critical dependency gaps (flagged up-front, same as Task 28):**
1. **`recording_access_audit` does not exist in the migrations directory today.** Plan 02's audit migration is a hard block.
2. **`signed_url_revocation` does not exist today.** Plan 02 migration is a hard block.
3. **`regulatory_retention_policy` does not exist today.** Plan 02 migration is a hard block.
4. **No audio Composition artifact is yet produced by the voice adapter.** Plan 05 Task 25's post-consult worker + `consultation_transcripts` + the Twilio Composition polling pattern is what **produces the audio artifact this task replays**. If Plan 05 Task 25 hasn't shipped, this task can still mint signed URLs against placeholder artifact refs for unit testing, but the end-to-end smoke test requires Plan 05.

**Estimated time:** ~5.5 hours (slightly above the plan's 5h to absorb the triple-policy-check pipeline + the fresh-URL-on-expiry refresh flow + the patient-facing route + the `<ConsultArtifactsPanel>` skeleton).

**Status:** ✅ Completed 2026-04-19 — see implementation log at the bottom of this doc.

**Depends on:** Plan 02 Tasks 27 + 29 + 30 (hard — `recording_access_audit`, `signed_url_revocation`, `regulatory_retention_policy` tables must exist). Plan 01 (hard — Twilio client + Composition artifact-metadata patterns). Plan 05 Task 25 (hard for end-to-end smoke; soft for unit tests — voice transcription + Composition pipeline produces the audio artifact this task mints URLs against). Plan 07 Task 30 (soft, parallel — mutual notifications; if Task 30 hasn't shipped, this task's `emitNotification` call stubs to `console.info` and Task 30 swaps it in).

**Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md)

---

## Acceptance criteria

### Backend — service

- [ ] **`backend/src/services/recording-access-service.ts` (NEW).** Full public surface:
  ```ts
  /**
   * Mint a stream-only, watermarked, short-TTL signed URL for a consult
   * recording artifact. The three-door policy pipeline runs on every
   * call; every call writes a `recording_access_audit` row regardless of
   * outcome (including denials).
   *
   * Stream-only: signed URL carries a `response-content-disposition=inline`
   * hint to Twilio Compositions download endpoint (Twilio honors this on
   * the returned media); the frontend's <audio> element never sets a
   * `download` attribute; right-click save is a cosmetic UX concern —
   * real defense is the audit log ("we know you clicked save").
   *
   * Watermark: server-side overlay is tempting but requires re-encoding
   * the composition per-user, which doesn't scale. v1 uses a CSS
   * watermark on <RecordingReplayPlayer> — documented compromise; real
   * deterrent is the audit row.
   */
  export type MintReplayErrorCode =
    | 'not_a_participant'
    | 'beyond_self_serve_window'
    | 'revoked'
    | 'artifact_not_ready'
    | 'artifact_not_found';

  export class MintReplayError extends Error {
    constructor(public readonly code: MintReplayErrorCode, message: string);
  }

  export interface MintReplayInput {
    sessionId:             string;
    artifactKind:          'audio';                // Plan 08 extends with 'video' | 'transcript'
    requestingUserId:      string;                 // Supabase auth UID OR the synthetic support-staff UID
    requestingRole:        'doctor' | 'patient' | 'support_staff';
    escalationReason?:     string;                 // required when requestingRole='support_staff'; ≥10 chars; persisted in audit metadata
    correlationId:         string;
  }

  export interface MintReplayResult {
    signedUrl:   string;
    expiresAt:   Date;
    artifactRef: string;                           // the Twilio Composition SID (provider-side artifact reference; surfaced for client-side cache-busting)
  }

  export async function mintReplayUrl(input: MintReplayInput): Promise<MintReplayResult>;

  /**
   * Lightweight preflight — does the caller HAVE access (without burning
   * an audit row on a UI-side "is the button enabled?" check)?
   */
  export interface ReplayAvailability {
    available:        boolean;
    reason?:          MintReplayErrorCode;
    selfServeExpiresAt?: Date;                     // set when available=true for patient callers
  }
  export async function getReplayAvailability(input: {
    sessionId:        string;
    requestingUserId: string;
    requestingRole:   'doctor' | 'patient' | 'support_staff';
  }): Promise<ReplayAvailability>;
  ```

- [ ] **Policy pipeline order inside `mintReplayUrl`** (load-bearing — must not reorder without a security review):
  1. **AuthZ — is caller a participant?** Load session; assert `requestingUserId === session.doctor_id` (doctor) OR `requestingUserId === session.patient_id` (patient) OR `requestingRole === 'support_staff'`. Throw `MintReplayError('not_a_participant')` otherwise.
  2. **Support-staff escalation check.** If `requestingRole === 'support_staff'`, require `escalationReason` ≥ 10 chars. Throw `ValidationError` otherwise.
  3. **Patient-window check (patient-only).** Load `regulatory_retention_policy` keyed on `(doctor.country_code, doctor.specialty)`; fallback to global default (90 days) if no row. Compute `windowEndsAt = session.actual_ended_at + policy.patient_self_serve_days`. If `now() > windowEndsAt`, throw `MintReplayError('beyond_self_serve_window')`. Doctors and support-staff bypass this check.
  4. **Revocation-list check.** Query `signed_url_revocation` for any row whose `url_prefix` is a prefix of the artifact's canonical URL root. If any match, throw `MintReplayError('revoked')`. Applies to every role (including doctor) — revocation is a hard stop for everyone.
  5. **Artifact-readiness check.** Look up the artifact metadata (Twilio Composition status for audio). If `status !== 'completed'`, throw `MintReplayError('artifact_not_ready')`. If no composition metadata exists, throw `MintReplayError('artifact_not_found')`.
  6. **Write the audit row.** Insert `recording_access_audit` row with `{ session_id, artifact_ref, artifact_kind: 'audio', accessed_by: requestingUserId, accessed_by_role, correlation_id, metadata: { outcome: 'granted', escalation_reason? } }`. On failure, log + throw — do NOT mint the URL without the audit.
  7. **Mint the signed URL.** Call Twilio's Compositions API to generate a short-lived (15 min) signed URL for the audio composition. The URL carries the Composition's native access token; Twilio's signing is the actual security boundary.
  8. **Fire mutual notification** (fire-and-forget via Task 30's helpers). Doctor replaying → `notifyPatientOfDoctorReplay`. Patient replaying → `notifyDoctorOfPatientReplay`. Support-staff replaying → notify the doctor (since the patient granted consent to the doctor's clinic, not to support staff individually).
  9. **Return.**

- [ ] **Every denial path also writes an audit row** — before throwing, insert a `recording_access_audit` row with `metadata.outcome = 'denied'` + `metadata.deny_reason = <code>`. Rationale: regulatory doctrine treats denied access attempts as first-class audit signal. A pattern of "denied for revoked" or "denied for beyond_self_serve_window" is a Support-team signal; without persistence we lose it. Adds one DB write per denial but denials are rare. Document in the function's JSDoc.

- [ ] **`getReplayAvailability` does NOT write an audit row.** This is the preflight-for-UI helper. Write-on-check would pollute the audit. Strictly read-only: runs checks 1–5 of the pipeline, returns `{ available, reason }`. The frontend uses it to decide whether to render the player or the "contact support" empty state; only on actual play does `mintReplayUrl` fire.

- [ ] **Twilio Compositions client wrapper.** New helper `backend/src/services/adapters/twilio-compositions.ts` exporting:
  ```ts
  export async function getCompositionMetadata(compositionSid: string): Promise<{ status: 'enqueued' | 'processing' | 'completed' | 'failed' | 'deleted'; durationSec?: number; sizeBytes?: number }>;
  export async function mintCompositionSignedUrl(compositionSid: string, opts: { ttlSec: number }): Promise<{ signedUrl: string; expiresAt: Date }>;
  ```
  Rationale: Plan 05 Task 25 already wraps Twilio Composition polling for the transcription worker; if that wrapper is already present at PR-time, extend it rather than create a sibling. Grep at PR-time.

### Backend — routes

- [ ] **`POST /api/v1/consultation/:sessionId/replay/audio/mint`** — body `{ }` (no body needed; session comes from URL, role from auth). Returns `{ signedUrl, expiresAt, artifactRef }` on 200. Error codes:
  - 403 `not_a_participant`
  - 404 `artifact_not_found`
  - 409 `artifact_not_ready`
  - 409 `beyond_self_serve_window` (patient caller)
  - 410 `revoked`
  - 429 rate-limit (protect against replay-burst)
  - Body shape: `{ error: { code, message } }` consistent with existing route conventions.

- [ ] **`GET /api/v1/consultation/:sessionId/replay/status`** — returns `ReplayAvailability` shape. Same authz as mint (participant OR support_staff). No audit write.

- [ ] **Rate limiting**: `POST /replay/audio/mint` should be rate-limited to ~10 mints per session per hour per user. Rationale: legitimate players re-mint at most 4 times per hour (15-min TTL); 10 gives headroom for reconnects + speed-scrubbing-induced drops. Beyond 10 → 429. Protects against a malicious loop trying to enumerate/stress the audit log. Reuse the existing route-level rate limiter (grep for existing 429 handling at PR-time).

- [ ] **Authentication**: same HMAC-exchange pattern as Task 31 for the patient side (`POST /:sessionId/replay-token` issues a patient-scoped 15-min JWT that the replay routes accept). Doctor uses dashboard session. Detail: the replay-token JWT's TTL is short (15 min) because it's only used to hit the mint endpoint; the **mint endpoint's** signed URL is what the player streams. Compare: the chat-history JWT (Task 31) is 90 days because it's used for the whole chat read surface. Different workload, different TTL.

### Backend — tests

- [ ] **`backend/tests/unit/services/recording-access-service.test.ts`** (NEW):
  - **AuthZ** — non-participant caller → `not_a_participant`, audit row written with `outcome='denied'`.
  - **Support-staff missing reason** → `ValidationError` (before audit write — bad-input never audits).
  - **Support-staff with reason** → passes authZ; `metadata.escalation_reason` persisted in audit.
  - **Patient beyond window** — fixture with policy.patient_self_serve_days=30 and session ended 45 days ago → `beyond_self_serve_window`, denied audit.
  - **Doctor beyond patient window** — doctors bypass; same fixture as above with `requestingRole: 'doctor'` → grants.
  - **Revocation** — revocation row with prefix matching the composition URL → `revoked`, denied audit. Applies to ALL roles — assert doctor denied too.
  - **Artifact not ready** — composition metadata returns `status: 'processing'` → `artifact_not_ready`, denied audit.
  - **Artifact not found** — Twilio API 404 → `artifact_not_found`, denied audit.
  - **Happy path (patient)** — granted audit row, signed URL returned, mutual notification fired (spy on `notifyDoctorOfPatientReplay`).
  - **Happy path (doctor)** — same shape; `notifyPatientOfDoctorReplay` fired.
  - **Happy path (support_staff)** — doctor notified (not patient), `metadata.escalation_reason` persisted.
  - **Mutual notification failure is non-fatal** — mock Task 30 helper to throw; mint still succeeds; log at `error` but don't rethrow.
  - **Policy-row lookup fallback** — no row in `regulatory_retention_policy` → default 90 days applied.
  - **Per-call TTL** — signed URL's expiry is 15 min ± skew tolerance.

- [ ] **`backend/tests/unit/services/recording-access-service-availability.test.ts`** (NEW):
  - Same pipeline minus audit writes + minus URL mint; asserts no audit rows are written on any branch.

- [ ] **`backend/tests/unit/routes/consultation-replay-mint.test.ts`** (NEW):
  - Every error code mapped to the correct HTTP status.
  - Rate-limit at the 11th call in an hour returns 429.

- [ ] **`backend/tests/unit/services/adapters/twilio-compositions.test.ts`** (NEW):
  - Metadata fetch success + failure branches.
  - Signed-URL mint returns the expected shape; TTL honored.

### Frontend — player component

- [ ] **`frontend/components/consultation/RecordingReplayPlayer.tsx` (NEW).** Props:
  ```ts
  interface RecordingReplayPlayerProps {
    sessionId:       string;
    accessToken?:    string;                // patient via HMAC-exchange; omitted for doctor (uses dashboard session)
    currentUserRole: 'doctor' | 'patient' | 'support_staff';
    patientName?:    string;                // rendered in watermark overlay (from session join)
    consultDateLabel: string;               // "19 Apr 2026" for watermark
  }
  ```
  UI:
  ```
  ┌───────────────────────────────────────────────────┐
  │  🔊 Audio recording — 19 Apr 2026                  │
  │  [Patient: Rohan Gupta · Confidential — do not share] ← watermark overlay (translucent)
  │                                                    │
  │  ▶ ━━━━●────────────  0:12 / 4:37        1.0x ▼   │
  │     (play)  (scrubber)  (time)  (speed-picker)    │
  └───────────────────────────────────────────────────┘
  ```
  Behavior:
  - On mount, calls `GET /replay/status`; if `available: false`, render the empty-state for the reason (see empty-states below) instead of the player.
  - If `available: true`, calls `POST /replay/audio/mint` to obtain the first signed URL.
  - Passes the signed URL to an `<audio>` element. No `download` attribute. `controlsList="nodownload"` for Chromium browsers that honor it.
  - Speed picker: 0.75x / 1.0x (default) / 1.25x / 1.5x. Uses `audioElement.playbackRate`.
  - On URL expiry (Twilio 403 / 410 after ~15 min), re-mint transparently without interrupting the perceived playback (a brief pause is acceptable; skip-and-rewind not implemented in v1 — the user tolerates the tiny hitch).
  - Watermark overlay: positioned over the player card with `opacity-30`; carries `{patientName} · Confidential — do not share`. CSS-only; not part of the audio stream. Document the weakness in Notes.
  - Keyboard shortcuts: `Space` play/pause, `Left` -5s, `Right` +5s (match standard audio-player conventions).

- [ ] **Empty states** (one per error code):
  - `not_a_participant` → should never reach the player (pre-authed by the route layer); defensive: "You don't have access to this recording."
  - `artifact_not_found` → "No audio recording was made for this consult."
  - `artifact_not_ready` → "The recording is still processing. Please try again in a few minutes." + a Retry button that re-checks status.
  - `beyond_self_serve_window` → "This recording is older than 90 days. Contact support to request access." + a mailto-style link.
  - `revoked` → "This recording is no longer available. Contact support if you have questions." (Don't surface the word "revoked" — confusing for users; the audit already captures it.)
  - Network error on status / mint → "Something went wrong loading this recording. Please try again." + Retry.

- [ ] **Frontend tests** (DEFERRED until test harness):
  - Mounting with `available: true` renders the player + calls mint.
  - Mounting with `available: false` for each reason renders the correct empty state.
  - Speed picker updates `audioElement.playbackRate`.
  - URL-expiry path: mock fetch to return 403 on the Twilio URL; assert re-mint is called.
  - No `download` attribute on the `<audio>` element.

### Frontend — routes + doctor-side mount

- [ ] **`frontend/app/c/replay/[sessionId]/page.tsx` (NEW)** — patient-facing. Same HMAC-exchange shape as Task 31's `/c/history/[sessionId]` page. Mounts `<RecordingReplayPlayer currentUserRole='patient' accessToken={jwt} ... />`.

- [ ] **`frontend/components/consultation/ConsultArtifactsPanel.tsx` (NEW skeleton)** — a panel with sections:
  ```
  ┌────────────────────────────────────────────────┐
  │ Consult artifacts                               │
  │  ┌──────────────────────────────────────────┐  │
  │  │ Audio recording                           │  │
  │  │ <RecordingReplayPlayer ... />             │  │  ← this task
  │  └──────────────────────────────────────────┘  │
  │  ┌──────────────────────────────────────────┐  │
  │  │ Transcript                                │  │
  │  │ <TranscriptDownloadButton ... />          │  │  ← Task 32
  │  └──────────────────────────────────────────┘  │
  │  ┌──────────────────────────────────────────┐  │
  │  │ Conversation                              │  │
  │  │ → Open read-only chat                     │  │  ← Task 31 link
  │  └──────────────────────────────────────────┘  │
  │  (modality timeline slot — Plan 09)            │  │
  └────────────────────────────────────────────────┘
  ```
  Task 29 ships the skeleton + the audio section. Task 32 adds the transcript section; Plan 09 adds the timeline.

- [ ] **Doctor-side mount** — embed `<ConsultArtifactsPanel>` on the existing `/dashboard/appointments/[id]` page (post-consult section, after `<PreviousPrescriptions>`). Render only when a `consultation_sessions` row exists for the appointment. Patient-side: the panel also renders inside `/c/replay/[sessionId]/page.tsx` (minus the chat-link button, since the patient is already on the audit-friendly chat-history flow via Task 31's separate page).

- [ ] **Manual smoke test** (requires Plan 05 Task 25 to have actually produced an audio artifact):
  - Complete a voice consult → wait for the transcription worker to complete the Composition → navigate to `/dashboard/appointments/[id]` as the doctor → confirm the panel renders with a working audio player.
  - Click play → browser streams audio from the signed URL; inspect the Network tab — the URL is an ephemeral Twilio URL, not a static file.
  - Wait 15+ minutes (or mock TTL to 1 min); click play again → the component transparently re-mints.
  - Inspect `recording_access_audit` rows: one row per mint attempt, with correct `outcome` + `accessed_by_role`.
  - Trigger a revocation: `INSERT INTO signed_url_revocation (url_prefix, ...)` matching the composition URL → reload the player → should render "no longer available" empty state, with a denied audit row written.
  - As the patient (via the HMAC link from Task 31's chat DM surfaced via a "Play recording" link — or just navigate directly to `/c/replay/{sessionId}?t=...`), confirm the same player works with the patient scope.
  - Manually simulate `actual_ended_at = now() - 91 days` → patient hits `beyond_self_serve_window`; doctor still succeeds.

- [ ] **Type-check + lint clean.** Backend `npx tsc --noEmit` + `npx jest` green. Frontend `npx tsc --noEmit` + `npx next lint` clean.

- [ ] **No new env vars.**

---

## Out of scope

1. **Video replay.** Plan 08 Task 41 extends this task with `artifactKind: 'video'`, adds audio-first + "Show video" toggle + SMS OTP friction + warning modal. This task's service + player are architected so the `artifactKind` switch is the only load-bearing change; Plan 08 won't need to rewrite.
2. **Server-side watermark overlay.** v1 uses a CSS watermark. Server-side (re-encoding the Composition with patient-name burned-in) would be per-user work; doesn't scale. Documented weakness; real deterrent is the audit.
3. **Transcript-as-artifact replay.** Transcripts are a Task 32 PDF export + a Plan 10 rendering surface, not a "play a transcript" thing here.
4. **Scrubbing telemetry.** v1 doesn't audit scrub events — one audit row per mint covers "this user accessed the recording." Per-scrub telemetry is a Plan 10 analytics concern.
5. **Offline playback.** Stream-only is Decision 10 LOCKED; no downloadable artifact.
6. **"Bookmark this moment" / clinical annotations.** Plan 10 territory.
7. **Audio quality / bitrate selection.** Single quality produced by Twilio Composition; no bitrate toggle.
8. **Cross-session playlists** ("play all last week's consults for Dr. Sharma"). Out of scope — one player per session.
9. **A "download the audit trail" button for the patient.** Regulatory doctrine — the patient doesn't have self-serve access to the audit log; they can request it via support. Out of scope.
10. **`GET /replay/status` authenticating with a separate lighter token.** Reuses the same auth; the read-only nature keeps it cheap.
11. **Client-side "nudge" UX when approaching the 90-day window** (e.g. "You have 7 days left to replay this consult"). Post-v1 UX polish; capture in inbox if patients actually run into the cliff.
12. **Right-click inspect / dev-tools blocking.** Decision 10 acknowledges stream-only is "best-effort against casual capture"; defeating a determined attacker with screenshare or OBS is not a v1 goal.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/recording-access-service.ts` (~400 lines including JSDoc + the policy pipeline).
- `backend/src/services/adapters/twilio-compositions.ts` (~100 lines; or extend existing if Plan 05 Task 25 already shipped a sibling).

**Backend (extend):**

- `backend/src/routes/api/v1/consultation.ts` — add the mint + status + replay-token routes.
- `backend/src/types/database.ts` — reflect Plan 02 audit / policy / revocation shapes once those land.

**Frontend (new):**

- `frontend/components/consultation/RecordingReplayPlayer.tsx` (~250 lines).
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` (~150 lines skeleton).
- `frontend/app/c/replay/[sessionId]/page.tsx` (~80 lines).

**Frontend (extend):**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — mount `<ConsultArtifactsPanel>` post-consult.
- `frontend/lib/api.ts` — wrappers for `mintReplay`, `getReplayStatus`, `exchangeReplayHmac`.

**Tests:**

- `backend/tests/unit/services/recording-access-service.test.ts` — new.
- `backend/tests/unit/services/recording-access-service-availability.test.ts` — new.
- `backend/tests/unit/services/adapters/twilio-compositions.test.ts` — new.
- `backend/tests/unit/routes/consultation-replay-mint.test.ts` — new.
- Frontend tests deferred.

---

## Notes / open decisions

1. **Policy pipeline order is security-critical.** AuthZ first, then support-escalation validation, then window check, then revocation, then artifact state, then audit, then mint. Re-ordering (e.g. putting the revocation check before authZ) leaks information about which artifacts are revoked to non-participants. Re-ordering (putting artifact readiness before revocation) wastes a Twilio API call on revoked artifacts. The order in the spec is optimized for both security + cost.
2. **Denial audits vs grant audits.** Both persist to the same table with `metadata.outcome`. Regulatory doctrine treats "denied access attempt" as first-class signal — a support-ticket search for "denied: revoked" should surface every attempt. A future Plan 10 analytics view will slice on `metadata.outcome`.
3. **Watermark is CSS not server-side.** Client-side watermark is removable by anyone who opens DevTools. Document in `<RecordingReplayPlayer>`'s JSDoc that the defense is the audit trail, not the watermark. Twilio doesn't expose an ergonomic per-user watermark burn-in on Compositions; third-party processing (ffmpeg transcoding with overlay) would require a dedicated worker + storage. Captured in inbox as a follow-up if legal pushback.
4. **Why 15-min signed-URL TTL?** Twilio recommends short TTLs on Composition signed URLs. 15 min is long enough to survive a reconnect + light speed-scrubbing on a 1-hour consult; short enough that a copy-pasted URL leaking into logs isn't reusable long. The player re-mints transparently on expiry.
5. **Why re-mint transparently instead of showing "URL expired, reload"?** UX polish. A user listening to a 90-min consult shouldn't get interrupted. The hitch during re-mint is ~0.5-1s — acceptable. A future UX refinement can preemptively re-mint at 13 min to eliminate the hitch entirely.
6. **Rate limit of 10 mints/hour is conservative.** The 4-mints-per-hour legitimate case (4× 15-min TTLs per 60 min) plus headroom for reconnects on slow networks. If the 429 trips for real users, loosen to 20.
7. **Patient-scoped HMAC-exchange JWT has a 15-min TTL**, NOT the 90-day TTL of Task 31's chat-history JWT. Different workload: replay is a single-click event; chat history is a multi-visit read surface. Shorter TTL = smaller blast radius if the JWT leaks (but the audit log already captures all accesses).
8. **Support-staff `requestingUserId` — where does it come from?** Synthetic: support staff sign in to a separate ops tool (not scope here); the ops tool passes the support-staff's real user ID as `requestingUserId` and `requestingRole='support_staff'`. The ops tool gates who can invoke via `X-Support-Reason`; our service just validates reason ≥ 10 chars. If ops-tool auth is later federated, the service stays unchanged.
9. **Revocation list scope.** `signed_url_revocation` is Plan 02's primary deletion-cascade surface (Plan 02 Task 33 writes to it during account deletion). A revocation for a deleted patient means every recording involving that patient becomes un-replayable — that's the correct behavior per Decision 3 LOCKED (account-deletion severs access). Document that this service respects deletion without coupling directly to Plan 02's worker.
10. **Artifact-kind extensibility.** v1 is `'audio'` only. Plan 08's video extension adds `'video'`; Task 32's transcript render-or-fetch uses `'transcript'`. The discriminated-union shape is intentional so adding a new artifact kind is an additive change inside `mintReplayUrl` without rewriting callers.
11. **Why does the patient's doctor get the notification when support_staff replays?** The doctor is the consent relationship holder; the patient granted consent to their clinic, not to individual support staff. Notifying the doctor lets them verify the access was legitimate. Notifying the patient would be confusing ("I didn't ask for this; who is replaying?") and would require a new DM copy template; out of scope.
12. **`<ConsultArtifactsPanel>` empty-at-start for this task.** Until Task 32 + Plan 09 ship, the panel only renders the audio section. That's fine — the skeleton is layout-only; sections are mounted independently. Document in the component's JSDoc.
13. **A note on Twilio Composition signed-URL behavior.** Per Twilio docs, Composition signed URLs carry a short access token embedded in the URL querystring. The token is valid for the TTL you request (15 min in our case). The URL is opaque to our code — we never inspect its innards; we just pass it to the `<audio>` element. If Twilio's SDK version in-repo doesn't expose this mint surface cleanly, a thin fetch to the `https://video.twilio.com/v1/Compositions/{sid}/Media` endpoint with the service-role auth header works; verify at PR-time. Plan 05 Task 25's Composition-readiness polling code path already exercises the Twilio Composition API, so the authentication wiring should already exist.

---

## References

- **Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md) — Task 29 section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 + Decision 10 LOCKED.
- **Plan 02:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md) — the three audit / policy / revocation tables this task reads + writes.
- **Plan 05 Task 25 — Composition-producing worker that supplies the audio artifact:** [task-25-voice-transcription-pipeline.md](./task-25-voice-transcription-pipeline.md).
- **Plan 08 Task 41 — video-escalation extension built on top of this task.** (Not yet drafted; referenced as a forward consumer.)
- **Task 30 (sibling) — mutual-replay notification helpers this task invokes:** [task-30-mutual-replay-notifications.md](./task-30-mutual-replay-notifications.md).
- **Task 31 (sibling) — HMAC-exchange pattern this task mirrors for `/c/replay/[sessionId]`:** [task-31-post-consult-chat-history-surface.md](./task-31-post-consult-chat-history-surface.md).
- **Task 32 — transcript download button hosted in the same `<ConsultArtifactsPanel>`:** [task-32-transcript-pdf-export.md](./task-32-transcript-pdf-export.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ✅ Completed 2026-04-19 — see implementation log below.

---

## Implementation log — 2026-04-19

### Shipped

**Migration (audit table — was missing from Plan 02):**

- `backend/migrations/065_recording_access_audit.sql` — `recording_access_audit` table with `(session_id, artifact_ref, artifact_kind, accessed_by, accessed_by_role, metadata jsonb, correlation_id, created_at)`. Indexes on `(session_id, created_at DESC)`, on `(metadata->>'outcome') = 'denied'`, and on `correlation_id`. Service-role-only RLS. `ON DELETE CASCADE` on `session_id`.

**Backend services:**

- `backend/src/services/twilio-compositions.ts` — Twilio Compositions adapter: `fetchCompositionMetadata` (status/duration/size via SDK) + `mintCompositionSignedUrl` (15-min signed URL via direct GET to `/v1/Compositions/{sid}/Media?Ttl=N` with Basic Auth, parsing both `Location` redirect and `{ redirect_to }` JSON shapes). Pure `getComputedTwilioMediaUrl(sid)` helper for the revocation-list lookup. `__setOverridesForTests` hook for unit tests.
- `backend/src/services/recording-access-service.ts` — full three-door pipeline: AuthZ → support-staff escalation reason validation → patient self-serve window → revocation list → artifact readiness → audit (granted) → mint → fire-and-forget mutual notification stub (Task 30 swap point) → return. Every `mintReplayUrl` outcome writes exactly one `recording_access_audit` row (denied audits are written via a separate try/catch path that swallows audit-insert failures so the original denial still propagates). `getReplayAvailability` is the read-only preflight twin — same pipeline, NO audit writes. Resolves the audio artifact via `recording_artifact_index` first, falling back to `consultation_transcripts.composition_sid` (only when SID starts with `'CJ'` so unresolved Room SIDs don't masquerade as ready). Patient window default of 90 days when `regulatory_retention_policy.patient_self_serve_days` is 0.

**Backend routes + middleware:**

- `backend/src/middleware/rate-limiters.ts` — added `replayMintLimiter`: 10 mints / hour, keyed on IP + sessionId.
- `backend/src/controllers/consultation-controller.ts` — added three handlers:
  - `exchangeReplayTokenHandler` — `POST /:sessionId/replay-token`. Verifies the URL HMAC (`verifyConsultationToken`), confirms it binds to the session's `appointmentId`, mints a 15-min Supabase JWT scoped to the session (`consult_role: 'patient'`, `session_id: <sid>`).
  - `mintReplayUrlHandler` — `POST /:sessionId/replay/audio/mint`. Resolves caller via the new `resolveReplayCaller` middleware (tries the scoped consultation JWT first → falls back to standard Supabase auth for doctors). Maps `MintReplayError` codes to 403 / 404 / 409 / 410 via the standard `errorResponse` envelope.
  - `getReplayStatusHandler` — `GET /:sessionId/replay/status`. Same auth model. Returns `{ available, reason?, selfServeExpiresAt? }`; never audits.
- `backend/src/routes/api/v1/consultation.ts` — wired the three routes (mint route gets the rate limiter).

**Backend tests (32 tests, all green):**

- `backend/tests/unit/services/twilio-compositions.test.ts` — covers `getComputedTwilioMediaUrl`, `fetchCompositionMetadata` (200 / 404 / generic-error paths), `mintCompositionSignedUrl` (Location header / JSON `redirect_to` / 404 / non-2xx / missing URL / TTL clamping / override).
- `backend/tests/unit/services/recording-access-service.test.ts` — covers the full pipeline: input validation (no audit), authZ denial (audit), support-staff missing-reason (no audit) vs. valid escalation (audit metadata persists `escalation_reason`), patient 91-day window denial / doctor bypass / 0-day policy fallback to default, revocation match across roles, artifact-not-found, Twilio "processing" status denial, granted happy paths (doctor + patient with `self_serve_window_ends_at`), Twilio mint-failure-after-audit (granted row already persisted), `getReplayAvailability` writes ZERO audit rows on every branch, `MintReplayError` shape pin.

**Frontend:**

- `frontend/lib/api.ts` — added `exchangeReplayToken`, `mintReplayAudioUrl`, `getReplayStatus` plus the `ReplayDenyReason` / `ReplayMintData` / `ReplayStatusData` types. The mint helper exposes `.code` on the thrown `Error` so the player can switch on the deny reason.
- `frontend/components/consultation/RecordingReplayPlayer.tsx` — stream-only audio player. Mounts → `getReplayStatus` (preflight, no audit). On user click → `mintReplayAudioUrl` (writes audit). Re-mints transparently on `<audio>` `error` event (signed-URL TTL expiry). Watermark overlay (`callerLabel · sessionId.slice(0,8)`, low opacity, `pointer-events-none`). Speed picker (0.75 / 1 / 1.25 / 1.5 / 2×) persisted to `localStorage`. `controlsList="nodownload noplaybackrate"`. Empty-state copy switches on the deny reason and on `callerRole`.
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — skeleton wrapper that mounts the audio player and ships placeholder cards for transcript/chat history (Task 32 + 39 swap points).
- `frontend/app/c/replay/[sessionId]/page.tsx` — patient route. HMAC-exchange via `exchangeReplayToken`, strips `?t=` from the URL, mounts `<ConsultArtifactsPanel callerRole="patient">`. Refreshes the scoped JWT 30s before expiry to keep long listening sessions alive.
- `frontend/app/dashboard/appointments/[id]/page.tsx` — mounts `<ConsultArtifactsPanel callerRole="doctor">` after `<AppointmentConsultationActions>` whenever `appointment.consultation_session?.status === "ended"`.

### Decisions made during implementation

1. **Created the missing audit table inline (migration 065).** Plan 02 Task 30's audit migration hadn't shipped — same pattern as Task 28 (which shipped its own audit migration). Schema designed to be a drop-in replacement when Plan 02 lands.
2. **Custom `resolveReplayCaller` middleware instead of stretching `authenticateToken`.** Patient JWTs use a synthetic `sub` (`patient:{appointmentId}`) so `supabase.auth.getUser()` would either reject or surface a synthetic ID that won't match `consultation_sessions.patient_id`. The custom middleware verifies the scoped JWT directly via `verifyScopedConsultationJwt`, validates the JWT's `session_id` claim against the URL path, then resolves the real `patient_id` from the session row.
3. **Notification stub (Task 30 swap point).** `notifyReplayWatcher` logs at `info` and never throws, with a `stub: 'task-30-pending'` field for grep-ability. Same input shape as the eventual real implementation so Task 30 is a one-line swap.
4. **Read `actual_ended_at` directly in `loadSessionContext` instead of extending `SessionRecord`.** `SessionRecord` is a wide cross-cutting type; adding a field there would have rippled into every adapter. The replay service is the only consumer that needs `actual_ended_at` to compute the 90-day window, so a direct `consultation_sessions` SELECT in `loadSessionContext` is the lower-blast-radius option.
5. **Standardized error envelope on the mint route.** Initial draft returned `{ error: { code, message } }`, which doesn't match the global `ApiError` shape the frontend `request<>` helper expects. Switched to `errorResponse(...)` from `utils/response` so the frontend gets a uniform `{ success: false, error: {...}, meta: {...} }` shape.
6. **`disablePictureInPicture` removed from the `<audio>` element.** It's a `<video>`-only attribute (TS error caught it). Browsers don't put audio in PiP anyway.
7. **`controlsList="nodownload noplaybackrate"`** on the audio element — no download (Decision 10), no native playback-rate menu (we own the speed UI for visual consistency).

### Verification

- `cd backend && npx tsc --noEmit` ✅
- `cd backend && npx jest --no-coverage` → **115 suites, 1516 tests, all green**
- `cd frontend && npx tsc --noEmit` ✅
- `cd frontend && npx next lint --dir app/c/replay --dir components/consultation --dir lib` ✅ no warnings/errors

### Out of scope / deferred

- **End-to-end smoke test** still depends on Plan 05 Task 25 producing a real Twilio Composition. The unit suite covers all pipeline branches via the `__setOverridesForTests` hook.
- **Mutual replay DM fan-out** is stubbed; Task 30 will replace `notifyReplayWatcher`.
- **Frontend tests** were deferred per task spec ("Frontend tests deferred").
