# Task crc-14: Realtime lobby presence channel

## 13 Aug 2026 — Batch [p4-realtime-and-channel-gaps](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) — Wave 1 — **L, ~5h**

---

## Task overview

Give the doctor board an instant presence signal without touching the database replication surface. The patient lobby joins a Realtime channel; the board subscribes. Heartbeat columns stay exactly as they are and remain the source of truth (CRC4-D1, CRC4-D2).

**The load-bearing problem:** the lobby exists **before** any `consultation_sessions` row (CRC-D3), but `mintScopedConsultationJwt` is session-scoped — it stamps `consult_role` + `session_id` claims. There is no `session_id` to stamp in the lobby. Deciding the token/claim shape for lobby presence **is** this task; the wiring is the easy half.

**Estimated time:** ~5h
**Status:** ✅ Code done 2026-08-13 — board consumption is crc-15.
**Hard deps:** p3 closed.
**Source:** CRC-D3, CRC-D10, CRC-D13, CRC4-D1, CRC4-D2, CRC4-D4, CRC4-D7.

---

## Model & execution guidance

**Recommended model:** **Opus (max thinking)** — new claim shape on a patient-facing auth token. This is on the agent hard-rules list.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `backend/src/services/supabase-jwt-mint.ts` — `mintScopedConsultationJwt` L112, `verifyScopedConsultationJwt` L181, `buildPatientSub` L232. Read the file-level doc block (L1–30) — it explains why patient `sub` is synthetic and why RLS keys on claims rather than `auth.uid()`.
- `frontend/lib/text/use-tab-presence-claim.ts` — the canonical broadcast-channel pattern (L111–165). **This is the prior art to follow.**
- `frontend/lib/supabase/scoped-client.ts` — `createScopedRealtimeClient`.
- `backend/migrations/052_consultation_messages_patient_jwt_rls.sql` — how the patient JWT branch was expressed for a session-scoped surface.
- `backend/src/services/lobby-heartbeat-service.ts`, `backend/src/utils/lobby-presence.ts` — the columns that stay authoritative.
- `backend/src/utils/consultation-token.ts` — the HMAC the patient already holds.

**Estimated turns:** 4–6.

---

## Credential decision (2026-08-13)

**Chosen: (b) + (c).** Purpose-minted short-lived JWT that grants nothing except Realtime identity, issued by exchanging the HMAC consultation token the patient already holds.

| Option | Verdict | Why |
|--------|---------|-----|
| **(a)** Extend `mintScopedConsultationJwt` with `lobby_appointment_id` (session_id optional) | **Rejected** | Widens the session-scoped grant that RLS on `consultation_messages` (mig 052) keys on. Lobby has no `session_id` (CRC-D3 / CRC4-D4). Mixing both shapes in one minter is how a lobby token accidentally grows message access later. |
| **(b)** Broadcast-only channel + purpose-minted JWT | **Chosen (shape)** | Separate minter. Claims: `purpose: 'lobby_presence'`, `appointment_id`, synthetic `sub: 'lobby:{appointmentId}'`. **No** `consult_role`, **no** `session_id`. Existing message RLS cannot match. `aud`/`role` stay `authenticated` so `createScopedRealtimeClient` / `setAuth` work. |
| **(c)** HMAC → mint endpoint | **Chosen (delivery)** | Patient already has `verifyConsultationToken` proof (same as heartbeat). `POST /api/v1/bookings/session/lobby-presence-token?token=` exchanges it. No new patient credential type in the URL. |

**(b) without (c)** has no patient-facing way to get the JWT. **(c) without (b)** would be tempting to reuse the consult JWT — that is (a). Together they keep lobby auth off the session-scoped path.

**TTL: 2 hours** (`LOBBY_PRESENCE_JWT_TTL_MS`). Slot check-in is T−30 min (CRC-D4); queue check-in can sit longer; delay adds more. 2h covers a long lobby without matching the 24h HMAC lifetime. Re-exchange is a follow-up if a patient is still waiting at expiry (crc-17 reconnect can pick that up). Heartbeat (5s POST) is **not** tied to this TTL.

**Channel:** public broadcast (same as `text-presence:{sessionId}` — no `{ config: { private: true } }`). Private channels need Realtime Authorization / RLS → **hard stop**. Topic and payload live in `frontend/lib/consultation/lobby-presence.ts` for crc-15.

