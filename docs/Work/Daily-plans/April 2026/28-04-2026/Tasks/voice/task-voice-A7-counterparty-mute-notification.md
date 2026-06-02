# Task voice-A7: Counterparty mute notification (system message in companion chat)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~2h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When the doctor mutes / unmutes their mic, a small system-message row appears in the companion chat: `"Dr. Sharma muted their microphone"` / `"Dr. Sharma unmuted their microphone"`. Same for the patient side. Reuses Plan 06's existing system-message channel — **adds one new `system_subtype` enum value: `'mute_changed'`**.

**Hard-depends on Sub-batch 0 — without the companion chat working on the patient side, this notification never reaches half the audience.**

**Estimated time:** ~2h.

**Status:** Complete (2026-05-20).

**Depends on:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md), [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md), [task-voice-0C](./task-voice-0C-companion-error-surfacing.md) — hard. Without Sub-batch 0, A7 ships green but silently fails for patients.

**Source:** [T1 §T1.8](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md).

---

## Acceptance criteria

### Plan 06 system-message enum extension

- [x] **One-line addition** to the Plan 06 `SystemEvent` union in `consultation-message-service.ts` (Migration 063: `system_event` is TEXT — **no Postgres migration**).
- [x] **New value:** `'mute_changed'`.
- [x] **Migration:** not required (`system_event` column is free TEXT per Migration 063). B3's `'hold_changed'` follows the same pattern.

### Backend: emit system message on mute toggle

- [x] **Path shipped:** `POST /api/v1/consultation/:sessionId/mute-changed` — doctor OR patient companion JWT; service-role `emitMuteChanged` (RLS blocks direct frontend INSERT of system rows).
- [x] Twilio webhook path deferred (OS-mute semantics flagged for follow-up).
- [x] **Insert payload shape:**
  ```json
  {
    "type": "system",
    "system_subtype": "mute_changed",
    "body": null,
    "metadata": {
      "actor_id": "<user_id>",
      "actor_role": "doctor" | "patient",
      "muted": true | false,
      "actor_name": "Dr. Sharma" | "Patient"
    }
  }
  ```
- [x] **RLS verification** — system rows remain service-role-only (Migration 063); route uses `emitSystemMessage` admin client.

### Frontend: render the system row

- [x] **`TextConsultRoom`** system-row branch + `formatSystemMessageBody()` for `mute_changed` (self: "You …"; other: third-person from `metadata`).
- [x] Same centered italic system-row styling as other banners.

### Wire mute click → POST

- [x] **`<VoiceConsultRoom>`** + **`<VideoRoom>`** — fire-and-forget `postConsultationMuteChanged` after local Twilio mute flip when companion chat auth is ready.
- [x] Frontend-only (no Twilio webhook double-insert).

### Manual smoke

- [ ] Doctor mutes → patient sees "Dr. Sharma muted their microphone" within Realtime SLA (~1s). *(staging)*
- [ ] Doctor unmutes → patient sees the unmute row. *(staging)*
- [ ] Patient mutes → doctor sees "Patient muted their microphone". *(staging)*
- [ ] **Patient on phone with chat panel collapsed** → row stacks; on opening the panel, all mute events visible. *(staging)*
- [x] On a session where companion chat fails → mute action still works locally; system row simply doesn't propagate.

### General

- [x] Type-check + lint clean (unit tests: backend emitter + `format-system-message.test.ts`).
- [x] No migration (TEXT `system_event`).

---

## Out of scope

- **Sound effect on mute change.** Out of scope; visual chat row is enough.
- **Mute-on-join default.** Out of scope.
- **Track which side muted whom** (doctor cannot mute patient in v1). Out of scope.
- **OS-level interruption detection** (call comes in on the user's phone). Flag for follow-up.

---

## Files expected to touch

**Backend / migrations:**

- `backend/migrations/0XX_add_mute_changed_system_subtype.sql` — **new** (~5 LOC; or combine with B3's `hold_changed` if same PR).

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~20 LOC: mute handler emits system row).
- `frontend/components/consultation/MessageBubble.tsx` (or system-row component) — **edit** (~15 LOC: handle new subtype).

**Tests:** none in this task; smoke verifies. Migration tested via existing migration test runner.

---

## Notes / open decisions

1. **Frontend-emit vs backend-webhook** — frontend is simpler and good enough for v1. Backend webhook captures OS-mute events but adds latency + complexity. Flag for telemetry: track if users complain about missed mute notifications.
2. **Why a system row, not a transient toast** — the chat is the audit log; toasts disappear. Doctors reviewing post-call should see "patient muted at minute 14" in the transcript.
3. **Self vs other copy** — "You" vs "Dr. Sharma" is a small UX win; ship in v1 since the renderer already knows `currentUserId`.
4. **Plan 06 ownership** — the enum extension is owned by Plan 06 formally; A7 is the first consumer. The migration line lives in this batch's migration file but the enum's existence is Plan 06's contract.
5. **Why hard-depends on Sub-batch 0** — without 0, the patient never receives Realtime messages on voice/video sessions; A7 silently degrades.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T1 §T1.8](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Hard deps:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md), [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md), [task-voice-0C](./task-voice-0C-companion-error-surfacing.md).
- **Sibling enum extension:** [task-voice-B3](./task-voice-B3-hold-call.md) adds `'hold_changed'`; coordinate migration.
- **Plan 06 enum reference:** see [plan-f06-companion-text-status.md](../../../../Product%20plans/text-consult/plan-f06-companion-text-status.md) for the canonical enum surface.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Complete (2026-05-20).
