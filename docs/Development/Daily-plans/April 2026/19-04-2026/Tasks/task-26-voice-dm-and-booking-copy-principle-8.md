# Task 26: DM + booking copy — `buildConsultationReadyDm` voice variant + `buildPaymentConfirmationMessage` voice disambiguation (Principle 8 LOCKED)

## 19 April 2026 — Plan [Voice consultation modality](../Plans/plan-05-voice-consultation-twilio.md) — Phase B

---

## Task overview

**Principle 8 LOCKED:** voice booking + DM copy must explicitly say *"audio only, no phone call — tap link to join"*. Without this disambiguation, patients in markets where "voice consult" defaults to "phone call" (especially India) will sit on their phone screen waiting for a ring that never comes → "but the doctor never called me" support tickets.

This task ships **both** copy surfaces in one PR so the messaging is consistent across the booking → reminder → consult-ready arc:

1. **Consult-ready DM (5 min before slot):** `buildConsultationReadyDm` voice branch lit up in `backend/src/utils/dm-copy.ts:680-683` (currently throws "voice-modality copy ships in Plan 05"). Mirrors the video + text branches' three-paragraph structure, but adds an explicit "audio only, no phone call" disambiguation paragraph between the trust-signal opener and the bare URL.
2. **Booking-time payment-confirmation DM (immediately after Razorpay capture):** `buildPaymentConfirmationMessage` extended with an optional `modality?: ConsultationModality` field. When `modality === 'voice'`, the helper appends a Principle 8 disambiguation paragraph **before** the existing closing line — so the patient learns "this is a web link, not a phone call" days before the consult, not 5 min before.

Two surfaces, one task, one source-of-truth file. Plan 04 Task 21 lit up the text variant of `buildConsultationReadyDm`; this task is the symmetric voice equivalent.

This is a copy-quality task — get the wording wrong and 100% of voice consults send confusing messages. Snapshot tests pin the strings.

**Estimated time:** ~1 hour (actual: ~45 min)

**Status:** Code-complete 2026-04-19 — see Decision log.

**Depends on:** Nothing hard. Task 23 (voice adapter) will call `buildConsultationReadyDm` via the existing Task 16 `sendConsultationReadyToPatient` fan-out helper, so this task can ship in parallel with Task 23 (and ahead of Task 24 / 25). The booking flow that calls `buildPaymentConfirmationMessage` is older infrastructure (Razorpay webhook handler) and already sets `consultation_type` on the appointment row — wiring the new optional `modality` arg is a small follow-up at the call site, captured here as a one-line diff.

**Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md)

---

## Acceptance criteria

