# Task 09: Mixed-complaint clarification — numbered list
## 18 April 2026 — Plan "Patient DM copy polish", P3

---

## Task Overview

`backend/src/utils/complaint-clarification.ts:27` emits:

```
You've mentioned a few concerns. Which one would you like to consult about first? We can address the others in a follow-up visit.
```

The tone is good; the structure isn't. The LLM matcher *knows* which concerns it parsed (that's why we're firing clarification in the first place), but the message asks "which one first?" without echoing the list back. Patients have to remember what they typed and disambiguate manually.

**Fix (from 2026-04-17 audit):** echo the parsed concerns as a numbered list; let the patient reply with a number.

**Target shape:**

```
You've mentioned a few concerns:

**1.** Headache
**2.** Diabetes follow-up
**3.** Knee pain

Which one is the main reason for this visit? Reply **1**, **2**, or **3** — we can handle the rest in a follow-up.
```

**Target shape — fallback (no concerns enumerated):**

Existing copy, unchanged:

```
You've mentioned a few concerns. Which one would you like to consult about first? We can address the others in a follow-up visit.
```

**Estimated Time:** 2.5–3 hours (locale nuance + handler wiring)  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Extend `resolveComplaintClarificationMessage(userText: string, parsedConcerns?: string[])`:
   - When `parsedConcerns` is absent or has < 2 entries → return today's locale string (unchanged).
   - When `parsedConcerns.length >= 2` → return the numbered-list shape.
2. The LLM matcher should already produce a parsed-concerns list when `mixed_complaints: true`. Find the upstream producer (`rg "mixed_complaints"` inside `backend/src/services` — likely in `service-catalog-matcher.ts` or an adjacent matcher result type). If the matcher already returns concern snippets, pipe them through `state`/the gating input. If it only returns the boolean flag, this task adds a minimal "concerns" array to the matcher result.
3. Wire the webhook handler caller (where clarification fires) to pass the list through.
4. Localized variants (`hi`, `pa`, Roman Hindi, Roman Punjabi) get numbered-list variants too. Follow the existing pattern in `complaint-clarification.ts` (5 locales currently).
5. State persistence: store `pendingClarificationConcerns: string[]` on the conversation so, when the patient replies with `1` / `2`, the handler can map back to the right concern and set `reason_for_visit` accordingly (this is the whole point of echoing — it gives us a referable key).
6. Reply classifier update: add a lightweight "numeric reply to clarification" branch inside the webhook handler (e.g. in the existing `awaiting_cancel_choice`-style pattern) that catches `"1"`, `"2"`, … and sets the reason.
7. Snapshot all variants + test the numeric-reply handling.

**Scope trade-offs:**
- We cap the list at **5 items**. More than that indicates the patient is flooding concerns; we fall back to the open-ended string and let the downstream handling ask manually.
- We don't try to group semantically similar concerns. If the matcher returns `"headache"` and `"migraine"` as separate items, we show them separately. Merging is a matcher-quality concern, not a copy concern.
- If `parsedConcerns` contains PHI beyond the concern noun-phrase, trim to a short label (≤ 40 chars) before display. Avoid echoing sentences.
- Not all locales get numbered-list variants in this task if the matcher only returns concerns in English (which it likely does). If so, render numbers with English concerns under a localized intro/CTA — it's a pragmatic win and can be refined later.

### Change Type

- [x] **Update existing** — `complaint-clarification.ts`
- [x] **Update existing** — upstream matcher type (if concerns array isn't produced yet)
- [x] **Update existing** — webhook handler wiring for numeric reply handling

### Current State

- `backend/src/utils/complaint-clarification.ts` — owns copy + gating predicate.
- Matcher emits `mixed_complaints: true` → need to confirm whether a `concerns: string[]` sibling exists in its result type.
- `state.lastPromptKind` already captures various prompt kinds — add `mixed_complaint_clarification` if not present so numeric replies can be routed correctly.

### Scope Guard

- Expected files touched: 3–4 + tests (matcher type, copy helper, webhook handler, state type).
- Do NOT change the gating predicate (`shouldRequestComplaintClarification`) — it stays as-is. Only extend copy + add numeric-reply handling.
- Do NOT exceed the `COMPLAINT_CLARIFICATION_MAX_ATTEMPTS` cap.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)
- `docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md` — §"Ask once; then trust the reply"

---

## Task Breakdown

### 1. Matcher concerns surface

