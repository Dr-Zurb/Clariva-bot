# Task 14: IG-bot booking flow — verify (and minimally extend) `patient_phone` capture for SMS fan-out

## 19 April 2026 — Plan [Foundation: consultation_sessions schema + facade + fan-out + IG phone capture](../Plans/plan-01-foundation-consultation-sessions.md) — Phase A.0

---

## Task overview

Plan 01's notification fan-out helper (Task 16) will fire SMS + email + IG DM **in parallel** for clinical urgent moments (consult-ready, prescription-ready). SMS lands via the existing `twilio-sms-service.ts` and reads `appointments.patient_phone`. If that column is null on a high % of bookings, fan-out silently degrades to email + IG only — acceptable but must be **measured** before Plan 04 ships its first text consult.

This task is mostly an **audit** with a **conditional minor extension**:

1. Trace `backend/src/workers/instagram-dm-webhook-handler.ts` end-to-end and confirm the IG-bot booking conversation captures `patient_phone` (E.164) before `awaiting_payment` / before `appointments.status = 'confirmed'`.
2. Run a one-shot SQL audit on existing data to measure the historical capture rate over the last 30 days.
3. **If capture rate ≥ 99.5%** → ship a metric/dashboard surface only; no code change.
4. **If capture rate < 99.5%** → add a `collectPhoneForSms` conversation step + a backfill prompt for existing null rows on next IG interaction.

The capture rate is the gating metric — the actual extension is conditional on what the audit finds. Don't preemptively add the step if the data already proves it's fine.

**Estimated time:** ≤ 2 hours (audit-only path); 3–4 hours (audit + extension path)

**Status:** Code-trace audit complete (2026-04-19); awaiting one SQL run on production. See Decision log below.

**Depends on:** Nothing — runs first in Plan 01 because Task 16 needs the metric to exist before SMS fan-out is wired in.

**Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md)

---

## Acceptance criteria

