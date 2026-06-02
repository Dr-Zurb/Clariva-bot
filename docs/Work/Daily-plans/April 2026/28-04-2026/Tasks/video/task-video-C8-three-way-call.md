# Task video-C8: Three-way call (interpreter / family member; multi-participant RLS)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **L item, ~5 days**

---

## Task overview

Real clinical scenarios that need a 3rd person:
- **Interpreter** — patient doesn't speak the doctor's language.
- **Family member / caregiver** — elderly patient with adult child; pediatric with parent.
- **Specialist consult** — primary care doctor pulls in a specialist mid-call.

T3.26 ships invite-by-link three-way support:

1. Doctor opens "Invite" panel → generates a one-time link (`/c/video-invite/<token>`).
2. Doctor copies link or sends via SMS (existing patient-link infra).
3. Third participant joins via link → joins same Twilio room as third participant.
4. Layout (B6) auto-switches to a 3-tile layout.
5. Companion chat shows "Maria (interpreter) joined the call".
6. RLS: third participant has READ access to companion chat + companion-chat ATTACHMENTS but NOT to clinical record / past consults / Rx.

**Decision §16** — per-call invite link (recommended; simple; one-shot).

**Multi-participant RLS work** — requires schema/policy updates to allow a third participant to read `consultation_messages` for a session they're not the doctor or patient of.

**Estimated time:** ~5 days.

**Status:** Phase 1 complete (backend + plumbing + minimal UI). Phase 2 deferred (3-tile layout polish + auto-switch + chat-quote).

**Phase 1 delivery (1 May 2026):**
- DB migration `085_consultation_extra_participants.sql` — table + RLS via `public.safe_uuid_sub()` (also fixes the `084` doctor-branch regression that had reverted to bare `auth.uid()`).
- `consultation_messages` SELECT extended with a 3rd `extra_participant` branch enforcing the join-only window (`created_at >= ep.joined_at`) plus the existing snapshot visibility gate.
- `supabase-jwt-mint.ts` — `ConsultRole` extended to `'extra_participant'`; new `extra_participant_id` claim + `buildExtraParticipantSub()` helper. Synthetic sub `extra:<uuid>` resolved by `public.safe_uuid_sub()` in RLS.
- `consultation-extra-participant-service.ts` — `createInvite`, `exchangeInviteToken` (mints scoped Supabase JWT + Twilio token, single-shot, optimistic-lock on `joined_at`), `revokeInvite`, `recordParticipantLeft`, `listInvitesForSession`. Doctor-only auth + gate-ordering doctrine. Twilio failure falls back to chat-only.
- `consultation-message-service.ts` — `participant_joined` + `participant_left` system events with correlation-id dedupe and metadata payload.
- Routes (`backend/src/routes/api/v1/consultation.ts`): literal-path-first ordering, public exchange + leave endpoints, doctor-scoped invite/list/revoke endpoints.
- Frontend: `lib/api.ts` helpers; `<ThreeWayInvitePanel>` doctor FAB action; `/c/video-invite/[token]` lobby + Twilio-direct join page (deliberately NOT mounting `<VideoRoom>` in Phase 1 — bare `<video>` tile rendering for the third participant).
- Tests: 39 service unit tests + 43 message-emitter unit tests, all green. Backend `tsc` + ESLint and frontend `tsc` + `next lint` clean on touched files.

**Phase 2 backlog (deferred):**
- `<VideoRoom>` 3-tile layout integration (depends on real-world UX feedback from B6).
- Auto-switch from 1-on-1 → 3-tile when `participant_joined` lands.
- Mounting full `<VideoRoom>` (with mute, picture-in-picture, hold) on the invite-token page instead of the minimal Twilio direct join.
- Inline chat quote of the system banner ("Maria (interpreter) joined the call") with avatar pill.
- `<ChatPane>` companion-chat read window for the third participant (Phase 1 already enforces it server-side via RLS — the client just needs to trust the JWT).

**Depends on:** [task-video-B6](./task-video-B6-layout-swap.md) (HARD — needs 3-tile layout); existing patient-invite link infra (audit).

