# e-task-phil-05 — Conversation types: extend `lastPromptKind` (channel pick, optional extras)

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T3  
**Planning source:** [rt-07-utils-validation-types-findings-and-planned-changes.md](../planning/rt-07-utils-validation-types-findings-and-planned-changes.md) §5  
**Maps to:** [tm-bot-audit-01-routing-context.md](../../../../../task-management/tasks/tm-bot-audit-01-routing-context.md)

---

## Objective

Reduce **substring** routing for **consultation channel pick** and **optional-extras consent** by extending **`ConversationLastPromptKind`** (or dedicated flags), updating **`conversationLastPromptKindForStep`**, **`effectiveAskedFor*`**, and **`resolveConsentReplyForBooking`** / **`booking-consent-context`** as needed.

---

## Preconditions

- [x] e-task-phil-03 audit done or in parallel (avoid duplicate outbound mapping work).

---

## Tasks

- [x] **Design** enum values: e.g. `consultation_channel_pick`, `consent_optional_extras` (names TBD with types review).
- [x] **Migrate** `dm-consultation-channel` / `lastBotAskedForConsultationChannel` substring path to structured kind where possible.
- [x] **Wire** consent optional-extras so **`isOptionalExtrasConsentPrompt`** does not rely solely on assistant copy match (or document why copy hash is kept).
- [x] **Tests:** `conversation-last-prompt-kind.test.ts`, `booking-turn-classifiers`, webhook paths.
- [ ] Optional: add **`last_prompt_kind`** to **`InstagramDmRoutingLogFields`** (enum only — metadata).

_`isOptionalExtrasConsentPrompt` still uses assistant copy for detection; structured `lastPromptKind` + persist merge narrow routing._

---

## Acceptance criteria

- No user-facing regression on channel pick and consent flows; tests cover new kinds.

---

## Out of scope

- Full i18n of all templates in one PR.