- [x] 1.1 `rg "mixed_complaints"` confirmed the flag was already wired (`ServiceCatalogMatchResult.mixedComplaints`) but NO `concerns` array existed in the matcher prompt, parser, or result type.
- [x] 1.2 Extended `ServiceCatalogMatchResult` with `concerns?: string[]`. Added the `concerns` field to the LLM system prompt's schema line + a dedicated rules block explaining when/how to emit it (English noun-phrases, ≤ 40 chars, 2–5 items, only when `mixed_complaints: true`, OMIT otherwise). New `normalizeLlmConcerns(raw)` helper at the parser boundary: array-only, trims entries, truncates > 40 chars with `…`, dedupes case-insensitively (first wins), caps at `SERVICE_MATCH_MAX_CONCERNS = 5`, returns `undefined` when fewer than 2 valid entries remain. Exported new constants `SERVICE_MATCH_MAX_CONCERNS` + `SERVICE_MATCH_CONCERN_MAX_CHARS` so downstream callers see one contract.
- [x] 1.3 Added **7 matcher tests** in `service-catalog-matcher.test.ts`: prompt schema contains the new `concerns` field + rules; LLM response with `mixed_complaints:true + concerns` surfaces the array; entries > 40 chars are truncated with ellipsis; dedupe is case-insensitive; `concerns` is ignored/dropped when `mixed_complaints:false` (hallucination guard); < 2 valid entries → `undefined`; single-fee short-circuit reports `concerns:undefined`. All 38 matcher tests green.

### 2. Copy helper

- [x] 2.1 Signature changed to `resolveComplaintClarificationMessage(userText, parsedConcerns?: readonly string[])` — second arg optional, so existing single-arg callers (and all legacy tests) compile unchanged.
- [x] 2.2 Renders numbered-list shape when `parsedConcerns.length ∈ [2, 5]`. Bold-dot numbers (`**1.**`, `**2.**`, …) match the Task-07 cancel-list convention. CTA includes bolded numeric choices joined grammatically per locale (`**1** or **2**` / `**1**, **2**, or **3**` / `**1**, **2**, **3**, **4**, or **5**`).
- [x] 2.3 Empty / 1-entry / 6+-entry / undefined falls back to the existing locale string (verified via 2 additional snapshots: "6 concerns → falls back to open-ended" and "1 concern → falls back to open-ended").
- [x] 2.4 5 locale variants implemented via a `CLARIFICATION_NUMBERED_BY_LOCALE` table keyed by `en | hi | pa | latin-hi | latin-pa`. Each entry owns `intro`, `ctaTemplate` with `{choices}` token, and a `joinChoices` function (Oxford-joiners for English/Hinglish/Roman-Punjabi; Devanagari "या" and Gurmukhi "ਜਾਂ" for script variants). Concern labels themselves stay English verbatim per task design constraint.

### 3. Handler wiring

- [x] 3.1 `maybeTriggerComplaintClarification` now persists `pendingClarificationConcerns` on state when the matcher supplied a 2+ entry list, and passes the same list to `resolveComplaintClarificationMessage`. Log breadcrumb only includes the concern COUNT (never the labels — PHI-adjacent).
- [x] 3.2 Added a numeric-reply short-circuit inside the `awaiting_complaint_clarification` dispatch (first-attempt path): `resolveClarificationNumericReply(rawReply, state.pendingClarificationConcerns)` → mapped concern text is used as the narrowed reason for the matcher re-run. Invalid digits (e.g. `"9"` when 3 concerns) resolve to `null` and fall through to the raw reply — typically produces a low-confidence match and escalates to staff review on this attempt (intentional: the patient gave us no usable signal).
- [x] 3.3 Free-text replies use the existing path unchanged; `resolveClarificationNumericReply` returns `null` for anything that isn't a 1–2 digit positive integer within `[1, N]`. `pendingClarificationConcerns` is cleared on every exit from `awaiting_complaint_clarification` (consent-resume path, staff-review-escalate path, cap-reached path) so stale concerns from a prior round never leak into a later clarification event.

### 4. Tests

- [x] 4.1 **9 snapshots** added to `dm-copy.snap.test.ts` (one more than the original plan — the "1 concern fallback" case was cheap to cover alongside the "6 concerns fallback"):
  - `clarification / en / 2 concerns`
  - `clarification / en / 3 concerns`
  - `clarification / en / 5 concerns`
  - `clarification / en / 1 concern → falls back to open-ended`
  - `clarification / en / 6 concerns → falls back to open-ended`
  - `clarification / hi Devanagari / 3 concerns (English labels under Hindi intro + CTA)`
  - `clarification / pa Gurmukhi / 3 concerns (English labels under Punjabi intro + CTA)`
  - `clarification / latin-hi / 3 concerns (Hinglish intro + CTA)`
  - `clarification / latin-pa / 3 concerns (Roman Punjabi intro + CTA)`
