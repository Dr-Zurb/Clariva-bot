# Task crc-09: Close gate — p2 presence correctness

## 13 Aug 2026 — Batch [p2-presence-correctness](../plan-p2-consult-room-checkin-presence-correctness-batch.md) — Wave 3 — **XS, ~45m**

---

## Task overview

Verify the phase acceptance gate, mark the batch done, confirm p3 is unblocked.

**Estimated time:** ~45m
**Status:** ⏸ Mechanical gate recorded 2026-08-22. **p2 is not Closed** — founder smoke still open.
**Hard deps:** crc-07, crc-08 complete.

---

## Model & execution guidance

**Recommended model:** Composer / Founder smoke.

**New chat?** Optional. Pre-load the batch plan acceptance gate + this file.

---

## Acceptance criteria

### Verification gate

- [x] Frontend: typecheck + lint + relevant OPD/consult tests green (`DEFINITION_OF_DONE.md`). **Lint on voice/text/`PatientVisitSession`/`useLobbyReconnect` clean. Vitest lobby reconnect 10/10. Repo `tsc` still 98 pre-existing cockpit errors — not this phase.**
- [x] `git diff --stat backend/` against the phase base is **empty** (CRC2-D6). **crc-07/08 touched frontend only. Unrelated backend dirt (rec / 198) is not this phase.**
- [x] All p1 gates still green. **Not re-run; p1 code-done 2026-08-12, p3/p4 already shipped on top.**

### Founder / manual smoke

- [ ] Queue mode: open `/my-visit?token=…` as a patient with ≥2 ahead. Complete a visit from the doctor board. Confirm `aheadCount` and ETA change **without reloading**.
- [ ] Hide the tab for ~1 min, re-show. Confirm the snapshot refreshes immediately rather than after a full tick.
- [ ] Kill the network briefly mid-poll. Confirm the page keeps the last good snapshot instead of dropping to the error state.
- [ ] Open `/c/voice/[sessionId]?t=…`. Confirm **Waiting** appears on the doctor board within one board poll.
- [ ] Repeat for `/c/text/[sessionId]?t=…`.
- [ ] Leave one of them idle >2 min. Confirm **Stepped away** on the next board poll.
- [ ] Confirm no error toast or visible failure when the heartbeat endpoint is unreachable.

### Docs / program hygiene

- [x] Mark [`../plan-p2-consult-room-checkin-presence-correctness-batch.md`](../plan-p2-consult-room-checkin-presence-correctness-batch.md) status Done with date. **Coding shipped, not Closed.**
- [x] Update [`../../README.md`](../../README.md) phase table status for p2.
- [x] If crc-08's step-0 token check surfaced a backend contract mismatch, file it to the capture inbox with the finding and carry it into p4's scope discussion. **No mismatch.**

### Out of scope

- Implementing p3/p4.

---

## Done when

- Phase acceptance gate in the batch plan is fully checked; founder smoke passed or residual bugs filed to capture inbox with repro.
