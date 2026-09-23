# Implementation triage prompt

> **Purpose:** I'm about to make a code change or feature and I'm unsure *how* to run it.
> Your only job this turn is to tell me **how to implement it**, not to implement it.
> `@`-mention this file in a fresh chat, then describe the change. Return the verdict block, then stop.

> **System T** = our existing task-management system: daily plans → phases → execution-order → task files.
> The deep rules live in the guides under §References. You decide whether a change is worth that machinery
> or should just be done here in chat.

---

## The one decision

Pick **one** path:

| Path | Choose when | Signals |
|---|---|---|
| **① Direct in chat** | The change is bounded and low-risk enough that a written spec would be overhead. | ≤ ~3 files; pattern already exists in the codebase; clear "done when"; you could describe it in 1–2 sentences; no schema/RLS/PHI/auth. |
| **② Route through System T** | The change is big, branchy, risky, or spans multiple sittings/gates — a written spec prevents rework. | Many files; new data model; multiple acceptance gates; needs to ship in slices; or you'd otherwise re-explain it across several chats. |

**Litmus question:**
> "Could a smart junior who's seen this codebase once finish this correctly, in one sitting, from my one-paragraph description, without a written spec?"
>
> **Yes** → ① Direct. **No** → ② System T.

---

## If ① Direct in chat

Do not recommend a model switch. The user decides the model.

Still name the blast radius: RLS, PHI columns, a new migration, payments, or consent. Confirm the approach before guessing those. Do not stop the turn to ask for a different model.

---

## If ② Route through System T — hand off, don't plan it here

Tell me, per [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md):

- **Single batch vs phased:** single batch if self-contained, < ~1 week, **one** acceptance gate (flat program folder + `Tasks/`). Phased (`p1-…`, `p2-…`) if > ~1 week, ≥ ~10 tasks, **multiple** gates, or a decision lock later phases inherit.
- **Where it lands:** suggested program folder + file name(s) (`plan-…-batch.md`, `EXECUTION-ORDER-…`, `task-<prefix>-NN-…`).

Do **not** write the task/plan files this turn unless I reply "go".

---

## Output (return exactly this, then stop)

```
VERDICT
- Path:        ① Direct in chat | ② System T  — <one-line why>
- Scope guess: ~<n> files; data/RLS/PHI touched? yes/no
- If ②:        single batch | phased; suggested path + filename(s)
- Next action: <one concrete sentence — e.g. "Reply 'go' and I'll implement now"
               or "Reply 'go' and I'll write the task file under <path>">
```

If something material is ambiguous (acceptance criteria, blast radius, data model), ask **one** sharp clarifying question first — then give the verdict.

---

## References (System T deep rules)

- Model/cost routing: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Phase vs single batch + folder/naming rules: [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md)
- Waves/lanes within a batch: [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md)
- Task lifecycle + planning/execution boundary: [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md)
- Per-task file shape: [`TASK_TEMPLATE.md`](./TASK_TEMPLATE.md)
- Rules when editing existing code: [`CODE_CHANGE_RULES.md`](./CODE_CHANGE_RULES.md)

---

**Created:** 2026-06-17
