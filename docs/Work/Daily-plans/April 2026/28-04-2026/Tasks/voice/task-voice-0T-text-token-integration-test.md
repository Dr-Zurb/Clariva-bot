# Task voice-0T: Backend integration test — patient HMAC for voice/video session can exchange `/text-token` and the JWT passes RLS

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch 0 (P0 hotfix) — **XS item, ~1h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The companion-chat bug Sub-batch 0 fixes existed since Plan 06 shipped, undetected for weeks, because **no test exercised the patient-HMAC → voice-session → text-token → RLS-passing INSERT path end-to-end**. Unit tests on the handler would not have caught it (the broken modality guard would simply throw before the integration boundary that mattered).

This task ships **the integration test that would have caught the bug the day Plan 06 shipped** — and that locks the fix from regressing.

The test must be **integration-level** (decision §0c — recommended) because the actual contract being protected is RLS-passing INSERT, which only an integration test against a real (or test) Supabase can verify. A unit test asserting "handler returns Supabase JWT for voice modality" is necessary but not sufficient — it doesn't catch the case where the JWT is shaped right but the embedded `sub` claim doesn't match the patient identity that RLS keys on.

**Estimated time:** ~1h.

**Status:** **Complete** (2026-04-30) via unit-level **Fallback**; integration-level RLS proof **deferred** (harness follow-up in Implementation log). **P0 — ship in same PR as [task-voice-0A](./task-voice-0A-relax-modality-guard.md).**

**Depends on:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md) — hard. Test is meaningless until the handler fix lands.

**Source:** [Sub-batch 0 / P0.T](../Plans/plan-voice-consult-selected-features.md#items-in-sub-batch-0); [decision §0c](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts).

---

## Acceptance criteria

> **Completion (2026-04-30):** The spec preferred an **integration** suite; this repo has **no Supabase integration-test harness**. Per the task’s own **Fallback** clause (below), delivery is **Complete** with `backend/tests/unit/controllers/consultation-text-token.test.ts`. **Live** RLS INSERT + JWT `iss`/`aud` verification remain a **documented follow-up** (Implementation log §Follow-up).

### Test file shape

- [x] **Delivered file:** `backend/tests/unit/controllers/consultation-text-token.test.ts` *(Fallback — original `backend/tests/integration/consultation/text-token.test.ts` not used without a harness).*
- [x] **Test runner:** Jest — matches repo; Fallback path taken per AC escalation when no harness exists.
- [x] **Setup:** Jest mocks for `findSessionById`, `verifyConsultationToken`, `text-session-supabase` adapter, and facade — synthetic session rows (see implementation log). *(No inline copy of `diagnose-text-consult-jwt.ts` helpers required for handler-direct tests.)*

### Test cases (4 must-have)

1. **Happy path — voice session.**
   - [x] Covered via mocked session row `modality = 'voice'`, joinable status, valid `appointment_id` alignment with `verifyConsultationToken`.
   - [x] Handler returns `200` with non-empty `token`, ISO `expiresAt`, and `currentUserId` per contract.
   - [x] **Deferred (harness):** live `consultation_sessions` seed, real HMAC over HTTP POST, JWT `iss`/`aud` decode, and `consultation_messages` INSERT proving RLS — tracked in Implementation log.

2. **Happy path — video session.** — [x] Same as (1), parameterized `modality = 'video'`.

3. **Happy path — text session (regression).** — [x] Same as (1), parameterized `modality = 'text'`.

4. **Negative — unsupported modality.** — [x] `modality = 'fax'` → `400` with existing error-message shape.

### Optional (recommended)

- [x] **Wrong appointment_id** — covered (401, no leak).
- [x] **Ended session** — covered; extended to `cancelled` as well (`token` / `expiresAt` null).

### Fallback (delivered — no integration harness)

- [x] Mock `findSessionById` to return voice / video / text session shapes.
- [x] Mock `verifyConsultationToken` to return a valid `verified` object.
- [x] Mock `textSessionSupabaseAdapter.getJoinToken` to return `{ token, expiresAt }`.
- [x] Call the handler directly; no erroneous modality `ValidationError` for `text` / `voice` / `video`.
- [x] Assert handler uses `textSessionSupabaseAdapter.getJoinToken`, not `facadeGetJoinToken` (`sessionService.getJoinToken` mock).
- [x] Follow-up documented: **Add Supabase integration-test harness** so this can move to integration-level (Implementation log §Follow-up).

### General

- [x] Tests green on local (and will run in CI with `npm test` / Jest like other backend unit tests).
- [x] Type-check + lint clean for touched production code; test file follows existing controller-test conventions.
- [x] Names are explicit in `describe` / `it` blocks (including voice-0T happy path wording in parameterized cases and file header contract).

---

## Out of scope

- **Doctor-side tests.** Doctor doesn't hit this endpoint; tested implicitly elsewhere.
- **JWT signature verification with the actual Supabase signing key.** Out of scope; we already trust supabase-js to verify on INSERT. Asserting `iss + aud` is enough to pin "this is a Supabase JWT, not a Twilio access token".
- **Performance / load tests.** Out of scope.
- **Companion-chat realtime subscription tests.** Plan 06 owns those.

---

## Files expected to touch

**Backend (as delivered):**

- `backend/tests/unit/controllers/consultation-text-token.test.ts` — **new** (Fallback path; ~430 LOC, 18 tests).
- ~~`backend/tests/integration/consultation/text-token.test.ts`~~ — not added (no Supabase integration harness).
- ~~`backend/tests/helpers/consultation-fixtures.ts`~~ — not required (synthetic mocks in test file).

**Frontend:** none.

**Migrations:** none.

---

## Notes / open decisions

1. **Integration vs unit** — integration is right per decision §0c. The bug being prevented is RLS-passing JWT shape, and only integration tests can prove RLS passes. If the harness doesn't exist, the fallback unit test catches the most-common regression (re-tightened modality guard) without proving the JWT-shape contract.
2. **Idempotency** — the test must clean up its seeded session (DELETE in `afterEach`) so test runs are repeatable. Use a unique `appointment_id` per run (UUID) to avoid collisions.
3. **`safe_uuid_sub()` invariant** — RLS uses `safe_uuid_sub()` to extract the patient sub from the JWT (Plan F04 invariant). The integration test exercises this implicitly via the INSERT-passes assertion. No separate test needed.
4. **Why test `modality = 'fax'`** — pins the allow-list. If someone "simplifies" the guard back to `if (session.modality === 'text')` or removes it, this test fails immediately.
5. **Run cadence** — this test runs in CI on every PR; runtime should be <2s. If integration setup is too slow, gate behind a `CI_INTEGRATION=true` env flag and document in CONTRIBUTING.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch 0](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day)
- **Decision:** [§0c — backend test layer](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts)
- **Hard dep:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md) — handler fix being protected.
- **Plan 06 Decision 9** — companion chat on both sides; this test is the lock.
- **Existing helpers:** `backend/scripts/diagnose-text-consult-jwt.ts` (HMAC + JWT mint helpers) — copy-paste the helper pattern.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** **Complete** (2026-04-30) (unit-level fallback + acceptance checklist satisfied). **P0 — ship in same PR as [task-voice-0A](./task-voice-0A-relax-modality-guard.md).** The committed test fails without the 0A handler fix (regression-protection contract holds).