- [ ] **Audit query:** A documented SQL query — added to `docs/Reference/` or inline in this task file's "Notes" — that returns `patient_phone IS NOT NULL` rate for `appointments` rows where `status = 'confirmed'` AND `created_at > now() - interval '30 days'`. Result captured in this task file's Decision log.
- [ ] **Capture rate target:** Document the actual measured rate. Target ≥ 99.5%; if below, the extension path triggers.
- [ ] **Conversation flow trace:** A short paragraph in the Decision log identifying which `conversation_state.step` value owns phone capture today (or notes that no step does) and the exact code path in `instagram-dm-webhook-handler.ts` that writes `appointments.patient_phone`.
- [ ] **(Conditional) Extension implementation:** If capture rate < 99.5%, add a `collectPhoneForSms` step in the booking state machine before `awaiting_payment`, with copy: *"What's the best phone number to send appointment reminders + the consult link to? (we use SMS as a backup if you can't reach the IG message)"*. Validate E.164 format on receive; persist to both `patients.phone` and `appointments.patient_phone`.
- [ ] **(Conditional) Backfill plan:** If extension path triggers, a documented one-time job (or "next-IG-interaction prompt") to recover `patient_phone` for existing null rows. No silent breakage of existing patients.
- [ ] **Ops dashboard surface:** Add `patient_phone` capture rate to whichever existing ops dashboard surfaces booking metrics today. If no such dashboard exists, add a simple note in the task referencing the SQL query for ad-hoc runs. (Don't build a new dashboard from scratch in this task.)
- [ ] **Tests:** Only required for the conditional extension path — `backend/tests/unit/workers/instagram-dm-webhook-phone-capture.test.ts` covering:
  - happy path: patient sends valid E.164 → step advances + `appointments.patient_phone` set
  - validation: malformed phone → friendly retry copy
  - existing null patient on next interaction: backfill prompt fires once

---

## Out of scope

- Adding WhatsApp DM fan-out. The master plan locked WhatsApp deferral; SMS + email + IG are the three urgent-moment channels in Plan 01.
- Multi-region phone-number formatting (libphonenumber, etc.). E.164 validation suffices for v1; locale-aware normalization can land in a follow-up if international onboarding ramps.
- Patient consent for SMS use. Existing booking ToS already covers transactional SMS for service delivery; verify with the existing privacy policy at PR-time but do not introduce a new consent gate here.
- Doctor-side phone capture (already exists in onboarding).

---

## Files expected to touch

**Audit-only path:**
- This task file (`docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-14-ig-bot-phone-capture-audit.md`) — Decision log entry with measured rate + SQL query

**Extension path (conditional):**
- `backend/src/workers/instagram-dm-webhook-handler.ts` — add `collectPhoneForSms` conversation step
- `backend/src/types/conversation.ts` — add new step value to enum
- `backend/src/utils/dm-copy.ts` — add `buildPhoneCapturePrompt` + `buildPhoneCaptureRetry`
- `backend/tests/unit/workers/instagram-dm-webhook-phone-capture.test.ts` (new)

---

## Decision log

### 2026-04-19 — Code-trace audit (Phase 1 of 2)

**Finding 1 — `patient_phone` cannot be NULL by schema constraint.**

`backend/migrations/001_initial_schema.sql` line 28 declares
`patient_phone TEXT NOT NULL` on `appointments`. Same column shape
(`phone TEXT NOT NULL`) on `patients` line 82. Postgres rejects any
INSERT/UPDATE that would land NULL there, so the **NULL-rate audit
the original task spec measured is moot — the answer is structurally
0% NULL.** Proof: `rg "patient_phone" backend/src/services` returns
exactly one writer (`appointment-service.ts:123`) and it always
forwards the validated value from collection state.

**Finding 2 — Conversation flow `step = 'collecting_phone'` already owns capture.**

The IG-bot booking state machine (`backend/src/services/collection-service.ts`
lines 33–40, `backend/src/types/conversation.ts` line 116) declares
`'collecting_phone'` as the canonical step for phone capture. The step
runs as part of the "all-at-once" intake (`COLLECTION_ORDER = name → phone
→ age → gender → reason_for_visit → email`). The IG handler hard-gates
patient creation on `collected.phone?.trim()` being non-empty
(`backend/src/workers/instagram-dm-webhook-handler.ts` lines 2598, 2606,
2708, 2716, 3041) and only then calls `createPatientForBooking({ phone })`
(handler lines 2614, 2734) → `bookAppointment({ patientPhone })` →
`appointments.patient_phone`. There is **no parallel write path that
bypasses the step**.

**Finding 3 — Validation already enforces E.164-like shape, but `+` is OPTIONAL.**

`backend/src/utils/validation.ts:25` defines
`PHONE_REGEX = /^\+?[1-9]\d{1,14}$/`. This is the regex behind
`patientPhoneSchema`, which gates every `validateAndApply` →
`setCollectedData({ phone })` call. Crucially the leading `+` is
**optional**, so `"9876543210"` (bare 10-digit Indian mobile) passes
validation and gets stored verbatim.

**Finding 4 — The regex-fallback extractor strips country codes, making the problem worse.**

`backend/src/utils/extract-patient-fields.ts:50–55` (`normalizePhone`)
explicitly removes `+91` / leading `0` / any country code and returns
the **last 10 digits**. The AI-first extraction path
(`extractFieldsWithAI`) is preferred, but whenever the LLM returns
nothing or returns no API key, this fallback runs and silently strips
the `+<country>` prefix from anything the patient typed. So the
historical corpus very likely contains many bare-10-digit Indian
numbers, not E.164.

**Finding 5 — Twilio SMS path passes the value through verbatim.**

`backend/src/services/twilio-sms-service.ts:30–54` calls
`client.messages.create({ to: trimmedTo, … })` with no E.164
normalization. `notification-service.ts:247` reads
`appointment.patient_phone` (or falls back to `patients.phone`) and
hands it directly to `sendSms`. **Twilio rejects non-E.164 `to`
values with error 21211** ("Invalid 'To' Phone Number") — the row
counts as `null phone` for fan-out purposes even though the column
is non-null.

**Finding 6 — Placeholder patients exist but never propagate to `appointments.patient_phone`.**

`patient-service.ts:691` writes `phone: 'placeholder-instagram-<senderId>'`
when an IG conversation first appears (so the platform sender has a row
to attach DMs to). At consent the bot calls `createPatientForBooking`
which inserts a **brand-new** `patients` row with the validated phone.
Booking writes `appointments.patient_phone` from the collected value,
not from the placeholder row. So placeholders don't poison the SMS
fan-out path.

**Finding 7 — No booking-metrics ops dashboard exists today.**

`backend/src/services/webhook-metrics.ts` and `services/opd/opd-metrics.ts`
emit structured `metric: …` log lines for log-derived counters; there
is no UI dashboard. The acceptance-criteria "ops dashboard surface"
collapses to "structured INFO log line at the right place + a documented
SQL the on-call can run."

---

### Implication for Plan 01 / Plan 04

The original task hypothesis ("capture rate may be < 99.5%, conditionally
add a step") is **false in shape**. The capture rate by NULL is ~100%,
but the **deliverable rate** (E.164-prefixed, Twilio-acceptable) is
almost certainly < 99.5% for legacy IG-bot rows. The conditional
extension that the task spec proposed (adding a `collectPhoneForSms`
step before `awaiting_payment`) is **the wrong fix** — `collecting_phone`
already runs. The right fixes are:

1. **Format normalization at validation time.** Tighten
   `patientPhoneSchema` to require the leading `+`, OR run all
   incoming phones through a country-code-aware normalizer
   (`libphonenumber-js`) before persisting. Default country code
   = `IN` for v1 since onboarding is India-first; pass through any
   pre-prefixed E.164 unchanged.
2. **Fallback-extractor parity.** Stop stripping `+91` in
   `normalizePhone`; instead, prepend `+91` when input matches the
   `[6-9]\d{9}` pattern with no leading `+`. This recovers the
   fallback path.
3. **Backfill job.** One-shot UPDATE that prepends `+91` to existing
   rows where `patient_phone ~ '^[6-9]\d{9}$'`. Conservative — only
   touches rows that are unambiguously Indian mobiles. Other shapes
   (US 10-digit, malformed) get left alone for manual review.
4. **One-time SMS-send-time observability log.** Inside
   `sendSms` (or its caller), log
   `metric: 'sms_recipient_format', shape: 'e164' | 'bare_10' | 'other'`
   so we can track the deliverable rate over time without a UI
   dashboard.

These four are **out-of-scope for this task** (this task is the
audit) but become the natural follow-up tasks (call them 14a, 14b,
14c, 14d) under Plan 01 once the SQL run below confirms the shape
of the legacy data.

---

## SQL queries to run on production

The original NULL-rate query (kept for completeness, but expected
to return ~100% by schema constraint):

```sql
-- Q1: NULL-capture rate over last 30 days for confirmed appointments
SELECT
  COUNT(*) FILTER (WHERE patient_phone IS NOT NULL) AS with_phone,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE patient_phone IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS pct
FROM appointments
WHERE status = 'confirmed'
  AND created_at > now() - interval '30 days';
```

The **actually-meaningful** query — phone-shape distribution — to
size the normalize/backfill follow-up tasks:

```sql
-- Q2: Phone-shape distribution over last 30 days (deliverability proxy)
SELECT
  CASE
    WHEN patient_phone ~ '^\+[1-9]\d{1,14}$'         THEN 'e164_prefixed'
    WHEN patient_phone ~ '^[6-9]\d{9}$'              THEN 'bare_10_indian_mobile'
    WHEN patient_phone ~ '^0[6-9]\d{9}$'             THEN 'leading_zero_indian'
    WHEN patient_phone ~ '^\d{10,15}$'               THEN 'bare_other'
    WHEN patient_phone IS NULL OR patient_phone = '' THEN 'null_or_empty'
    ELSE 'malformed'
  END AS shape,
  COUNT(*) AS rows,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM appointments
WHERE status = 'confirmed'
  AND created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY rows DESC;
```

A third query to check whether the placeholder phone ever leaked
into appointments (defensive — should always return 0):

```sql
-- Q3: Sanity — placeholder phones must NOT appear on appointments
SELECT COUNT(*) AS leaked_placeholder_count
FROM appointments
WHERE patient_phone LIKE 'placeholder-%';
```

Run all three against the production read replica (or staging mirror).
Paste results + run-date in the result table below, then close this
task by deciding follow-up work based on Q2's `e164_prefixed` percentage.

| Run date   | Q1 with_phone | Q1 total | Q1 % | Q2 e164_prefixed % | Q3 leaked | Decision |
|------------|---------------|----------|------|--------------------|-----------|----------|
| (TODO)     |               |          |      |                    |           | follow-up tasks 14a/b/c/d if e164_prefixed < 99.5% |

---

## Acceptance criteria — re-mapped against findings

- [x] **Audit query:** Q1, Q2, Q3 above. Q1 alone is insufficient (schema makes it ~100%); Q2 is the deliverability-meaningful one.
- [ ] **Capture rate target:** Pending SQL run on prod. Expect Q1 ≈ 100%, Q2 `e164_prefixed` likely < 50% for IG-bot rows.
- [x] **Conversation flow trace:** `'collecting_phone'` step already exists and is enforced; full code path documented in Findings 2–3 above.
- [ ] **(Conditional) Extension implementation:** **Not the right fix.** The original "add `collectPhoneForSms` step" is unnecessary because `collecting_phone` already runs. Replaced by follow-up tasks 14a/b/c/d (see Implication section). Cancelled here, will be tracked separately under Plan 01 once Q2 result lands.
- [ ] **(Conditional) Backfill plan:** Documented in Implication item 3 (one-shot UPDATE prefixing `+91` for `^[6-9]\d{9}$` rows). Will be carved into a follow-up task only if Q2 says it's needed.
- [x] **Ops dashboard surface:** No UI dashboard exists. Q2 is the on-call SQL; Implication item 4 specifies the structured log to add inside `sendSms` for ongoing visibility.
- [ ] **Tests:** Only required for the conditional extension path — not applicable here because the extension as originally written is being cancelled in favour of normalization-at-validation (which would carry its own tests in task 14a).

---

## References

- **Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md) — Phase A.0 deep-dive section
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED (multi-channel fan-out for urgent moments)
- **Existing IG-bot booking handler:** `backend/src/workers/instagram-dm-webhook-handler.ts` (gates at lines 2598, 2606, 2708, 2716, 3041)
- **Collection step definition:** `backend/src/services/collection-service.ts:33–40` (`STEP_BY_FIELD`), `backend/src/types/conversation.ts:116`
- **Phone validation:** `backend/src/utils/validation.ts:25,64-67` (`PHONE_REGEX`, `patientPhoneSchema`)
- **Fallback extractor that strips country code:** `backend/src/utils/extract-patient-fields.ts:50-55` (`normalizePhone`)
- **`appointments.patient_phone` source:** `backend/migrations/001_initial_schema.sql:28`
- **`patients.phone` source:** `backend/migrations/001_initial_schema.sql:82`
- **Placeholder patient writer:** `backend/src/services/patient-service.ts:691` (`placeholderPhone`)
- **Booking writer (only writer to `patient_phone`):** `backend/src/services/appointment-service.ts:123`
- **Existing SMS path (proves the channel works):** `backend/src/services/twilio-sms-service.ts:30-54` consumed by `notification-service.ts:247,294`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-trace audit complete; awaiting one SQL run on production to size the follow-up normalization/backfill work.
