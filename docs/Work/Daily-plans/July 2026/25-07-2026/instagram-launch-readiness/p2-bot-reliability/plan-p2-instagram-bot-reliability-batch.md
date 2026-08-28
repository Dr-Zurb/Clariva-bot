# Plan p2 — Instagram bot reliability (batch)

> **Status:** 📋 Scaffolded (2026-07-25). Start after p1 close gate.  
> **Program:** [`../README.md`](../README.md) · Tasks `ilr-06`…`ilr-10`  
> **One-line intent:** Fix silent patient-facing failures (throttle desync, mid-funnel non-text drop, staff-review stall, webhook sig bypass).

---

## Why this phase

Audit launch-blockers / high-severity reliability:

1. Throttle skip persists bot reply to DB but patient never receives it → state desync.
2. Non-text mid-funnel suppresses ack → patient gets silence.
3. Staff service-review can stall booking with no SLA.
4. Webhook HMAC bypass on failed sig for message/comment payloads.

---

## Decision lock

| ID | Decision |
|----|----------|
| **ILR2-D1** | Never persist a bot reply as delivered if send was throttle-skipped — either don't write until send succeeds, or mark unsent / retry. |
| **ILR2-D2** | Mid-funnel non-text always gets a short typed-ack (never silent). Idle "phantom attachment" suppress stays if still needed. |
| **ILR2-D3** | Staff-review pending: doctor dashboard alert + patient copy with expected wait / cancel path. Exact SLA hours = OQ-1. |
| **ILR2-D4** | Production: reject failed-sig DM/comment **or** gate bypass behind env default-off. Prefer fix root cause of bad signatures. |

---

## Open questions

| ID | Question | Default |
|----|----------|---------|
| **OQ-1** | Staff-review patient SLA copy / doctor escalate after N hours? | **24h** doctor alert; patient "still confirming" can mention clinic will respond soon |
| **OQ-2** | Signature bypass: hard reject in prod, or feature flag? | **Hard reject in production**; allow bypass only when `NODE_ENV !== 'production'` or explicit env |

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ilr-06` | Throttle skip: don't persist unsent reply | S–M | **Opus** |
| `ilr-07` | Non-text mid-funnel: always ack | S | Sonnet / Opus |
| `ilr-08` | Staff service-review stall: SLA / escalation | M | **Opus** |
| `ilr-09` | Webhook signature: remove or gate bypass | S–M | **Opus** |
| `ilr-10` | Close gate p2 | S | Sonnet / Composer |

---

## Acceptance gate

- [ ] Throttle skip never leaves "ghost" bot messages in history the patient didn't get.
- [ ] Mid-funnel image/voice/sticker → patient always gets typed-ack.
- [ ] Staff-review has doctor alert path + non-dead-end patient copy.
- [ ] Failed-sig DMs/comments rejected in production (or env-gated with tests).
- [ ] Verification green.

---

**Created:** 2026-07-25.
