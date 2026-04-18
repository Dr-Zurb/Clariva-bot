# Plan — Patient DM copy polish
## 18 April 2026

---

## Goal

Raise the floor on patient experience in every DM the bot sends — without changing flow, routing, or business rules. Today most messages are technically correct but read like transactional SMS: walls of comma-separated fields, stacked questions in one paragraph, buried CTAs, links hugging sentences, and seven copies of the same "Please share: Full name, Age, …" string. This plan fixes those shapes.

## Source

This plan is a direct conversion of the 2026-04-17 DM patient-experience audit (see `docs/capture/inbox.md` under "DM copy audit 2026-04-17" once filed, and the audit transcript in chat history). Each task below corresponds to one audit finding; each task stands on its own and can ship independently.

## Non-goals

- No new routing / intent rules. No new LLM calls. No new DB columns.
- No tone overhaul of the bot's "voice" — we keep the existing warm, concise register. We just restructure how existing copy is laid out.
- No localization work in this plan. All changes remain English-only for now; the `safety-messages.ts` locale pattern is already used where relevant and is NOT expanded here.
- No product / visual design review. Edits stay strictly in markdown-rendered text (bold, newlines, bullets, optional one emoji where product intent clearly calls for it).

## Guiding principles (applied to every task)

1. **One ask per paragraph.** Never stack "here's what we captured + consent Q + optional-notes Q + CTA" into a single bubble.
2. **Multi-line > comma list** whenever the patient has to produce OR read structured data.
3. **Bold the labels, not just the values.** `**Name:** Abhishek` scans faster than `**Abhishek**, 35, male, …`.
4. **Actionable data on its own line** — links, phone numbers, appointment IDs, MRNs, dates. Never in the middle of a sentence.
5. **Every message ends with a single, bolded CTA** after a blank line (`Reply **Yes** to continue.`).
6. **Copy lives in one place.** Extract a `dm-copy.ts` module (Task 01). Patient-facing strings stop being inline across 5+ files.
7. **Golden-snapshot tests.** Once copy is centralized, every rendered message gets a `.snap` so future tweaks surface in diff, not in production.

## Tasks

| # | Priority | Title | Files touched (approx) | Depends on |
|---|---|---|---|---|
| [01](./Tasks/task-01-dm-copy-helper-and-golden-snapshots.md) ✅ | Prereq | `dm-copy.ts` module + golden-snapshot test harness | 2 new files + test | — |
| [02](./Tasks/task-02-confirm-details-multi-line.md) ✅ | P0 | `buildConfirmDetailsMessage`: multi-line labeled layout | `collection-service.ts` + tests | 01 |
| [03](./Tasks/task-03-intake-request-helper.md) ✅ | P0 | `buildIntakeRequestMessage` helper; replace 9 call sites + `Still need:` variants | `instagram-dm-webhook-handler.ts`, `ai-service.ts` prompt note, `dm-copy.ts` | 01 |
| [04](./Tasks/task-04-consent-optional-notes-split.md) ✅ | P1 | Split consent / optional-notes / CTA into three lines | `instagram-dm-webhook-handler.ts` (2 sites) | 01 |
| [05](./Tasks/task-05-payment-received-sectioning.md) ✅ | P1 | Format payment-received DM with sections | `notification-service.ts` | 01 |
| [06](./Tasks/task-06-abandoned-reminder-url.md) ✅ | P2 | Re-include booking URL in abandoned-booking reminder | `abandoned-booking-reminder.ts` | 01 |
| [07](./Tasks/task-07-cancel-list-polish.md) ✅ | P2 | Cancel-list copy polish (`Reply 1 or 2`, bold numbers, modality hint) | `instagram-dm-webhook-handler.ts` | 01 |
| [08](./Tasks/task-08-staff-review-resolved-url.md) ✅ | P2 | Staff-review resolved booking DM: URL on its own line + labeled CTA | `staff-service-review-dm.ts` | 01 |
| [09](./Tasks/task-09-mixed-complaint-numbered-list.md) ✅ | P3 | Mixed-complaint clarification: echo concerns as numbered list | `complaint-clarification.ts`, webhook handler wiring | 01 |
| [10](./Tasks/task-10-reason-first-triage-split.md) ✅ | P3 | Reason-first triage copy split (2 lines, CTA isolated) | `reason-first-triage.ts` | 01 |
| [11](./Tasks/task-11-non-text-ack-softer.md) ✅ | P3 | Soften non-text acknowledgement copy | `instagram-dm-webhook-handler.ts` | 01 |

**Task 01 is the only strict prerequisite.** Everything else is parallelizable and can land in any order after 01 ships. If Task 01 slips, Tasks 02–11 can still ship inline (without centralization) — but each one then grows by ~1 file (the test fixture) and we lose the single-source-of-truth guarantee.

## Rollout / shipping order

