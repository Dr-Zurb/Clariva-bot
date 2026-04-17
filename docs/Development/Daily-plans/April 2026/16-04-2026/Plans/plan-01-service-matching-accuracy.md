# Plan 01 — Service matching accuracy

## Fix the matcher, close the learning loop, add patient clarification

**Goal:** Make the bot's service-to-complaint routing accurate and trustworthy. A doctor who creates a "Non Communicable Diseases" service for HTN, DMT2, and Hypothyroidism must **not** see cough, headache, or stomach pain routed there. Fix the immediate over-matching, then add control knobs and a learning loop so routing only gets better over time.

**Companion plans:**
- [plan-02-ai-catalog-setup.md](./plan-02-ai-catalog-setup.md) — AI auto-fill for service cards, quality checks
- [plan-03-single-fee-vs-multi-service-mode.md](./plan-03-single-fee-vs-multi-service-mode.md) — Proper single-fee / multi-service mode architecture

---

## Audit summary (relevant subset)

### What works

| Component | Status | Notes |
|-----------|--------|-------|
| **Two-stage matcher** (deterministic → LLM) | Working | `service-catalog-deterministic-match.ts` → `service-catalog-matcher.ts` |
| **Staff review queue** | Working | Confirm / reassign / cancel via API; wired to conversation state |
| **Learning ingest** | Working | Writes `service_match_learning_examples` on confirm/reassign |
| **Shadow evaluation** | Working | Inserts majority-vote predictions on new pending reviews |
| **Autobook policies** | Working | `tryApplyLearningPolicyAutobook` hooks into webhook handler |
| **Policy suggestion cron** | Working | `runStablePatternDetectionJob` finds stable reassignment patterns |
| **Confidence gating** | Working | `high` → auto-finalize; `medium`/`low` → staff review |

### What's broken or too loose

| Problem | Location | Impact |
|---------|----------|--------|
| **LLM prompt too generous** | `service-catalog-matcher.ts:170` — *"Prefer the best-fitting row other than 'other' whenever it reasonably applies"* | Bot force-fits complaints into named services even when they don't belong; `"other"` is treated as last resort instead of default-safe |
| **Empty `matcher_hints` = no constraints** | Doctors create services without filling hints → matcher has zero guidance → LLM guesses from label alone | The NCD example: label says "Non Communicable Diseases" and bot maps anything chronic-sounding there |
| **`hasLooseOverlap` returns `true` for empty hints** | `service-catalog-deterministic-match.ts:23` — `if (!h) return true;` | Empty `include_when` is treated as "include everything" instead of "no preference" — contributes to over-matching |
| **No strictness per service** | No way for doctor to say "ONLY these conditions, nothing else" vs "these and anything similar" | Bot applies same flexible matching to all services regardless of intent |

### What's missing (this plan)

| Gap | Priority |
|-----|----------|
| **Patient clarification for mixed complaints** — Bot never asks "which concern is most important?" when patient lists multiple unrelated symptoms | High |
| **Learning from corrections → hint updates** — Reassign API does full **replace** of hints (not append); corrections don't strengthen future routing | High |
| **Frontend for learning policies** — No doctor-facing UI for autobook policy suggestions | Medium |
| **SLA timeout closure** — `runStaffReviewTimeoutJob` marks breach but doesn't close the review | Low |

---

## Problem statement (the NCD incident)

**What happened:** A doctor set up a "Non Communicable Diseases" service intended for HTN, DMT2, and Hypothyroidism. A patient said their complaints were *"hypertension, diabetes, cough, sneezing, stomach pain, headache."* The bot routed **all** of them under NCD.

**Root causes:**

1. **Empty `matcher_hints`:** The doctor's NCD service had no keywords, no `include_when`, no `exclude_when`. The bot had zero guidance about what conditions belong.

2. **LLM prompt bias:** The system prompt says *"Prefer the best-fitting row other than 'other' whenever it reasonably applies."* With empty hints, the LLM saw "Non Communicable Diseases" and matched based on the label's broad meaning alone.

3. **No mixed-complaint handling:** The patient listed 6 conditions. Some (HTN, diabetes) fit NCD; others (cough, sneezing, stomach pain, headache) clearly don't. The bot had no mechanism to split complaints or ask which is the primary concern.

4. **No strictness control:** The doctor intended "only these 3 conditions" but the system treated the service as "anything that might relate to NCD."

---

## Design principles

1. **Doctor's word is law** — If the doctor said "HTN, DMT2, Hypothyroidism," the bot should route exactly those (and obvious synonyms: "high BP" = HTN). Anything outside requires explicit inclusion.

2. **Empty hints = conservative matching** — An unconfigured service should match **less**, not more. Prefer `"other"` over guessing when hints are absent.

3. **Ask, don't guess** — When the patient's complaint is ambiguous or mixed, ask the patient to clarify their primary concern rather than picking the "closest" service.

4. **Learn from corrections** — Every reassign in the review queue should strengthen hints for both the wrong and correct service, with pre-filled one-tap suggestions.

