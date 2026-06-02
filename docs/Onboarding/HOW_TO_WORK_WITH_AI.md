# How to Work With AI for Elite/Global Code

**Purpose:** Get the best possible code from Cursor (and any AI assistant) by giving the right context, asking the right way, and reviewing correctly.

**Philosophy:** The AI is only as good as the context and instructions you give. You are the architect; the AI is the expert builder who follows your blueprints and standards.

---

## 🎯 Core Principles

### 1. You Set the Bar
- **You** decide what "elite" and "global" mean for Clariva.
- **You** point the AI at the rules (docs/Reference, task-management).
- **You** review and approve; never accept code blindly.

### 2. Context Is Everything
- The AI doesn't remember past chats forever.
- The AI doesn't read your whole repo unless you reference files.
- **@-mention** the files, folders, and docs that matter.

### 3. Specific Beats Vague
- "Add payment" → unclear scope, style, security.
- "Add Razorpay payment link per @e-task-4 and @STANDARDS.md" → clear scope and standards.

### 4. Iterate, Don't Expect Perfection
- First response is a draft. Review it. Ask for fixes.
- "Follow our patterns in @RECIPES.md" or "Add tests per @TESTING.md" refines the result.

---

## 📎 What to Give the AI (Context)

### Always Helpful

| What to @-mention | Why |
|-------------------|-----|
| **Task file** (`docs/Work/Daily-plans/.../e-task-X.md`) | Defines WHAT to build and acceptance criteria |
| **Relevant Reference doc** ([`STANDARDS.md`](../../Reference/engineering/development/STANDARDS.md), [`SECURITY.md`](../../Reference/engineering/compliance/SECURITY.md), [`TESTING.md`](../../Reference/engineering/development/TESTING.md), etc.) | Defines HOW (patterns, security, tests) |
| **Files you're changing** (`backend/src/services/payment-service.ts`) | Shows existing code so the AI can extend, not replace blindly |
| **Architecture** (`docs/Reference/engineering/architecture/ARCHITECTURE.md`) | Keeps structure consistent |

### When It's a New Feature

- **Task file** — so the AI knows scope and "definition of done"
- **RECIPES.md** — so implementation follows existing patterns
- **STANDARDS.md** or **CODE_QUALITY.md** — naming, types, structure
- **SECURITY.md** — if the feature touches auth, payments, PHI, or external APIs
- **API_DESIGN.md** or **CONTRACTS.md** — if you're adding or changing endpoints

### When It's a Change to Existing Code

- **CODE_CHANGE_RULES.md** (`docs/Work/process/CODE_CHANGE_RULES.md`) — audit, impact, remove obsolete, update tests
- **The file(s) you're changing** — so edits are minimal and consistent
- **Tests for that area** — so the AI updates or adds tests

### When It's a Bug or Refactor

- **The failing test or error message** — exact error text or screenshot
- **The file/function where it happens** — so the AI can narrow the fix
- **DEBUGGING.md** — if the issue is environment, logs, or external services

### When You Want Elite/Global Quality

- **CODE_QUALITY.md** — structure, naming, TypeScript
- **SECURITY.md** — no secrets, no PHI in logs, validation, auth
- **TESTING.md** — coverage, AAA, no PII in tests
- **COMPLIANCE.md** or **PRIVACY_BY_DESIGN.md** — if the change touches data or privacy

---

## ✍️ How to Ask (Prompts)

### Good Prompt Structure

```
[Goal] — what you want in one sentence
[Context] — @task file, @reference doc, @file
[Constraints] — "follow our patterns", "no PHI in logs", "add tests"
[Optional] — "prefer X over Y", "same style as Y.ts"
```

### Examples: Good vs Bad

**❌ Too vague**
```
Add login for doctors
```
- No task, no standards, no security doc. Result: generic code that may not fit your stack or rules.

**✅ Specific and contextual**
```
Add doctor login per @e-task-5-auth.md using JWT and our auth pattern in @RECIPES.md.
Follow @SECURITY.md (no secrets in code, validate input with Zod).
Reuse existing middleware in @auth.ts.
```

---

**❌ No context**
```
Fix the payment webhook
```
- Which webhook? Razorpay, PayPal? What’s broken (error, behavior)?

