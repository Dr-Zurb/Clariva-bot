# RT-09 — Reference docs cross-check — findings & doc backlog

**Review date:** 2026-04-13  
**Scope:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md), [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md), [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) (DM/AI/PHI skim), [DECISION_RULES.md](../../../../../Reference/DECISION_RULES.md)  
**Code anchor:** `backend/src/workers/instagram-dm-webhook-handler.ts` (main `if / else if` chain after `classifyIntent`)  
**Reading task:** [rt-09-reference-docs-cross-check.md](../reading%20tasks/rt-09-reference-docs-cross-check.md)

---

## 1. Drift: branch inventory vs handler (2026-04-13)

**Verified:** Top-of-chain order matches **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md** “Decision order” and early rows of the branch table:

`revoke_consent` → `receptionist_paused` → `awaiting_cancel_*` → `awaiting_reschedule_choice` → **`emergency_safety`** → `awaiting_staff_service_confirmation` → **consultation channel** → **`post_medical_payment_existence_ack`** → **reason-first block** → …

**Gaps (inventory doc lags code):**

| Handler `dmRoutingBranch` / behavior | In inventory? |
|--------------------------------------|---------------|
| **`booking_resume_after_emergency`** — `medical_query` idle, thread had assistant emergency escalation, user signals post-emergency stability → resume booking (`step: collecting_all`, AI with idle hint) | **No** — add row + short “Decide / Say” note after **`medical_safety`** or in reason-first / medical subsection |
| **`learning_policy_autobook`** — pre-DM / staff-learning autobook path (late in handler) | **No** — add row or footnote under staff feedback / learning (ties to §9 philosophy) |
| **`awaiting_reschedule_slot`** as user step | Table mentions reschedule choice + URL; **optional** explicit row for “user on link flow after numeric pick” (behavioral, not a new `dmRoutingBranch` label in grep) |

**Not drift:** Inner reason-first sub-branches (`fee_ambiguous_visit_type_staff`, `fee_follow_up_anaphora_idle`, `reason_first_triage_ask_more_ambiguous_yes`, etc.) are implementation detail inside row 9; inventory stays **guidance** as stated.

---

## 2. Conversation rules vs code

**RECEPTIONIST_BOT_CONVERSATION_RULES.md** remains **aligned** with the three-layer pattern, RBH-14 context + `applyIntentPostClassificationPolicy`, fee / `activeFlow`, and **`lastPromptKind`** description (with legacy substring caveat).

**Minor:** “Intent priority” list is a **tie-break** abstraction; the **handler** applies **step gates and safety before** raw intent priority for open conversation — already implied by branch inventory; no conflict if engineers read inventory + handler together.

---

## 3. COMPLIANCE.md vs bot behavior (skim)

**Aligned in spirit:** External AI must not receive unnecessary PHI; logs metadata-first; consent for collection.

**Engineering reminder (not a doc defect):** COMPLIANCE references **`redactPHI()` “when implemented”** — production path uses **`redactPhiForAI`** in `ai-service` (and related). Optional backlog: **COMPLIANCE** “Implementation references” table could name the **actual** helper file(s) in a small follow-up edit so agents do not hunt for a non-existent `redactPHI` export.

---

## 4. DECISION_RULES.md

**AI_BOT_BUILDING_PHILOSOPHY** is listed in the conflict hierarchy as guidance for **receptionist/DM strategy** (below COMPLIANCE / STANDARDS / CONTRACTS). **No contradiction** with philosophy’s own statement that it is **optional** unless the lead asks — “optional” means **not every PR**, not that philosophy is invalid when it *is* invoked.

---

## 5. Philosophy §7 / §9 — link check

| Link | Result |
|------|--------|
| §7 table — file paths (`ai-service.ts`, `reason-first-triage.ts`, …) | Repo files exist under `backend/src/...` |
| §9 — `plan-staff-feedback-learning-system.md`, `e-task-learn-01` … `e-task-learn-05` | **OK** — under `docs/Development/Daily-plans/April 2026/12-04-2026/` |
| §9 — `plan §1a` anchor on same plan | Verify in browser if anchor IDs differ (low risk) |
| Related — `STAFF_FEEDBACK_LEARNING_INITIATIVE.md` | **OK** — `docs/task-management/` |
| **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY** → RBH-17 task | **OK** — March 2026 path exists |

**No broken relative links** detected from `docs/Reference/` for the checked targets.

---

## 6. Philosophy “optional” vs elite product (RT §3)

**AI_BOT_BUILDING_PHILOSOPHY.md** explicitly states it is **not** a default gate for every PR. For an **elite** receptionist initiative, the team may still **choose** to require philosophy alignment for **bot-touched** PRs (e.g. label `area: receptionist` + checklist). That is a **product/process** decision; the philosophy file should stay honest unless leadership rewrites the opening paragraph.

**Suggestion:** If the team adopts a stricter default, update **§ opening** and **DECISION_RULES** “when to open philosophy” in one PR — avoid two conflicting “optional vs required” statements.

---

## 7. Deliverable — **doc update backlog** (after code audit)

Edit when executing doc-sync work (see also theme **T5**):

1. **`docs/Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`** — Add **`booking_resume_after_emergency`** and **`learning_policy_autobook`** (and optionally **`awaiting_reschedule_slot`** UX); bump “Last updated”.
2. **`docs/Reference/COMPLIANCE.md`** — Optional: point AI redaction bullet to **`redactPhiForAI`** / actual module path.
3. **`docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md`** — Optional: one sentence cross-linking **post-emergency resume** branch to inventory after (1).
4. **`docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md`** — Only if process changes: align **§ opening** with team PR policy for bot work.
5. **`docs/Development/Daily-plans/April 2026/13-04-2026/planning/plan-philosophy-alignment-audit-2026.md`** — Mark **T5** complete; close **RT-01–09** row when execution tasks are filed.

**No code changes** required for RT-09 completion.

---

## 8. Severity

| Sev | Item |
|-----|------|
| **P2** | Branch inventory missing **`booking_resume_after_emergency`** and **learning** autobook branch |
| **P3** | COMPLIANCE `redactPHI` vs implemented helper naming; philosophy optional vs strict process |
