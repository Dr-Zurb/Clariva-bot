# Task lang-21: Consent, revocation, and the pause gate

> **Links:** batch [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md) · exec [`./EXECUTION-ORDER-p5-copy-coverage.md`](./EXECUTION-ORDER-p5-copy-coverage.md)

---

## 📋 Task Overview

Migrate the eight English strings in `consent-service.ts` and give the receptionist pause gate a language.

Small in string count, highest in consequence. `Done. I've removed your personal information…` is the confirmation a patient receives after exercising a data right. It should not arrive in a language they did not choose.

The pause gate is worse than untranslated — it is *unwired*. `receptionistPausedGate` never receives `turnLanguage` at all, so there is nothing to translate later. Same for the revoke gate, which calls `handleRevocation` with no language.

**Program / Phase:** bot-language-policy · p5 · Wave 2
**Estimated Time:** ~4 hours
**Status:** ✅ Eng done (2026-08-02)
**Change Type:** Copy migration + gate parameter threading
**Model:** **Opus** (consent and revocation — named in `.cursor/rules/00-agent-contract.mdc`)
**Depends on:** nothing — disjoint from `lang-20`, safe to run in parallel

---

## ✅ Task Breakdown

### 1. Consent service strings

- [ ] 1.1 `persistPatientAfterConsent` failure (`:69`) and missing-phone (`:79`).
- [ ] 1.2 Persist success (`:108`).
- [ ] 1.3 `handleConsentDenied` (`:129`) — *"No problem. I haven't saved any of your information…"*
- [ ] 1.4 `handleRevocation`: record not found (`:152`), already removed (`:156`), no stored data (`:160`), success (`:183`).
- [ ] 1.5 Each becomes a `dm-copy` builder taking `language`, English in all arms (LANG5-D1).
- [ ] 1.6 These describe **what the system did to the patient's data**. Getting the English exactly right matters more than usual — do not reword, and preserve the distinction between "already removed", "no data to remove", and "removed just now". A translator in p6 will rely on that distinction surviving.

### 2. Thread language into the service

- [ ] 2.1 `consent-service.ts` functions take `language: ConversationLanguage` as an explicit parameter. Do not read the DB inside — every caller is mid-turn with the value resolved.
- [ ] 2.2 Update all callers. Known: `booking-funnel.ts` (`:683-687`), the revoke gate in `control-gates.ts` (`:114-121`).
- [ ] 2.3 The revoke gate has `ctx.turnLanguage`. Pass it. This is the fix that makes the strings reachable at all.
- [ ] 2.4 Grep for other `consent-service` callers before assuming the list is complete.

### 3. Pause gate

- [ ] 3.1 `DEFAULT_RECEPTIONIST_PAUSE_MESSAGE` (`control-gates.ts:60-61`) becomes a builder taking `language`.
- [ ] 3.2 `resolveReceptionistPauseMessage` takes `language` and passes it through for the default arm.
- [ ] 3.3 **A doctor's custom pause message is emitted verbatim, never localized** (LANG5-D4). Write it as an explicit branch with a comment saying why — doctor-authored text is not ours to translate, and a future contributor will otherwise "fix" the inconsistency.
- [ ] 3.4 `receptionistPausedGate.handle` passes `ctx.turnLanguage`.
- [ ] 3.5 Confirm the gate ordering is unchanged: `revoke → emergency → open-crisis → paused`. This task touches what the gates *say*, never when they fire.

### 4. PHI registry

- [ ] 4.1 None of these interpolate patient data — verify rather than assume, then record `phi: false` explicitly (LANG5-D3). An empty entry and a verified-negative entry are different things to p6.

### 5. Tests

- [ ] 5.1 Byte-identical `en` for all eight consent strings plus the pause default.
- [ ] 5.2 Per-locale golden snapshots.
- [ ] 5.3 Revoke gate passes `turnLanguage` into `handleRevocation` — assert on the argument.
- [ ] 5.4 Pause gate: default arm localizes; **custom doctor message passes through untouched** even on a `hi-Latn` thread. The test that protects LANG5-D4.
- [ ] 5.5 Existing consent and revocation behavioural tests pass unmodified. Revocation semantics must be provably unchanged — this task moves strings, nothing else.
- [ ] 5.6 `dm-control-gates.test.ts` gate ordering assertion still passes.

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts (or dm-copy/consent.ts if split)
UPDATE: backend/src/services/consent-service.ts (8 strings + signatures)
UPDATE: backend/src/workers/dm/control-gates.ts (pause default + revoke gate language)
UPDATE: backend/src/workers/dm/stages/booking-funnel.ts (consent call sites only)
UPDATE: backend/tests/unit/utils/dm-copy.snap.test.ts
UPDATE: backend/tests/unit/workers/dm-control-gates.test.ts
DO NOT TOUCH: recording-consent copy — English-only by LANG3-D7, and versioned
DO NOT TOUCH: RECORDING_CONSENT_BODY_V1 or RECORDING_CONSENT_VERSION
DO NOT TOUCH: consent/revocation logic, DB writes, or audit behaviour
DO NOT TOUCH: gate ordering or firing conditions
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Do not change consent or revocation semantics.** What gets deleted, when, and what is audited is untouched. Strings only.
- **Do not translate versioned legal text** (LANG3-D6/D7). The recording-consent body is under a version contract; translating it silently breaks that contract.
- **Do not localize doctor-authored custom copy** (LANG5-D4).
- Do not reword the data-rights confirmations (§1.6).
- Do not reorder gates.
- Never log PII/PHI. These paths handle deletion confirmations — the temptation to log "removed patient X" is exactly the thing the contract forbids.

---

## ✅ Acceptance Criteria

- [ ] All eight consent strings and the pause default are locale-dispatched builders.
- [ ] Revoke and pause gates both pass `turnLanguage`.
- [ ] Doctor custom pause message provably passes through untranslated.
- [ ] `en` byte-identical for every string.
- [ ] Consent/revocation behavioural tests and gate-ordering tests pass unmodified.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