---

## Task files (implementation order)

| # | Task | Phase | Effort | Risk |
|---|------|-------|--------|------|
| 01 | [task-01-llm-prompt-strictness.md](../Tasks/task-01-llm-prompt-strictness.md) | A — Emergency | Medium | Low — prompt-only change, no schema changes |
| 02 | [task-02-deterministic-empty-hints-fix.md](../Tasks/task-02-deterministic-empty-hints-fix.md) | A — Emergency | Small | Low — logic fix in `hasLooseOverlap` and scoring |
| 03 | [task-03-hint-learning-from-corrections.md](../Tasks/task-03-hint-learning-from-corrections.md) | B — Learning | Medium | Low — enhances existing reassign flow with pre-filled suggestions |
| 04 | [task-04-service-scope-mode.md](../Tasks/task-04-service-scope-mode.md) | C — Control | Medium–Large | Medium — schema addition, prompt + scoring changes, frontend toggle |
| 05 | [task-05-patient-clarification-mixed-complaints.md](../Tasks/task-05-patient-clarification-mixed-complaints.md) | D — Conversation | Large | Medium — new conversation branch |

**Suggested order:** 01 + 02 (parallel, quick wins) → 03 (learning loop) → 04 (power-user control) → 05 (conversation flow).

**Rationale:** Tasks 01+02 immediately reduce mis-routing. Task 03 closes the learning loop so the bot improves with every correction. Task 04 gives doctors explicit control. Task 05 handles the edge case of mixed-complaint visits.

---

## Phase A — Prompt & deterministic fixes (emergency patch)

### Task 01: LLM prompt strictness

**File:** `backend/src/services/service-catalog-matcher.ts`

**Changes:**
- Replace the "prefer non-other" bias with a balanced instruction:
  - *When `matcher_hints` are filled:* follow them strictly — `include_when` defines what belongs, `exclude_when` defines what doesn't.
  - *When `matcher_hints` are empty:* match only if the service label is an unambiguous fit for the patient's primary complaint. When in doubt, use `"other"`.
- Add instruction: *If the patient lists multiple unrelated complaints, match based on the single most prominent / first-mentioned complaint, not the entire list.*
- Add instruction: *A service label alone is not sufficient evidence for "high" confidence — `matcher_hints` must corroborate for "high".*

### Task 02: Deterministic empty-hints fix

**File:** `backend/src/utils/service-catalog-deterministic-match.ts`

**Changes:**
- `hasLooseOverlap`: When `hint` is empty, return `false` (not `true`) — empty hint should not count as a match.
- `matcherHintScore`: When `matcher_hints` object exists but all fields are empty/blank, return `0` (neutral) not a positive score.
- Ensure tie-breaking doesn't favor services with no hints over `"other"`.

---

## Phase B — Learning from corrections (review inbox as training interface)

### Task 03: Pre-filled hint suggestions on reassign

**Core idea:** The review inbox is the single best place to learn — the doctor is already looking at a mis-route and correcting it. Today the reassign API does a full **replace** of `matcher_hints` (using `setMatcherHintsOnDoctorCatalogOffering`), so unless the doctor manually types new hints, nothing changes about future routing. The `appendMatcherHintFields` utility exists in the schema but isn't used.

**On reassign, auto-propose hint updates (pre-filled, one-tap accept):**

1. System extracts the patient's reason-for-visit (sanitized, no PHI).
2. Shows a pre-filled suggestion in the reassign dialog:
   > **Suggested learning:**
   > - Add *"cough, sneezing, stomach pain, headache"* to **"Not this service when…"** for **NCD**
   > - Add *"cough, sneezing, stomach pain, headache"* to **"Book this service when…"** for **General Consultation**
   > 
   > [Accept suggestions] [Edit] [Skip]
3. On accept: use `appendMatcherHintFields` (merge, not replace) to update both the wrong and correct service.
4. Show confirmation: *"Got it — I'll remember that [complaint] should go to [correct service] and not [wrong service]."*

**Also: "Did the bot get it right?" on auto-finalized bookings:**
- When the bot auto-finalizes with `high` confidence, the doctor currently never sees it.
- Add a lightweight "correct / wrong service" toggle on the appointment card or a periodic digest.
- This feeds the learning pipeline for high-confidence mistakes that currently go undetected.

**Hint accumulation guardrail:** Cap at ~800 chars (current schema max for `include_when` / `exclude_when`). When near the limit, run a periodic LLM pass to summarize/deduplicate accumulated hints.

**Files touched:**
- `backend/src/services/service-staff-review-service.ts` — reassign handler uses append
- `backend/src/services/doctor-settings-service.ts` — expose `appendMatcherHintFields` path
- `frontend/components/service-reviews/` — pre-filled suggestion UI in reassign dialog
- Appointment card or dashboard — optional feedback toggle for auto-finalized bookings

---

## Phase C — Service scope mode (power-user control)

### Task 04: `scope_mode` field on service offerings