Recommended single-PR groupings to keep reviews small:

1. **PR 1 (foundation):** Task 01 only. No user-visible change.
2. **PR 2 (P0):** Task 02 + Task 03. Biggest patient-visible wins; both touch the confirm/intake loop.
3. **PR 3 (P1):** Task 04 + Task 05. Consent paragraph split and happy-path payment DM.
4. **PR 4 (P2):** Task 06 + Task 07 + Task 08. Three small cosmetic polishes on the booking edges.
5. **PR 5 (P3):** Task 09 + Task 10 + Task 11. Tone-level refinements.

Each PR is independently revertable. Golden-snapshot tests guard every string.

## Acceptance for the plan

Plan is done when:

- [x] All 11 task checkboxes in the table above are `[x]`.
- [x] `backend/src/utils/dm-copy.ts` + `backend/src/utils/complaint-clarification.ts` + `backend/src/utils/reason-first-triage.ts` are the **only** places where user-facing patient DM strings from these 11 tasks live (the first owns the shared builders; the other two retain locale-specific helpers that pre-dated this plan).
- [x] Golden-snapshot suite covers every message introduced / changed by these tasks — **57 snapshot entries** across `backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap` (well above the 11-minimum baseline).
- [x] Full unit suite green (955 tests / 80 suites / 57 snaps); `tsc --noEmit` green; ESLint clean on all touched files.
- [ ] Manual DM smoke in staging deferred to PR-4 + PR-5 rollout — covered per-task in individual task docs.

## Related

- Philosophy alignment plan: [`../April 2026/13-04-2026/planning/plan-philosophy-alignment-audit-2026.md`](../April%202026/13-04-2026/planning/plan-philosophy-alignment-audit-2026.md) — adjacent but separate workstream (intent / extraction / routing correctness). This plan 18-04 is purely copy-layout; no overlap in files touched except via `instagram-dm-webhook-handler.ts`, which is large enough to accommodate both.
- Reference doc: [`docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md`](../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) — §"Patient-facing copy" lines up with every principle in this plan.

---

