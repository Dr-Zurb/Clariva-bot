/**
 * Consultation API Routes (e-task-3)
 *
 * POST /api/v1/consultation/start - Start video consultation (auth required)
 * GET /api/v1/consultation/token - Get Video access token (doctor: auth; patient: ?appointmentId=&token=)
 */

import { Router } from 'express';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth';
import { replayMintLimiter } from '../../../middleware/rate-limiters';
import {
  startConsultationHandler,
  getConsultationTokenHandler,
  startTextConsultationHandler,
  exchangeTextConsultTokenHandler,
  startVoiceConsultationHandler,
  exchangeVoiceConsultTokenHandler,
  resendConsultationLinkHandler,
  getRecordingConsentForSessionHandler,
  pauseRecordingHandler,
  resumeRecordingHandler,
  getRecordingStateHandler,
  exchangeReplayTokenHandler,
  mintReplayUrlHandler,
  getReplayStatusHandler,
  getVideoReplayOtpStateHandler,
  sendVideoReplayOtpHandler,
  verifyVideoReplayOtpHandler,
  exchangeChatHistoryTokenHandler,
  exchangeTranscriptTokenHandler,
  downloadTranscriptPdfHandler,
  requestVideoEscalationHandler,
  respondVideoEscalationHandler,
  getVideoEscalationStateHandler,
  patientRevokeVideoHandler,
} from '../../../controllers/consultation-controller';
import {
  modalityChangeRequestHandler,
  modalityChangeApproveHandler,
  modalityChangePatientConsentHandler,
  modalityChangeStateHandler,
  modalityChangeHistoryHandler,
} from '../../../controllers/modality-change-controller';

const router = Router();

router.post('/start', authenticateToken, startConsultationHandler);
router.get('/token', optionalAuthenticateToken, getConsultationTokenHandler);

// Plan 04 · Task 18 — text consultation entry points.
router.post('/start-text', authenticateToken, startTextConsultationHandler);
router.post('/:sessionId/text-token', exchangeTextConsultTokenHandler);

// Plan 05 · Task 24 — voice consultation entry points.
router.post('/start-voice', authenticateToken, startVoiceConsultationHandler);
router.post('/:sessionId/voice-token', exchangeVoiceConsultTokenHandler);

// Plan 05 · Task 24 — doctor-triggered resend of the patient join link
// (voice-first; works for video too).
router.post('/:sessionId/resend-link', authenticateToken, resendConsultationLinkHandler);

// Plan 02 · Task 27 — doctor-side recording-consent lookup for the
// <SessionStartBanner>.
router.get(
  '/:sessionId/recording-consent',
  authenticateToken,
  getRecordingConsentForSessionHandler
);

// Plan 07 · Task 28 — doctor-driven mid-consult recording pause/resume
// + state inspector (both-parties). Decision 4 LOCKED.
router.post(
  '/:sessionId/recording/pause',
  authenticateToken,
  pauseRecordingHandler,
);
router.post(
  '/:sessionId/recording/resume',
  authenticateToken,
  resumeRecordingHandler,
);
router.get(
  '/:sessionId/recording/state',
  authenticateToken,
  getRecordingStateHandler,
);

// Plan 07 · Task 29 — patient self-serve replay (audio-baseline).
// Decision 4 + Decision 10 LOCKED.
//
// `replay-token` is HMAC-exchange (no Authorization header — the
// patient join URL HMAC IS the proof of authority). The mint + status
// endpoints accept either a doctor's Supabase JWT OR the patient JWT
// minted here; the controllers' `resolveReplayCaller` figures out
// which one is in use.
router.post('/:sessionId/replay-token', exchangeReplayTokenHandler);
// The `audio/mint` path is historical (Task 29 ran audio-only v1);
// Plan 08 Task 44 accepts `?artifactKind=video` on the same path so
// the patient's "Show video" toggle hits a familiar URL. The path
// name is kept for backward compatibility with existing frontend
// callers; a future refactor can rename it to `replay/mint` once the
// callsite migration lands.
router.post(
  '/:sessionId/replay/audio/mint',
  replayMintLimiter,
  mintReplayUrlHandler,
);
router.get('/:sessionId/replay/status', getReplayStatusHandler);

// Plan 08 · Task 44 — patient video-replay SMS-OTP friction gate
// (Decision 10 LOCKED). All three routes require the Task-29 patient
// scoped JWT; `resolvePatientReplayCaller` rejects doctor JWTs with
// 403 `forbidden_role` because the friction protects the patient
// self-serve replay surface specifically (doctor replays have their
// own audit channel). Rate limits enforced in-service so they work
// across lambda instances; no per-route limiter is needed.
router.get(
  '/:sessionId/video-replay-otp/state',
  getVideoReplayOtpStateHandler,
);
router.post(
  '/:sessionId/video-replay-otp/send',
  sendVideoReplayOtpHandler,
);
router.post(
  '/:sessionId/video-replay-otp/verify',
  verifyVideoReplayOtpHandler,
);

