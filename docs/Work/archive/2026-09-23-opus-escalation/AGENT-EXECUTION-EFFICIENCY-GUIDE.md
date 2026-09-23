# Agent execution efficiency guide

**Purpose:** ship the Clariva EHR project to market without burning unnecessary money on AI agent costs. Quality first, cost-aware second — this guide is how you get both.

**Audience:** you (solo dev), and anyone you bring on later who'll be using Cursor agents on this codebase.

**Last updated:** 2026-05-31

---

## TL;DR (the 30-second version)

1. **Plan with Opus, execute with Auto, polish with Composer (or Auto).** Don't run Opus on every turn. The hard-rules list below still stays on a manually-picked Opus.
2. **One topic per chat.** Start a fresh chat when the topic shifts.
3. **Sub-batch docs are the spec.** When the task is well-spec'd, route it through Auto.
4. **Save Opus for: planning, security/PHI code, multi-file refactors, sub-batch close-gate review.** Auto will never pick a thinking model for you.
5. **Don't iterate. Plan, execute, ship.** Each rewrite cycle ≈ paying twice.

> **Model names:** this guide names model *families* — **Opus** (top thinking model), **Sonnet** (workhorse), **Composer** (Cursor's fast/cheap model), **Codex** — plus the **Auto** router, **without version numbers** so it doesn't go stale. "Opus" means whatever the current top Anthropic thinking model is; pick its max-thinking variant manually. For current versions and per-token rates see [Cursor — Models & Pricing](https://cursor.com/docs/models). Short policy version of this doc: [`CURSOR_MODEL_SELECTION.md`](../../Reference/engineering/development/CURSOR_MODEL_SELECTION.md).

---

## Auto vs Premium vs picking a model

Cursor's model picker has three layers, and they bill from different pools. Knowing which one you're in matters more than which specific model is named.

### Auto (Efficiency router) — your default for execution

**What it is:** Cursor picks a model per turn from a pool weighted toward cost/reliability. It explicitly **avoids** the thinking tier (Opus max-thinking, GPT reasoning variants).

**What it costs:** A flat per-token rate regardless of which model runs behind the scenes, billed from the cheaper **Auto + Composer pool** — separate from, and more generous than, your plan's API pool. (See [Cursor pricing](https://cursor.com/docs/models) for current numbers.)

**Quality:** Comparable to Sonnet on bounded, well-spec'd tasks. The routing itself is opaque (you don't see which model picked your turn), so treat it as "Sonnet-equivalent with sometimes-better cost."

**Use for:** Tier 2 / 3 / 4 work in this guide — sub-batch task implementation, frontend, tests, doc sync, trivial refactors, Ask Mode exploration. **Roughly 60–70% of your turns on this project.**

**Don't use for:** Anything on the hard-rules list below. Auto will never escalate to a thinking model, so RLS/PHI/auth/migrations need manual Opus.

### Premium (Intelligence router) — usually skip on this project

**What it is:** The opposite-end router. Cursor picks the most capable model available (curated by their internal evals) — typically the top Opus / GPT reasoning model, or equivalents.

**What it costs:** Billed at the picked model's full API rate, drawn from your **API pool** (not the cheap Auto pool).

**When it helps:** When you know a task is hard but you genuinely don't know which thinking model to pick.

**Why we mostly skip it on Clariva:** You've already encoded the "when to use a thinking model" decision in the hard-rules list below. Manually selecting **Opus (max thinking)** gives the same quality with more predictability and lets you make a deliberate choice each time. Premium is a convenience tax we don't need.

### MAX Mode (the toggle above the router)

Orthogonal to Auto/Premium/manual. MAX Mode extends the context window to the model's maximum (often ~1M tokens on current Sonnet/Opus). Bills at API rate, burns the API pool fast. Only flip on when you genuinely need to pin a large chunk of the codebase into one turn (rare on this project — sub-batches are designed to be small).

### Picking a specific model

Still useful when:
- The task is on the **hard-rules list** → manually pick **Opus (max thinking)**.
- You want **Composer specifically** for the cheapest possible execution (still pool-friendly, even cheaper than Auto).
- You want to **A/B test Sonnet vs Codex** on a specific task and need to know which one ran.

### Quick decision tree

```
Task is on the hard-rules list (RLS, PHI, auth, migrations, close-gate, hard debug)?
├─ Yes → manually pick Opus (max thinking)
└─ No → is it a Composer-tier task (doc sync, comments, trivial edits)?
        ├─ Yes → Composer (or Auto, both pool-friendly)
        └─ No → Auto
```

---

## Model tier strategy

Cursor's model menu, sorted by when to use each on this project:

### Tier 1 — Opus, max thinking (use sparingly, ~10–15% of turns)

**The "thinking" model.** Worth the cost only when judgment matters more than typing.

Use for:
- **Sub-batch planning sessions** — reading the source product plan + master batch + writing the per-task `tasks-subbatch-X.md` file. The spec quality you get out of Opus is what makes Tier 2 work cheaply later.
- **Security-sensitive code** — anything touching `auth.uid()`, RLS policies, HMAC tokens, PHI handling, signed URLs, audit logging.
- **Cross-cutting refactors** — anything that touches 5+ files or rewrites a service surface (e.g., the B2.4 send-pipeline upgrade).
- **Debugging "why is this broken" sessions** — when you don't know the root cause and need real reasoning, not pattern matching.
- **Sub-batch close-gate review** — once a sub-batch's tasks are coded, open a fresh Opus chat with the diff and ask it to grade against the acceptance gate. One careful review beats four mediocre ones.

Don't use for:
- Implementing a task that's already well-spec'd in your sub-batch doc.
- Doc edits, status sync, README updates.
- "Move this function" / "add this import" / type-only fixes.
- Anything Composer can do in 3 seconds.

### Tier 2 — Sonnet-class execution (your default, ~50–60% of turns)

**The workhorse layer.** Code quality on bounded tasks is genuinely close to Opus when the spec is clear.

**Default routing: Auto.** Auto picks Sonnet-class models from the cheaper Auto+Composer pool and matches Sonnet quality on bounded work. Drop into manual Sonnet only if you need to know which model ran (e.g., for A/B comparison or reproducing a bug).

Use for:
- Implementing a sub-batch task that has a numbered "Steps" list + a "Done when" checklist (i.e., almost everything in `tasks-subbatch-*.md`).
- Frontend component work where you've described the UX in a sentence.
- Adding API endpoints when the controller / service / route pattern already exists in the codebase.
- Writing tests for code Opus already wrote.
- Most TypeScript fixes when the error message is concrete.

Quality safety net: if Auto/Sonnet gets stuck on a single message (asks the same clarifying question twice, or ships code that fails type-check on a non-obvious error), **escalate that one message to Opus (max thinking)** — don't switch the whole chat over. Cursor's per-message model picker is your friend.

### Tier 3 — Codex (Auto often picks this; manual when you want it specifically)

Some tasks Codex does as well or better than Sonnet at similar cost — pure code-gen with a tight spec, refactor renames, type-error fixing. Auto will sometimes route to a Codex-class model on its own; if you specifically want Codex behavior (or want to A/B test against Sonnet), pick **Codex** manually. Alternate per task — no need to commit.

### Tier 4 — Composer (use heavily, ~15–25% of turns)

**Cursor's own model. Very fast, very cheap.** Quality is fine for trivial work; bad for anything requiring judgment.

**Routing:** Composer draws from the **same Auto+Composer pool** as Auto but at even cheaper per-token rates. Pick it manually when you want the cheapest possible execution; Auto is fine when you don't want to think about the switch.

Use for:
- Doc sync — ticking rows in `EXECUTION-ORDER-ehr.md`, tagging `[SHIPPED YYYY-MM-DD]` in source plans, updating `plan-ehr-implementation-batch.md`.
- README / inbox edits.
- Trivial refactors (move file, rename symbol, fix import order).
- Adding code comments to existing functions.
- One-line bug fixes when you already know the fix.
- Markdown editing in any docs/ file.

Don't use for: anything you'd want to read twice before merging.

### Tier 5 — Ask Mode for read-only exploration

For "where is X handled?" questions or browsing unfamiliar code areas, switch to **Ask Mode** (read-only). The model can't accidentally edit anything, and you can use a cheaper tier safely.

**Default routing in Ask Mode: Auto.** Auto in Ask Mode is the ideal combination — read-only means no expensive multi-file edit risk, and the cheap pool means you can explore freely. This is how you avoid the "Opus exploring the codebase for 10 minutes" cost spiral.

---

## When to escalate to Opus (the hard rules)

These are the **only** times in this project where the model choice should be Opus regardless of how routine the task seems:

1. The diff touches `auth.uid()`, RLS policies, `safe_uuid_sub()`, HMAC tokens, signed URL TTLs, or any audit-logging path.
2. The diff touches PHI columns (medicines, diagnosis, clinical notes, allergies, vitals).
3. You're writing a new migration file (the cost of getting RLS or a backfill wrong is high).
4. You're about to start a new sub-batch and need to validate the spec before coding.
5. You're at the close-gate of a sub-batch reviewing the full diff.

If none of those apply, default to Auto.

---

## Token-efficiency tactics specific to this repo

These are silently bleeding tokens on every turn regardless of model choice. Fix once, save forever.

### 1. One topic per chat

When the topic shifts (e.g., "EHR Sub-batch B2 done, on to Sub-batch C"), **start a new chat**. The full B1+B2 history riding along into C costs real money on every turn and rarely helps the agent — sub-batches are designed to be independent.

Heuristic: if your last 5 messages are about a different file/feature than your first 5, you're in a new conversation. Cut it.

### 2. Use Plan Mode for ambiguous work

When you don't know what to build yet (architectural decisions, "should we use X or Y", new feature scoping):

- Switch to **Plan Mode** — it's read-only, so the agent can't make expensive multi-file edits.
- Forces a "let's agree first" rhythm before any code is written.
- Prevents the worst cost pattern: "agent ships 4 files → you don't like it → agent rewrites all 4 → you don't like it → repeat."

### 3. Front-load the spec, not the conversation

Your `tasks-subbatch-*.md` docs are excellent — that's why Auto works for the implementation. **Keep writing those carefully with Opus**, then hand the implementation to Auto. The pattern of "Opus to think, Auto to type" is where the money goes furthest.

If you're tempted to "just have the agent figure it out", that's the signal to stop and write the spec first.

### 4. Use background agents for parallel work

When a sub-batch decomposes cleanly (e.g., B1 + B2 are explicitly designed to run in parallel per the exec-order doc), launch a background agent on one while you supervise the other. Idle time waiting for one task doesn't have to be wasted.

### 5. Prefer concrete file references over searches

When you know the file, say "edit `frontend/components/ehr/PatientRxView.tsx`" instead of "find the patient view component and update it". The agent's first move otherwise is a Glob + Grep + Read sequence that costs tokens.

---

## Workflow patterns

### Pattern A: Standard sub-batch execution (the 80% case)

For a sub-batch like B1, B2, C, D where the task list is already written:

1. **Open the sub-batch doc in Opus** for one careful read. Ask: "Are the §X–§Y decisions in the master batch settled, or do any need answers before we start?" One short Opus session, very cheap.
2. **Switch to Auto** in a fresh chat. Execute task 1 → mark done → start fresh chat for task 2 → repeat. Auto draws from the cheap pool and matches Sonnet-class quality on well-spec'd tasks.
3. If Auto stalls on a single message, escalate that message to **Opus (max thinking)**. Don't switch the whole chat.
4. **Save Opus for the close-gate.** When all tasks are coded, fresh Opus chat with the diff: "review this sub-batch against the acceptance gate in EXECUTION-ORDER-ehr.md".
5. **Use Composer (or Auto)** for the doc sync (status emojis, `[SHIPPED]` tags, three-way doc sync).

### Pattern B: New feature / no spec yet

When you have an idea but no plan doc:

1. **Plan Mode + Opus** — describe the feature, let Opus produce a draft sub-batch task file in the same shape as your existing ones.
2. **Review the draft yourself**, edit, push back. Spec quality is the ceiling for everything downstream.
3. Once the spec is locked, fall back to Pattern A.

### Pattern C: Production-hardening checklist work

When you're configuring Sentry, setting up rate limits, writing tests, drafting privacy policy text, etc:

1. **Composer or Auto** — these are checklist execution tasks. Opus is overkill.
2. The exception: anything that's a security control (rate limit thresholds on the public Rx route, signed URL TTLs, audit log retention) — that's back to the "hard rules" list above → **Opus**.

### Pattern D: Debugging an unknown failure

1. **Auto first**, with a tight prompt: paste the error, point at the file, ask for the cause.
2. If Auto's first answer is wrong or vague → escalate the same chat to **Opus**. The full debugging context is now loaded; you're not paying to rebuild it.
3. Once the cause is known, **fix it with Auto** in a new chat. Opus to diagnose, Auto to type the fix.

---

## Anti-patterns to avoid

These are the patterns that quietly multiply your costs without improving quality:

- **"Let me just keep going in this chat"** → context grows linearly, cost grows linearly. Cut the chat at topic boundaries.
- **"Opus on autopilot for everything"** → you're paying for thinking that isn't happening on routine work.
- **"Auto on autopilot for everything"** → the inverse. Auto **will not** escalate to a thinking model, ever. If the task is on the hard-rules list (RLS, PHI, auth, migrations, close-gate review), Auto will ship a confident, fast, and possibly wrong answer. You have to manually pick Opus for those.
- **Trusting Premium routing to save you a decision** → Premium bills at API rate (drains your API pool), not the cheap Auto pool. You've already encoded the "when to think hard" decision in the hard-rules list — manually picking Opus is more predictable and equally good.
- **Iteration loops** → if the agent has rewritten the same file twice and you still don't like it, **stop**. Write a tighter spec, start a new chat. Each rewrite ≈ paying twice for the same code.
- **"Search the codebase for X"** without a directory hint → expensive when "search the `backend/src/services` folder for X" would do.
- **Asking the agent to re-read context you can paste** → if you have the file open and know the relevant lines, paste them. Cheaper than asking the agent to fetch.
- **Running tests / type-checks the agent doesn't need to see** → the agent doesn't need to invoke the linter on every turn. You can run `npx tsc` yourself, paste only failures.
- **Letting Opus explore the codebase** → exploration is read-only. Use Ask Mode + a cheaper model.

---

## Path to market-ready (concrete remaining scope)

What's left to ship the EHR + consult product, broken down by what model handles it:

### EHR batch (~4 dev-days remaining)

- **Sub-batch C — Safety** (~2 days, 4 tasks). Opus for C.1 (allergy matching, PHI handling) and C.4 (pre-send modal aggregation logic). Auto for C.2 (schema + seed) and C.3 (chips UI).
- **Sub-batch D — Vitals & trends** (~2 days, 4 tasks). Opus for D.3 (additive FK + backfill — migration risk). Auto for everything else.

### Operational work for already-shipped batches

- Apply any pending migrations. Manual / Composer.
- Provision env vars (`RX_SHARE_TOKEN_SECRET`, `APP_BASE_URL`, etc.) per environment. Manual.
- End-to-end smoke test the full B2 send → patient share-link → PDF download round-trip. Manual; agents don't help here.

### Other batches (text/voice/video consult)

Based on what's in the codebase, similar 1–3 weeks of work per batch. Same model strategy. Reuse the patterns from this guide.

### Production hardening (the underestimated bucket)

Don't charge a real doctor before this is done:

- **Error monitoring** — Sentry on backend + frontend. Wire it once with Composer/Auto.
- **Rate limiting** — especially on `GET /api/v1/public/prescriptions/:id` (unauthenticated, public). Opus to design (security-sensitive), Auto to implement.
- **Backup + restore drill** — practice the Supabase restore on a scratch project. Don't assume it works.
- **Privacy policy + ToS** — especially required if you're handling PHI under your jurisdiction's healthcare data law (DPDP Act in India, HIPAA in US, etc.). Not an agent task — talk to a lawyer.
- **Audit log review process** — you're writing audit rows; design who reads them and when.
- **Load test** — 5–10 concurrent doctors on the consult flow. Opus to design the test, Auto to script it.
- **Pilot with one doctor** — onboard yourself or one trusted doctor first, watch them use it, fix what breaks. The most expensive bug to find in production is the cheapest to find in pilot.

---

## Cost calibration — red flags

Watch for these signals that you're overspending:

- **Single Cursor session > ₹500 worth of tokens** → you're either using Opus for execution work, or your chat has too much history. Cut the chat.
- **Three messages of "let me try again"** → spec was unclear. Stop and write a clearer spec; don't iterate the agent.
- **Opus exploring the codebase before answering a "where is X" question** → wrong tool. Use Ask Mode + a cheaper model.
- **Re-reading the same file in 3 consecutive messages** → context is being thrown away. Start a new chat with that file pinned.
- **A task that should take 15 minutes is on hour 2** → the agent is fighting the spec. Stop, simplify.

---

## When in doubt, the heuristic

> "Would I trust a smart junior dev who's seen the codebase once to handle this, given the spec I have?"
>
> - **Yes** → **Auto** (or manually Sonnet / Codex if you want to know which one ran).
> - **No, this needs a senior who'll actually think about edge cases** → **Opus (max thinking)** (manually picked — Auto won't escalate here for you).
> - **A teammate asked you to update a comment / move a file / sync a status doc** → **Composer** (cheapest pool rates) or **Auto**.