**Source:** [T3 §T3.26](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decision §16](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Schema additions

- [ ] **New migration** `0XX_consultation_extra_participants.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS consultation_extra_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    invite_token    TEXT NOT NULL UNIQUE,
    role_label      TEXT,                        -- e.g. "interpreter", "family member"
    display_name    TEXT NOT NULL,
    invited_by      UUID NOT NULL,               -- doctor user id
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at       TIMESTAMPTZ,
    left_at         TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
  );
  
  CREATE INDEX consultation_extra_participants_token_idx 
    ON consultation_extra_participants(invite_token) WHERE revoked_at IS NULL;
  CREATE INDEX consultation_extra_participants_session_idx 
    ON consultation_extra_participants(session_id);
  
  ALTER TABLE consultation_extra_participants ENABLE ROW LEVEL SECURITY;
  -- RLS: doctor owns session can read/insert/revoke; participant can read their own row by token.
  -- Use safe_uuid_sub() per Plan F04 invariant.
  ```
- [ ] **Update `consultation_messages_view` RLS** — extra participants can SELECT messages where `session_id IN (SELECT session_id FROM consultation_extra_participants WHERE invite_token = current jwt token)` AND join/leave window is active.
- [ ] **No insert / mutate** for extra participants on messages table — read-only.

### Backend invite endpoint

- [ ] **`backend/src/routes/api/v1/consultation.ts`** — new:
  - `POST /api/v1/consultations/:id/invite-participant` → doctor-only; creates token; returns invite link.
  - `POST /api/v1/consultations/:id/revoke-participant/:tokenId` → doctor-only; sets `revoked_at`.
- [ ] **HMAC + JWT exchange path** — extra participant exchanges the invite token for a short-lived Supabase JWT with role-claim `extra_participant`.

### Twilio room joins

- [ ] Extra participant connects to the same Twilio room SID as the doctor + patient (server-side mints a Twilio access token tied to the same room).
- [ ] Companion chat: third participant joins as a regular member but with read-only Supabase JWT.

### `<ThreeWayInvitePanel>` component

- [ ] **New component** at `frontend/components/consultation/ThreeWayInvitePanel.tsx`:
  - Doctor-only.
  - Field: display name + role label.
  - Buttons: "Copy link" / "Send via SMS" (uses existing SMS provider; same pattern as patient invite).
  - List of currently-joined / pending invites + revoke button.

### Layout (B6 extension)

- [ ] **Extend `<VideoRoom>` layouts** to handle 3 tiles:
  - **Speaker:** main remote tile + 2 thumbnails in corner.
  - **Gallery:** 3 equal tiles.
  - **Sidebar:** 2 main tiles + sidebar.
- [ ] Auto-switch to Gallery when 3rd participant joins (best clinical view).

### Plan 06 enum extension

- [ ] Add `'participant_joined'` and `'participant_left'` (combine with other Sub-batch C enum migrations).

### Companion-chat surfacing

- [ ] System rows: "Maria (interpreter) joined the call" / "Maria left the call".

### Manual smoke

- [ ] Doctor invites Maria → link generated.
- [ ] Maria opens link in another browser → joins as 3rd tile.
- [ ] All 3 see all 3.
- [ ] Maria can read companion chat history (since she joined) but not from before her join.
- [ ] Doctor revokes Maria mid-call → Maria's tile disappears + chat access revoked.
- [ ] Maria's invite link is single-use (revoked after first join, or after `left_at`).

### `mode='readonly'`

- [ ] Invite panel hidden.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Migration forward + reverse cleanly.
- [ ] **All RLS uses `public.safe_uuid_sub()`** (Plan F04 invariant).

---

## Out of scope

- **More than 3 participants** (4-way, 5-way). Out of scope v1.
- **Participant chat-only joining** (without video). Out of scope v1; could ship v2 with a `is_audio_only` flag.
- **Participant-side recording consent flow.** Plan 02 / 08 governs recording at session level; document that the third participant inherits the existing consent state.
- **Participant pre-call lobby with branding.** Out of scope v1; participant goes straight to live room.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/ThreeWayInvitePanel.tsx` — **new** (~150 LOC).
- `frontend/app/c/video-invite/[token]/page.tsx` — **new** (~80 LOC; entry point for the third participant).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~80 LOC: 3-tile layout variants).
- `frontend/lib/api.ts` — **edit** (~30 LOC: invite/revoke helpers; participant token exchange).

**Backend:**
- `backend/src/routes/api/v1/consultation.ts` — **edit** (~100 LOC: invite + revoke endpoints; participant token exchange).
- `backend/src/services/consultation-extra-participant-service.ts` — **new** (~150 LOC).
- `backend/migrations/0XX_consultation_extra_participants.sql` — **new** (~80 LOC).

**Tests:**
- `backend/tests/integration/consultation-extra-participants.test.ts` — **new** (~150 LOC: invite + join + read messages + revoke + RLS deny).

---

## Notes / open decisions

1. **Decision §16** — per-call invite link (simple; recommended).
2. **Token TTL** — short-lived JWT (~30 min after first use); invite link valid for 60 min from creation.
3. **Revoked participant cleanup** — revoking a token does NOT auto-disconnect them from Twilio (Twilio doesn't expose that); document. Their CHAT access is immediately revoked.
4. **Pre-call lobby for participant** — out of scope; participant joins live directly. Defer to v2.
5. **PHI hygiene** — third participant's join is recorded in `consultation_extra_participants` for audit; their chat read-window is enforced by `joined_at` / `left_at`.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.26](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Hard dep:** [task-video-B6](./task-video-B6-layout-swap.md)
- **Decision:** [§16 — invite mechanism](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **Plan F04:** `safe_uuid_sub()` invariant
- **Plan 06:** Companion chat (extra participant inherits chat panel)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Drafted; biggest schema work in this batch outside E6 QoS.
