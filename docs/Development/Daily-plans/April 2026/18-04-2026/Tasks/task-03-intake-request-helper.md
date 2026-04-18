# Task 03: `buildIntakeRequestMessage` helper + replace 9 inline call sites
## 18 April 2026 — Plan "Patient DM copy polish", P0

---

## Task Overview

The "Please share: Full name, Age, Gender, Mobile number, Reason for visit. Email (optional) for receipts." string (and six variants of it) is copy-pasted across **nine** sites in `backend/src/workers/instagram-dm-webhook-handler.ts`:

```
:2450  — booking for both self + other, combined intake
:2480  — booking for someone else only
:2537  — retry: "I didn't receive the details"
:2645  — retry: "I didn't receive the details for the person you're booking for"
:2856  — booking switches to someone else mid-flow
:2920  — "Got it. Still need: ..."  (partial-update retry)
:3082  — "Still need: ..."  (partial-update retry)
:3279  — someone-else flow, post-confirmation
:3452  — self-booking with seeded reason
:3453  — self-booking fresh intake
```

Each variant is a dense comma list. The 2026-04-17 audit's screenshot showed one patient got it right only because they guessed newlines would work — not everyone will.

**Fix:** extract a single helper `buildIntakeRequestMessage()` that renders a bulleted list with an optional missing-fields subset, an optional "we already have your X" prefix, and an optional "booking for your {relation}" framing. All nine call sites collapse onto it.

**Target shape (default self-booking, all fields needed):**

```
Sure — happy to help you book at **Dr Zurb's Clinic**.

Please share these details (you can paste them all in one message):
- **Full name**
- **Age**
- **Gender**
- **Mobile number**
- **Reason for visit**
- **Email** *(optional, for receipts)*

Example:
> Abhishek Sahil
> 35, male
> 8264602737
> headache + diabetes follow-up
```

**Variant A — we already have the reason:**

```
Sure — happy to help you book at **Dr Zurb's Clinic**.

We already have your **reason for visit** from earlier. Just need a few more:
- **Full name**
- **Age**
- **Gender**
- **Mobile number**
- **Email** *(optional, for receipts)*
```

**Variant B — partial retry (`Still need: ...`):**

```
Got it. Still need these details:
- **Age**
- **Reason for visit**

You can paste them in one message.
```

**Variant C — booking for someone else:**

```
I'll help you book for your **mother**. Please share her details:
- **Full name**
- **Age**
- **Gender**
- **Mobile number**
- **Reason for visit**
- **Email** *(optional, for receipts)*
```

**Variant D — didn't receive the details (retry):**

```
I didn't catch your details — could you resend them?
- **Full name**
- **Age**
- **Gender**
- **Mobile number**
- **Reason for visit**
- **Email** *(optional, for receipts)*
```

**Estimated Time:** 3–4 hours (mostly the 9 call-site swap + tests)  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Add `buildIntakeRequestMessage(input: IntakeRequestInput): string` to `dm-copy.ts`.
2. `IntakeRequestInput` shape:
   ```ts
   export type IntakeField =
     | 'name' | 'age' | 'gender' | 'phone' | 'reason_for_visit' | 'email';
   export interface IntakeRequestInput {
     practiceName: string;
     variant: 'initial' | 'still-need' | 'retry-not-received';
     missing?: IntakeField[]; // default = all six; `email` always appended as optional
     forRelation?: string;    // e.g. 'mother' → "I'll help you book for your mother"
     alreadyHaveReason?: boolean; // suppresses reason row + adds the "We already have your reason" note
   }
   ```
3. Implementation picks the intro from `variant`, the list from `missing ∖ {email}` (email always listed as `(optional, for receipts)` at the bottom), and the closing example/CTA from `variant`.
4. Replace each of the 9 call sites with a call to the helper. Preserve current semantics — especially the three context signals `forRelation`, `alreadyHaveReason`, and `variant`.
5. Add a short note to the AI prompt at `backend/src/services/ai-service.ts:423` (which references the old string literal "Please share: Full name, Age, Mobile, Reason for visit" to tell the LLM not to repeat it). Update that quoted literal to match the new copy so the LLM's self-check stays accurate. **Do NOT change the LLM's behavior**, only the quoted example inside the system prompt.
6. Snapshot every variant × realistic input combination.

**Scope trade-offs:**
- No locale variants — English only, same as today's strings.
- The "Email (optional) for receipts" line stays exactly that — we don't hide email from the list even when the patient is in a jurisdiction where receipts aren't customary. Keep behavior identical.
- The "Example:" block is **only** added for `variant: 'initial'` (not for retries or still-need). Retries already have context; adding the same example inflates every retry message unnecessarily.
- Per-relation pronoun accuracy (her/him/them) is deliberately skipped. Using "their" universally is acceptable; we do NOT build a gender-of-subject dispatch.

