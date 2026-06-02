# Task voice-B3: Hold call (both mics muted + banner; Plan 06 enum: `hold_changed`)



## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **S–M item, ~5h**



---



## Model & execution guidance



**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).



---



## Task overview



Either party can put the call on **hold**. While on hold:



- BOTH mics are muted (decision §4: both parties see the banner — neither side is uncertain).

- Both audio outputs are muted (no risk of leakage).

- A banner appears on both sides: "On hold — Dr. Sharma stepped away" / "On hold — you stepped away".

- Caller-card status pill (A8) flips to amber "On hold".

- Recording continues (Plan 07; verify continuity).

- Either party can resume the call.



Plan 06 enum extension: **`hold_changed`** (sibling to A7's `mute_changed`; can ship in same migration).



**Hard-depends on Sub-batch 0** for the same reason A7 does.



**Estimated time:** ~5h.



**Status:** Complete (2026-05-20).



**Depends on:** [Sub-batch 0](./task-voice-0A-relax-modality-guard.md), [task-voice-A8](./task-voice-A8-caller-card-header.md).



**Source:** [T2 §T2.11](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md) (under T2-Later, promoted into this batch); [decision §4](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts).



---



## Acceptance criteria



### Plan 06 system-message enum extension



- [x] **`'hold_changed'`** added to `SystemEvent` union in `consultation-message-service.ts` (Migration 063: `system_event` is TEXT — **no Postgres migration**).

- [x] **Migration:** not required (same pattern as A7 `mute_changed`).

- [x] Insert payload shape:

  ```json

  {

    "type": "system",

    "system_subtype": "hold_changed",

    "metadata": {

      "actor_id": "<user_id>",

      "actor_role": "doctor" | "patient",

      "on_hold": true | false,

      "actor_name": "Dr. Sharma" | "Patient"

    }

  }

  ```



### Hold state machine



- [x] **Centralized hold state** — `useVoiceCallHoldState()` (`'live' | 'hold-by-self' | 'hold-by-other'`).

- [x] Transitioning to hold: mute local mic, POST `hold_changed` with `on_hold: true`; counterparty receives via Realtime → `'hold-by-other'`.

- [x] Transitioning back to live: same path with `on_hold: false`.

- [x] **Audio output muting**: `remoteAudioRef.muted = true` while on hold; restored on resume.



### `<HoldCallBanner>` component



- [x] **`frontend/components/consultation/HoldCallBanner.tsx`** — `holdState` prop; self shows Resume; other shows "Waiting for them to resume…".



### Hold button in `<VoiceConsultRoom>`



- [x] **Hold / Resume** in controls bar; disabled while `'hold-by-other'`.

- [x] **Caller-card status pill** → `"hold"` (amber) when `callHold.isOnHold`.



### Resume permission



- [x] **Decision §4 LOCKED:** only the actor who initiated hold can resume.



### Recording continuity



- [x] **No client-side recording stop on hold** — Twilio server-side capture unchanged (smoke on staging with Plan 07 playback).



### Manual smoke



- [ ] Doctor clicks Hold → banner on both sides; both mics muted; both outputs muted; caller-card pill amber. *(staging)*

- [ ] Doctor clicks Resume → live again; banners disappear; mics + outputs restored. *(staging)*

- [ ] Patient clicks Hold → reverse case. *(staging)*

- [ ] System message rows in companion chat. *(staging)*

- [ ] Recording continuity across hold. *(staging)*

- [ ] Reconnect during hold preserves initiator state. *(staging)*



### General



- [x] Type-check + lint clean (unit tests: `emitHoldChanged`, `format-system-message`).

- [x] No migration (TEXT `system_event`).

- [x] Backend route: `POST /api/v1/consultation/:sessionId/hold-changed`.



---



## Out of scope



- **Hold music.** Out of scope (Principle 8).

- **Auto-resume after timeout.** Out of scope; user explicitly resumes.

- **Hold notification on counterparty side beyond banner+pill** (e.g. push). Out of scope.

- **Force-resume by other party.** Out of scope (decision §4 locked: only actor resumes).



---



## Files touched



**Backend:**



- `backend/src/services/consultation-message-service.ts` — `hold_changed` + `emitHoldChanged`

- `backend/src/services/consultation-hold-service.ts` — **new**

- `backend/src/controllers/consultation-controller.ts` — `postHoldChangedHandler`

- `backend/src/routes/api/v1/consultation.ts` — route

- `backend/tests/unit/services/consultation-message-service-system-emitter.test.ts`



**Frontend:**



- `frontend/components/consultation/HoldCallBanner.tsx` — bilateral `holdState`

- `frontend/components/consultation/VoiceConsultRoom.tsx` — hold state, button, banner, output muting

- `frontend/hooks/useVoiceCallHoldState.ts` — **new**

- `frontend/lib/api.ts` — `postConsultationHoldChanged`

- `frontend/lib/consultation/format-system-message.ts` — `hold_changed` copy

- `frontend/components/consultation/TextConsultRoom.tsx` — `metadata` on `IncomingMessageMeta`



**Tests:** smoke only (staging).



---



## Notes / open decisions



1. **Decision §4 LOCKED** — both parties see the banner. Holder sees "you stepped away"; other sees "{actor} stepped away". Symmetric awareness.

2. **Why mute outputs too** — privacy. If patient is mid-hold and doctor's mic accidentally unmutes, patient shouldn't hear the doctor's office.

3. **Why only holder can resume** — prevents accidental "patient resumed and is now back to silent doctor". Holder owns the hold.

4. **No Postgres enum** — Migration 063 `system_event` is TEXT; one-line TS union extension only (corrected from draft ALTER TYPE).

5. **Recording continuity** — verify post-Plan 07 on staging.

6. **Video B3** — can add `postConsultationHoldChanged` to `<VideoRoom>` `handleToggleHold` in a follow-up; local hold UI already ships.



---



## References



- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)

- **Source item:** [T2 §T2.11 (under T2-Later)](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)

- **Decision:** [§4 — both see banner](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts)

- **Hard deps:** [Sub-batch 0](./task-voice-0A-relax-modality-guard.md); [task-voice-A8](./task-voice-A8-caller-card-header.md)

- **Sibling enum:** [task-voice-A7](./task-voice-A7-counterparty-mute-notification.md)



---



**Owner:** TBD

**Created:** 2026-04-29

**Status:** Complete (2026-05-20).

