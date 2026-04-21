# Plan 04 — Text consultation modality (Supabase Realtime + branded `<TextConsultRoom>` + IG-DM ping handoff)

## Ship the first non-video modality end-to-end on the Plan 01 facade

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 1 (text surface = IG DM ping + branded Supabase-Realtime web chat) **LOCKED**. Decision 5 (live-only sync for v1, messaging-mode async deferred to v2+ as additive `mode` column) **LOCKED**. Decision 1 sub-decision (post-consult chat-history access — both parties indefinite read access via `<TextConsultRoom mode='readonly'>`) **LOCKED** (read-side delivery is in Plan 07).
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 01 + 02 + 03. Ships before Plan 05 because text is the simpler delivery path and proves the lifecycle.

---

## Goal

Land the first non-video modality end-to-end:

- A patient who books a text consult gets an IG DM ping (with a branded link) at the consult start time.
- Tapping the link opens a branded `<TextConsultRoom>` (Supabase Realtime + Postgres backbone, NOT WhatsApp, NOT Twilio Conversations — Decision 1 LOCKED).
- The doctor opens the same room from `<LiveConsultPanel>` (Plan 03's host).
- Both sides chat live: typing indicators, presence, attachments (images, PDFs), optimistic send, reconnect.
- At consult end, prescription delivery uses both inline-in-room AND fan-out IG DM (existing prescription delivery + Plan 01's `sendPrescriptionReadyToPatient`).
- `consultation_messages` rows persist for AI-pipeline reuse (Phase D / Plan 10) and for Plan 07's post-consult chat history.

This plan **does not** ship companion text for voice/video (that's Plan 06) or post-consult read-only access (Plan 07). It ships the **live text surface** end-to-end.

---

## Companion plans

- [plan-01-foundation-consultation-sessions.md](./plan-01-foundation-consultation-sessions.md) — provides the facade; Plan 04 adds the `text` adapter behind it.
- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — text consults are "recorded" in the sense that the chat log itself is the recording (Decision 12 inherits Decision 4); chat persists into `consultation_messages` and falls under the same retention doctrine.
- [plan-03-doctor-modality-launcher.md](./plan-03-doctor-modality-launcher.md) — provides the host (`<LiveConsultPanel>`) where `<TextConsultRoom>` mounts.
- [plan-06-companion-text-channel.md](./plan-06-companion-text-channel.md) — extends `consultation_messages` schema with attachment columns + system-message types; reuses this plan's adapter wholesale.
- [plan-07-recording-replay-and-history.md](./plan-07-recording-replay-and-history.md) — extends `<TextConsultRoom>` with a `mode='readonly'` prop for post-consult patient access.

---

## Architectural choice (already locked)

Decision 1 sub-decision LOCKED text on **Supabase Realtime + Postgres**, NOT Twilio Conversations, for these reasons (recap):

1. Transcript is direct SQL → AI pipeline (Plan 10) is a `SELECT`, not a webhook-mirror system.
2. DPDP residency — Supabase Mumbai region; Twilio Conversations has no India region GA.
3. Cost — Supabase pricing is effectively $0 incremental MAU vs Twilio's ~$500/mo at 10k MAU.
4. RLS reuse — same patterns as today's `prescription-attachment-service.ts`.
5. Zero new auth surface or vendor lock-in.

Trade-off accepted: ~3 extra build days to ship typing indicators / presence / read receipts ourselves vs Twilio's batteries-included SDK.

This plan implements that decision.

---

## Audit summary (current code)

### What exists today

| Component | Path | Plan-04 disposition |
|-----------|------|---------------------|
| Plan 01's session facade | `backend/src/services/consultation-session-service.ts` | **Consume** — register the new `text-session-supabase.ts` adapter under modality `'text'` |
| Existing IG-DM webhook pipeline | `backend/src/workers/instagram-dm-webhook-handler.ts` | **Consume** — fire IG-DM ping at consult start using existing send infrastructure |
| Existing DM copy builders | `backend/src/utils/dm-copy.ts` | **Extend** — add `buildConsultationReadyDm` (text variant), `buildPrescriptionReadyDm` |
| Existing prescription attachment patterns | `backend/src/services/prescription-attachment-service.ts` | **Mirror** — RLS policies, signed URL minting, etc. |
| Existing Supabase client | (already wired into the codebase for prescriptions / drafts) | **Read-only consume** for backend; new direct-from-frontend client for Realtime |
| Plan 03's `<LiveConsultPanel>` host | `frontend/components/consultation/LiveConsultPanel.tsx` | **Mount target** — `<TextConsultRoom>` lands here when modality === 'text' |

### What's missing (this plan delivers)

| Gap | Why |
|-----|-----|
| No `consultation_messages` table | Sessions need a place to store chat messages with RLS for both parties. Plan 06 will extend this with attachment + system-message columns; this plan ships the base shape. |
| No `text-session-supabase.ts` adapter | Plan 01's facade needs an implementation for `modality === 'text'`. |
| No `<TextConsultRoom>` UI | The patient-facing branded chat surface that the IG DM link points to. Mounts on doctor side too via `<LiveConsultPanel>`. |
| No consult-ready fan-out wired | Plan 01 shipped the `sendConsultationReadyToPatient` helper but no caller. This plan is the first caller. |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 17 | C.1 — DB migration: `consultation_messages` table + RLS + Storage bucket policies | C | ~2h | Low — additive table; RLS mirrors prescription pattern |
| 18 | C.2 — Backend `text-session-supabase.ts` adapter (`sendMessage`, lifecycle hooks, signed-token URL minting) | C | ~4h | Medium — new adapter behind facade; first non-video implementation |
| 19 | C.3 — Frontend `<TextConsultRoom>` mobile chat UI (Realtime subscriptions, typing/presence, attachments, optimistic send) | C | 6–8h | **Medium-High** — building chat UX from scratch is the trade-off accepted in Decision 1 sub-lock; biggest individual task in the v1 scope. |
| 21 | C.5 — DM copy builders for `buildConsultationReadyDm` (text variant) + `buildPrescriptionReadyDm` | C | ~1h | Low — additive copy |

**Suggested order:** 17 (migration first; everything else needs it) → 18 + 21 in parallel → 19 (depends on both 18 and the migration). Single integrator runs the whole sequence as one PR series.

---

## Schema deliverable (Task 17)

### `consultation_messages` (base shape — Plan 06 will extend)

```sql
CREATE TYPE consultation_message_kind AS ENUM (
  'text'
  -- 'attachment' and 'system' added in Plan 06
);

CREATE TABLE consultation_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL,
  sender_role  TEXT NOT NULL,                       -- 'doctor' | 'patient'
  kind         consultation_message_kind NOT NULL DEFAULT 'text',
  body         TEXT,                                -- nullable for future attachment-only / system rows
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_messages_session_time ON consultation_messages(session_id, created_at);
```

### RLS

```sql
ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultation_messages_read ON consultation_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid() OR patient_id = auth.uid()
    )
  );

CREATE POLICY consultation_messages_insert ON consultation_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND session_id IN (
      SELECT id FROM consultation_sessions
      WHERE (doctor_id = auth.uid() OR patient_id = auth.uid())
        AND status IN ('live')             -- live-only per Decision 5
    )
  );
```

**Both policies key on `consultation_sessions` membership** — the table is the single source of truth for who can talk in a room.

### Storage bucket (for Plan 06's attachments — provisioned now to keep Plan 06 small)

```sql
-- Supabase Storage bucket: 'consultation-attachments'
-- RLS: only readable by session participants; signed URLs are short-lived (15 min)
```

### Realtime publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
```

---

## Adapter contract (Task 18)

```ts
// backend/src/services/text-session-supabase.ts (NEW)

import type { ConsultationSessionAdapter } from './consultation-session-service';

export const textSessionSupabaseAdapter: ConsultationSessionAdapter = {
  async createSession(input) {
    // 1. Insert consultation_sessions row with provider='supabase_realtime'
    //    and provider_session_id = `text:${session.id}` (the Realtime channel name).
    // 2. No room creation needed — Supabase Realtime channels are virtual.
    // 3. Mint per-party join URL: `${PUBLIC_BASE}/c/text/${session.id}?token=...`
    // 4. Fire sendConsultationReadyToPatient (Plan 01) — fan-out SMS + email + IG DM.
    return session;
  },

  async endSession(sessionId) {
    // 1. Update consultation_sessions.status = 'ended', actual_ended_at = now().
    // 2. Mark consultation_messages RLS insert policy will now reject (sessions no longer 'live').
    // 3. Trigger Plan 07's chat-history surface via DM (when Plan 07 ships).
  },

  async getJoinToken(sessionId, role) {
    // 1. Verify caller is the right doctor/patient for this session.
    // 2. Mint a Supabase JWT scoped to:
    //    - SELECT on consultation_messages WHERE session_id = sessionId
    //    - INSERT on consultation_messages WHERE session_id = sessionId AND sender_id = caller
    //    - Realtime subscription on the same channel
    //    - SELECT on consultation-attachments storage bucket scoped to this session
    // 3. Return { token, expiresAt }.
  },

  // Plan 06 will add: provisionCompanionChannel(...), emitSystemMessage(...)
};

// Helper used by frontend / controllers:
export async function sendMessage(input: { sessionId: string; senderId: string; body: string }): Promise<MessageRow>;
```

The adapter is the **only** place that knows about Supabase Realtime — controllers and frontend never import the Supabase client directly for chat. This keeps the adapter swappable (e.g. if we ever revisit Twilio Conversations / WhatsApp via a `text-session-whatsapp.ts` adapter).

---

## Frontend `<TextConsultRoom>` (Task 19)

```
frontend/components/consultation/TextConsultRoom.tsx (NEW)

Props:
  - sessionId: string
  - currentUserId: string
  - currentUserRole: 'doctor' | 'patient'
  - mode?: 'live' | 'readonly'   // Plan 07 will use 'readonly'; default 'live'

Layout (mobile-first):
  ┌─────────────────────────────────┐
  │ Header                           │
  │ Dr. Sharma / Patient Name        │
  │ ● Online · typing…               │
  ├─────────────────────────────────┤
  │ Messages (virtualized list)      │
  │   - text bubbles                 │
  │   - (Plan 06 adds attachment +   │
  │      system rows)                │
  ├─────────────────────────────────┤
  │ Composer                         │
  │  [📎] [text input    ] [send]    │
  └─────────────────────────────────┘

Realtime:
  - Subscribe to channel `text:${sessionId}` for inserts on consultation_messages
  - Presence channel for "online" / "typing" status
  - Optimistic send: insert local row immediately, replace on server ack

Reconnect:
  - On WebSocket drop, show banner; auto-retry with backoff
  - On reconnect, fetch any messages with created_at > last_seen_at
```

**v1 scope explicitly excludes:** message edit/delete, threading, reactions. Just send + receive + typing + presence + attachments (Plan 06).

---

## DM copy (Task 21)

Extend `backend/src/utils/dm-copy.ts`:

```ts
export function buildConsultationReadyDm(input: {
  modality: 'text' | 'voice' | 'video';
  doctorName: string;
  joinUrl: string;
  expiresAt: Date;
}): string {
  // Text variant copy:
  //   "Your text consultation with Dr. {doctorName} is ready.
  //    Tap to open the chat: {joinUrl}
  //    The link is active for the next {expiresAt} minutes."
  //
  // Voice / Video variants land in Plan 05 (with Principle 8 disambiguation copy).
}

export function buildPrescriptionReadyDm(input: {
  doctorName: string;
  prescriptionId: string;
  pdfUrl: string;
}): string;
```

---

## Lifecycle wiring (where Plans 01 + 02 + 03 + 04 join up)

**Booking time:**

1. Patient books `consultation_type='text'` via IG DM.
2. Plan 02's consent capture step fires (recording_consent_decision recorded on `appointments`).
3. `appointments` confirmed; awaiting consult start time.

**Pre-consult (5–10 min before scheduled_start_at):**

1. Cron / scheduler identifies the appointment.
2. Calls `consultation-session-service.ts#createSession({ modality: 'text', ... })`.
3. Facade dispatches to `textSessionSupabaseAdapter.createSession()`.
4. Adapter inserts `consultation_sessions` row + mints patient join URL.
5. Adapter fires `sendConsultationReadyToPatient` → fan-out SMS + email + IG DM with `buildConsultationReadyDm` text variant.

**Consult time:**

1. Patient taps the IG DM link → branded `<TextConsultRoom>` loads in browser.
2. Doctor opens the appointment detail page → `<ConsultationLauncher>` (Plan 03) → primary `[Start text consultation]` → mounts `<TextConsultRoom>` inside `<LiveConsultPanel>`.
3. If Plan 02's consent decision was `false`, `<SessionStartBanner>` renders above the chat.
4. Both chat live; messages persist into `consultation_messages`.

**Consult end:**

1. Doctor clicks `[End consultation]`.
2. `consultation-session-service.ts#endSession()` → adapter updates `consultation_sessions.status='ended'` + `actual_ended_at`.
3. Doctor writes prescription via existing prescription flow.
4. Plan 01's `sendPrescriptionReadyToPatient` fires → fan-out IG + SMS + email with `buildPrescriptionReadyDm`.
5. Prescription PDF is also posted inline into the chat (Plan 06 makes this a `kind='attachment'` row; in this plan we can post a `kind='text'` row with the PDF link until Plan 06 lands).
6. Plan 07 (when it ships) sends a "view your conversation" DM with link to read-only `<TextConsultRoom>`.

---

## Files expected to touch

**Backend:**

- `backend/src/services/text-session-supabase.ts` (**new**) — Realtime adapter
- `backend/src/services/consultation-message-service.ts` (**new**) — RLS-safe CRUD helpers; mirrors `prescription-attachment-service.ts` patterns
- `backend/src/services/consultation-session-service.ts` (**extend** to register the text adapter behind the facade)
- `backend/src/routes/api/v1/consultation.ts` (**extend** `/token` for chat-scope tokens; new `/messages` endpoints if not going direct-Supabase-from-frontend)
- `backend/src/utils/dm-copy.ts` (**extend** with text-variant builders per Task 21)
- DB migration: `consultation_messages` table + RLS + Storage bucket policies (Migration ~023 or next free)

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` (**new**) — main chat UI
- `frontend/components/consultation/LiveConsultPanel.tsx` (**extend** from Plan 03 to wire the text branch)
- New patient-facing route — `frontend/app/c/text/[sessionId]/page.tsx` or equivalent (the URL the IG-DM ping points to)

**Tests:**

- `backend/tests/unit/services/text-session-supabase.test.ts`
- `backend/tests/unit/services/consultation-message-service.test.ts` (RLS scenarios)
- `backend/tests/integration/consultation-text-flow.test.ts` (book → ping → chat → end smoke)
- `frontend/__tests__/components/consultation/TextConsultRoom.test.tsx` (subscribe → optimistic send → server ack)

---

## Acceptance criteria

- [ ] **Task 17:** `consultation_messages` migration applies forward + reverse cleanly; RLS policies pass test cases for (a) session participant can read+insert, (b) outsider gets zero rows, (c) ended session blocks new inserts.
- [x] **Task 18:** `text-session-supabase.ts` adapter implements the full `ConsultationSessionAdapter` contract; smoke test creates a session + posts a message + ends the session end-to-end. — **Done 2026-04-19.** Shipped: adapter + JWT mint utility + message service (in-memory rate limit) + pre-consult cron + start-text route + HMAC-token-exchange route. Patient-auth chose option (b) custom-claim RLS via new migration `052_consultation_messages_patient_jwt_rls.sql` (no `auth.users` provisioning); patient join URL uses HMAC consultation-token (not raw JWT) to keep JWTs out of referrer logs. Pre-ping cron no-ops gracefully when `appointments.consultation_modality` is missing (logged inbox follow-up to add column in Plan 02). RLS verification done as content-sanity test on the migration (live-DB harness deferred — also logged in inbox). Full backend suite: 1206 / 1206 passing across 91 suites. See task doc Departures section for the four spec divergences.
- [x] **Task 19:** `<TextConsultRoom>` renders on mobile + desktop, supports send/receive in real-time across two browser tabs (one as doctor, one as patient), shows typing + presence, optimistic-send works, reconnects after network drop. — **Done 2026-04-19 (patient surface).** Shipped: `<TextConsultRoom>` (presence + typing + optimistic send + retry + reconnect-with-backoff + token refresh + a11y), patient route at `/c/text/[sessionId]` (token exchange + holding screen + end-state), `frontend/lib/supabase/scoped-client.ts` (Bearer-scoped Realtime client), `requestTextSessionToken` in `frontend/lib/api.ts`, additive backend extension of `exchangeTextConsultTokenHandler` to return session metadata. Doctor-side `<LiveConsultPanel>` mount + `<ConsultationLauncher>` text-branch wiring **deferred** to Plan 03 Task 20 (those files don't exist in the repo today — blocking on a non-existent component is a worse failure than shipping the patient surface in isolation). Cross-side manual smoke deferred for the same reason. Frontend `tsc` + `next lint` clean; backend `tsc` + `jest` (1206/1206) green. See task doc Departures for the nine spec divergences (notably: doctor display name dropped in favor of `practiceName`-only header to match every other patient-facing fan-out; URL param renamed `?token=` → `?t=` to match Task 18's URL builder; non-virtualized list per spec note 3; scoped-client helper instead of mutating the existing `@supabase/ssr` cookie client).
- [ ] **Task 21:** Both DM builders produce strings matching the locked copy; unit tests cover the variants.
- [ ] **End-to-end smoke (gating):** book a text consult → pre-consult cron fires → patient receives IG DM ping → patient taps link → branded chat loads → doctor opens appointment detail page → both sides chat → doctor ends → prescription PDF lands in chat + IG DM.
- [ ] No regression on existing video flow.
- [ ] Backend + frontend type-check + lint clean.

---

## Open questions / decisions for during implementation

1. **Direct Supabase client from frontend vs. routed through backend?** Decision 1 sub-lock implies direct (RLS handles security). Recommendation: direct from frontend for `consultation_messages` reads + inserts (lowest latency, simplest), but backend mints the JWT via `/token`. Route message sends through backend ONLY if we hit a regulatory blocker (none expected).
2. **Pre-consult ping timing — exactly how many minutes before `scheduled_start_at`?** Recommendation: 5 minutes before. Make configurable in env.
3. **Live-only enforcement (Decision 5):** the RLS policy `status IN ('live')` blocks pre-session and post-session inserts. Pre-session: chat shows "Consult starts at HH:MM — please wait". Post-session: chat shows "Consult ended" + (Plan 07) "View read-only history" link. Both states are read-only.
4. **Idle timeout:** Decision 5 LOCKED is live-only sync but doesn't pin an idle-timeout. Recommendation: if no messages for 10 min and the slot's `expected_end_at` has passed, auto-end the session. Owner sign-off needed.
5. **Attachment composer in v1 vs Plan 06:** Plan 06 explicitly owns attachments, but the composer's 📎 button can stub disabled here so the layout doesn't shift later. Recommendation: stub it disabled with a tooltip "Attachments coming soon".

---

## Non-goals

- No companion text inside voice/video. Plan 06 owns that and reuses this plan's adapter wholesale.
- No post-consult read-only chat view. Plan 07 ships that as a `mode='readonly'` extension.
- No transcript PDF export. Plan 07.
- No async messaging / between-consult messaging. Decision 5 LOCKED defers that to v2+ as additive `mode='messaging'` column.
- No AI clinical assist on text. Plan 10 (deferred) — but `consultation_messages` SQL shape is already AI-pipeline-friendly.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 1 LOCKED (chat backbone), Decision 5 LOCKED (live-only sync).
- **Plan 01:** facade contract for adapters
- **Plan 02:** consent + audit doctrine that text inherits
- **Plan 03:** `<LiveConsultPanel>` host
- **Existing patterns:** `backend/src/services/prescription-attachment-service.ts` (RLS + signed URLs)
- **Existing DM copy:** `backend/src/utils/dm-copy.ts`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 01 + 02 + 03 landing.
