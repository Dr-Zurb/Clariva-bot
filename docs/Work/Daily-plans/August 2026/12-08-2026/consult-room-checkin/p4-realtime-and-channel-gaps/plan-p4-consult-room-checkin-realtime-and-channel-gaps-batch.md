# Plan p4 — Realtime presence + channel gaps

## 13 Aug 2026 — Batch `consult-room-checkin` / `p4-realtime-and-channel-gaps` (crc-14..18) — **L, ~2–3 dev-days**

> **Status:** ✅ Code done 2026-08-13 — founder smoke + charter metric parked (crc-18). Program not Closed.
> **Charter:** [`../plan-consult-room-checkin-charter.md`](../plan-consult-room-checkin-charter.md) (CRC-D1…D13)
> **Predecessor:** [`../p3-device-precheck/`](../p3-device-precheck/) (crc-10..13)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md`](./Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md)

---

## Why this phase

CRC-D10 deferred Realtime to a later phase and CRC-D12 deferred Facebook Messenger fan-out. Both come due here, plus the reconnect handling that a lobby patients sit in for 30 minutes actually needs.

Realtime last is deliberate. It is the highest-architecture item in the program and it is a **latency optimisation over a correct poll path** — so the poll path had to be correct first (p2) and the thing being pulled into had to be worth pulling into (p3). Doing it first would have meant optimising a lie.

---

## Decision lock (phase inherits charter)

| ID | Phase note |
|----|------------|
| CRC-D1…D13 | Inherited; do not re-litigate. CRC-D10's "Realtime is p2" is superseded by the phase renumbering — the intent (poll ships first, Realtime layers on) is preserved. |
| **CRC4-D1** | **Presence uses a Realtime *channel*, not `postgres_changes` on `appointments`.** Do not add `appointments` to the `supabase_realtime` publication. It is a PHI-bearing, doctor-RLS'd table and widening its replication surface to move a presence dot is a bad trade. Prior art: `frontend/lib/text/use-tab-presence-claim.ts`. |
| **CRC4-D2** | **Heartbeat columns stay the source of truth.** 193/194/195 stamps continue exactly as they are. Realtime is an *additional* instant signal, not a replacement. `deriveTags`, the pre-visit cron's skip logic in `previsit-notify-stages.ts`, and the board's derived tags all keep reading the columns. Nothing downstream of presence changes shape. |
| **CRC4-D3** | **The board must degrade to poll.** If the Realtime channel fails to subscribe, drops, or the browser blocks websockets, the 30s poll path from p1/p2 remains fully functional and the doctor sees no error. Realtime is strictly additive. |
| **CRC4-D4** | **The lobby has no `consultation_sessions` row** (CRC-D3), so the existing `mintScopedConsultationJwt` — which is session-scoped — does **not** fit as-is. Resolving the token/claim shape for lobby presence is an explicit design decision inside crc-14, not an implementation detail to improvise. |
| **CRC4-D5** | Facebook fan-out extends the **existing** `dispatchFanOut` channel matrix. No new notification pathway, no new copy family — Facebook is a fourth sibling alongside SMS / email / Instagram DM, with the same skip/sent/failed outcome shape. |
| **CRC4-D6** | Reconnect is **patient-side resilience only**. No new server state, no "patient disconnected" event. A patient whose network blips and returns must land back in the same lobby without re-reading a DM. |
| **CRC4-D7** | No PHI on any Realtime channel. Presence payloads carry an appointment identifier and a timestamp — never a name, phone, or clinical field (CRC-D13). |

---

## Waves

| Wave | Task | Model | Scope |
|------|------|-------|-------|
| 1 | [`crc-14`](./Tasks/task-crc-14-realtime-presence-channel.md) | **Opus** | Lobby presence channel + token/claim shape |
| 2 | [`crc-15`](./Tasks/task-crc-15-board-instant-presence.md) | Auto | Doctor board instant presence + poll fallback |
| 3 | [`crc-16`](./Tasks/task-crc-16-facebook-consult-fanout.md) | Auto | Facebook Messenger consult + pre-visit fan-out |
| 4 | [`crc-17`](./Tasks/task-crc-17-lobby-reconnect-resilience.md) | Auto | Lobby reconnect + network-drop handling |
| 5 | [`crc-18`](./Tasks/task-crc-18-close-gate-p4.md) | Composer / Founder | Verification gate + founder smoke + program close |

`crc-16` is independent of `crc-14`/`crc-15` (disjoint files, no shared output) and may run as a parallel lane — see the exec-order doc.

---

## Scope guard — DO NOT TOUCH

- The `supabase_realtime` publication. Adding `appointments` to it is explicitly banned (CRC4-D1).
- Heartbeat columns, `deriveTags`, or the pre-visit cron's stage logic (CRC4-D2).
- Twilio room create/end, recording, consent, modality transitions.
- `sendConsultationReadyToPatient` semantics — crc-16 adds a channel to the fan-out, it does not change when or why the fan-out runs.
- The DM copy families. Facebook reuses existing copy (CRC4-D5).
- Device pre-check behaviour from p3.
- **Any RLS policy change or new migration.** If Realtime authorization appears to need one, **STOP** — that is an Opus decision and it must be surfaced, not assumed.

---

## Acceptance gate (phase)

- [x] All p1 + p2 + p3 **automated** gates still green (crc-09 / crc-13 founder smokes remain parked).
- [ ] A patient opening the lobby shows **Waiting** on the doctor board in **under ~2s**, without waiting for the 30s board poll.
- [ ] Killing the Realtime connection (block websockets in devtools) leaves the board fully functional on the 30s poll, with no error surfaced to the doctor (CRC4-D3).
- [x] `appointments` is **not** in the `supabase_realtime` publication. Verify explicitly. 2026-08-13: no `ALTER PUBLICATION … ADD TABLE appointments` in any migration; published tables are `consultation_messages`, `consultation_message_reactions`, `text_chat_quality`.
- [x] No migration in the phase. `ls backend/migrations | sort -V | tail` — last numbered file is **195** (p1). No `196_*`.
- [ ] No PHI on any Realtime payload — inspect the frames (CRC4-D7). Payload contract is `{ appointmentId, ts }` (unit-tested); live frame inspect is founder.
- [ ] A patient reachable only on Facebook Messenger receives consult-ready and pre-visit check-in messages.
- [x] Facebook failures degrade exactly like Instagram failures — recorded as a channel outcome, never throwing the fan-out. (crc-16 unit tests.)
- [ ] A patient whose network drops for ~30s in the lobby returns to the lobby automatically, still checked in, without reopening the DM link.
- [x] Backend + frontend typecheck + lint + tests green on p4 surfaces; no PHI in logs. Full-tree frontend `tsc` has pre-existing errors outside this program.

---

## Program close

p4 is the last planned phase of `consult-room-checkin`. crc-18 records the charter metric when the founder times it — measured, not asserted. Until then the program stays **not Closed**.

---

**Created:** 2026-08-13.
