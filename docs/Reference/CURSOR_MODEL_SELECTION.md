# Cursor model selection — cost-efficient workflow (Clariva-bot)

This guide is for **choosing which Cursor chat model to use** while building this project. Official billing and per-model token rates are documented at [Cursor — Models & Pricing](https://cursor.com/docs/models); this file is a **practical policy** for this repo.

---

## One-line rule

- **Default:** `Composer 2` (most sessions).
- **Escalate:** `GPT-5.4` when debugging is fuzzy or spans many files.
- **Reserve:** `Opus` only for large architecture or high-stakes design.

---

## Three tiers

### Tier 1 — Default (cheapest): `Composer 2`

Use for roughly **70–80%** of work.

**Good for**

- Small wording / copy changes in DMs or prompts
- Docs, daily plans, task files
- Adding or adjusting unit tests
- Straightforward edits in 1–3 files
- Obvious fixes from a clear error or ticket

**In this repo, typical examples**

- Task markdown, README updates
- Fee/booking string or formatting tweaks
- Test expectation updates after intentional behavior changes
- Migrations or types when the scope is obvious
- Cron wiring, small service additions

### Tier 2 — Strong reasoning: `GPT-5.4`

Use for roughly **15–25%** of work.

**Good for**

- Weird DM behavior (“why did the bot say this?”)
- Bugs that touch **state + prompts + routing** together
- Root-cause from screenshots, logs, or chat transcripts
- Refactors across `instagram-dm-webhook-handler.ts`, utils, and tests
- When you are not sure which branch or file owns the bug

**In this repo, typical examples**

- Reason-first triage, consent, booking, fee paths interacting badly
- Throttle / duplicate webhook / non-text message edge cases
- Classifier + copy + `lastPromptKind` interactions

### Tier 3 — Expensive, rare: `Opus`

Use for roughly **0–5%** of work.

**Good for**

- Major architecture decisions (e.g. redesign DM routing)
- Large new bot workflows planned end-to-end
- Deep audit before a risky rewrite
- When cheaper models failed twice and the problem is still ambiguous

---

## Escalation rules

### Stay on `Composer 2` when

- You already know the file and the change
- The bug is obvious from code or a single stack trace
- The task is mostly mechanical
- You are doing many small commits in one session

### Switch to `GPT-5.4` when

- You are unsure where the bug lives after one focused pass
- The issue spans handler + `ai-service` / fees / consent / tests
- You need to reconcile **product intent** with **branchy code**
- The same class of bug keeps coming back after a “fix”

### Use `Opus` when

- Cost of being wrong is high (compliance, safety, major UX)
- You need a careful design review, not a quick patch
- You are planning a large refactor of conversation architecture

---

## Cost-saving workflow

1. Start with **`Composer 2`**.
2. If the problem is still unclear after a **serious** attempt (~10–15 minutes of focused reasoning), switch to **`GPT-5.4`**.
3. Use **`Opus`** only for big-brain architecture or when Tier 2 is not enough.

---

## Repo-specific cheat sheet

| Situation | Suggested model |
|-----------|-----------------|
| Copy, docs, task checkboxes | `Composer 2` |
| Single-file bug with clear cause | `Composer 2` |
| New test + small code change | `Composer 2` |
| “What’s wrong in this chat?” (screenshot) | `GPT-5.4` |
| Looping / wrong step / wrong prompt | `GPT-5.4` |
| Webhook + state + classifier mystery | `GPT-5.4` |
| Redesign entire DM pipeline | `Opus` |
| Full multilingual strategy from scratch | `Opus` |

---

## Related

- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) — agent behavior in-repo
- [AI_BOT_BUILDING_PHILOSOPHY.md](./AI_BOT_BUILDING_PHILOSOPHY.md) — bot product rules

**Last updated:** 2026-04-15