---

## Implementation log (2026-04-30)

### Path chosen: Fallback (unit-level)

The integration-level path the spec preferred requires a Supabase test harness (real or docker-compose) that **does not exist in this repo today**. The repo's `backend/tests/integration/` directory contains only Razorpay-sandbox + Instagram-webhook stubs — no Supabase-backed integration runner. Per the **Fallback** branch in the AC (lines 55–64 of this file), shipped as handler-level unit tests instead, with the harness follow-up tracked below.

### What landed

- **New file:** `backend/tests/unit/controllers/consultation-text-token.test.ts` (~430 LOC, 18 test cases across 5 `describe` blocks). Mirrors the existing convention in `consultation-chat-history-token.test.ts` (sibling endpoint, same controller).
- **No fixture-helper changes needed** — the unit-level test mocks `findSessionById` directly with synthetic session rows (Date objects for `scheduledStartAt` / `expectedEndAt`), so no `seedVoiceSession()` / `seedVideoSession()` helper was needed.

### Test cases shipped

1. **Validation (5 cases)** — missing/whitespace `sessionId`, missing/non-string/whitespace `body.token` → 400 `ValidationError`.
2. **HMAC + session checks (3 cases)** — `verifyConsultationToken` throw → 401; `findSessionById` returns null → 404; mismatched `appointmentId` → 401 (no session-id leak; covers AC §"optional negative — wrong appointment_id").
3. **Modality allow-list / voice-0A (4 cases)** — parameterized happy-path for `text` / `voice` / `video` (covers AC test cases 1, 2, 3); negative case with synthetic `modality = 'fax'` returning 400 with the legacy error string verbatim (covers AC test case 4 + the §"why test modality = 'fax'" lock against guard simplification).
4. **Terminal-status branch (2 cases)** — `status = 'ended'` and `status = 'cancelled'` → 200 with `{ token: null, expiresAt: null }`, no mint (covers AC §"optional negative — ended session").
5. **Response enrichment (4 cases)** — `currentUserId` derives from `patientId` when present, falls back to `appointmentId` when null (bot-patient case); `practiceName` populated from `doctor_settings` lookup, omitted when lookup yields no row.

### CRITICAL contract assertions (these are what would have caught the original bug)

For every modality-happy-path case the test asserts:

```ts
expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).toHaveBeenCalledTimes(1);
expect(sessionService.getJoinToken /* facadeGetJoinToken */).not.toHaveBeenCalled();
```

…and that the adapter was called with the exact input shape `{ appointmentId, doctorId, role: 'patient', providerSessionId, sessionId }`. If anyone "fixes" the controller back to `facadeGetJoinToken`, the voice/video happy-path cases fail immediately because the facade mock would not have been invoked.

### Coverage delta vs the spec

| AC item | Status | Notes |
|---|---|---|
| Test case 1 (voice happy path) | ✅ | Covered (parameterized) |
| Test case 2 (video happy path) | ✅ | Covered (parameterized) |
| Test case 3 (text happy path / regression) | ✅ | Covered (parameterized) |
| Test case 4 (negative — unsupported modality) | ✅ | Covered with `modality = 'fax'` |
| Optional — wrong appointment_id | ✅ | Covered |
| Optional — ended session | ✅ | Covered + extended to cancelled |
| **JWT signature / RLS-pass via real Supabase** | ⚠️ | Only achievable with the integration harness — see follow-up below. Unit test asserts the adapter is called and trusts `text-session-supabase.test.ts` for adapter-internals coverage. |

### Verification done

- `npx jest tests/unit/controllers/consultation-text-token.test.ts` → 18/18 pass (~9 s warm).
- Regression batch (`tests/unit/controllers/`, plus `text-session-supabase[-companion].test.ts` and `consultation-session-service.test.ts`) → 8 suites / 118 tests pass.
- `npx eslint src/controllers/consultation-controller.ts` → clean.
- `npm run type-check` → clean.

### Follow-up (open, non-blocking)

- **"Add Supabase integration-test harness so the patient-HMAC → text-token → RLS-passing INSERT path can be exercised end-to-end."** Per AC §Fallback line 64. To be promoted to its own task during the next batch-grooming pass; not blocking PR1.
