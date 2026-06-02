# Plan 06 — Companion text channel for voice and video consults (Decision 9 delivery)

## Auto-provision an always-on chat alongside every voice and video consult; unified attachments + system messages

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 9 (companion text channel always-on for both voice and video; auto-opened, attachments live as `consultation_messages` rows, chat is a free affordance with no extra billing) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 04 + 05 (re-uses Plan 04's `consultation_messages` infra inside Plan 05's `<VoiceConsultRoom>` and the existing `<VideoRoom>`).

---

## Goal

Honor Decision 9 — every voice and video consult gets a free, always-on companion text channel — by **reusing Plan 04's text adapter** wholesale and:

- Extending `consultation_messages` schema with `attachment_url`, `attachment_mime_type`, and a `kind` enum (`'text' | 'attachment' | 'system'`).
- Adding a lifecycle hook in `consultation-session-service.ts#createSession()` that **auto-provisions** a Realtime channel for every voice/video session (not just text-modality ones).
- Auto-emitting **system messages** to the companion chat on every important lifecycle event: consult-started, recording-paused/resumed (Plan 07), party-joined, consult-ended, modality-switched (Plan 09), etc.
- Extending `<VideoRoom>` with a side panel chat (~30% width on desktop, tab switcher on mobile).
- Filling the empty visual region in Plan 05's `<VoiceConsultRoom>` with the same chat panel — but it **fills the main canvas** (since voice has no video to look at).

After this plan ships, doctors and patients on every modality see one unified message thread that they can attach files to, and that the AI pipeline (Plan 10) can read as a single coherent narrative.

---

## Companion plans

- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md) — provides the `consultation_messages` table + `text-session-supabase.ts` adapter + `<TextConsultRoom>` component that this plan **reuses** (does not re-implement) for the chat panel inside voice/video.
- [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md) — `<VoiceConsultRoom>`'s empty visual region in v1 becomes the chat-panel-fills-canvas in this plan.
- [plan-07-recording-replay-and-history.md](./plan-07-recording-replay-and-history.md) — emits the system messages this plan defines (recording-paused/resumed); transcript-PDF export reads attachments from this plan's extended schema.
- [plan-09-mid-consult-modality-switching.md](./plan-09-mid-consult-modality-switching.md) — emits "Switched from voice to video at HH:MM by Dr. Sharma" system messages via the helper this plan ships.

---

## Why this plan exists separately

A naive implementation would have hard-coded the companion chat into `<VideoRoom>` and `<VoiceConsultRoom>` directly during Plans 04+05. We don't, because:

1. **Plan 04 ships text-only first** so the chat infrastructure proves itself in isolation before we wire it into multi-modality rooms.
2. **Plans 04 + 05 stay smaller** — each is a single-modality slice.
3. **Schema extensions for attachments + system messages** are additive and land cleanly in one PR with one migration here, rather than smeared across Plans 04 + 05.
4. **The companion-chat lifecycle hook** (auto-provisioning a chat channel for voice/video sessions) is the kind of cross-cutting glue that benefits from a focused PR.

---

## Audit summary (current code, after Plans 04 + 05 land)

### What exists at start of Plan 06

