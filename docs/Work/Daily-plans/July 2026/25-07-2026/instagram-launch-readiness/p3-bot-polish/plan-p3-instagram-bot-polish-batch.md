# Plan p3 — Instagram bot polish (batch)

> **Status:** 📋 Scaffolded (2026-07-25). Start after p2 close gate.  
> **Program:** [`../README.md`](../README.md) · Tasks `ilr-11`…`ilr-16`  
> **One-line intent:** Close funnel dead-ends, weak fallbacks, and copy/brand gaps that hurt conversion — without redesigning the AI architecture.

---

## Why this phase

Should-fix-pre-launch items from the audit: reschedule follow-up hole, match-unclear → new patient, dead-end fallbacks, silent `no_doctor_token`, brand "Halo Aid" fallback, thin localization, "link above" slot copy, fee↔book intent demotion, returning-patient memory off, comment→conversation link never wired.

---

## Decision lock

| ID | Decision |
|----|----------|
| **ILR3-D1** | Polish shared engine only — no channel forks (ILR-D2). |
| **ILR3-D2** | Match confirmation `unclear` → **re-prompt**, never auto-create new patient. |
| **ILR3-D3** | Replace "We'll get back to you soon" dead-end with actionable menu (book / fees / status). |
| **ILR3-D4** | Returning-patient memory: document env flag; default **on in staging**, production flip is a launch config decision (OQ-1). |
| **ILR3-D5** | Comment→conversation link is in this phase (analytics + lead quality) but **not** a launch blocker if time-boxed — close gate may park it. |

---

## Open questions

| ID | Question | Default |
|----|----------|---------|
| **OQ-1** | Enable `RETURNING_PATIENT_MEMORY_ENABLED` for production at launch? | **Yes** after privacy gates already claimed shipped (rcp-24); verify first |
| **OQ-2** | Localization depth for p3 — Hinglish for key funnel strings only, or full? | **Key funnel strings** (consent, slot nudge, staff-pending, fallbacks) |

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ilr-11` | Reschedule slot follow-up handler | S–M | Sonnet / Opus |
| `ilr-12` | Match-unclear re-prompt + fallbacks + no_doctor_token | M | Sonnet / Opus |
| `ilr-13` | Brand / localization / slot-link copy | M | Sonnet |
| `ilr-14` | Fee↔book intent + returning-patient memory flag | S–M | Sonnet / Opus |
| `ilr-15` | Comment lead → conversation link | S | Sonnet |
| `ilr-16` | Close gate p3 | S | Sonnet / Composer |

---

## Acceptance gate

- [ ] Post-reschedule-link messages get reschedule-aware handling.
- [ ] Unclear match confirmation re-prompts (no silent new patient).
- [ ] Fallbacks are actionable; expired token path replies or alerts doctor.
- [ ] Practice name used when set; key funnel strings localized per OQ-2.
- [ ] Slot follow-up does not rely only on "link above".
- [ ] Returning memory flag decided + documented.
- [ ] Comment→conversation link wired **or** explicitly parked with reason.
- [ ] Verification green.

---

**Created:** 2026-07-25.
