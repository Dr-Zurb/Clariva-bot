# e-task-phil-03 — DM webhook: audit `lastPromptKind` on all outbound paths

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T3  
**Planning source:** [rt-02-instagram-dm-webhook-findings-and-planned-changes.md](../planning/rt-02-instagram-dm-webhook-findings-and-planned-changes.md) §3–5, [rt-07](../planning/rt-07-utils-validation-types-findings-and-planned-changes.md) §5  
**Maps to:** [tm-bot-audit-01-routing-context.md](../../../../../task-management/tasks/tm-bot-audit-01-routing-context.md)

---

## Objective

Ensure **every** template / DM path that gates the next user turn sets **`lastPromptKind`** (and uses **`conversationLastPromptKindForStep`** where applicable) so **`effectiveAskedFor*`** does not depend on **English substring** drift.

---

## Preconditions

- [x] Read **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md** branch table.

---

## Tasks

- [x] **Inventory** outbound sends: consent, confirm_details, collect_details prompts, match pick, fee quote, consultation channel — grep `updateConversationState` + send paths in `instagram-dm-webhook-handler.ts`.
- [x] **Fix gaps** where `lastPromptKind` is missing but substring helpers exist (`lastBotMessageAskedFor*`).
- [x] Add **regression tests** (webhook characterization or unit) for at least **one** path that previously relied on substring only.
- [x] Document residual **substring fallbacks** in file comment (legacy rows) and optional metrics on fallback hit rate.

_Granular `lastPromptKind` values (`consent_optional_extras`, `consultation_channel_pick`) are preserved on persist when step-derived kind would overwrite them; optional-extras + channel pick flows updated in-handler._

---

## Acceptance criteria

- Checklist of prompt kinds vs code paths reviewed; gaps closed or ticketed with P2/P3.

---

## Out of scope

- Splitting **`instagram-dm-webhook-handler.ts`** into multiple files — separate epic.
