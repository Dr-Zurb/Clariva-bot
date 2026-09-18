# Task crc-11: Advisory connection quality probe

## 13 Aug 2026 — Batch [p3-device-precheck](../plan-p3-consult-room-checkin-device-precheck-batch.md) — Wave 2 — **M, ~3–4h**

---

## Task overview

Camera and mic are covered by the hoisted pre-call. Bandwidth is the remaining unknown, and it is the one that produces "you're breaking up" five minutes into a consult. `VideoConsultPreCall`'s header explicitly scopes the network test out ("E1 / E6 territory"), so this is the genuinely new surface in p3.

Advisory only — it informs the patient, it never blocks them (CRC3-D4, CRC3-D7).

**Estimated time:** ~3–4h
**Status:** ⏳ Pending
**Hard deps:** crc-10 merged (mounts into the lobby surface it creates).
**Source:** CRC3-D4, CRC3-D7.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + charter + batch plan.
- `frontend/app/consult/join/page.tsx` — the lobby branch as restructured by crc-10.
- `frontend/components/consultation/CellularDataWarning.tsx` — existing `navigator.connection` consumer and its self-gating pattern (unsupported → render nothing). **Match that defensiveness.**
- `frontend/components/consultation/VideoRoom.tsx` — the in-call quality indicator (A8), so the lobby's vocabulary matches what the patient sees later.

**Estimated turns:** 3–4.

---

## Acceptance criteria

### 1. Probe behaviour

- [ ] Runs **once** per lobby visit, automatically, shortly after the lobby renders. Not on a loop (CRC3-D7).
- [ ] Bounded cost — a few hundred KB at most. State the budget in a code comment since it is a constraint the code cannot show.
- [ ] Cancellable, and cancelled on unmount.
- [ ] Never runs on a metered/cellular connection without the patient opting in — respect the same signal `CellularDataWarning` uses. Burning a patient's mobile data to tell them their mobile data is slow is a bad trade.
- [ ] A manual "Test again" affordance is allowed; automatic re-runs are not.

### 2. Result presentation

- [ ] Three advisory states at most — good / marginal / poor. Do not show raw Mbps to a patient.
- [ ] Vocabulary matches the in-call quality indicator so "poor" means the same thing in both places.
- [ ] Poor result suggests a concrete action (move closer to the router, switch to audio-only, use the voice consult) rather than just reporting badness.
- [ ] The result **never** disables Continue or blocks auto-connect (CRC3-D4).

### 3. Failure and unsupported paths

- [ ] Probe failure, timeout, or an unsupported browser renders **nothing** — no error, no scary empty state. Silence is the correct fallback (`CellularDataWarning` precedent).
- [ ] Probe activity does not interfere with the lobby poll or the heartbeat.

### 4. Tests

- [ ] Unit coverage for the classification thresholds and for the unsupported/failed → render-nothing path.

### Out of scope

- Continuous in-call monitoring (already exists as A8).
- Reporting the result to the doctor board (CRC3-D5).
- Auto-downgrading the consult to voice or text — suggest it in copy, do not act on it.
- Any backend change or new endpoint. If the probe needs a server-side target beyond an existing static asset, **stop and surface it**.

---

## Scope Guard

- Expected files touched: **≤ 4** (probe module, a small result component, join-page mount, tests).
- **DO NOT** add a dependency for this. A fetch against a known-size static asset with a timeout is sufficient.
- **DO NOT** block any join path on the result.

---

## Done when

- Lobby shows an advisory connection result once per visit; unsupported/failed probes render nothing; nothing is ever blocked by the result; no new backend surface; tests + typecheck + lint green.