### Change Type

- [x] **Create new** — `buildIntakeRequestMessage` in `dm-copy.ts`
- [x] **Update existing** — 9 call sites in `instagram-dm-webhook-handler.ts` + 1 prompt literal in `ai-service.ts:423`
- [ ] **Create migration** — not required

### Current State

- `backend/src/workers/instagram-dm-webhook-handler.ts` — 9 inline variants listed above.
- `backend/src/services/ai-service.ts:423` — system prompt contains the old literal that shapes LLM behavior.
- Existing label helpers (`extractResult.missingFields.map((f) => labels[f] ?? f)`) in the webhook handler — reuse the same `labels` map from the current site `:2920` when building the helper input, or move the map into `dm-copy.ts` alongside the builder. The labels map is the source-of-truth for the human-readable field names and must stay consistent across callers.

### Scope Guard

- Expected files touched: 3 (`dm-copy.ts`, `instagram-dm-webhook-handler.ts`, `ai-service.ts` prompt literal) + tests.
- Each of the 9 replacements must be semantically equivalent — don't quietly change when `forRelation` is set vs. not, or when the retry variant fires.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — required harness

---

## Task Breakdown

### 1. Helper design

- [x] 1.1 Centralize the `IntakeField` → human label mapping in `dm-copy.ts`:
  ```ts
  export const INTAKE_FIELD_LABELS: Record<IntakeField, string> = {
    name: 'Full name',
    age: 'Age',
    gender: 'Gender',
    phone: 'Mobile number',
    reason_for_visit: 'Reason for visit',
    email: 'Email',
  };
  ```
- [x] 1.2 Implement `buildIntakeRequestMessage` per the variants in "Task Overview". Emit trailing `*(optional, for receipts)*` italic suffix only on the `email` row.
- [x] 1.3 Clamp `forRelation` to ≤ 32 chars and lowercase the rendered noun (`Mother` → `mother`) but NOT the practice name.

### 2. Replace call sites

Tackle sites in ascending line-number order so diffs stay reviewable:

