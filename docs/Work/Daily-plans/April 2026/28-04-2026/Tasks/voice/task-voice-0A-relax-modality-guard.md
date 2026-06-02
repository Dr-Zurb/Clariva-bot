# Task voice-0A: Relax modality guard + force text-adapter mint in `exchangeTextConsultTokenHandler`

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch 0 (P0 hotfix) — **XS item, ~30 min**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

**This is the first half of the P0 fix that unblocks Plan 06 Decision 9 on the patient side.** The patient phone hits `POST /api/v1/consultation/:sessionId/text-token` for every voice/video consult so the companion chat can mount; today this endpoint hard-rejects any non-text session with a 400, so every voice/video patient gets a dead canvas instead of the side-by-side chat the doctor sees.

Two adjacent bugs in the same handler, fixed together:

1. **Modality guard is too strict.** `if (session.modality !== 'text') throw ValidationError(...)` was written for Plan 04 (text-only sessions) and was never relaxed when Plan 06 added the companion chat to voice/video. The relaxed guard is an explicit allow-list `['text', 'voice', 'video']` (decision §0a — recommended) so future-unknown modalities still reject cleanly.

2. **Wrong token type minted for voice/video.** The current code calls `facadeGetJoinToken(sessionId, 'patient')`, which dispatches by `session.modality` to the matching adapter. For voice/video that returns a **Twilio access token** — wrong shape entirely; the chat layer needs a Supabase JWT. The fix calls `textSessionSupabaseAdapter.getJoinToken(...)` directly, ignoring session modality, because this endpoint's contract is "give me the chat-channel token regardless of the call modality".

This task is the **backend half**. Frontend wiring + error UX live in 0B / 0C; the integration test that pins the contract lives in 0T.

**Estimated time:** ~30 min.

**Status:** **Complete** (2026-04-30). **P0 — ship before any other voice batch task.** Awaiting PR + merge if not merged.

**Depends on:** nothing.