- [x] 4.2 Unit tests (two invariant blocks, 15 tests total in `dm-copy.snap.test.ts`):
  - **`resolveComplaintClarificationMessage invariants`** (7 tests): 3-paragraph structure; bold-dot numbers `**N.**` preserve input order; CTA join is grammatical per N; fallback to legacy copy for 0/1/6+ concerns; Hindi/Punjabi intros use the right scripts; Roman Hindi/Punjabi used when no Devanagari/Gurmukhi; concern labels render verbatim across all 5 locales.
  - **`resolveClarificationNumericReply`** (8 tests): valid 1-based mapping; whitespace tolerance; out-of-range → null; free-text / mixed replies → null; undefined/empty concerns → null; > 2-digit / negative / decimal / hex inputs rejected.
  - The "`concerns` > 40 chars trimmed at matcher-parse time" contract is covered by the matcher tests (§1.3 above), not the copy helper — confirming the caller-boundary contract per task design.

### 5. Verification

- [x] 5.1 `tsc --noEmit` clean (full backend, 14.5 s).
- [x] 5.2 Full unit suite green: **938 tests** across **80 suites**, **48 snapshots** (up from 39 post-Task-08, +9 new). Zero regressions.
- [ ] 5.3 Staging smoke deferred to the PR bundle.

---

## Files to Create/Update

```
backend/src/utils/complaint-clarification.ts                   — UPDATED (signature + localized numbered variants)
backend/src/services/service-catalog-matcher.ts                — UPDATED (concerns field in result, if missing)
backend/src/types/conversation.ts                              — UPDATED (pendingClarificationConcerns + lastPromptKind value)
backend/src/workers/instagram-dm-webhook-handler.ts            — UPDATED (wire concerns; dispatch numeric reply)
backend/tests/unit/utils/complaint-clarification.test.ts       — UPDATED
backend/tests/unit/services/service-catalog-matcher.test.ts    — UPDATED (concerns schema)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (8 snapshots)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
```

---

## Design Constraints

- **Cap at 5 concerns.** 6+ → open-ended fallback.
- **Bold numbers**, not concern text. (Consistent with Task 07's cancel-list pattern.)
- **Concern labels ≤ 40 chars** at the parse boundary; trim longer strings with an ellipsis.
- **Numeric reply handling respects the attempt cap.** If the patient fails to pick a valid number twice, we route to staff review (existing fallback).
- **English concerns in all locales for now.** Localized concerns is a matcher improvement, not a copy task.

---

## Global Safety Gate

- [x] **Data touched?** Reads `parsedConcerns` from matcher result (transient); writes `pendingClarificationConcerns` to `ConversationState` (persisted via existing `updateConversationState` path — no schema change, the state blob is JSONB). Field documented as "may contain PHI, same posture as `originalReasonForVisit`".
- [x] **Any PHI in logs?** The clarification-requested breadcrumb logs `clarificationConcernCount` only, NEVER the concern labels. Numeric-reply breadcrumb logs `clarificationReplyShape: 'numeric'` only. No `info`-level log in this change contains a concern string.
- [x] **External API or AI call?** The existing matcher LLM call — no new endpoint. The schema change adds an optional `concerns` field to the response; the parser tolerates its absence (backward compatible with in-flight LLM responses that predate the prompt update), so there's no hard dependency on the model adopting the new field instantly.
- [x] **Retention / deletion impact?** `pendingClarificationConcerns` rides on the same `ConversationState` JSON that already stores `originalReasonForVisit` — inherits existing retention / purge semantics. Field is cleared on every exit from `awaiting_complaint_clarification`, so it's never persisted longer than one clarification round.

---

## Acceptance & Verification Criteria

- [x] `resolveComplaintClarificationMessage` accepts an optional concerns array and renders the numbered-list shape for 2–5 entries across all 5 locales.
- [x] Matcher produces a concerns array when `mixed_complaints: true` (new LLM schema + parser). Gracefully drops the field when the flag is `false` or the list is malformed.
- [x] Numeric reply (`1`..`N`) dispatches correctly (mapped to concern text → passed to matcher as narrowed reason); invalid numbers fall through to free-text re-match, which escalates to staff review when no usable signal.
- [x] 9 snapshot cases committed (2/3/5/1-fallback/6-fallback English, plus 3-concern variants for hi Devanagari, pa Gurmukhi, latin-hi, latin-pa).
- [x] `tsc --noEmit` clean; full suite green (938 tests / 80 suites / 48 snapshots, zero regressions).
- [ ] Staging smoke deferred to PR bundle.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 07](./task-07-cancel-list-polish.md) — same numbered-list pattern; consider harmonizing helpers.

---

**Last Updated:** 2026-04-18  
**Pattern:** Echo parsed data back as a numbered list; accept numeric reply  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