- [x] 2.1 Line 2451 — `variant: 'initial'`, `forRelation: relation`, custom `intro` for two-person framing. **Note:** code at this site sets `bookingForSomeoneElse: true`, meaning the OTHER person's fields are collected first — so the rendered copy says "your {relation} first, then you" (not "yours first, then theirs"). The task spec's literal "yours first" was a copy-paste error; the parenthetical "preserves the two-step framing" captures the actual intent and we matched that.
- [x] 2.2 Line 2481 — `variant: 'initial'`, `forRelation: relation` (or `undefined` + custom `intro: "I'll help you book for **them**. …"` when `relation === 'them'`).
- [x] 2.3 Line 2538 — `variant: 'retry-not-received'`, no relation, default intro.
- [x] 2.4 Line 2646 — `variant: 'retry-not-received'`, `forRelation: state.relation` when concrete; falls back to custom `intro: "I didn't catch the details for the person you're booking for — …"` when the relation word is unknown.
- [x] 2.5 Line 2857 — `variant: 'initial'`, `forRelation: relation`, custom `intro: "Got it, just your **{relation}** then. Please share their details:"`.
- [x] 2.6 Line 2921 — `variant: 'still-need'`, `missing: extractResult.missingFields`, `includeEmail: false`, default intro (`"Got it. Still need these details:"`).
- [x] 2.7 Line 3083 — `variant: 'still-need'`, `missing: extractResult.missingFields`, `includeEmail: false`, custom `intro: 'Still need these details:'` (no "Got it." prefix — this branch doesn't acknowledge a fresh partial update).
- [x] 2.8 Line 3280 — `variant: 'initial'`, `forRelation: relation`, custom `intro: "Got it. I'll help you book for your **{relation}** next. Please share their details:"`.
- [x] 2.9 Line 3453 — collapsed with 2.10 into a single call using `alreadyHaveReason: reasonSeedBook.length > 0` (replaces the ternary).
- [x] 2.10 Line 3454 — same single call as 2.9; `alreadyHaveReason: false` branch.

### 3. AI prompt literal

- [x] 3.1 `backend/src/services/ai-service.ts` — updated two quoted literals:
  - Line 423 (the "NEVER repeat" CRITICAL rule) — generalized from the old comma-joined excerpt to reference the new bulleted structure so the LLM recognizes the canonical intake-request shape without needing the full multi-line quote.
  - Line 2023 (the `collecting_all` hint example) — both the `still-need` and `initial` branches now carry short bulleted examples mirroring the helper output (bolded labels, one per line, `*(optional, for receipts)*` suffix on email).
- [x] 3.2 No existing "prompt snapshot" test exists in the repo (verified via `rg` of the tests tree for prompt-related assertions). Full unit suite stays green (858/858), so no downstream prompt consumer regressed.

### 4. Tests

- [x] 4.1 Snapshot cases in `dm-copy.snap.test.ts` — 12 intake cases shipped (11 from the matrix + a custom-intro two-person case + a canonical-order regression case):
  - initial / no relation / all fields
  - initial / no relation / `alreadyHaveReason: true`
  - initial / relation: mother / all fields
  - initial / relation: son / `alreadyHaveReason: true`
  - initial / custom intro (two-person self+other framing)
  - initial / empty practiceName → falls back to `"the clinic"`
  - initial / input order shuffled → output is canonical `name → age → gender → phone → reason → email`
  - still-need / missing: age, reason_for_visit
  - still-need / missing: email only
  - still-need / missing: all five required (`includeEmail: false`)
  - retry-not-received / no relation
  - retry-not-received / relation: father
- [x] 4.2 Unit tests for the builder: throws on `missing: []`; clamps a 64-char `forRelation` to 32 chars and lowercases it. Empty-`practiceName` fallback is covered by snapshot "initial / empty practiceName → the clinic".
- [x] 4.3 `rg "Please share: Full name" backend/tests` + `rg "Still need: " backend/tests` return zero — no brittle literal assertions existed, so no cleanup needed.

### 5. Verification

- [x] 5.1 `rg "Please share: Full name" backend/src` returns zero matches.
- [x] 5.2 `rg "Still need: " backend/src` returns **one** match — `backend/src/services/ai-service.ts:651` — which is an **LLM-input context string** (`parts.push(\`Still need: ${...}\`)`) used when building the prompt, not patient-facing output. Intentionally left as-is (the task's "zero" target is for patient copy).
- [x] 5.3 `npx tsc --noEmit` clean.
- [x] 5.4 Full unit suite green — 858/858 tests across 80 suites (was 844 before Task 03; +14 = +12 snapshot + 2 builder invariants).
- [ ] 5.5 Manual DM smoke: deferred to staging rollout (requires live Instagram webhook).

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (add buildIntakeRequestMessage + INTAKE_FIELD_LABELS)
backend/src/workers/instagram-dm-webhook-handler.ts            — UPDATED (9 call-site replacements)
backend/src/services/ai-service.ts                             — UPDATED (prompt literal refresh)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (9 snapshot cases + 2 unit tests)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
backend/tests/unit/workers/instagram-dm-webhook-handler.test.ts — UPDATED (remove brittle literal asserts if present)
```

---

## Design Constraints

- **One helper, one shape family.** Don't grow a second "intake-like" helper for edge cases — extend this one with new variant strings.
- **Bulleted fields > comma list.** Every variant renders fields as `- **Label**` on its own line.
- **CTA or framing sentence on its own line**, separated from the list by a blank line when non-trivial.
- **No behavioral change in routing.** Don't "fix" when the retry fires vs. the initial — that's handler logic, out of scope.
- **Don't over-personalize.** Keep "their/they" when we don't know gender. Do not bolt on an LLM call to choose pronouns.

---

## Global Safety Gate

- [x] **Data touched?** No writes. Reads `state.relation`, `practiceName`, `extractResult.missingFields` — all already present upstream.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No new calls. The `ai-service.ts` prompt literal change does NOT change any existing OpenAI call's parameters beyond the quoted example inside the system prompt string.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildIntakeRequestMessage` exists in `dm-copy.ts` and handles all three variants (`initial`, `still-need`, `retry-not-received`) with optional `forRelation`, `alreadyHaveReason`, `includeEmail`, and `intro` escape hatch.
- [x] All 9 inline occurrences in `instagram-dm-webhook-handler.ts` are gone (verified via `rg "Please share: Full name" backend/src` → zero matches).
- [x] `ai-service.ts` system prompt quotes the new copy (both the CRITICAL rule at line 423 and the `collecting_all` hint example at line 2023).
- [x] 12 snapshot cases + 2 builder-invariant unit tests committed; all pass.
- [x] `tsc --noEmit` clean; full unit suite green (858/858, 20 snapshots).
- [ ] Manual DM smoke in staging — deferred until rollout (see Task 5.5).

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 02](./task-02-confirm-details-multi-line.md) — companion P0 in PR 2 per the rollout plan.
- [Task 04](./task-04-consent-optional-notes-split.md) — adjacent site in the same flow (next step after intake is consent).

---

**Last Updated:** 2026-04-18  
**Pattern:** Extract-and-replace duplicated copy with typed variant input  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
