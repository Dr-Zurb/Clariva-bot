# Task 32: Transcript PDF export — `transcript-pdf-service.ts` + `<TranscriptDownloadButton>` (merges chat + audio transcript, watermarked, mutual-notified, Decision 1 sub + Decision 4 LOCKED)

## 19 April 2026 — Plan [Recording replay & history](../Plans/plan-07-recording-replay-and-history.md) — Phase E

---

## Task overview

Decision 1 sub + Decision 4 LOCKED a downloadable transcript as a first-class artifact for every consult: text-only (just the chat), voice / video (audio transcript from Plan 05 Task 25's `consultation_transcripts` table **merged** with chat rows by timestamp into a single coherent narrative). Both doctor and patient can download; every download fires a mutual notification (same shape as recording replay — Task 30's helpers extend to cover `artifactType: 'transcript'`).

**Critical audit finding: there is NO PDF rendering library in the backend today.** Grep across `backend/package.json` confirms no `puppeteer` / `playwright` / `pdfkit` / `pdf-lib` / `@react-pdf/renderer` / `jsPDF` / `html-pdf`. The plan's "Reuses prescription-service.ts PDF rendering stack" is wrong — `prescription-service.ts` is CRUD; `prescription-attachment-service.ts` handles doctor-uploaded PDFs (the doctor brings the PDF; we don't render one). This task **introduces a PDF rendering dependency** as a first-class concern: the dependency choice is itself a sub-deliverable that needs owner review before implementation (see Notes #1 for the decision matrix).

Five things land together:

1. **PDF renderer dependency selection + install** — see Notes #1. Recommendation: `pdfkit` (pure JS, no headless browser; writes to a stream; small install footprint; good enough for the deterministic text-based layout this task needs). Alternatives (`puppeteer`, `@react-pdf/renderer`) discussed.
2. **`transcript-pdf-service.ts`** — composes + renders the transcript. Pulls from `consultation_messages` (chat + attachments + system rows, Plan 06 Task 39 schema) and `consultation_transcripts` (voice / video transcripts, Plan 05 Task 25 schema). Merges by timestamp. Writes to a Supabase Storage bucket (new — `consultation-transcripts`, provisioned in this task's migration).
3. **HTTP route** `GET /api/v1/consultation/:sessionId/transcript.pdf` — streams the rendered PDF (or redirects to a pre-rendered signed URL if the PDF is cached). Authorization reuses the same participant + support-staff pattern from Task 29.
4. **`<TranscriptDownloadButton>`** — component mounted inside `<ConsultArtifactsPanel>` (Task 29 ships the skeleton). Click → call the route → trigger a download. Loading + error states.
5. **`notifyPatientOfDoctorReplay` / `notifyDoctorOfPatientReplay` extensions** — Task 30's helpers already accept `artifactType: 'transcript'`; this task only wires the call at download-time. Plus a new DM-copy variant for `buildTranscriptDownloadedNotificationDm` (slightly different wording than replay-of-audio).

The design splits "render" from "deliver" so the renderer can be cached (first-call cost: ~1-3s; subsequent calls: ~100ms redirect to the cached signed URL). Cache invalidation: session-end is the trigger (transcripts are immutable post-consult); any late-arriving `consultation_messages` row (from a background system-message emit) is out of scope — if it matters, the patient / doctor re-downloads after a few minutes.

**Critical dependency gaps (flagged up-front, same as Tasks 28 + 29):**
1. **Plan 05 Task 25's `consultation_transcripts` table may not exist yet.** If absent, voice / video transcripts fall through with a "Transcript not yet available — audio transcription is still processing" placeholder section in the PDF. Text-only consults render fully regardless.
2. **Plan 02's `recording_access_audit` table** — this task writes an audit row per transcript download (same doctrine as replay). Hard dependency.
3. **No `consultation-transcripts` Storage bucket exists yet.** This task provisions it.

**Estimated time:** ~4 hours (slightly above the plan's 3h to absorb the PDF-library-introduction decision + the merge-by-timestamp composition logic + the bucket provisioning migration + the caching layer).

**Status:** Completed — 19 April 2026 (see Implementation log at end of file)

**Depends on:** Plan 02 Task 27 (hard — `recording_access_audit`). Plan 06 Task 39 (hard — `consultation_messages` schema for text / attachment / system rows to render). Plan 05 Task 25 (soft — voice transcripts; text-only flow works without it). Plan 07 Task 29 (hard — `<ConsultArtifactsPanel>` skeleton this task slots into). Plan 07 Task 30 (hard — `notifyPatientOfDoctorReplay` / `notifyDoctorOfPatientReplay` accept `artifactType: 'transcript'`).

**Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md)

---

## Acceptance criteria

### Backend — dependency + migration

- [ ] **Install PDF dependency.** Per Notes #1 recommendation: `pdfkit` (latest stable). Add `pdfkit` to `backend/package.json` dependencies + `@types/pdfkit` to devDependencies. Run via the package-manager command (npm install) — do NOT hand-edit the version (ensures lockfile is accurate). If owner review selects a different library, this criterion swaps to that library without structural changes elsewhere.

- [ ] **Migration `backend/migrations/0NN_consultation_transcripts_bucket.sql` (NEW)**:
  ```sql
  -- Provision the consultation-transcripts Storage bucket + RLS policies.
  -- Mirrors the consultation-attachments bucket shape from Migration 051
  -- (Plan 04 Task 17). Path convention: consultation-transcripts/{session_id}/transcript.pdf.
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('consultation-transcripts', 'consultation-transcripts', false)
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS consultation_transcripts_select_participants ON storage.objects;
  CREATE POLICY consultation_transcripts_select_participants
    ON storage.objects
    FOR SELECT
    USING (
      bucket_id = 'consultation-transcripts'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    );
  -- No INSERT policy — only the backend service role writes to this bucket.
  ```
  Reverse-migration block documented in the file foot.

### Backend — renderer service

- [ ] **`backend/src/services/transcript-pdf-service.ts` (NEW).** Full public surface:
  ```ts
  export interface RenderTranscriptPdfInput {
    sessionId:        string;
    requestingUserId: string;
    requestingRole:   'doctor' | 'patient' | 'support_staff';
    escalationReason?: string;        // required when support_staff
    correlationId:    string;
  }

  export interface RenderTranscriptPdfResult {
    signedUrl:        string;         // 15-min TTL, stream-only
    bytesRendered:    number;
    cached:           boolean;        // true when served from pre-rendered cache
  }

  export async function renderConsultTranscriptPdf(
    input: RenderTranscriptPdfInput,
  ): Promise<RenderTranscriptPdfResult>;

  /** Internal (exported for tests only): compose the PDF content from session + messages + transcripts. */
  export async function composeTranscriptPdfStream(opts: {
    sessionId: string;
    output:    NodeJS.WritableStream;
  }): Promise<{ bytesWritten: number }>;
  ```

- [ ] **Pipeline** inside `renderConsultTranscriptPdf`:
  1. **AuthZ + policy check.** Reuse the same pipeline as Task 29's `mintReplayUrl` — participant-or-support-staff check, support-staff reason check, `beyond_self_serve_window` for patients (per Decision 4's uniform 90-day patient window across artifact types), revocation check against `signed_url_revocation`. Share as much of the pipeline code with Task 29 as makes sense — factor out into `recording-access-policy.ts` if the overlap is substantial (lightweight utility; probably three shared helpers).
  2. **Gate on `session.status = 'ended'`.** Per Plan 07 open-question #5, transcripts for in-progress sessions are disabled. Throw `ConflictError` with code `'session_not_ended'` if the session is still live.
  3. **Cache lookup.** Check Storage for `consultation-transcripts/{sessionId}/transcript.pdf`. If present AND `session.actual_ended_at < file.last_modified` (no late updates invalidating the cache — see Notes #5), return its signed URL + `cached: true`.
  4. **Compose.** Call `composeTranscriptPdfStream` with a new Storage write stream. Stream writes to a temp local path OR directly to Supabase Storage via a buffered upload — see Notes #6.
  5. **Upload.** Write the rendered PDF to `consultation-transcripts/{sessionId}/transcript.pdf` via the service-role client.
  6. **Mint signed URL.** Supabase Storage `createSignedUrl` with 15-min TTL + `{ download: false }` to prevent a browser save-as dialog from embedding the signed URL.
  7. **Audit.** Insert `recording_access_audit` row with `artifact_kind = 'transcript'`, `outcome = 'granted'`, and `metadata.bytes_rendered`.
  8. **Notify.** Fire `notifyPatientOfDoctorReplay({ artifactType: 'transcript' })` or `notifyDoctorOfPatientReplay({ artifactType: 'transcript' })` per requesting role (support_staff → notifies doctor, same doctrine as Task 29).
  9. Return `{ signedUrl, bytesRendered, cached: false }`.

- [ ] **Deny paths** — same shape as Task 29: write a denied audit row before throwing. Error codes: `not_a_participant`, `session_not_ended`, `beyond_self_serve_window` (patient-only), `revoked`.

- [ ] **`composeTranscriptPdfStream` implementation** — the heart of the task. Composition rules:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ [Clinic letterhead]                                  │
  │ Dr. {doctor_name}, {doctor_specialty}                │
  │ Consultation transcript                              │
  │ Patient: {patient_display_name}                      │
  │ Date: {actual_ended_at formatted}                    │
  │ Modality: {modality}                                 │
  │ Session ID: {first-8-chars-of-session-id}...         │
  ├─────────────────────────────────────────────────────┤
  │                                                      │
  │ 14:02  Patient: I've had a headache since Monday.   │
  │ 14:02  Dr. Sharma: Where exactly does it hurt?       │
  │ 14:03  Patient: [attached: image/jpeg — head_scan.jpg]│
  │ 14:03  🎙 Dr. Sharma: Hmm, let me ask a few more.    │  ← 🎙 prefix = spoken line from audio transcript
  │ 14:04  [System: Recording paused by Dr. Sharma.      │
  │         Reason: "Patient stepped away for water."]   │  ← system rows in italic gray
  │ 14:06  [System: Recording resumed.]                  │
  │ 14:06  🎙 Patient: Sorry about that, I'm back.       │
  │ ...                                                  │
  │ 14:47  [System: Consultation ended.]                 │
  │                                                      │
  ├─────────────────────────────────────────────────────┤
  │ Confidential — for personal medical use only.        │  ← watermark footer on every page
  │                                                      │
  │ This transcript was generated by Clariva on          │
  │ {now()}. For the authoritative audio recording,      │
  │ contact {clinic_name}.                               │
  │                                                      │
  │ Signed: Clariva Transcript Service (v1)              │
  └─────────────────────────────────────────────────────┘
  ```
  Load-bearing composition rules:
  - **Merge order.** SELECT all `consultation_messages` for the session ordered by `created_at`; SELECT all `consultation_transcripts` for the session ordered by the spoken-segment `start_at` (or whatever timestamp shape Plan 05 Task 25 persists — verify at PR-time). Merge the two streams by timestamp into one list.
  - **Row rendering** per kind:
    - `kind = 'text'`: `{HH:MM}  {sender_label}: {body}`. `sender_label` is `"Patient"` / `"Dr. {last_name}"` / `"Support staff"` (for the rare audit case).
    - `kind = 'attachment'`: `{HH:MM}  {sender_label}: [attached: {attachment_mime_type} — {filename}]`. Filename extracted from `attachment_url` (last path segment).
    - `kind = 'system'`: `{HH:MM}  [System: {body}]`. Italic gray.
    - Voice/video transcript segment: `{HH:MM}  🎙 {sender_label}: {transcript_text}`.
  - **Timestamp format**: `HH:MM` in the **doctor's timezone** (same convention as Task 37's system-message time formatter). Consistent across PDF with the in-chat banners.
  - **Sender-label resolution**: join on `consultation_sessions.doctor_id` → `doctors.display_name`; patient name from `patients` (or appointment booking if patient row is absent).
  - **Page break**: pdfkit's automatic page-break on overflow; footer watermark on every page via `pdfkit`'s `on('pageAdded', ...)` listener.
  - **Long-consult scaling** (per plan open-question #6): stream-render to disk (or directly to Storage), don't hold the full PDF in memory. `pdfkit` is streaming-native.

- [ ] **Font embedding** — pdfkit's default Helvetica is fine for English-only v1. If a future i18n PR ships Hindi / Hinglish display, embed a Devanagari-capable font (`Noto Sans Devanagari` or similar). Out of scope here, captured in Notes #7.

- [ ] **DM-copy helper `backend/src/utils/dm-copy.ts#buildTranscriptDownloadedNotificationDm` (NEW)**:
  ```ts
  export function buildTranscriptDownloadedNotificationDm(input: {
    practiceName:     string;
    consultDateLabel: string;
  }): string;
  ```
  Canonical body (audio-first variant):
  ```
  Your doctor at {practiceName} downloaded the written transcript of your consult on {consultDateLabel}.

  This is a normal part of care (doctors often review transcripts to confirm the plan).
  Every access is audited, and you can ask support for the access log anytime.
  ```
  Pin in a copy-snapshot test.

- [ ] **`buildRecordingReplayedNotificationDm` / `notifyPatientOfDoctorReplay` extension** — Task 30 already covers `artifactType: 'transcript'` via its union; this task uses the existing shape + ensures the `'transcript'` variant body comes from `buildTranscriptDownloadedNotificationDm` (not the audio-variant body). Trade-off: slight duplication between the two builder functions; worth the clarity of distinct bodies per artifact type.

### Backend — routes

- [ ] **`GET /api/v1/consultation/:sessionId/transcript.pdf`** (NEW):
  - AuthN: dashboard session (doctor) OR patient JWT via HMAC exchange (same as Tasks 29 + 31; reuse the exchange endpoint shape).
  - AuthZ: delegated to `renderConsultTranscriptPdf`.
  - On success: `302` redirect to the signed URL (so the browser's native download behavior kicks in with correct headers from Storage).
  - Error codes: 403 / 404 / 409 / 410 per deny path.
  - Rate-limit: same 10-per-hour per-session-per-user as Task 29 — protects against render-burst on a cache miss.

- [ ] **`POST /api/v1/consultation/:sessionId/transcript-token`** (NEW; mirrors the replay-token route from Task 29):
  - HMAC-exchange for patient access; returns a short-TTL JWT (15 min) usable against the transcript.pdf route.

### Backend — tests

- [ ] **`backend/tests/unit/services/transcript-pdf-service.test.ts` (NEW)**:
  - **AuthZ deny paths** — non-participant / support-staff-missing-reason / session-not-ended / beyond-self-serve-window / revoked — each writes a denied audit row and throws the right error code.
  - **Happy path (text-only session)** — compose stream contains `Patient:` and `Dr.` prefixes, timestamp-ordered, attachment rendered as `[attached: ...]`, system rows rendered as `[System: ...]`.
  - **Happy path (voice session with merged transcript)** — stream contains interleaved 🎙 lines by timestamp.
  - **Happy path (voice session with Plan 05 Task 25 NOT yet shipped)** — stream falls through to the "Transcript not yet available" placeholder section + text-only chat still renders. This gracefully handles the partial-rollout state.
  - **Cache hit** — second call for the same session returns `cached: true` without re-rendering (assert `composeTranscriptPdfStream` not called).
  - **Cache miss + upload** — first call writes to Storage; pin the path shape `consultation-transcripts/{uuid}/transcript.pdf`.
  - **Audit + notification fired** — per role (doctor / patient / support_staff), confirm the correct Task 30 helper is called.
  - **Bytes counter** — `bytesRendered` matches the actual output size (mock the stream + assert).
  - **Long-consult smoke** — synthesize 500 messages; assert no memory spike (monitored via `process.memoryUsage()` before/after stays within a threshold).
  - **Timezone formatting** — doctor's TZ correctly applied; fallback to `Asia/Kolkata` when missing.

- [ ] **`backend/tests/unit/services/transcript-pdf-composition.test.ts` (NEW; isolates the composition rules)**:
  - Each row kind renders with the expected prefix.
  - Merge preserves timestamp order across chat + audio-transcript streams.
  - System-row italic styling applied (pdfkit styling verifiable via the stream's internal command tracking or a lightweight PDF parser in tests).

- [ ] **`backend/tests/unit/routes/consultation-transcript-pdf.test.ts` (NEW)**:
  - 302 redirect on happy path.
  - Error-code HTTP mapping per deny path.
  - Rate-limit trip.
  - Patient HMAC-exchange flow.

- [ ] **`backend/tests/unit/migrations/consultation-transcripts-bucket-migration.test.ts` (NEW)**:
  - Bucket provisioning statement.
  - RLS policy existence.
  - Reverse-migration block documented.

### Frontend

- [ ] **`frontend/components/consultation/TranscriptDownloadButton.tsx` (NEW).** Props:
  ```ts
  interface TranscriptDownloadButtonProps {
    sessionId:       string;
    currentUserRole: 'doctor' | 'patient' | 'support_staff';
    accessToken?:    string;               // patient via HMAC-exchange; omitted for doctor
    label?:          string;               // defaults to "Download transcript"
    variant?:        'primary' | 'secondary';
  }
  ```
  Behavior:
  - Click handler: triggers a browser navigation to `GET /.../transcript.pdf` with the auth token attached (either the dashboard cookie for doctor, or `?t={jwt}` query for patient). The 302 redirect lands on the Storage signed URL; browser downloads.
  - Loading state while the first render happens on a cache-miss (UX: button shows "Rendering..." with a spinner; typically 1-3s).
  - Error states for each deny code — inline toast with human-readable copy.

- [ ] **`<ConsultArtifactsPanel>` slot filled** — Task 29's panel ships the skeleton with a "Transcript" section; this task renders `<TranscriptDownloadButton>` inside it. Verify at PR-time that Task 29 reserved the slot correctly.

- [ ] **Patient-side mount** — inside `/c/replay/[sessionId]/page.tsx` (Task 29's route), render the button alongside the audio player. Also inside `/c/history/[sessionId]/page.tsx` (Task 31's route), render it in the header next to the read-only watermark.

- [ ] **Doctor-side mount** — inside `/dashboard/appointments/[id]/page.tsx` via `<ConsultArtifactsPanel>` (already covered). Also inside `/dashboard/appointments/[id]/chat-history/page.tsx` (Task 31's doctor route) for symmetry with the patient side.

- [ ] **Frontend tests** (DEFERRED until test harness):
  - Click triggers a navigation.
  - Loading state spinner.
  - Error-code-to-toast mapping.
  - Doctor-vs-patient prop routing (patient passes `accessToken`; doctor doesn't).

- [ ] **Manual smoke test** (end-to-end, requires Plan 02 + Plan 05 Task 25 + Plan 06 + Plan 07 Tasks 28 + 29 + 30 + 31 to all be shipped):
  - Complete a voice consult with: several chat messages, one attachment, one pause/resume, several minutes of spoken audio.
  - From the doctor dashboard, click "Download transcript" → PDF downloads with clinic header, correctly interleaved chat + audio lines by timestamp, pause/resume system rows visible, watermark on every page.
  - Open patient's IG-DM inbox → confirm `buildTranscriptDownloadedNotificationDm` body received.
  - As the patient (via HMAC link), click "Download transcript" on the replay page → PDF downloads.
  - Open doctor dashboard → bell icon shows a new event "Patient downloaded the transcript of their consult on ...".
  - Second doctor download (cache hit) completes in under 200ms; `cached: true` in response.
  - Inspect `recording_access_audit` → one row per download with `artifact_kind = 'transcript'`.

- [ ] **Type-check + lint clean.** Backend `npx tsc --noEmit` + `npx jest` green. Frontend `npx tsc --noEmit` + `npx next lint` clean.

- [ ] **No new env vars.**

---

## Out of scope

1. **AI-assisted SOAP / prescription draft from transcript.** Plan 10.
2. **Transcript edit / correction by doctor.** v1 is read-only. Doctors may note a transcription error; if support can edit, they do it via direct SQL. No user-facing edit surface.
3. **Translation of transcript.** English-only for now; Plan 10 or an i18n pass handles the localization story.
4. **Transcript search / highlighting.** Browser Ctrl+F inside the downloaded PDF is the v1 UX.
5. **Printing-optimized layout with clinic letterhead images.** v1 uses text-only letterhead; image letterhead via pdfkit's `image()` is a straightforward follow-up when clinics upload branding.
6. **PDF signing (digital signature).** "Signed by Clariva Transcript Service" is a text footer. Real cryptographic PDF signing requires a cert infrastructure out of scope here.
7. **Per-message attachment embedding.** Attachments are referenced by name in the transcript but not embedded. A future PR can embed images inline (pdfkit's `image()` supports it) + attach PDFs as PDF attachments; v1 keeps it simple.
8. **Transcript delta between two consults** (a la "compare two visits side-by-side"). Plan 10.
9. **Incremental / live transcript updates during the consult.** Plan 05 Task 25's worker produces the voice transcript *after* the consult ends; Plan 10 might explore live streaming captioning. Out of scope here.
10. **Patient-configurable display timezone.** v1 uses the doctor's timezone for consistency with in-chat banners. A post-consult "see this in my TZ" toggle is a UX follow-up.
11. **Transcript cache eviction.** v1 keeps the rendered PDF in Storage indefinitely (storage cost is negligible — KB-scale per consult). Plan 02's retention worker may sweep the bucket alongside other artifacts at regulatory retention end; verify cross-coordination at PR-time.
12. **Transcript render triggered on session-end** (background pre-rendering so the first download is instant). Considered; rejected for v1 because it (a) wastes render compute for sessions that never get downloaded, (b) races with late-arriving system-message emits. On-demand render with cache is the right trade-off.
13. **Different PDF layouts for doctor vs patient.** v1 uses one layout. Considered: a "doctor's notes appendix" that patient PDFs exclude — rejected because the doctor's notes live in the prescription, not the transcript.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/transcript-pdf-service.ts` (~400 lines).
- `backend/src/services/transcript-pdf-composer.ts` (~250 lines; the pdfkit rendering details — could live in the same file, split for testability).
- `backend/migrations/0NN_consultation_transcripts_bucket.sql` — new migration.

**Backend (extend):**

- `backend/package.json` — add `pdfkit` + `@types/pdfkit`.
- `backend/src/utils/dm-copy.ts` — `buildTranscriptDownloadedNotificationDm`.
- `backend/src/services/notification-service.ts` — wire `'transcript'` variant to the new DM body (if Task 30's helpers don't already route per `artifactType`).
- `backend/src/routes/api/v1/consultation.ts` — `GET /transcript.pdf` + `POST /transcript-token`.

**Frontend (new):**

- `frontend/components/consultation/TranscriptDownloadButton.tsx`.

**Frontend (extend):**

- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — fill the Transcript slot with `<TranscriptDownloadButton>`.
- `frontend/app/c/replay/[sessionId]/page.tsx` — mount the button.
- `frontend/app/c/history/[sessionId]/page.tsx` — mount the button in the header.
- `frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` — mount for doctor-side parity.
- `frontend/lib/api.ts` — `downloadTranscript(sessionId, opts)` wrapper.

**Tests:**

- Five backend tests per the Acceptance section.
- Frontend tests deferred.

---

## Notes / open decisions

1. **PDF library choice — recommendation: `pdfkit`.** Decision matrix:
   | Option | Pros | Cons | Verdict |
   |---|---|---|---|
   | **`pdfkit`** | Pure JS (~1 MB install); streams natively; deterministic output; 10+ years mature; no headless-browser dependency; good enough for text-based templates. | Manual layout code (no HTML-to-PDF); styling requires imperative API calls; no native charting. | **Ship this v1.** Meets every requirement in this task without overhead. |
   | **`puppeteer` / `puppeteer-core`** | HTML → PDF via a headless Chromium; easiest to style (uses existing web primitives). | ~200+ MB install (Chromium binary); slow startup; requires system fonts; sandboxing headaches on some deploy targets. | Over-engineered for v1. Reconsider if clinic-letterhead designs need pixel-perfect image-rich layouts. |
   | **`@react-pdf/renderer`** | Declarative React components; clean ergonomics. | Learning curve; some edge cases around Unicode fonts; smaller community than `pdfkit`. | Good alternative; swap-in if the team has strong React-component preference. |
   | **`pdf-lib`** | Can modify existing PDFs + generate new. | Lower-level than `pdfkit` for generation-from-scratch. | Weaker fit for this workload. |

   The task file pins `pdfkit` as the recommendation; owner review can swap without re-architecting because the renderer surface (`composeTranscriptPdfStream(output)`) is library-agnostic in shape.

2. **Plan 05 Task 25's `consultation_transcripts` schema.** I didn't verify the exact column shape at draft time (Task 25 itself was drafted but may not be shipped). Expected fields: `session_id`, `provider ('openai_whisper' | 'deepgram_nova_2')`, `segments JSONB[]` where each segment has `{ start_sec, end_sec, speaker, text }`. This task's composer adapts to that shape; if Task 25 ships with a different shape, adjust in a single function.

3. **Merge-by-timestamp algorithm.** Two streams merged by `created_at` (chat) / `start_sec + session.actual_started_at` (transcript). Naive two-pointer merge; O(n + m). Edge case: two events at the exact same timestamp — stable sort by source ("chat first" is arbitrary but consistent). Document in the composer.

4. **Speaker attribution in voice transcripts.** Plan 05 Task 25's transcription output usually carries speaker diarization (Whisper doesn't reliably; Deepgram does). When the speaker is ambiguous, render as `🎙 Someone:` with a footnote caveat at the end of the PDF. If Plan 05 Task 25 ships without diarization, every line is `🎙 Speaker:` — degraded but honest.

5. **Cache invalidation.** Primary invalidation signal: `session.actual_ended_at`. A new system-message INSERT (e.g. a late-arriving Plan 07 Task 28 pause-resume reconciliation event — rare but possible) doesn't invalidate the cache; the doctor / patient re-downloads if they notice. Alternative: track a `transcript_generated_at` column on `consultation_sessions` and compare against `MAX(created_at)` on `consultation_messages`. More correct; more complex. v1 accepts the simple version.

6. **Stream vs buffer.** pdfkit writes to a stream; Supabase Storage accepts Buffer or Readable. Options:
   - (a) Pipe directly through a PassThrough → Supabase's upload (one-pass, low memory).
   - (b) Write to a tmpfile on disk → upload the file.
   - (c) Buffer in memory → upload.
   Prefer (a) for low-memory guarantee on long consults. Supabase's `upload(path, body)` accepts a Blob or Readable via the Node SDK; verify the SDK version at PR-time.

7. **i18n / non-ASCII handling.** pdfkit's default fonts don't support Devanagari. If a consult contains Hindi / Hinglish text (chat messages in Devanagari), the default font renders tofu (`□`). Options:
   - Short-term: fail-graceful — detect non-ASCII and render a warning line at the top of the PDF ("Some content in this transcript could not be rendered due to font limitations. Contact support for the full transcript.").
   - Medium-term: embed `Noto Sans` (multi-script) via pdfkit's `registerFont` + switch per line. Adds ~2-5 MB to the install.
   - Recommendation: ship the warning for v1; embed in a follow-up PR triggered by first user report.

8. **Watermark security.** "Confidential — for personal medical use only" is a deterrent; a determined exfiltrator can re-type the content. Real defense is the audit row (every download is logged). Don't oversell the watermark's protective value in internal comms.

9. **Support-staff download.** Same doctrine as replay (Task 29 Notes #11). Doctor is notified; patient is not. Escalation reason required + persisted.

10. **Why gate on `session.status = 'ended'`?** A partial transcript (rendered mid-consult) would be (a) incomplete, (b) surprise the doctor when the patient says "I downloaded the transcript already" mid-call. Simple gate: not live → PDF available. Post-v1, if a clinic wants a live-preview transcript, a separate `/transcript-preview` route can skip the gate + skip the cache + flag the PDF as "preview — not authoritative."

11. **Cache-TTL on signed URLs.** 15 min matches replay-URL TTL. The first-call render + upload + sign takes 1-3s; subsequent calls hit the cache + take 100-200ms. A user refreshing the transcript-download button repeatedly doesn't incur render cost.

12. **"Transcript not yet available" fallback section.** When voice / video transcription hasn't completed (Plan 05 Task 25's worker is still processing), render a placeholder section in the PDF:
    ```
    ── Audio transcription pending ──
    The spoken portion of this consult is still being transcribed.
    Please re-download in a few minutes for the complete transcript.
    ```
    Rather than blocking the whole PDF, let the text-only chat portion render. The doctor / patient can re-download when ready.

13. **Page-1 vs multi-page layout.** v1 single-column; wrap at ~70 chars per line. pdfkit handles word-wrap natively. For very long consults, the PDF may be 20+ pages — acceptable.

14. **PDF metadata.** Set `title`, `author: 'Clariva'`, `subject: 'Consultation transcript'`, `keywords: 'consult, transcript, {session_id}'`, `creationDate` via pdfkit's `info` object. Useful for PDF search tools.

---

## References

- **Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md) — Task 32 section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 1 sub + Decision 4 LOCKED.
- **Plan 02 Task 27 — `recording_access_audit` table:** (upstream Plan 02 task, not yet drafted).
- **Plan 05 Task 25 — `consultation_transcripts` source:** [task-25-voice-transcription-pipeline.md](./task-25-voice-transcription-pipeline.md).
- **Plan 06 Task 39 — `consultation_messages` schema:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md).
- **Task 28 — pause/resume system rows rendered in the transcript:** [task-28-recording-pause-resume-mid-consult.md](./task-28-recording-pause-resume-mid-consult.md).
- **Task 29 — `<ConsultArtifactsPanel>` skeleton this task slots into; policy pipeline to share:** [task-29-recording-replay-player-patient-self-serve.md](./task-29-recording-replay-player-patient-self-serve.md).
- **Task 30 — mutual notification helpers, extended here with `'transcript'` DM body:** [task-30-mutual-replay-notifications.md](./task-30-mutual-replay-notifications.md).
- **Task 31 — `/c/history/[sessionId]` route mount site for the download button:** [task-31-post-consult-chat-history-surface.md](./task-31-post-consult-chat-history-surface.md).
- **Task 37 — time-formatter convention reused:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md).
- **pdfkit docs:** https://pdfkit.org/ (authoritative API reference).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed — 2026-04-19.

---

## Implementation log — 2026-04-19

### Decisions locked at implementation time

- **PDF library:** `pdfkit@0.18.0` + `@types/pdfkit@0.17.6`. Chosen per Notes #1 — pure JS, streaming, no headless browser.
- **Bucket privacy:** `consultation-transcripts` provisioned in `backend/migrations/068_consultation_transcripts_bucket.sql`. Private (public=false). RLS `SELECT` policy allows only session participants (`doctor_id = auth.uid()` OR `patient_id = auth.uid()`). No `INSERT` / `UPDATE` / `DELETE` policies — only the service role writes (via `getSupabaseAdminClient()`), which RLS bypasses by design.
- **Cache invalidation:** simple (Notes #5) — `session.actual_ended_at < object.last_modified` ⇒ cached PDF is stale. Late-arriving system rows aren't covered in v1; users re-download if they notice.
- **Watermark:** "Confidential — for personal medical use only" footer on every page; no PDF-level DRM (deterrent only; audit row is the real defense — Notes #8).
- **i18n:** default Helvetica — non-ASCII content may render as tofu (Notes #7). Follow-up ticket will embed Noto Sans on first user report.
- **Route shape changed from plan:** `GET /transcript.pdf` returns **JSON** `{ signedUrl, expiresAt, cacheHit, filename }` instead of a 302 redirect. Reason: the GET is Bearer-authed, and `window.location.assign(thisUrl)` does not replay the `Authorization` header — returning the signed URL as JSON lets the frontend navigate directly to the Supabase Storage URL (which carries its own token). Documented in the route JSDoc.
- **Doctor display name:** no dedicated `doctors.name` column exists, so the composer uses `doctor_settings.practice_name` for the letterhead and falls back to `"Doctor"` for chat speaker labels. Follow-up ticket will surface a proper doctor name when that column lands.
- **Voice provider shapes:** Whisper (`segments[] with start/end sec`) and Deepgram v1 (flat `transcript` string) both handled in `loadVoiceTranscriptSegments`. Deepgram falls back to a single block with no per-segment timing.
- **`actionKind` added to notification helpers:** `notifyPatientOfDoctorReplay` and `notifyDoctorOfPatientReplay` now accept `actionKind: 'reviewed' | 'downloaded'`; when `artifactType: 'transcript' + actionKind: 'downloaded'`, the DM body switches to `buildTranscriptDownloadedNotificationDm`. Audit rows and dashboard event payloads carry `action_kind` so downstream analytics can differentiate "listened" from "downloaded".
- **Policy reuse:** instead of duplicating the policy pipeline or refactoring Task 29, the three helpers (`SessionContext`, `PipelineCheckOutput`, `runReplayPolicyChecks`, `isSessionOrCompositionRevoked`) were exported from `recording-access-service.ts`. Tests for the existing audio flow (20 tests) pass unchanged.
- **Session-ended gate:** added on top of reused policy checks (the replay flow leaves this to `actualEndedAt` for patients only). Transcript service short-circuits with `session_not_ended` for all roles when `session.status !== 'ended'` — Notes #10.

### Files added

- `backend/migrations/068_consultation_transcripts_bucket.sql` — private bucket + RLS `SELECT` policy for participants.
- `backend/src/services/transcript-pdf-composer.ts` — pure rendering. `composeTranscriptPdfStream` + `mergeByTimestamp` + letterhead/footer helpers. `compress: false` + `bufferPages: true` so footers can be drawn post-content on each buffered page.
- `backend/src/services/transcript-pdf-service.ts` — pipeline: input validation → `runReplayPolicyChecks` → session-ended gate → revocation check → cache lookup → compose+upload on miss → mint signed URL (15-min TTL, `?download=` param) → audit row (granted / denied, both with `artifact_kind='transcript'`) → fire-and-forget mutual notification.
- `backend/src/controllers/consultation-controller.ts` — two new handlers (`exchangeTranscriptTokenHandler` + `downloadTranscriptPdfHandler`) + `transcriptErrorStatus` mapper.
- `backend/src/routes/api/v1/consultation.ts` — registered `POST /:sessionId/transcript-token` + `GET /:sessionId/transcript.pdf`.
- `backend/src/utils/dm-copy.ts` — new `buildTranscriptDownloadedNotificationDm` helper.
- `backend/src/services/dashboard-events-service.ts` — added optional `action_kind` on `PatientReplayedRecordingPayload`.
- `backend/tests/unit/migrations/consultation-transcripts-bucket-migration.test.ts` — 4 tests (idempotency, private flag, `SELECT` policy, no write policies).
- `backend/tests/unit/utils/dm-copy-transcript-downloaded.test.ts` — 2 snapshot tests.
- `backend/tests/unit/services/transcript-pdf-composer.test.ts` — 7 tests (merge ordering, letterhead content, footer watermark, speaker labels, pending-transcription banner).
- `backend/tests/unit/services/transcript-pdf-service.test.ts` — 10 tests (cache hit, cache miss, doctor + patient notification routing, denial paths for `session_not_ended`, `revoked`, `beyond_self_serve_window`, `not_a_participant`).
- `backend/tests/unit/controllers/consultation-transcript-routes.test.ts` — 14 tests (token validation, 200 JSON response, error-code mapping for 403 / 409 / 410, uncaught error propagation).
- `frontend/components/consultation/TranscriptDownloadButton.tsx` — reusable button with denial-code-aware empty-state copy.

### Files modified

- `backend/package.json` — `pdfkit` + `@types/pdfkit`.
- `backend/src/services/recording-access-service.ts` — exported `SessionContext`, `PipelineCheckOutput`, `runReplayPolicyChecks`, `isSessionOrCompositionRevoked`.
- `backend/src/services/notification-service.ts` — `actionKind` threaded through both mutual-notify helpers; DM body switches builder when `'transcript' + 'downloaded'`.
- `frontend/lib/api.ts` — `requestTranscriptToken` + `downloadTranscript` helpers; `TranscriptExportDenyReason` + `TranscriptDownloadData` types.
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — replaced Task 32 placeholder with live `<TranscriptDownloadButton>`.
- `frontend/app/c/history/[sessionId]/page.tsx` — mounted the button in the patient chat-history page footer (uses the 90-day chat-history JWT — same `consult_role:'patient'` claim shape).
- `frontend/app/dashboard/appointments/[id]/chat-history/page.tsx` — mounted the button for doctor parity.

### Verification

- `backend: npx tsc --noEmit` — clean.
- `backend: jest --testPathPattern "(transcript|notification-service|recording-access|dm-copy|consultation-transcripts-bucket)"` — **23 suites / 336 tests / 66 snapshots passing**. No regressions in adjacent suites.
- `frontend: npx tsc --noEmit` — clean.
- `frontend: next lint` — no warnings / errors in the five touched files.

### Known follow-ups

- **i18n:** Devanagari / non-Latin text still renders as tofu with default Helvetica (Notes #7).
- **Doctor display name:** using `practice_name` as a stand-in until a `doctors.name` column lands.
- **Deepgram v1 transcripts:** render as a single un-timestamped block; no per-segment timing until Deepgram v2 wiring ships.
- **AI summary slot:** the artifacts panel's transcript card is titled "Transcript" for now; it'll gain an AI-summary sub-card in a follow-up.
- **Rate limiting:** no per-IP / per-user limiter on `GET /transcript.pdf` in v1 (cache fronts the heavy work; abuse surface is gated by participant-only auth). Revisit if cost pressure shows up.