| Component | Path | Plan-06 disposition |
|-----------|------|---------------------|
| `consultation_messages` table (text-only kind) | Plan 04's migration | **Extend** — add `attachment_url`, `attachment_mime_type`, `kind` enum |
| `text-session-supabase.ts` adapter | `backend/src/services/text-session-supabase.ts` | **Extend** with `provisionCompanionChannel()` + `emitSystemMessage()` helpers |
| `consultation-session-service.ts` facade | `backend/src/services/consultation-session-service.ts` | **Extend** — `createSession()` always provisions a companion channel for voice/video; the text adapter handles the text-modality case directly already |
| `<TextConsultRoom>` | Plan 04's component | **Reuse** — mounts inside `<VideoRoom>` side panel and inside `<VoiceConsultRoom>` main canvas; no duplication |
| `<VideoRoom>` | `frontend/components/consultation/VideoRoom.tsx` | **Extend** — add side panel hosting `<TextConsultRoom>` |
| `<VoiceConsultRoom>` | Plan 05's component | **Extend** — fill the empty visual region with `<TextConsultRoom>` |
| `consultation-message-service.ts` | Plan 04's helper | **Extend** with attachment + system-message variants |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 24-companion | (master Task 24's "+ companion text panel auto-opened" portion split out from Plan 05) | B / Decision 9 | ~1.5h | Low — mounts existing `<TextConsultRoom>` inside `<VoiceConsultRoom>`; main-canvas fill |
| 36 | A (Decision 9) — Lifecycle hook: auto-provision companion text channel for every voice/video session at `createSession()` | A | ~2h | Low — facade extension |
| 37 | A (Decision 9) — Auto-emit system messages to companion chat (consult-started, recording-paused/resumed, party-joined, consult-ended) | A | ~2h | Low — central emitter pattern |
| 38 | B / Decision 9 — Extend existing `<VideoRoom>` with companion chat panel (auto-opened, ~30% width side panel) | B | 2–3h | Low — UI integration; mobile responsive layout matters |
| 39 | C (Decision 9) — Extend `consultation_messages` schema with `attachment_url`, `attachment_mime_type`, `kind` enum (`'text' \| 'attachment' \| 'system'`) | C | ~1h | Low — additive migration; default `kind='text'` preserves Plan 04 rows |

**Suggested order:** 39 (migration first) → 36 + 37 in parallel (backend lifecycle + emitter) → 38 + 24-companion in parallel (frontend mounts).

---

## Schema deliverable (Task 39)

```sql
-- Migration extending Plan 04's consultation_messages

ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'attachment';
ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'system';

ALTER TABLE consultation_messages
  ADD COLUMN attachment_url        TEXT,
  ADD COLUMN attachment_mime_type  TEXT,
  ADD COLUMN attachment_byte_size  INT,
  ADD COLUMN system_event          TEXT;     -- e.g. 'consult_started','recording_paused','recording_resumed','party_joined','consult_ended','modality_switched'
                                              -- (NULL when kind != 'system')

-- Update RLS insert policy to allow system rows from the backend service role
-- (existing policy from Plan 04 keys on `sender_id = auth.uid()`; system rows
--  use the backend service role's UID and a constant sender_role='system'.)

CREATE POLICY consultation_messages_insert_system ON consultation_messages
  FOR INSERT
  WITH CHECK (
    kind = 'system'
    AND sender_role = 'system'
    AND auth.role() = 'service_role'
  );
```

**Default `kind='text'` on the existing column** preserves Plan 04 rows. New attachment rows have `kind='attachment'` + `attachment_url`. System messages have `kind='system'` + `system_event`.

---

## Lifecycle-hook contract (Task 36)

```ts
// backend/src/services/consultation-session-service.ts (EXTEND)

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const adapter = adapters[input.modality];
  const session = await adapter.createSession(input);
  await persistSessionRow(session);

  // NEW in Plan 06: auto-provision companion chat for voice/video.
  // Text modality already has a chat — it IS the chat.
  if (session.modality === 'voice' || session.modality === 'video') {
    await textSessionSupabaseAdapter.provisionCompanionChannel({
      sessionId: session.id,
      doctorId:  session.doctorId,
      patientId: session.patientId,
    });
  }

  // NEW in Plan 06: auto-emit consult-started system message.
  await emitSystemMessage({
    sessionId: session.id,
    event:     'consult_started',
    body:      `Consultation started at ${formatTime(now())}.`,
  });

  return session;
}
```

`provisionCompanionChannel()` is essentially a no-op at the table level (the channel is virtual, just a Realtime subscription topic). The work is in the JWT mint that scopes both parties to the same `consultation_messages` rows for this session — same exact pattern as Plan 04's `getJoinToken()`.

---

## System-message emitter contract (Task 37)

