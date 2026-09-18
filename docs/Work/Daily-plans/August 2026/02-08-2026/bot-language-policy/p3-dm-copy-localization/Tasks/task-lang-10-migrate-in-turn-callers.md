# Task lang-10: Migrate in-turn callers

> **Links:** batch [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md) · exec [`./EXECUTION-ORDER-p3-dm-copy-localization.md`](./EXECUTION-ORDER-p3-dm-copy-localization.md)

---

## 📋 Task Overview

Pass `ctx.turnLanguage` into every `dm-copy` builder that already accepts `language` from inside a DM turn.

**Program / Phase:** bot-language-policy · p3 · Wave 2
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Refactor (call sites)
**Model:** Sonnet
**Depends on:** `lang-09` (pattern established)

---

## ✅ Task Breakdown

### Done
- [x] `language` **required** on `IntakeRequestInput` (no silent `'en'` default)
- [x] All intake call sites pass `ctx.turnLanguage`:
  - `booking-funnel.ts` (5)
  - `booking-entry.ts` (4)
  - `service-match.ts` (1)
- [x] `buildNonTextAckMessage({ language })` — IG handler uses `resolveTurnLanguage(stored, '')` for sticky language
- [x] Tests: intake plumbing + non-text sticky + snaps green

### Deferred to lang-11 / lang-12
- [ ] `cancel-reschedule-status.ts` cancel-list builders — no `language` field until lang-12
- [ ] `staff-service-review-dm.ts` + service callers — out-of-band DB language (lang-11)
- [ ] Other in-turn builders (`buildConfirmDetailsMessage`, `buildConsentOptionalExtrasMessage`, …) — locale tables in lang-12
- [ ] Legal builders remain English-only (LANG3-D7) — no language param by design

---

## ✅ Acceptance Criteria

- [x] Intake in-turn callers pass `turnLanguage`
- [x] No temporary `en` default on intake
- [x] Non-text path preserves stored language
- [x] Typecheck + tests green
- [ ] Full Hinglish funnel (confirm/consent) — blocked on lang-12 copy tables

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
