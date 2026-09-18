# Plan p3 — Device pre-check in the lobby

## 13 Aug 2026 — Batch `consult-room-checkin` / `p3-device-precheck` (crc-10..13) — **M, ~2 dev-days**

> **Status:** ✅ Code done 2026-08-13 — founder smoke (zero-tap timing + permission matrix) parked to capture inbox.
> **Charter:** [`../plan-consult-room-checkin-charter.md`](../plan-consult-room-checkin-charter.md) (CRC-D1…D13)
> **Predecessor:** [`../p2-presence-correctness/`](../p2-presence-correctness/) (crc-07..09)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-consult-room-checkin-device-precheck.md`](./Tasks/EXECUTION-ORDER-p3-consult-room-checkin-device-precheck.md)

---

## Why this phase

The charter's non-goals list "device quality pre-check (p3)" as if it were unbuilt. It mostly **is** built — and mounted in the wrong place.

`frontend/app/consult/join/page.tsx` has two distinct screens:

- `status === "lobby"` (L502–528) — a bare text card. "Waiting room", scheduled time, "Waiting for the doctor…". **No device check, no branding, no countdown.**
- `step === "precall"` (L572–618) — the rich screen: `VideoConsultLobbyHeader` + `VideoConsultLobbyCountdown` + `VideoConsultPreCall` (live selfie preview, 10-bar mic meter, camera/mic dropdowns, per-device localStorage persistence) + `CellularDataWarning`.

The rich screen is only reachable **after** the token exchange returns live — that is, **after the doctor has clicked Start**. So the patient discovers their camera is blocked while the doctor sits watching an empty room. That is precisely the latency the whole `crc` program exists to remove, and it survived p1 because p1's auto-connect (CRC1-D6) drops the patient into the pre-call gate rather than into the room.

So p3 is mostly a **hoist**, not a build. The genuinely new piece is the network probe, which `VideoConsultPreCall`'s own header explicitly scopes out ("Network-quality test (E1 / E6 territory)").

---

## Decision lock (phase inherits charter)

| ID | Phase note |
|----|------------|
| CRC-D1…D13 | Inherited; do not re-litigate. |
| **CRC3-D1** | **Device check moves into the lobby.** The pre-call chrome renders while `status === 'lobby'`, before any Twilio room exists. CRC-D1 still holds — the check uses raw `getUserMedia`, never a Twilio connect. |
| **CRC3-D2** | **Verified devices are cached and reused.** Once the patient completes the check in the lobby, `live` auto-connects **straight into `VideoRoom`** with the chosen device IDs. The `step === 'precall'` gate is skipped. This is what makes CRC1-D6's "zero taps" real. |
| **CRC3-D3** | The pre-call gate **stays** for patients who arrive after Start (late openers, resend links, `CRC-D11` fan-out). Skipping is conditional on a completed lobby check, not unconditional. |
| **CRC3-D4** | **Readiness never blocks joining.** A patient with a denied camera, a dead mic, or a failed bandwidth probe still gets a working Continue path. `VideoConsultPreCall`'s existing permission matrix (both / mic-only / camera-only / neither) is the contract — do not tighten it into a gate. |
| **CRC3-D5** | Readiness is **patient-side only** in this phase. Do **not** report device state to the doctor board — that needs a column or a transient channel and is p4-or-later. Captured as a follow-up. |
| **CRC3-D6** | **Doctor's display name stays out of scope.** The backend does not surface it to patients (no `doctor_full_name`; see the note at `consult/join/page.tsx` L581–588). Lobby context uses practice branding + scheduled time + `doctorBusyWith` only. Adding the name is a backend payload change → separate task, not p3. |
| **CRC3-D7** | Network probe is **advisory, cheap, and bounded** — a few hundred KB at most, one run, cancellable, never blocking. No continuous monitoring in the lobby; in-call quality already has its own surface. |
| **CRC3-D8** | Voice reaches parity using the existing `VoiceConsultPreCall`. Text has no device surface and is untouched. |

---

## Waves

| Wave | Task | Model | Scope |
|------|------|-------|-------|
| 1 | [`crc-10`](./Tasks/task-crc-10-lobby-precall-hoist.md) | Auto | Hoist pre-call into lobby; cache devices; skip gate on auto-connect |
| 2 | [`crc-11`](./Tasks/task-crc-11-connection-quality-probe.md) | Auto | Advisory bandwidth / connection probe |
| 3 | [`crc-12`](./Tasks/task-crc-12-voice-parity-and-lobby-context.md) | Auto | Voice lobby pre-check parity + lobby context copy |
| 4 | [`crc-13`](./Tasks/task-crc-13-close-gate-p3.md) | Composer / Founder | Verification gate + founder smoke |

---

## Scope guard — DO NOT TOUCH

- Twilio room create/end, recording, consent, modality transitions (CRC-D1).
- `VideoRoom`'s in-call behaviour, including the in-call quality indicator (A8) and camera switch.
- The permission matrix inside `VideoConsultPreCall` (CRC3-D4) — reuse it, don't redesign it.
- Doctor board rendering. Device readiness does not reach the board in this phase (CRC3-D5).
- Any backend file **except** where crc-12 needs a read-only snapshot call that already exists.
- Any migration. Any RLS policy change. If a step appears to require one, **STOP** and surface it.
- Supabase Realtime (p4).
- Facebook fan-out (p4).

---

## Acceptance gate (phase)

- [x] All p1 + p2 **automated** gates still green (crc-09 / crc-13 founder smokes remain inbox items).
- [x] Opening a video join link **before** Start shows the device check — waiting-room unit tests + `consult/join` lobby branch. Live preview/mic bars are founder smoke.
- [x] No Twilio room is created by the lobby device check — lobby Continue caches devices only; voice holding polls text-token until `live` (`shouldMintVoiceTwilio`).
- [x] Completing the check in the lobby then having the doctor Start → skip precall gate (`shouldSkipVideoPrecallGate` / `shouldSkipVoicePrecallGate`). Stopwatch ~0–5s is founder smoke.
- [x] A patient who opens the link **after** Start still gets the pre-call gate (CRC3-D3) — late-opener unit tests.
- [x] Denied camera / denied mic / both denied each still reach a working join path in the permission-matrix Continue handlers (CRC3-D4). Real browser deny is founder smoke.
- [x] Connection probe: advisory, cancellable, never blocks Continue, fail → render nothing (crc-11 unit tests). Throttle/block in a real browser is founder smoke.
- [x] Voice lobby shows its device check before Start (`VoiceConsultPreLobby` holding mode).
- [x] Lobby heartbeat from p2 is independent of the device-check UI (same 5s interval on video lobby / voice holding+precall). Board **Waiting** tag is founder smoke.
- [x] Frontend typecheck + lint + p3/OPD tests green (2026-08-13: 147 tests / 24 files); no PHI in logs. p3 added **no** backend files.

---

**Created:** 2026-08-13.