// Plan 07 · Task 31 — post-consult chat-history token exchange.
// HMAC-only (no Authorization header) — the patient join URL HMAC IS the
// proof of authority. Mints a 90-day patient-scoped Supabase JWT that
// can SELECT `consultation_messages` for the session (Migration 052's
// patient-branch SELECT policy).
router.post('/:sessionId/chat-history-token', exchangeChatHistoryTokenHandler);

// Plan 07 · Task 32 — transcript PDF export.
// Token-exchange is HMAC-only (same pattern as replay-token /
// chat-history-token). The download route accepts either a doctor's
// Supabase JWT OR the patient JWT from `transcript-token`; it streams
// a 302 redirect to a short-TTL signed URL from Supabase Storage.
router.post('/:sessionId/transcript-token', exchangeTranscriptTokenHandler);
router.get('/:sessionId/transcript.pdf', downloadTranscriptPdfHandler);

// Plan 08 · Task 41 — video-recording escalation (Decision 10 LOCKED).
//
// Doctor asks to record video; patient gets a 60s consent modal; the
// server runs the rate-limit / cooldown / atomic-update state machine
// and — on allow — flips the Twilio Recording Rules via Task 43's
// `recording-track-service`.
//
// * `request`  — doctor-only (JWT.sub must equal session.doctor_id).
// * `respond`  — patient-only (JWT.sub must equal session.patient_id).
// * `state`    — either participant (doctor OR patient). Read-only.
//
// The timeout branch lives in `backend/src/workers/video-escalation-
// timeout-worker.ts`, triggered every ~5s via POST /cron/video-
// escalation-timeout. Realtime fan-out (doctor waiting view collapse,
// patient modal open/close) rides the Supabase Postgres-changes
// channel on `video_escalation_audit` — the service writes the row,
// Supabase broadcasts; no custom emit.
router.post(
  '/:sessionId/video-escalation/request',
  authenticateToken,
  requestVideoEscalationHandler,
);
router.post(
  '/video-escalation-requests/:requestId/respond',
  authenticateToken,
  respondVideoEscalationHandler,
);
router.get(
  '/:sessionId/video-escalation-state',
  authenticateToken,
  getVideoEscalationStateHandler,
);

// Plan 08 · Task 42 — patient-initiated revoke of an in-flight video
// recording (Decision 10 LOCKED safety valve). Patient-only: the
// service re-asserts the caller matches `session.patient_id` even
// though `authenticateToken` already validated the JWT. Returns 200
// with `{ status: 'revoked' | 'already_audio_only', correlationId }`
// — the idempotent shape covers the double-tap case without a
// second round-trip.
router.post(
  '/:sessionId/video-escalation/revoke',
  authenticateToken,
  patientRevokeVideoHandler,
);

// Plan 09 · Task 47 — mid-consult modality-change state machine
// (Decision 11 LOCKED). Four endpoints wire into the single-entry
// `requestModalityChange` + approve / patient-consent / state-read
// companions. All four require `authenticateToken`; the service
// re-checks the JWT's `sub` against the session's doctor/patient
// seat and returns `forbidden` on mismatch. Responses are always
// HTTP 200 with a `ModalityChangeResult` envelope on the first
// three routes — success + failure share the shape so the Task 50/
// 51/52 modals branch on `result.kind` + `result.reason`. The state
// route returns `{ state: ModalityChangeState | null }`.
router.post(
  '/:sessionId/modality-change/request',
  authenticateToken,
  modalityChangeRequestHandler,
);
router.post(
  '/:sessionId/modality-change/approve',
  authenticateToken,
  modalityChangeApproveHandler,
);
router.post(
  '/:sessionId/modality-change/patient-consent',
  authenticateToken,
  modalityChangePatientConsentHandler,
);
router.get(
  '/:sessionId/modality-change/state',
  authenticateToken,
  modalityChangeStateHandler,
);

// Plan 09 · Task 55 — post-consult modality timeline read. Returns the
// full chronological transition list + session summary for the
// `<ModalityHistoryTimeline>` on the appointment detail page.
// Participants-only (service-layer authZ + Migration 075 RLS).
router.get(
  '/:sessionId/modality-change/history',
  authenticateToken,
  modalityChangeHistoryHandler,
);

export default router;