```ts
// backend/src/services/consultation-message-service.ts (EXTEND)

export type SystemEvent =
  | 'consult_started'
  | 'recording_paused'              // emitted by Plan 07
  | 'recording_resumed'             // emitted by Plan 07
  | 'recording_stopped_by_doctor'   // emitted by Plan 07
  | 'party_joined'                  // doctor or patient joined
  | 'consult_ended'
  | 'modality_switched'             // emitted by Plan 09
  | 'video_recording_started'       // emitted by Plan 08
  | 'video_recording_stopped';      // emitted by Plan 08

export async function emitSystemMessage(input: {
  sessionId: string;
  event:     SystemEvent;
  body:      string;
  meta?:     Record<string, unknown>;     // free-form, e.g. { reason: '...' }
}): Promise<void>;

// Concrete emit helpers for clarity at call sites:
export async function emitConsultStarted(sessionId: string): Promise<void>;
export async function emitConsultEnded(sessionId: string, summary: string): Promise<void>;
export async function emitPartyJoined(sessionId: string, role: 'doctor' | 'patient'): Promise<void>;
// Plans 07, 08, 09 will add their own emit-helpers building on this primitive.
```

System messages render as small inline banners in the chat (italic, gray, clock icon) rather than message bubbles. They're persistent so the AI pipeline (Plan 10) can read them as part of the session narrative.

---

## Frontend layout deliverables (Tasks 38 + 24-companion)

### `<VideoRoom>` extension (Task 38)

```
desktop:
  ┌─────────────────────────────────────────────────────┐
  │ Header                                                │
  ├──────────────────────────────────┬───────────────────┤
  │                                  │ Companion chat    │
  │   video tiles (Twilio Video)     │ (~30% width)      │
  │                                  │                   │
  │                                  │ <TextConsultRoom  │
  │                                  │   sessionId=...   │
  │                                  │   layout='panel'/>│
  │                                  │                   │
  ├──────────────────────────────────┴───────────────────┤
  │ Controls: 🎙 mute · 🎥 camera · 📞 end · 📎 attach   │
  └─────────────────────────────────────────────────────┘

mobile:
  Tabbed switcher: [Video] [Chat]
  Default tab = Video
  Chat tab badge with unread count
```

### `<VoiceConsultRoom>` extension (Task 24-companion)

```
desktop + mobile:
  ┌─────────────────────────────────┐
  │ Header                           │
  │ Dr. Sharma · 🎙 Voice consult    │
  ├─────────────────────────────────┤
  │                                  │
  │   <TextConsultRoom               │
  │     sessionId=...                │
  │     layout='canvas'/>            │
  │                                  │
  │   (fills the main canvas         │
  │    since voice has no video      │
  │    to look at)                   │
  │                                  │
  ├─────────────────────────────────┤
  │ Controls: 🎙 mute · 🔊 speaker · │
  │           📞 end · 📎 attach     │
  └─────────────────────────────────┘
```

`<TextConsultRoom>` gets a `layout: 'standalone' | 'panel' | 'canvas'` prop that adjusts header (`'panel'` hides the header since the parent room has its own; `'canvas'` keeps a slim header), bubble width, and composer placement.

---

## Attachment flow (uses Task 39 schema)

1. Doctor or patient taps 📎 in the composer.
2. File picker opens (image, PDF — types restricted; max size enforced).
3. File uploads to `consultation-attachments` Supabase Storage bucket (provisioned in Plan 04).
4. Backend `consultation-message-service.ts#sendAttachment()` inserts a row:
   ```
   { kind: 'attachment',
     attachment_url: 'storage://consultation-attachments/{session_id}/{uuid}',
     attachment_mime_type: 'image/jpeg',
     attachment_byte_size: 123456,
     body: '(optional caption)' }
   ```
5. Realtime subscription delivers the row to the other party.
6. `<TextConsultRoom>` renders attachment bubbles inline with previews (image thumbnail, PDF first-page thumbnail).
7. Replay player (Plan 07) and AI pipeline (Plan 10) treat attachments as first-class content via the same SQL.

---

## Files expected to touch

**Backend:**