---

## Cross-references

This guide is the **how much / which model**. The companions cover **where** and **what-when**:

- [`CURSOR_MODEL_SELECTION.md`](../../Reference/engineering/development/CURSOR_MODEL_SELECTION.md) — short policy version of model choice (Reference library).
- [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) — folder structure for phased plans + the cross-day rule.
- [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md) — wave/lane ordering within one batch.
- [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md) — per-task lifecycle and the planning/execution boundary.
- [`../README.md`](../README.md) — Work-area folder map & conventions.

When starting a session: skim this guide for model choice, open the phase's `Tasks/EXECUTION-ORDER-*.md` to see what's next, open the relevant `task-<prefix>-NN-*.md` for the spec. That's your standard setup.

---

## Real-world batch retrospectives

### OPD Per-Day Mode (2026-05-17 batch — 12 tasks)

- **Opus budget:** 2 of 12 tasks (pdm-01 schema migration, pdm-04 conversion service). Matched the guide's "≤2 Opus per batch" target.
- **Composer:** 1 of 12 tasks (pdm-12 polish). Pure-text + header additions; Composer's strength.
- **Auto:** 9 of 12 tasks. Standard read-paths, UI components, cron workers.
- **Per-message escalations used:** ~3 across the batch (one for `dnd-kit` configuration in pdm-08, one for the per-row override grid state shape in pdm-10).
- **Lesson:** the two-Opus budget was sufficient. Wave 4's policy resolver was *almost* an Opus candidate (multi-file refactor of booking flows) but stayed under Auto with the well-spec'd task file. A third Opus would have been waste.

---

**Living doc.** Update this file when you find a new pattern that saves money or burns it. The goal is for future-you (or a teammate) to read this once and not waste a rupee on lessons we've already learned.