**Schema:** Add `scope_mode: 'strict' | 'flexible'` to `ServiceOfferingV1` in `service-catalog-schema.ts`.

- **`strict`** (default for new services): Only conditions explicitly listed in `keywords` / `include_when` should match. LLM prompt says: *"This service has strict routing: match ONLY if the patient's complaint matches the listed keywords or conditions. Do not generalize."*
- **`flexible`**: The current behavior — match broadly within the service category. LLM prompt says: *"This service has flexible routing: match when the patient's complaint is related to this service category, even if not explicitly listed."*

**Why:** Explicit control over how tightly the bot follows instructions. Most clinical services should be `strict`; a "General Consultation" might be `flexible`.

**Default for existing services:** `flexible` (preserves current behavior). New services default to `strict`. Show a one-time migration banner explaining the change.

**Files touched:**
- `backend/src/utils/service-catalog-schema.ts` — add field
- `backend/src/services/service-catalog-matcher.ts` — prompt uses `scope_mode`
- `backend/src/utils/service-catalog-deterministic-match.ts` — scoring adjusts for mode
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — toggle UI
- `frontend/lib/service-catalog-drafts.ts` — draft field mapping
- Migration for `service_offerings_json` default

---

## Phase D — Patient clarification for mixed complaints

### Task 05: Ask patient when complaints don't fit one service

**When the matcher detects multiple unrelated complaints** (e.g., the LLM could output confidence `"low"` or a new field `"mixed_complaints": true`):

1. Bot asks patient: *"You've mentioned several concerns. Which one would you like to consult about first? We can address others in follow-up appointments."*
2. Patient replies with primary concern → re-run matcher with narrowed input.
3. New conversation state: `awaiting_complaint_clarification` (between `confirm_details` and `awaiting_staff_service_confirmation`).

**Key design decisions:**
- Only trigger when the LLM returns low confidence AND the reason text contains multiple distinct conditions.
- Don't trigger for single-complaint visits even if confidence is medium.
- Timeout: If patient doesn't clarify within X messages, proceed with best guess + staff review.

**Files touched:**
- `backend/src/services/service-catalog-matcher.ts` — LLM schema adds `mixed_complaints` flag
- `backend/src/workers/instagram-dm-webhook-handler.ts` — new branch for clarification
- `backend/src/types/conversation.ts` — new step enum value
- Conversation state machine tests

---

## Open questions

1. **Scope mode default for existing services:** Should we retroactively set existing services (with empty hints) to `strict` or `flexible`? **Recommendation:** `flexible` for existing (preserves behavior), `strict` for new ones; show migration banner.

2. **Mixed-complaint threshold:** How many distinct conditions trigger the clarification prompt? **Recommendation:** Let the LLM flag it via `mixed_complaints: true`; it's better at detecting unrelated conditions than keyword counting.

3. **Hint accumulation bloat:** If corrections keep appending to `include_when`/`exclude_when`, the text will grow unbounded. **Recommendation:** Cap at ~800 chars (current schema max); when near limit, summarize/deduplicate with a periodic LLM cleanup pass.

4. **Reassign dialog UX for hint editing:** Should auto-learning bypass the dialog and just append silently, or show the doctor what's being added? **Recommendation:** Always show a pre-filled preview with one-tap accept — doctor stays in control but cognitive load is near zero.

5. **High-confidence mis-routes going undetected:** When the bot auto-finalizes with `high` confidence, there's no feedback channel. **Recommendation:** Add a lightweight "correct / wrong service" toggle on the appointment card or a periodic digest.

---

## Deferred (explicit)

| Item | Reason |
|------|--------|
| **Frontend for autobook policy management** | Requires design; learning pipeline needs more real-world data first |
| **SLA timeout full closure** | Edge case; priority is getting matching right first |

---

## Future ideas (parked, not planned)

| Idea | When to revisit |
|------|-----------------|
| **Training summary per service** — "This service matched 47 times. 3 reassigned. Bot learned: [patterns]." | After learning pipeline has enough data |
| **Confidence-based DM copy to patient** — "Checking with the doctor's team on the best consultation type" | Verify if `awaiting_staff_service_confirmation` already covers this |
| **Batch re-generate hints for all cards** | After Plan 02's single-card AI fill is stable |

---

## References

- **Matcher:** `backend/src/services/service-catalog-matcher.ts`, `backend/src/utils/service-catalog-deterministic-match.ts`
- **Schema:** `backend/src/utils/service-catalog-schema.ts`
- **Staff review:** `backend/src/services/service-staff-review-service.ts`
- **Learning pipeline:** `backend/src/services/service-match-learning-*.ts`
- **Frontend reviews:** `frontend/components/service-reviews/ServiceReviewsInbox.tsx`
- **Webhook handler:** `backend/src/workers/instagram-dm-webhook-handler.ts`
- **Existing docs:** `backend/src/services/README-matcher.md`, `docs/Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md`

---

**Last updated:** 2026-04-16