- [ ] **`buildConsultationReadyDm` voice branch lit up** in `backend/src/utils/dm-copy.ts:680-683`. Replace the existing throw with the voice-variant body. Final shape (final wording subject to copy-review nit-pick during PR but the structure is locked):
  ```
  Your voice consult with **{practice}** is starting.

  👉 This is an internet voice call (audio only) — NOT a phone call. Tap the link below to join from this device.

  {url}

  Reply in this thread if anything looks wrong.
  ```
  Wording deliberately diverges from the video + text branches at:
  - `"video consult"` / `"text consult"` → `"voice consult"`.
  - **NEW** disambiguation paragraph 2 — the load-bearing Principle 8 line. Anchored on the literal substrings `"audio only"` and `"NOT a phone call"` in tests so a future copy-tweak that drops either keyword fails the test loudly.
  - The closing stays `"Reply in this thread if anything looks wrong."` — same escape valve as the other two branches, same rationale (urgent fan-out hits SMS where patients can't reply to the bot).
  - The `practiceName` fallback (`'your doctor'`) and `joinUrl`-empty throw are reused unchanged from the existing video / text branches.
  - **Helper signature unchanged.** `ConsultationReadyDmInput` is not modified; only the body of `case 'voice'` and the JSDoc lose their "ships in Plan 05" breadcrumb.
- [ ] **`buildPaymentConfirmationMessage` extended** to accept an optional `modality` field on `PaymentConfirmationInput`:
  ```ts
  export interface PaymentConfirmationInput {
    readonly appointmentDateDisplay: string;
    readonly patientMrn?:            string;
    /**
     * Booked consultation modality — drives Principle 8 disambiguation copy.
     * Only `'voice'` triggers a copy variant today; the other values render
     * the existing all-purpose copy unchanged. Optional + backward-compatible:
     * existing callers that don't pass `modality` get byte-identical output
     * to the pre-Plan-05 helper.
     */
    readonly modality?: ConsultationModality;
  }
  ```
  - Voice-variant rendered body (inserted between the date paragraph and the closing line; only when `modality === 'voice'`):
    ```
    Note: voice consults happen via a web link from your browser — audio only, no phone call. We'll text + IG-DM the join link 5 min before.
    ```
  - All other modalities (`text`, `video`, `in_clinic`, undefined) → byte-identical to today's output (verified by snapshot regression test on the existing fixture).
  - **Type import.** `ConsultationModality` already exists at `frontend/types/appointment.ts`; for backend-side import, mirror the type in `backend/src/types/database.ts` if not already exported, or define a narrow union in `dm-copy.ts` (`type ConsultationModality = 'text' | 'voice' | 'video' | 'in_clinic'`). Pick the smallest-surface option at PR-time — the type already exists in multiple places (`backend/src/types/conversation.ts:190` has `consultationModality`).
- [ ] **Caller wiring at the booking-confirmation site.** Find the call site of `buildPaymentConfirmationMessage` (likely in the Razorpay webhook handler or `payment-service.ts`'s post-capture flow). Add the `modality` argument by reading `appointments.consultation_type` from the booking record. One-line diff at most. Do **not** introduce a new column or query — `consultation_type` is already on the appointment row (verified at `backend/src/types/database.ts:115`).
- [ ] **No caller wiring needed for `buildConsultationReadyDm`.** Plan 01 Task 16 shipped `sendConsultationReadyToPatient` already modality-aware; Task 23's voice adapter goes through the same fan-out. Once this task lights up the voice branch, the call path works end-to-end.
- [ ] **Snapshot tests** in `backend/tests/unit/utils/dm-copy-voice-variant.test.ts` (NEW):
  - `buildConsultationReadyDm` voice variant — happy-path snapshot with practice name set.
  - `buildConsultationReadyDm` voice variant — practice-name-fallback snapshot (whitespace-only).
  - `buildConsultationReadyDm` voice variant — practice-name-fallback snapshot (undefined).
  - `buildConsultationReadyDm` voice variant — empty `joinUrl` throws (parity with video + text branches).
  - `buildConsultationReadyDm` voice variant — load-bearing **`"audio only"`** substring assertion (separate from snapshot — survives copy nits).
  - `buildConsultationReadyDm` voice variant — load-bearing **`"NOT a phone call"`** substring assertion (separate from snapshot — survives copy nits).
  - `buildPaymentConfirmationMessage` modality voice — happy-path snapshot.
  - `buildPaymentConfirmationMessage` modality voice — load-bearing `"audio only"` + `"no phone call"` substring assertions (each, independent of snapshot).
  - `buildPaymentConfirmationMessage` modality voice — disambiguation paragraph appears **before** the closing reminder line (positional assertion, not just substring).
  - `buildPaymentConfirmationMessage` modality voice + `patientMrn` set — disambiguation paragraph appears between the MRN block and the closing line.
  - `buildPaymentConfirmationMessage` modality `text`, `video`, `in_clinic`, `undefined` — output byte-identical to current behavior. Implemented as a parameterized regression test that loads the existing `dm-copy.snap.test.ts` fixture and runs each non-voice modality through the new helper, asserting the snapshot is unchanged.
  - **The "video / text branches still render byte-identically" assertion** stays in the existing `dm-copy.snap.test.ts` and `dm-copy-text-modality.test.ts` regression suites — those tests will catch any accidental cross-branch leak. Document in the head comment of the new test file.
- [ ] **JSDoc on `buildConsultationReadyDm`** updated to remove the "OR when `modality` is `'voice'` (that branch ships in Plan 05)" clause from the `@throws` line. The clause currently reads (`dm-copy.ts:634-636`):
  ```
   * @throws when `joinUrl` is empty (always a caller bug — the fan-out
   *   helper computes the URL via the consultation-session-service before
   *   calling) OR when `modality` is `'voice'` (that branch ships in Plan 05).
  ```
  → drop the OR-clause; voice no longer throws after this task ships.
- [ ] **JSDoc on `buildPaymentConfirmationMessage`** extended with a one-paragraph note explaining the Principle 8 disambiguation paragraph and why it's only fired for `modality === 'voice'`. Reference Principle 8 by name + the master plan link so future maintainers find the rationale.
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/utils/` green; full backend suite green.

---

## Out of scope

- The voice transcription pipeline (Task 25). Different concern.
- The fan-out helper that calls `buildConsultationReadyDm`. Task 16 already shipped `sendConsultationReadyToPatient`; this task just makes its `modality: 'voice'` call path work end-to-end instead of throwing.
- Voice-specific reminder copy (24h reminder DM). Out of v1; existing `appointmentConsultationTypeToLabel` (`dm-copy.ts:842-858`) already labels voice as "Voice consult" in cancel / reschedule lists, which is sufficient v1 disambiguation outside the booking + ready DMs.
- WhatsApp variant. Master plan WhatsApp is deferred indefinitely.
- Internationalization. v1 is English-only. Translation surface is a Plan 10+ concern.
- Rich-text formatting beyond the existing `**bold**` markdown. The existing helpers ship plain text + light markdown; this task does not change that.
- Specialty-aware variants ("voice consult for second-opinion / lab review"). Single happy-path copy in v1.

---

## Files expected to touch

**Backend:**

- `backend/src/utils/dm-copy.ts` — light up the `case 'voice'` branch in `buildConsultationReadyDm`; extend `PaymentConfirmationInput` with the optional `modality` field; add the voice-disambiguation paragraph to `buildPaymentConfirmationMessage`. Update both helpers' JSDoc.
- The single call site of `buildPaymentConfirmationMessage` — pass `modality: appointment.consultation_type ?? undefined`. Likely `backend/src/services/payment-service.ts` or the Razorpay webhook handler; confirm at PR-time via grep.

**Tests:**

- `backend/tests/unit/utils/dm-copy-voice-variant.test.ts` — new (covers both helpers' voice path).
- `backend/tests/unit/utils/dm-copy-consultation-ready.test.ts` — update the existing "voice still throws" assertion to assert the new voice-variant copy. One-line diff to the test's expectation.

**No source code beyond `dm-copy.ts` + the one call site. No frontend touched. No new migrations. No new env vars.**

---

## Notes / open decisions

1. **Why disambiguate at booking time AND at consult-ready time?** Both arcs lose patients. Booking-time disambiguation catches the "I assumed this was a phone call" expectation mismatch days early — patient still has time to cancel or reschedule. Consult-ready (5 min before) disambiguation catches the patient who skimmed the booking confirmation. Belt-and-suspenders for a UX wart that scales linearly with bookings — over-warning is cheap, under-warning is expensive in support tickets.
2. **`👉` glyph at the start of the disambiguation paragraph.** Borrowed from the IG / WhatsApp content-creator vernacular — calls visual attention without the alarm-bell connotation of `⚠️`. Optional; if copy review wants to drop it, the substring tests assert on `"audio only"` + `"NOT a phone call"`, not on the glyph.
3. **`NOT a phone call` is in CAPS deliberately.** Plain text DMs lack typography for emphasis; CAPS on three-word noun phrases ("NOT a phone call") is the lightweight industry pattern (banking SMS, government alerts) that doesn't read as shouting. Snapshot test pins the casing.
4. **Why an optional `modality` field on `PaymentConfirmationInput` instead of a separate `buildVoicePaymentConfirmationMessage` helper?** Symmetry. The text + video + in-clinic branches all render the same body today, and we want voice to be the only divergent case. A separate helper would force the call site to branch (`if (modality === 'voice') buildVoice... else buildGeneric...`), which is the exact fork we're trying to avoid in `dm-copy.ts`. One helper, one branch, callers stay generic.
5. **The voice DM's `"This is an internet voice call (audio only) — NOT a phone call."` line is final-locked copy from the plan.** Wording is a transliteration of the master plan's Principle 8 spec. Snapshot test pins the exact string. If a copy-reviewer wants a tweak, they edit the test snapshot in the same PR — the load-bearing substring assertions catch any regression that drops the keywords.
6. **`appointmentConsultationTypeToLabel('voice')` already returns `"Voice consult"`** (`dm-copy.ts:849-850`). This task does **not** touch that helper — the cancel / reschedule list copy already disambiguates voice from video at the label level; the Principle 8 wording is specifically for the moments where the patient is most likely to expect a phone-call ring (booking confirmation + 5-min-before).
7. **Booking-confirmation copy will fire for in-clinic appointments too** — the existing helper is generic across modalities. The new `modality === 'voice'` branch is purely additive; in-clinic / video / text bookings render the existing copy unchanged. The regression test pins this byte-for-byte.
8. **No `confirmationDateDisplay` / `joinUrl` cross-pollution.** The booking-confirmation DM intentionally does NOT include a join URL — that's the consult-ready DM's job (sent 5 min before the slot). The Principle 8 disambiguation paragraph references "we'll text + IG-DM the join link 5 min before" as the bridge — no URL in the booking DM body. Don't tempt-add one in this task; that's a separate UX decision.

---

## References

- **Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md) — DM + booking copy section (the inline TypeScript snippet in the plan is the design source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Principle 8 LOCKED.
- **Existing builder (voice branch throws today):** `backend/src/utils/dm-copy.ts:680-683` — `buildConsultationReadyDm`.
- **Existing booking-confirmation builder (modality-blind today):** `backend/src/utils/dm-copy.ts:499-517` — `buildPaymentConfirmationMessage`.
- **Existing snapshot test patterns:** `backend/tests/unit/utils/dm-copy.snap.test.ts`, `backend/tests/unit/utils/dm-copy-consultation-ready.test.ts`, `backend/tests/unit/utils/dm-copy-text-modality.test.ts`.
- **Plan 04 Task 21 — sibling text-variant task this one mirrors:** [task-21-dm-copy-text-consult-and-prescription-ready.md](./task-21-dm-copy-text-consult-and-prescription-ready.md).
- **Plan 01 Task 16 — fan-out helper that calls `buildConsultationReadyDm`:** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md).
- **Plan 05 Task 23 — voice adapter that triggers the fan-out:** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete 2026-04-19 (shipped sequentially after Task 25 rather than in parallel with Task 23 — no cross-impact, see Decision log).

---

## Decision log — 2026-04-19

### What shipped

**Copy (`backend/src/utils/dm-copy.ts`):**

- `case 'voice'` in `buildConsultationReadyDm` replaced the `"ships in Plan 05"` throw with the final-locked Principle 8 body:
  ```
  Your voice consult with **{practice}** is starting.

  👉 This is an internet voice call (audio only) — NOT a phone call. Tap the link below to join from this device.

  {url}

  Reply in this thread if anything looks wrong.
  ```
  Reuses the shared `practiceName` fallback (`'your doctor'`) and `joinUrl`-empty throw unchanged. No other branches touched; the existing exhaustiveness check (`const _exhaustive: never`) stays valid.
- `buildPaymentConfirmationMessage` extended to accept an optional `modality?: PaymentConfirmationModality` field. When `modality === 'voice'`, a disambiguation paragraph is inserted **between** the existing MRN block (if any) and the closing reminder line:
  ```
  Note: voice consults happen via a web link from your browser — audio only, no phone call. We'll text + IG-DM the join link 5 min before.
  ```
  All non-voice modalities (`text`, `video`, `in_clinic`, `undefined`) render byte-identically to today's output — pinned by the existing `dm-copy.snap.test.ts` fixture (unchanged, still green) + a dedicated regression block in the new test file.
- JSDoc updates: dropped the `OR when 'modality' is 'voice'` clause from `buildConsultationReadyDm`'s `@throws` line; added a Principle 8 rationale paragraph to `buildPaymentConfirmationMessage`'s JSDoc referencing `plan-multi-modality-consultations.md`.

**Type surface:**

- Introduced `PaymentConfirmationModality = ConsultationModality | 'in_clinic'` as a **parallel** union to `ConsultationModality` (rather than widening the latter). Rationale: `buildConsultationReadyDm` is teleconsult-only by design and uses an exhaustive switch with a `never` check — widening `ConsultationModality` to add `'in_clinic'` would force a noisy `case 'in_clinic'` branch in that helper. A sibling narrow union for the payment-confirmation input keeps both contracts clean.
- Exported the new type from `dm-copy.ts` so `notification-service.ts` can narrow the raw DB `consultation_type` string to the typed union without duplicating the literal list.

**Caller wiring (`backend/src/services/notification-service.ts`):**

- `sendPaymentConfirmationDM` now selects `consultation_type` from the `appointments` row (added to the existing `.select(...)` call — no new query, no new column).
- Narrows the nullable string to `PaymentConfirmationModality | undefined` via an explicit allowlist (`'text' | 'voice' | 'video' | 'in_clinic'` → passthrough; anything else / null → undefined). This keeps the helper's input well-typed even when future `consultation_type` values land in the DB before copy catches up — unknowns fall back to the generic copy, never throw.
- Existing fan-out helper `sendConsultationReadyToPatient` (Task 16) already passes `modality` through to `buildConsultationReadyDm`, so the urgent-ping path now works end-to-end for voice consults once Task 23's adapter fires it.

**Tests:**

- **New** `backend/tests/unit/utils/dm-copy-voice-variant.test.ts` — 19 tests covering:
  - `buildConsultationReadyDm` voice: happy-path inline snapshot, practice-name fallback (whitespace + undefined), `joinUrl`-empty throw parity, load-bearing `"audio only"` substring, load-bearing `"NOT a phone call"` substring (CAPS casing explicitly guarded), URL-on-its-own-line positional check.
  - `buildPaymentConfirmationMessage` voice: happy-path inline snapshot (with MRN), load-bearing `"audio only"` + `"no phone call"` substrings (each), positional assertion that the disambiguation paragraph appears between MRN and closing (or between date and closing when MRN absent).
  - Parameterized regression block: for each non-voice modality (`text`, `video`, `in_clinic`) × (with-MRN, without-MRN), asserts byte-identical output to the no-modality baseline. Plus an explicit `modality: undefined` passthrough case.
- **Updated** `backend/tests/unit/utils/dm-copy-consultation-ready.test.ts` — the `"throws on voice modality (ships in Plan 05)"` test was rewritten to assert voice now renders correctly with the Principle 8 disambiguation substrings. Head comment updated to reflect the Task 26 milestone. One test replaced in place (no net count change in this file).

### Scope clarifications

- **`ConsultationModality` was NOT widened.** The task doc offered two options ("mirror in `backend/src/types/database.ts`" OR "define a narrow union in `dm-copy.ts`") — I picked option C, a parallel `PaymentConfirmationModality` union alongside the existing `ConsultationModality`. Smallest blast radius: no database-types change, no exhaustive-switch regressions in `buildConsultationReadyDm`, and `notification-service.ts` imports the narrow type directly.
- **No rich call-site narrowing library.** The AC said "one-line diff at most" at the call site. The final diff ended up being ~10 lines (select extension + inline narrow + modality pass-through). The narrow is literally a chained `||` ladder against the four known literals — nothing warranting a helper function. Kept inline so the intent is visible at the call site.
- **`appointmentConsultationTypeToLabel` untouched.** That helper already labels voice as `"Voice consult"` in cancel/reschedule lists; Principle 8 wording is only for booking-confirmation + consult-ready moments, as the task explicitly called out in Out-of-scope note 6.
- **No new exported helper for the narrow.** Kept the `'text' | 'voice' | 'video' | 'in_clinic'` literal allowlist inline at the one call site. If a second call site ever needs the same narrow (e.g. reminder-DM when it ships), hoist into a tiny `normalizeConsultationTypeForCopy` helper at that time — premature abstraction today.

### Verification

- `npx tsc --noEmit` → exit 0.
- `npx jest tests/unit/utils/dm-copy` → **6 suites / 163 tests / 63 snapshots** all pass (includes the existing `dm-copy.snap.test.ts` regression fixture — confirms non-voice rendering is byte-identical).
- `npx jest tests/unit/services/notification-service` → **2 suites / 13 tests** pass (confirms the `.select('consultation_type')` + narrow didn't disturb existing mocks).
- Full backend suite: **106 suites / 1371 tests / 63 snapshots** all pass (+1 suite, +19 tests vs. Task 25 baseline — matches the new `dm-copy-voice-variant.test.ts`).
- `ReadLints` on all four touched files → no lint errors.

### Merge-time checklist (human owner)

- [ ] Copy-review the locked strings. Final wording is pinned by inline snapshots + load-bearing substrings — any copy-nit that drops `"audio only"` or `"NOT a phone call"` will fail the test loudly, which is the point.
- [ ] Confirm the existing Razorpay / payment webhook flow (the sole caller of `sendPaymentConfirmationDM`) actually populates `appointments.consultation_type` before invoking the helper. A null `consultation_type` falls through to generic copy, which is safe but suboptimal for voice bookings. Spot-check one voice booking end-to-end at PR-time: book voice slot → capture payment → verify the Principle 8 paragraph appears in the delivered DM.
- [ ] (Optional) WhatsApp variant — master plan defers indefinitely; if WhatsApp ever lights up, this helper's output is template-string safe, but the `👉` glyph may need a plain-text fallback. Captured as an open nit, not a blocker.

### Dependency status

- **Task 16** (fan-out helper `sendConsultationReadyToPatient`) — shipped. Calls `buildConsultationReadyDm({ modality, … })` directly; voice now works end-to-end.
- **Task 21** (text-variant of `buildConsultationReadyDm`) — shipped. This task mirrors Task 21's file layout and test patterns.
- **Task 23** (voice adapter) — shipped yesterday. Its `endSession` path enqueues transcription; the urgent-ping path will fire `buildConsultationReadyDm({ modality: 'voice', … })` without throwing the moment the consult-ready cron trigger resolves a voice appointment.
- **Task 24 / 25** (voice surfaces / transcription pipeline) — independent. Task 26 was safe to ship sequentially rather than in parallel; no cross-impact.