**Owner:** TBD  
**Created:** 2026-04-18  
**Status:** Done — all 11 tasks shipped 2026-04-18. PR-1 (Task 01) + PR-2 (02, 03) + PR-3 (04, 05) + PR-4 (06, 07, 08) + PR-5 (09, 10, 11). Tasks 01 + 02 + 03 + 04 + 05 + 06 + 07 + 08 shipped 2026-04-18 (`dm-copy.ts` + snapshot harness; `buildConfirmDetailsMessage` multi-line labeled layout; `buildIntakeRequestMessage` with three variants replacing all 9 inline intake asks; `buildConsentOptionalExtrasMessage` replacing both consent-step ternaries with a three-paragraph "Thanks / question / CTA" shape for self + someone-else branches, plus an `isOptionalExtrasConsentPrompt` detector clause for the new copy with legacy fallbacks preserved; `buildPaymentConfirmationMessage` + `formatDateWithMiddot` replacing the inline payment-confirmation template in `notification-service.ts:180` with a scan-friendly `✅ Payment received / middot-formatted date / 🆔 Patient ID / reminder+reply` layout; `buildAbandonedBookingReminderMessage` replacing the inline one-liner in `abandoned-booking-reminder.ts:59` with a three-paragraph nudge whose second paragraph puts the freshly-regenerated `buildBookingPageUrl(...)` on its own line so the patient can tap without scrolling back, with a throw-guard on empty URLs to surface upstream config bugs; `buildCancelChoiceListMessage` + `appointmentConsultationTypeToLabel` + `formatAppointmentChoiceDate` replacing both cancel-intent prompts (single-upcoming confirm-by-Yes branch and multi-upcoming numbered list) with an adaptive, bolded-choice-key pick-list that includes a modality suffix (`"Video consult"`, `"In-person"`, …) and a smart trailer (`"Reply **Yes** …"` / `"Reply **1** or **2**."` / `"Reply a number from **1** to **N**."`) — reschedule list intentionally untouched per scope; `buildStaffReviewResolvedBookingMessage` + `StaffReviewResolvedKind` centralizing the ARM-05 staff-review resolved DM rendering in `dm-copy.ts` and delegating `formatStaffReviewResolvedContinueBookingDm` to it — replacing the legacy single-paragraph `"You can **pick a time and complete booking** here — tap to open: {url}"` with a three-paragraph shape that isolates the booking URL on its own line below a `"Pick a time and complete your booking here:"` label, preserving the three distinct kind phrasings (`confirmed` / `reassigned` / `learning_policy_autobook`) and the `"the clinic"` + `"your visit"` fallbacks, with a throw-guard on empty URLs symmetrical with the abandoned-reminder helper; snapshot suite grew to 39 cases across 908 total unit tests). **Task 09 (2026-04-18, PR-5):** extended the service-catalog matcher LLM schema with an optional `concerns: string[]` field (2–5 English noun-phrase labels emitted only when `mixed_complaints:true`), added `normalizeLlmConcerns` at the parser boundary (trim, truncate > 40 chars with `…`, case-insensitive dedupe, cap at 5, returns `undefined` if < 2 valid entries remain) plus exported `SERVICE_MATCH_MAX_CONCERNS`/`SERVICE_MATCH_CONCERN_MAX_CHARS` constants; extended `resolveComplaintClarificationMessage(userText, parsedConcerns?)` to render a numbered-list variant for 2–5 concerns (bold-dot numbers per the Task-07 cancel-list convention, grammatical-join CTA `**1** or **2**` / `**1**, **2**, or **3**`) across 5 locales (`en` / `hi` Devanagari / `pa` Gurmukhi / `latin-hi` / `latin-pa`, localized intro + CTA with English concern labels per the "English concerns in all locales for now" design constraint), with graceful fallback to the existing single-sentence copy for 0/1/6+ entries; added `pendingClarificationConcerns` to `ConversationState` and wired `maybeTriggerComplaintClarification` to persist + echo the list; added a numeric-reply short-circuit in the `awaiting_complaint_clarification` dispatch (`resolveClarificationNumericReply("2", concerns) → "Diabetes follow-up"` → passed to matcher re-run as narrowed reason) with invalid digits falling through to the pre-existing free-text path; clear `pendingClarificationConcerns` on every exit from the clarification step to prevent stale leakage; PHI posture preserved by logging only the concern COUNT (never the labels) and documenting the field's compliance posture alongside `originalReasonForVisit`. Coverage: 7 matcher tests (schema, truncation, dedupe, hallucination guard, single-fee short-circuit), 9 snapshots (2/3/5/1-fallback/6-fallback English + 3-concern variants for all 4 non-English locales), 15 invariant/numeric-reply unit tests. Full suite: **938 tests / 80 suites / 48 snapshots**, zero regressions. **Task 10 (2026-04-18, PR-5):** applied the 2-paragraph split to `clinicalDeflectionAskMore{English,Hi,Pa}` in `backend/src/utils/reason-first-triage.ts` across all 3 sub-branches (`blank` / `\n-bearing` / single-line snippet) — the question sentence (`**Is there anything else** …?` / `**Kya aur kuch** …?` / `**Hor kuj** …?`) now sits on its own paragraph, and the escape-hatch + next-step sentence (`If that covers it, reply **nothing else** and we'll move to **booking** or **fees**.` / locale equivalents) drops below a blank line. English wording is the audit-recommended new shape (`If that's the full picture, …` for blank-snippet; `If that covers it, …` for snippet-bearing); Hinglish / Roman-Gurmukhi wording stays byte-for-byte identical except for the inserted `\n\n`. No separate Roman-script leaf exists — `detectSafetyMessageLocale` collapses Roman Hi/Pa into the `hi`/`pa` leaves, and those strings are already transliterated, so 3 leaves × 3 sub-branches = **9** rendered variants (not the 15 projected in the original task doc; corrected in task-10 doc top-note). Coverage: 9 snapshots (`triage / {en,hi,pa} / {blank, single-line, multi-line} snippet`) + 6 invariants (paragraph-break presence, bold-phrase preservation, snippet-header prefix intact, regression guard forbidding the legacy single-line `Reply **nothing else** if … — then we can (help with|move to) booking or fees` tail). Full suite: **953 tests / 80 suites / 57 snapshots**, zero regressions. **Task 11 (2026-04-18, PR-5):** closed the plan with a single-line copy polish on `buildNonTextAckMessage` in `backend/src/utils/dm-copy.ts` — replaced the bot-framed `"I can only process text messages right now. Please type your request and I'll help you."` with the patient-framed `"I can't read images or voice notes yet — could you type your message instead? I'll take it from there."`. Rationale captured in an extended JSDoc above the function so a future reviewer understands why "images or voice notes" is named explicitly (two inputs patients plausibly expect a response to) while stickers and reactions stay unnamed (rare expected reply surface). No signature change; the single caller in `instagram-dm-webhook-handler.ts:1253` is untouched. Coverage: 1 snapshot (`dm-copy snapshots nonTextAck / default`) regenerated in place + 2 new invariants (`buildNonTextAckMessage invariants (Task 11)` in `dm-copy.snap.test.ts`) guarding the shape independently of the wording — single-line only, no markdown (no `**`), no emoji (explicit Unicode symbol/pictograph range assertion), names "images" and "voice notes", contains "type" (so we always tell the patient what to do), and an explicit regression guard against the legacy `process text messages` wording resurfacing. Full suite: **955 tests / 80 suites / 57 snapshots**, zero regressions. Plan complete.