**✅ Clear and scoped**
```
Razorpay webhook sometimes runs twice. Make it idempotent per @WEBHOOKS.md.
Use @webhook-controller.ts and @webhook-idempotency-service.ts.
Add a test for duplicate event in @webhook-controller.test.ts.
```

---

**❌ No quality bar**
```
Write a function to get appointments
```
- No validation, no errors, no RLS, no tests.

**✅ With standards**
```
Add getAppointmentsForDoctor in @appointment-service.ts with pagination per @PAGINATION.md.
Use RLS and ownership check per @RLS_POLICIES.md.
Validate query params with Zod (@STANDARDS.md).
Add unit tests per @TESTING.md (AAA, no real DB).
```

---

### Useful Phrases That Lift Quality

- *"Follow @RECIPES.md for …"* — ties implementation to your patterns
- *"Per @STANDARDS.md …"* — naming, types, file layout
- *"Add tests per @TESTING.md"* — consistent, safe tests
- *"No PHI in logs per @SECURITY.md"* — compliance-aware
- *"Use asyncHandler and our error classes per @ERROR_CATALOG.md"* — consistent API behavior
- *"Check @CODE_CHANGE_RULES.md"* — when modifying existing code
- *"Match the style of @payment-service.ts"* — keeps codebase consistent

---

## 🔄 Workflow: Before, During, After

### Before You Ask the AI

1. **Know the goal** — one clear outcome (e.g. "payment link creation for Razorpay").
2. **Have a task file** (for features) — so scope and acceptance criteria exist.
3. **Open the right docs** — at least the Reference doc that covers the area (security, testing, API, etc.).
4. **@-mention in the prompt** — task file, 1–2 Reference docs, and the main file(s) to change.

### During the Conversation

1. **One main ask per message** — one feature or one fix. Split big work into smaller asks.
2. **If the answer is wrong or incomplete** — say what’s wrong and what you want:
   - "Use Zod here per @STANDARDS.md"
   - "Add a test for the 404 case"
   - "This should use the adapter, not call Razorpay directly"
3. **If you don’t understand** — ask: "Explain this part" or "Why this instead of X?"
4. **If the AI suggests a different approach** — ask for pros/cons or: "Do it our way per @ARCHITECTURE.md."

### After the AI Suggests Code

1. **Read the diff** — don’t accept without reading. You’re the reviewer.
2. **Run checks** — `npm run type-check`, `npm test`, `npm run lint`.
3. **Check against your rules** — COMMON_MISTAKES.md, SECURITY.md (no logs of PHI, no hardcoded secrets).
4. **Update task file** — mark subtasks done, note any follow-ups.
5. **Commit with a clear message** — e.g. `feat(payments): add Razorpay link creation per e-task-4`.

---

## 📂 What to @-mention by Scenario

| Scenario | @-mention |
|----------|-----------|
| New API endpoint | Task file, RECIPES.md, API_DESIGN.md, CONTRACTS.md, the route/controller file |
| New service/feature | Task file, ARCHITECTURE.md, RECIPES.md, STANDARDS.md, existing service file |
| Security-sensitive (auth, payments, PHI) | Task file, SECURITY.md, COMPLIANCE.md, relevant service/controller |
| Bug fix | File where bug is, error message, DEBUGGING.md if needed |
| Refactor / change existing code | CODE_CHANGE_RULES.md, file(s) to change, tests |
| Tests only | TESTING.md, file under test, existing test file for that module |
| DB / schema change | Task file, DB_SCHEMA.md, MIGRATIONS_AND_CHANGE.md, existing migration or schema |

---

## 🚫 What to Avoid

### Don’t

- **Don’t ask for “everything” in one go** — e.g. "Build the whole payment flow." Break it into steps (e.g. create link → webhook → tests).
- **Don’t skip @-mentions** — without task or Reference docs, the AI will guess and may not follow your standards.
- **Don’t accept code without running it** — run type-check, tests, and lint every time.
- **Don’t paste secrets or PHI** — not in chat, not in task files. Use placeholders.
- **Don’t assume the AI “remembers”** — in a long chat, re-mention key files or rules if you’re refining the same feature.
- **Don’t leave review to “later”** — quick pass right after the AI suggests code catches most issues.