- DB migration: extend `consultation_messages` (Migration ~024 or next free)
- `backend/src/services/consultation-session-service.ts` (**extend** — Task 36 lifecycle hook in `createSession()`)
- `backend/src/services/text-session-supabase.ts` (**extend** with `provisionCompanionChannel()`)
- `backend/src/services/consultation-message-service.ts` (**extend** with attachment helpers + `emitSystemMessage()` + helpers — Tasks 37 + 39)
- (No new routes — direct-Supabase-from-frontend handles attachment uploads via signed Storage URLs)

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend** Plan 04's component with `layout: 'standalone' | 'panel' | 'canvas'` prop + attachment bubble rendering + system-message rendering)
- `frontend/components/consultation/VideoRoom.tsx` (**extend** with companion chat side panel for desktop / tab switcher for mobile — Task 38)
- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend** Plan 05's component to fill the main canvas with `<TextConsultRoom layout='canvas' />` — Task 24-companion)

**Tests:**

- `backend/tests/unit/services/consultation-message-service-attachments.test.ts`
- `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts`
- `backend/tests/unit/services/consultation-session-service-companion-hook.test.ts`
- `frontend/__tests__/components/consultation/VideoRoom-companion-chat.test.tsx`
- `frontend/__tests__/components/consultation/VoiceConsultRoom-canvas-chat.test.tsx`

---

## Acceptance criteria

- [ ] **Task 39:** Migration applies forward + reverse cleanly; existing Plan 04 rows still SELECT correctly; new attachment + system rows insert via the right policies.
- [ ] **Task 36:** Every new voice/video session provisions a companion channel; smoke test confirms a video booking auto-creates a usable chat panel.
- [ ] **Task 37:** System messages auto-fire on consult-started, party-joined, consult-ended; render as italic/gray inline banners (not bubbles); Plans 07/08/09's emit helpers compose cleanly on top of `emitSystemMessage()`.
- [ ] **Task 38:** `<VideoRoom>` shows companion chat side panel on desktop (~30% width) + tab switcher on mobile; chat works in real-time across both parties.
- [ ] **Task 24-companion:** `<VoiceConsultRoom>` chat fills the main canvas; doctor + patient can exchange messages + attachments while audio is active.
- [ ] Attachments end-to-end: upload from `<TextConsultRoom>` composer → row in `consultation_messages` with `kind='attachment'` → other party sees the attachment row in real-time → tap to view the file via signed URL.
- [ ] AI pipeline contract preserved: a `SELECT * FROM consultation_messages WHERE session_id = ... ORDER BY created_at` returns one coherent timestamped narrative spanning text + attachments + system messages, regardless of session modality.
- [ ] No regression on Plan 04's text-modality flow.

---

## Open questions / decisions for during implementation

1. **Side-panel default state on desktop video.** Always-open per Decision 9. Confirm — yes.
2. **Mobile chat-tab unread badge:** delivered via React state read from message stream. Edge case: if the user is on the Video tab and the doctor sends a message, the badge increments. Recommendation: increment, decrement to 0 when the user opens Chat tab.
3. **Attachment size cap:** images up to 10 MB, PDFs up to 25 MB. Both reasonable for clinical photos and lab reports. Decided in this plan; document in the task file.
4. **System-message rendering style:** italic + gray + clock icon, no avatar, full-width minus padding. No CTA buttons (those are message bubbles, not system messages). Document in the task file.
5. **What happens if patient attaches a 50 MB file?** Backend rejects with a friendly error rendered in the chat as a `kind='system'` row from the user's own perspective. Or do we render it as a regular failed-send error in the composer? Recommendation: composer error (consistent with text-message failures); don't pollute the persisted log with attempted-but-failed uploads.

---

## Non-goals

- No replay player. Plan 07.
- No mid-consult modality switching system messages. Plan 09's emitter helper is **defined here** but **invoked from there**.
- No video-recording escalation system messages. Same: defined here, invoked from Plan 08.
- No AI summarization of attachments (e.g. OCR on a lab PDF). Plan 10 (deferred).

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Plan 04:** schema base + `<TextConsultRoom>` component this plan extends.
- **Plan 05:** `<VoiceConsultRoom>` empty canvas this plan fills.
- **Existing video room:** `frontend/components/consultation/VideoRoom.tsx` — gets the side-panel chat extension.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 04 + 05.
