# Task crc-18: Close gate — p4 and the `crc` program

## 13 Aug 2026 — Batch [p4-realtime-and-channel-gaps](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) — Wave 4 — **S, ~1h**

---

## Task overview

Verify the phase gate, **measure** the charter's success metric, and close the `consult-room-checkin` program.

**Estimated time:** ~1h
**Status:** ✅ Automated gate done 2026-08-13 — founder smoke + charter metric parked to capture inbox. Program **not** Closed.
**Hard deps:** crc-14…crc-17 complete.

---

## Model & execution guidance

**Recommended model:** Composer / Founder smoke. Consider one **Opus** close-gate review of the full p4 diff — crc-14 introduced an auth surface, and the efficiency guide's hard-rules list puts close-gate review of security-touching work on Opus.

**New chat?** Optional. Pre-load the batch plan acceptance gate + the charter + this file.

---

## Acceptance criteria

### Verification gate

- [x] Backend + frontend: typecheck + lint + tests green (`DEFINITION_OF_DONE.md`). 2026-08-13: backend `tsc --noEmit` clean; p4 backend suites 39/39; frontend p4 lobby/reconnect 22/22; eslint clean on p4-touched files. Full-tree frontend `tsc` still has pre-existing errors outside this program.
- [x] All p1 + p2 + p3 **automated** gates still green. crc-09 and crc-13 founder smokes remain parked (not re-run here).
- [x] `ls backend/migrations | sort -V | tail` — last numbered file is still **195**. No `196_*`. p2–p4 added **no** migration. 193/194/195 are p1 (lobby presence + pre-visit stamps).
- [x] `appointments` is not in the `supabase_realtime` publication. Re-verified 2026-08-13: no migration matches `ALTER PUBLICATION supabase_realtime ADD TABLE appointments`. Published tables remain `consultation_messages`, `consultation_message_reactions`, `text_chat_quality`. Regression: `lobby-presence-jwt.test.ts`.

### Founder / manual smoke

- [ ] Patient opens lobby → **Waiting** on the board in <2s (stopwatch).
- [ ] Block websockets in devtools → board still works on the 30s poll, no doctor-visible error.
- [ ] Inspect the Realtime frames → no name, phone, or clinical field.
- [ ] Facebook-only patient receives consult-ready and each pre-visit stage.
- [ ] Disable the Facebook page token → other channels still send, failure recorded as an outcome.
- [ ] Airplane mode for ~30s in the lobby → recovers, still checked in, no Stepped-away flicker, device check intact.
- [ ] Lock the phone for a minute, doctor starts, unlock → patient pulled into the call.

### Measure the charter metric

- [ ] Charter success metric: *"Doctor clicks Start → sees patient within ~0–5s when the patient was already in lobby."* **Time it across at least 3 runs** on video and record the numbers in the program README.
- [x] If the metric is not met, file the gap with the measured numbers rather than closing the program on an assertion. **Not measured — program not Closed.**

### Docs / program hygiene

- [x] Mark [`../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md`](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) status Code done with date (founder smoke pending).
- [x] Update [`../../README.md`](../../README.md) — phase table status for p4; credential decision recorded; **not** Closed until the metric is timed.
- [x] Record crc-14's credential decision in the program README so the next reader does not have to reconstruct it from code.
- [x] Capture inbox items for what p4 deliberately left:
  - WhatsApp consult fan-out (scaffold exists at `backend/src/workers/channels/whatsapp/`, unwired).
  - Doctor display name in patient-facing payloads (CRC3-D6) — already inbox'd.
  - Device readiness on the doctor board (CRC3-D5) — already inbox'd; p4 did not add it.
  - Founder smoke + 3-run Start→patient stopwatch (this task).
- [x] Confirm the [patient-health-hub](../../../../13-08-2026/patient-health-hub/README.md) program is the agreed next move now that the room is finished. **Starts after this program Closes** (blocked on founder metric). Do not start it from this task.

### Out of scope

- Starting the hub program.

---

## Done when

- Phase gate fully checked; charter metric measured and recorded with real numbers; program README marked closed; follow-ups filed.

## Implementation (2026-08-13)

- Automated gate only. Founder smoke and the 3-run Start→patient stopwatch are in `docs/Work/capture/inbox.md`. The program README is **not** marked Closed — the charter forbids closing on an assertion.
- p2–p4 added no migration (last numbered: **195**). `appointments` is not on `supabase_realtime`.
- crc-14 credential `(b)+(c)` copied into the program README.
- Next program after Close: [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md). Not started from this task.