### Do

- **Do one logical chunk per request** — one endpoint, one service method, one test file.
- **Do say “follow our docs”** — e.g. "Follow @STANDARDS.md and @TESTING.md."
- **Do ask for explanations** — "Why use an adapter here?" improves your learning and keeps design consistent.
- **Do correct when wrong** — "We use Supabase here, not raw SQL" or "Use our logger, not console."

---

## 🧩 Vibecoding: You + AI as a Team

### Your Role

- **Decide what to build** — task files, priorities, acceptance criteria.
- **Provide context** — @ task, @ Reference docs, @ files.
- **Set the bar** — "elite", "global", "compliant" = point to SECURITY, TESTING, CODE_QUALITY, COMPLIANCE.
- **Review and test** — read diffs, run type-check and tests, check COMMON_MISTAKES and SECURITY.
- **Iterate** — "Add error handling", "Add a test for X", "Use Zod here."

### AI’s Role

- **Implement** — code that matches your task and referenced docs.
- **Follow patterns** — RECIPES, STANDARDS, ARCHITECTURE.
- **Suggest** — "Consider adding validation" or "This could use a test."
- **Explain** — when you ask "why?" or "how?".

### Best Rhythm

1. You write (or refine) the **task file** and **acceptance criteria**.
2. You **@ task + Reference + files** and ask for **one** concrete deliverable.
3. AI **proposes code** (and maybe tests).
4. You **review, run type-check + tests**, and ask for **fixes or refinements**.
5. You **commit** and **update the task file**.
6. Repeat for the next chunk.

---

## ✅ Checklist: “Am I Working With the AI in the Best Way?”

### Before Asking

- [ ] I know the single goal for this request
- [ ] I have a task file (for features) or a clear bug/refactor description
- [ ] I’ve @-mentioned the task file and the relevant Reference doc(s)
- [ ] I’ve @-mentioned the file(s) to be changed or created
- [ ] I’ve said how “good” looks (e.g. "per STANDARDS.md and TESTING.md")

### After Getting Code

- [ ] I read the diff
- [ ] I ran `npm run type-check`
- [ ] I ran `npm test` (and any new tests pass)
- [ ] I ran `npm run lint` (or lint:fix)
- [ ] I checked for no PHI in logs, no hardcoded secrets
- [ ] I updated the task file and committed with a clear message

---

## 📚 Reference Doc Quick Map

Use these when you want elite/global code in that area:

| Topic | Primary doc | Use when |
|-------|-------------|----------|
| Naming, types, structure | CODE_QUALITY.md, STANDARDS.md | Any new or changed code |
| Security, auth, PHI | SECURITY.md, COMPLIANCE.md | Auth, payments, health data |
| API design, contracts | API_DESIGN.md, CONTRACTS.md | New or changed endpoints |
| Patterns (controller, validation, errors) | RECIPES.md | Implementing features |
| Tests | TESTING.md | Adding or changing tests |
| DB / schema | DB_SCHEMA.md, MIGRATIONS_AND_CHANGE.md | Schema or migrations |
| Changing existing code | Work/process/CODE_CHANGE_RULES.md | Refactors, behavior changes |
| Webhooks | WEBHOOKS.md | Webhook handlers, idempotency |
| Errors and logging | ERROR_CATALOG.md, OBSERVABILITY.md | Error handling, logging |
| Performance | PERFORMANCE.md | Slow paths, N+1, timeouts |

---

## 🔗 Related Documents

- [PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md) — patterns the AI should follow
- [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — what to catch in review
- [DAILY_HABITS.md](./DAILY_HABITS.md) — when to review and push
- [CHEAT_SHEET.md](./CHEAT_SHEET.md) — commands and quick checks
- [../Work/process/CODE_CHANGE_RULES.md](../Work/process/CODE_CHANGE_RULES.md) — when changing existing code
- [../../Reference/](../../Reference/) — full set of rules and standards

---

**Bottom line:** Elite/global code comes from **you** setting the bar and giving the AI **precise context** (task + Reference + files) and **clear instructions** ("follow X", "add tests", "no PHI in logs"). Review every suggestion, run type-check and tests, and iterate. You’re the architect; the AI is the expert builder that follows your blueprints.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
