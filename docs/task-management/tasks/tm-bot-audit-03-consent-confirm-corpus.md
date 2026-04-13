# tm-bot-audit-03 — Consent, confirm & regression corpus epic

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Philosophy:** §4.8, consent/confirm code map

---

## Objective

**No wrong denials** on optional extras; **confirm_details** vs **consent** unambiguous; **golden corpus** covers paraphrases and multilingual cases.

---

## Preconditions

- [ ] tm-bot-audit-00 complete
- [ ] `booking-consent-context` + `resolveConsentReplyForBooking` reviewed in findings

---

## Scope (to refine)

- `resolveConsentReplyForBooking` / `resolveConfirmDetailsReplyForBooking`
- `booking-turn-classifiers.test.ts` + DM routing corpus expansion
- Optional: single JSON schema for “dialog_act” if findings recommend

---

## Out of scope

- Legal copy rewrite (compliance review separately)

**Execution (13-04-2026):** [e-task-phil-04](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-04-collection-seed-extraction-metrics.md), [e-task-phil-08](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-08-golden-corpus-gaps.md) — [README](../../../Development/Daily-plans/April%202026/13-04-2026/execution/README.md)

**Status:** ⏳ Ready for implementation