**Source:** [Sub-batch 0 / P0.A](../Plans/plan-voice-consult-selected-features.md#items-in-sub-batch-0); [decision §0a](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts).

---

## Acceptance criteria

### Modality guard relaxed (allow-list shape)

- [x] **Replace** the existing modality check at `backend/src/controllers/consultation-controller.ts` lines 361–365:

  ```ts
  // BEFORE:
  if (session.modality !== 'text') {
    throw new ValidationError(
      `Cannot exchange text-token for ${session.modality} session`,
    );
  }

  // AFTER:
  const COMPANION_CAPABLE_MODALITIES = ['text', 'voice', 'video'] as const;
  type CompanionCapableModality = typeof COMPANION_CAPABLE_MODALITIES[number];
  if (!COMPANION_CAPABLE_MODALITIES.includes(session.modality as CompanionCapableModality)) {
    throw new ValidationError(
      `Cannot exchange text-token for ${session.modality} session`,
    );
  }
  ```
- [x] **Allow-list constant** declared at file-scope (or close to `findSessionById`); not inlined inside the handler. Other handlers may eventually consume it.
- [x] **Error message preserved** so any downstream error log / Sentry rule that grepped on the old text doesn't silently break.

### Force text-adapter mint (correct token type for the chat channel)

- [x] **Replace** the `facadeGetJoinToken(...)` call at lines 372–378:

  ```ts
  // BEFORE:
  if (session.status !== 'ended' && session.status !== 'cancelled') {
    const joinToken = await facadeGetJoinToken(sessionId, 'patient', correlationId);
    token = joinToken.token;
    expiresAtIso = joinToken.expiresAt.toISOString();
  }

  // AFTER:
  if (session.status !== 'ended' && session.status !== 'cancelled') {
    // This endpoint's contract is "mint the chat-channel token", regardless
    // of session modality — voice/video sessions still need Supabase JWTs
    // for their companion chat (Plan 06 Decision 9). Calling the facade
    // here would dispatch by modality and return a Twilio access token for
    // voice/video, which is the wrong token type for the chat layer.
    const joinToken = await textSessionSupabaseAdapter.getJoinToken(
      sessionId,
      'patient',
      correlationId,
    );
    token = joinToken.token;
    expiresAtIso = joinToken.expiresAt.toISOString();
  }
  ```
- [x] **New import** — `textSessionSupabaseAdapter` added alongside existing `mintAttachmentSignedUrls` from `../services/text-session-supabase` (the file already imports `facadeGetJoinToken` from the facade; both stay — `facadeGetJoinToken` is still used by the voice call-channel handler).
- [x] **Inline comment** explains WHY the bypass — future maintainers must not "fix" it back to the facade. *(Implementation uses correct adapter signature `(input, correlationId)` — not the 3-arg snippet in the draft below.)*

### Verify nothing else regresses

- [x] **Voice call-channel handler** (`exchangeVoiceConsultTokenHandler`, `facadeGetJoinToken` for patient Twilio token) still uses `facadeGetJoinToken` — modality-dispatching by design. Not touched.
- [x] **Existing text-modality flows** (Plan 04 patient text consult) — same adapter path as before for text; response shape unchanged for `text` modality.
- [x] **`ended` / `cancelled` branch** — for ended/cancelled sessions, `token` and `expiresAtIso` stay `null`. Behavior unchanged (covered in [task-voice-0T](./task-voice-0T-text-token-integration-test.md) unit tests).

### General

- [x] Type-check + lint clean.
- [x] Controller-focused regression — no monolithic `consultation-controller.test.ts` in repo; `npm test` on `tests/unit/controllers/` + adjacent services passed (see implementation log).
- [x] **Test coverage for the fix** — [task-voice-0T](./task-voice-0T-text-token-integration-test.md) (**Complete**).

---

## Out of scope

- **`exchangeConsultTokenHandler`** (the call-channel token at line 740). Different endpoint, different contract; not broken.
- **Frontend wiring on patient video page.** Lives in [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md).
- **Patient-side error UX** when the exchange fails. Lives in [task-voice-0C](./task-voice-0C-companion-error-surfacing.md).
- **Doctor-side flow.** Doctor never hits this endpoint (uses dashboard's Supabase session directly). Verify no regression but no code change needed.
- **Companion-chat surface refactor.** Out of scope; the existing chat surface in `<VoiceConsultRoom>` already consumes the JWT correctly when present.

---

## Files expected to touch

**Backend:**

- `backend/src/controllers/consultation-controller.ts` — **edit** (~10 LOC change at lines 361–378 + 1 new import).

**Tests:** none in this task; see [task-voice-0T](./task-voice-0T-text-token-integration-test.md).

**Frontend:** none.

**Migrations:** none.

---

## Notes / open decisions

1. **Why allow-list vs removing the guard entirely** — defense in depth. If we add a `chat-only-async` modality next quarter that legitimately should NOT have a synchronous companion, the guard catches it. Removing the guard would silently mint tokens for any modality string the DB happens to hold.
2. **Why bypass the facade vs adding a "force chat-token" flag** — bypass is two lines and self-documenting. Adding a flag would require changing the facade signature + all call sites. Not worth it for one caller.
3. **JWT TTL** — `textSessionSupabaseAdapter.getJoinToken` already returns the same TTL contract as the facade for text modality. No client-side cache invalidation needed.
4. **HMAC verification stays unchanged** — the patient consultation token is still verified against `appointmentId`; this fix doesn't loosen any security boundary.
5. **Logs/observability** — if there's a Sentry rule on the old "Cannot exchange text-token for…" message, the rule still fires for genuinely-unsupported modalities. Verify post-deploy.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch 0](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day)
- **Decision:** [§0a — modality allow-list shape](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts)
- **Plan 06 Decision 9** — every voice/video consult ships with a working companion chat on both doctor AND patient sides. This task closes the patient side for the first time.
- **Adjacent task:** [task-voice-0T](./task-voice-0T-text-token-integration-test.md) — integration test that locks the contract.
- **Downstream blockers unblocked:** [task-voice-A7](./task-voice-A7-counterparty-mute-notification.md) (T1.8 mute notif), [task-voice-B3](./task-voice-B3-hold-call.md) (T2.11 hold banner) — both ship system messages into the companion chat that patients only receive once 0A is live.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** **Complete** (2026-04-30). **P0; ship FIRST before any other task in this batch.** Ship 0A + 0T together (single PR); 0B + 0C can ship in a follow-up PR same day.

---

## Implementation log (2026-04-30)

### What landed

- `backend/src/controllers/consultation-controller.ts`:
  - Extended import on (former) line 90 to also pull in `textSessionSupabaseAdapter` from `../services/text-session-supabase` (kept the existing `mintAttachmentSignedUrls` import alongside).
  - Added file-scope allow-list constant + branded type just below the imports (current lines ~95–106):

    ```ts
    const COMPANION_CAPABLE_MODALITIES = ['text', 'voice', 'video'] as const;
    type CompanionCapableModality = (typeof COMPANION_CAPABLE_MODALITIES)[number];
    ```
  - Replaced the modality guard at the (former) lines 361–365 with the allow-list check; preserved the legacy error-message string verbatim per AC.
  - Replaced the `facadeGetJoinToken(sessionId, 'patient', correlationId)` call at the (former) lines 374–378 with a direct call to `textSessionSupabaseAdapter.getJoinToken(...)`. **Two-line note for future maintainers:** the adapter takes `(input, correlationId)` where `input` is the same object the facade synthesizes internally — `{ appointmentId, doctorId, role, providerSessionId, sessionId }`. The task draft's "AFTER" snippet showed a 3-arg call (`sessionId, 'patient', correlationId`) that does not match the actual adapter signature; the implementation uses the correct shape. Also kept the inline comment block explaining WHY the bypass — exactly what the AC asked for.
  - Sibling handler at (now) line ~785, `exchangeVoiceConsultTokenHandler`, untouched — still uses `facadeGetJoinToken` as designed (it mints the call-channel Twilio access token, separate contract).

### Verification done

- `npm run type-check` → clean.
- `npx eslint src/controllers/consultation-controller.ts` → clean (no warnings).
- `npx jest tests/unit/controllers/ tests/unit/services/text-session-supabase.test.ts tests/unit/services/text-session-supabase-companion.test.ts tests/unit/services/consultation-session-service.test.ts` → 8 suites / 118 tests pass, including the new contract test from [task-voice-0T](./task-voice-0T-text-token-integration-test.md).

### Followups (not blocking PR1)

- Frontend wiring (0B) and patient-side error UX (0C) still owe — they can ship in PR2 same day per the original plan.
- The integration-level test the task contemplated requires a Supabase test harness that doesn't exist in this repo today — see [task-voice-0T](./task-voice-0T-text-token-integration-test.md) implementation log for the followup tracking the harness.
