# Task lang-09: `dm-copy` locale dispatch layer + first family

> **Links:** batch [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md) · exec [`./EXECUTION-ORDER-p3-dm-copy-localization.md`](./EXECUTION-ORDER-p3-dm-copy-localization.md)

---

## 📋 Task Overview

Establish **how** a `dm-copy` builder becomes locale-aware, and prove it on exactly **one** family — the intake ask (`buildIntakeRequestMessage`, plus field labels).

**Program / Phase:** bot-language-policy · p3 · Wave 1
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Architecture (patient-facing copy module)
**Model:** Opus (executed on founder override)
**Depends on:** p2 closed

---

## ✅ Task Breakdown

### 1. The pattern
- [x] `language?: ConversationLanguage` on `IntakeRequestInput` (defaults `'en'` for compile until lang-10)
- [x] Colocated `INTAKE_REQUEST_COPY: Record<StaticMessageLocale, …>`
- [x] `toStaticLocale` once at top of builder
- [x] Module header updated (locale dispatch + LANG3-D6/D7)

### 2. First family: intake ask
- [x] Labels + all intro/footer variants via locale record
- [x] Markdown structure preserved (`{{practice}}` / `{{relation}}` substitution)
- [x] hi/pa arms ship English (LANG3-D4) pending human review

### 3. Guardrails
- [x] `dm-copy-locale-invariants.test.ts` (practice name, protected tokens, bullet structure, `other` → en)
- [x] LANG3-D7 markers on recording-consent ask/explainer + account-deletion explainer

### 4. Tests
- [x] Per-locale intake snapshots (4 new); existing **en** snaps unchanged (57 passed, 0 updated)
- [x] Invariants + `other` → English

### Call sites still defaulting to `en` (for lang-10)

| File | Approx sites |
|------|----------------|
| `booking-funnel.ts` | 5× `buildIntakeRequestMessage` |
| `booking-entry.ts` | 4× |
| `service-match.ts` | 1× |

---

## ✅ Acceptance Criteria

- [x] Pattern documented + demonstrated on intake
- [x] en snapshots byte-identical
- [x] hi/pa/other snaps exist
- [x] LANG3-D6 invariants tested
- [x] Consent/legal English-only markers
- [x] Module remains pure
- [x] Typecheck + tests green

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
