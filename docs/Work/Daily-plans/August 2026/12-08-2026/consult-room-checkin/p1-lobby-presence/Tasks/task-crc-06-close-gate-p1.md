# Task crc-06: Close gate — p1 lobby presence

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 6 — **S, ~1h**

---

## Task overview

Verify the phase acceptance gate end-to-end; mark batch done; park follow-ups (p2 Realtime, FB fan-out, device pre-check).

**Estimated time:** ~1h  
**Status:** ⏳ Pending  
**Hard deps:** crc-01…crc-05 complete.

---

## Model & execution guidance

**Recommended model:** Composer / Founder smoke.

**New chat?** Optional. Pre-load batch plan acceptance gate + this file.

---

## Acceptance criteria

### Verification gate

- [ ] Backend: typecheck + lint + unit tests green (`DEFINITION_OF_DONE.md`).
- [ ] Frontend: typecheck + lint + relevant OPD/consult tests green.
- [ ] Migration 193 content-sanity present; apply path documented if not auto-applied in CI.

### Founder / manual smoke

- [ ] Slot: book video appointment → wait or force cron window → receive check-in link → open lobby before Start → board shows Waiting → doctor Start → patient auto-joins.
- [ ] Queue: with ≥4 waiting, advance until ahead≤3 → check-in DM once → same lobby path.
- [ ] Confirm **no** Twilio room SID / `consultation_sessions` video row until Start.
- [ ] Stepped away: leave lobby idle >2 min → tag updates on next board poll.

### Docs / program hygiene

- [ ] Mark [`../plan-p1-consult-room-checkin-lobby-presence-batch.md`](../plan-p1-consult-room-checkin-lobby-presence-batch.md) status Done with date.
- [ ] Update [`../../README.md`](../../README.md) phase table status for p1.
- [ ] Capture inbox items (if not already) for:
  - p2 Realtime lobby presence
  - Facebook Messenger consult/check-in fan-out
  - p3 device pre-check
  - Optional: board “suggest requeue if next not waiting”

### Out of scope

- Implementing p2/p3.

---

## Done when

- Phase acceptance gate in the batch plan is fully checked.
- Founder smoke passed or residual bugs filed to capture inbox with repro.