**Not used:** `postgres_changes`, `appointments` on `supabase_realtime`. Verified 2026-08-13: no migration contains `ALTER PUBLICATION supabase_realtime ADD TABLE appointments` (publication tables are `consultation_messages`, `consultation_message_reactions`, `text_chat_quality`). Regression test in `lobby-presence-jwt.test.ts`.

**Doctor:** existing authenticated browser Supabase client (crc-15). No new doctor credential.

---

## Acceptance criteria

### 1. Decide the token/claim shape — write the decision down

- [x] Evaluate at least these options and record the choice **and the rejected alternatives** in this task file before implementing:
  - **(a)** Extend the scoped JWT with an appointment-scoped claim (e.g. `lobby_appointment_id`) alongside the existing session-scoped shape.
  - **(b)** A broadcast-only channel whose topic is derived from the appointment, authorized by a purpose-minted short-lived JWT that grants nothing else.
  - **(c)** Reuse the existing HMAC consultation token via a mint endpoint that exchanges it for a narrowly-scoped Realtime JWT.
- [x] Whichever is chosen, the credential must grant **presence on one appointment's channel and nothing else**. No read access to messages, no table access, no widening of the existing session-scoped grant.
- [x] TTL is short and bounded by the lobby's realistic lifetime. State the number and the reasoning.
- [x] **If the chosen shape requires an RLS policy or a migration → STOP and surface it.** That is a separate Opus decision and CRC4's scope guard forbids assuming it.

### 2. Patient side

- [x] The lobby (video and voice, per p2/p3 surfaces) joins the presence channel on mount and leaves on unmount.
- [x] Payload carries an appointment identifier and a timestamp. **Nothing else** — no name, no phone, no clinical field, no token (CRC4-D7).
- [x] Channel failure is **silent** and non-blocking. The patient must never see a Realtime error; the 5s heartbeat continues regardless.
- [x] The heartbeat POST is **not** replaced or throttled by Realtime (CRC4-D2). Both run.

### 3. Doctor side contract

- [x] Define and document the channel topic format and payload type in one shared location that crc-15 can import. crc-15 is blocked on this contract being stable.
- [x] Doctor subscription uses the existing authenticated browser Supabase client — doctors are real auth users and need no new credential.

### 4. Bans

- [x] `appointments` is **not** added to the `supabase_realtime` publication (CRC4-D1). Verify and state how you verified.
- [x] No `postgres_changes` subscription on any PHI table.
- [x] No migration.
- [x] No change to `deriveTags`, the heartbeat service, or `previsit-notify-stages.ts`.

### 5. Tests

- [x] Unit coverage for the mint/verify path of whichever credential shape is chosen, including expiry and scope-violation cases.
- [x] Coverage asserting the presence payload contains no PHI fields.

### Out of scope

- Board UI consumption (crc-15).
- Reconnect semantics (crc-17).
- Replacing the poll path (banned — CRC4-D3).

---

## Scope Guard

- Expected files touched: **≤ 8**. If the credential design pushes past that, stop and split the decision from the implementation.
- **DO NOT** widen the existing scoped-JWT grant to cover more than lobby presence.
- **DO NOT** add RLS, a migration, or a publication change. Surface instead.
- **DO NOT** remove or throttle the heartbeat.

---

## Done when

- The credential decision is written down with rejected alternatives; a lobby patient's presence reaches a doctor-side subscriber in <2s; frames carry no PHI; heartbeat and poll paths are untouched; no migration, no RLS, no publication change; tests green.

## Implementation (2026-08-13)

- **Credential:** `(b)+(c)` — `POST /api/v1/bookings/session/lobby-presence-token?token=` exchanges HMAC for a 2h JWT (`purpose: lobby_presence`, `appointment_id`, `sub: lobby:{id}`). No `consult_role` / `session_id`. Public broadcast (not private Realtime / RLS).
- **Contract for crc-15:** `frontend/lib/consultation/lobby-presence.ts` — topic `lobby-presence:{appointmentId}`, event `lobby-presence`, payload `{ appointmentId, ts }`. Doctor uses the authenticated browser client; no new doctor credential.
- **Patient mount:** `useLobbyPresenceChannel` on video lobby (`status === "lobby"`) and voice (`precall` / `holding`). Ping every 5s, additive to HMAC heartbeat. Failures silent.
- **CRC4-D1:** `lobby-presence-jwt.test.ts` scans `backend/migrations/*.sql` for `ALTER PUBLICATION supabase_realtime ADD TABLE appointments`. None found. No new migration.
