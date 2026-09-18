# Plan p3 — Localize `dm-copy.ts` (batch)

> **Status:** ✅ eng done (2026-08-02). Founder live smoke (`lang-13`) still open. **LANG3-D4 discharged by p6** (`lang-25`…`27`, 2026-08-03) — booking-critical + OOB arms ship Roman hi/pa (or `enByPolicy` with reason).
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-09`…`lang-13`
> **One-line intent:** The last English-only layer learns to speak. Every patient-facing DM string renders in the conversation's language, including messages sent hours later by background workers.

---

## Why this phase

After p2, one thing decides language and every *in-turn* emitter obeys it — except `dm-copy.ts`, which is **English-only by explicit design**:

> *"If localized variants are needed, add them in a follow-up task — English only for now, matching the rest of the plan's non-goals."*
> — `backend/src/utils/dm-copy.ts:44-45`

That module owns **24 exported builders** across **1713 lines**: intake ask, confirm-details, consent, cancel picker, payment confirmation, prescription-ready, recording consent, account deletion, refunds. So a patient conducting the whole booking in Hinglish still gets the actual booking mechanics in English. This is the phase that makes the promise real.

### The wrinkle that shapes this phase

`dm-copy` has **two classes of caller**:

| Class | Callers | Where language comes from |
|---|---|---|
| **In-turn** | `booking-funnel.ts`, `booking-entry.ts`, `service-match.ts`, `cancel-reschedule-status.ts`, `instagram-dm-webhook-handler.ts`, `staff-service-review-dm.ts` | `ctx.turnLanguage` — already available |
| **Out-of-band** | `notification-service.ts`, `abandoned-booking-reminder.ts`, `account-deletion-worker.ts`, `modality-refund-retry-worker.ts`, `collection-service.ts` | **Must read `conversations.language` from the DB** — there is no turn |

The out-of-band class is why p3 is not a find-and-replace. A reminder sent 24 hours later has to remember what language the thread was in — which is exactly what `lang-02`'s column was for.

---

## Decision lock

Inherit program **LANG-D1…D9** and **LANG2-D1…D5**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LANG3-D1** | Builders take `language` in their **existing typed input object**, not as a new positional arg. | Preserves the module's stated contract (`dm-copy.ts:8-9`): typed inputs, not positional. |
| **LANG3-D2** | Copy lives in a **per-builder locale record** colocated with that builder, not one giant translation map at the top of the file. | 1713 lines is already at the limit; a central map would make every builder read from a distant table. |
| **LANG3-D3** | Out-of-band senders resolve language by **reading `conversations.language`**, defaulting to `en` when `NULL` or when no conversation exists. | LANG-D1 default, applied at the edge. |
| **LANG3-D4** | Untranslated arms **ship English** and are tracked, never machine-translated inline. | ✅ **Discharged by p6** (2026-08-03). Remaining English is deliberate `enByPolicy` (LANG6-D4/D6/D8), not deferral. |
| **LANG3-D5** | Golden snapshots go **per locale** — every builder × every supported locale. | The only way a 24-builder × 3-locale surface stays honest. |
| **LANG3-D6** | Do **not** localize: ₹ amounts, dates produced by `formatDateWithMiddot` / `formatAppointmentChoiceDate`, MRNs, URLs, doctor and practice names, `RECORDING_CONSENT_BODY_V1`. | Consent body is versioned legal text (`RECORDING_CONSENT_VERSION`) — translating it silently would break the version contract. |
| **LANG3-D7** | Legal/consent copy (`buildRecordingConsentAskMessage`, `buildRecordingConsentExplainer`, `buildAccountDeletionExplainerDm`) is **English-only in v1**, explicitly, with a comment saying why. | Needs counsel review per language before it can ship translated. |

---

## Scope guard

- **DO NOT** translate versioned consent text (LANG3-D6/D7).
- **DO NOT** convert currency, dates, or numerals to another numbering system.
- **DO NOT** collapse the two caller classes into one mechanism — the out-of-band path genuinely needs a DB read.
- **DO NOT** add languages beyond `en`/`hi`/`pa` (LANG-D7).
- Fix the mixed-language leftovers carried over from p2's punch-list (below) **only** in `lang-12`, not opportunistically.

---

## Punch-list carried from p2 (`lang-12`)

| Item | Where | Notes |
|------|-------|-------|
| Mixed ask-more opener | `reason-first-triage.ts` `askMoreHi` / `askMorePa` | English *"Thanks for sharing."* + Hindi/Punjabi body |
| Consent-unclear hi/pa | `booking-consent-context.ts` `resolveConsentUnclearMessage` | All arms English until human review (capture inbox) |
| Status-empty hi/pa | `dm-appointment-status.ts` `resolveNoUpcomingAppointmentsMessage` | All arms English until human review (capture inbox) |
| Fee-patience bridge native script | `formatReasonFirstFeePatienceBridgeWhileAskMore` | Pre-existing: Devanagari/Gurmukhi (`hi`/`pa`) fall through to English head; only Latin variants localized |

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-09` | `dm-copy` locale dispatch layer + first family | L | **Opus** |
| `lang-10` | Migrate in-turn callers | M | Sonnet |
| `lang-11` | Migrate out-of-band senders (DB-read language) | M | **Opus** |
| `lang-12` | Translate remaining families + clear the mixed-language punch-list | L | Sonnet |
| `lang-13` | Close gate p3 | S | Composer / Founder |

---

## Acceptance gate

- [ ] A booking conducted entirely in Hinglish is Hinglish from greeting to confirmation — intake ask, confirm-details, consent prompt, slot link, payment confirmation.
- [ ] An abandoned-booking reminder sent hours later arrives in the thread's language.
- [ ] Every `dm-copy` builder has a golden snapshot per supported locale.
- [ ] Consent/legal builders are English with a documented reason, not accidentally English.
- [ ] ₹ amounts, dates, URLs, and names are byte-identical across locales.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
