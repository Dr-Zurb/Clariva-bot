# Text consult — product plans (one-stop folder)

## Everything text-consult-related, sequenced from foundation up to mobile-native polish

This folder is the **single source of truth** for the text-consult product roadmap. It contains:

1. **Foundation status pages** (`plan-f04` / `plan-f06` / `plan-f07` / `plan-f10`) — what's already shipped underneath the baseline `<TextConsultRoom>` code and what's outstanding.
2. **Tier roadmap** (`plan-00`) — the master index for everything that comes _after_ the foundation.
3. **Tier plans** (`plan-t1` through `plan-t6`) — six independently shippable polish + capability slices.

---

## Read-order

```
plan-f04 (foundation)        ─┐
plan-f06 (companion chat)    ─┤
plan-f07 (replay + readonly) ─┤  →  plan-00 (tier roadmap)  →  plan-t1 → ... → plan-t6
plan-f10 (AI assist deferred)─┘
```

If you only have 60 seconds: skim `plan-00`. The "Tier overview" table is a map of every item across all six tiers.

If you have 5 minutes: skim `plan-00` + the four `plan-f0X` headlines. You'll know what's shipped, what's outstanding, and what's planned.

If you're picking items to commit: open the relevant `plan-tX` file. Each tier plan is self-contained with effort, files-to-touch, and acceptance criteria per item.

---

## File index

### Foundation (status snapshots; canonical history lives in `Daily-plans/April 2026/19-04-2026/Plans/`)

| File | Plan | Status | Outstanding work |
|------|------|--------|------------------|
| [plan-f04-text-foundation-status.md](./plan-f04-text-foundation-status.md) | Plan 04 — text consult Supabase backbone | ✅ Fully shipped | None. |
| [plan-f06-companion-text-status.md](./plan-f06-companion-text-status.md) | Plan 06 — companion chat for voice/video | 🟡 Mostly shipped | One patient-side gap booked as Sub-batch 0 in the [28-04-2026 voice batch](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). |
| [plan-f07-recording-replay-status.md](./plan-f07-recording-replay-status.md) | Plan 07 — replay + post-consult chat history | 🟢 Mostly shipped (text slice fully shipped) | None for text. |
| [plan-f10-ai-clinical-assist-status.md](./plan-f10-ai-clinical-assist-status.md) | Plan 10 — AI clinical assist | ⏸ Parked (Decision 6 LOCKED) | Whole plan; **5 of 7 T3 items hard-block on this**. 3 T3 items (T3.19 / T3.21 / T3.24) can ship without it. |

### Roadmap

| File | Purpose |
|------|---------|
| [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md) | Master index. Audits the baseline, frames the 6 tiers, locks cross-cutting principles, sequences. |

### Tiers

| File | Items | Effort | Schema work | Plan-10 dep? | 2026-04-28 batch |
|------|-------|--------|-------------|--------------|-------------------|
| [plan-t1-text-quick-wins.md](./plan-t1-text-quick-wins.md) | 8 | ~1.5 days | None | No | **All 8 SELECTED** → Sub-batch A |
| [plan-t2-text-real-polish.md](./plan-t2-text-real-polish.md) | 8 | ~5 days | One migration: reactions table + 4 nullable columns + view | No | **All 8 SELECTED** → Sub-batch B |
| [plan-t3-text-clinical-workflow.md](./plan-t3-text-clinical-workflow.md) | 7 | ~12 days | Two small additive tables (templates + form templates) | **Yes (5 of 7 items)** | NOT in batch (Plan-10 blocked) |
| [plan-t4-text-post-chat.md](./plan-t4-text-post-chat.md) | 4 | ~6 days | One trigram-index migration | No | NOT in batch (deferred) |
| [plan-t5-text-reliability-safety.md](./plan-t5-text-reliability-safety.md) | 7 | ~14 days | Three additive tables (push subs, rate-limit counter, quality telemetry) | No | **All 7 SELECTED** → Sub-batch D |
| [plan-t6-text-mobile-native.md](./plan-t6-text-mobile-native.md) | 7 | ~9 days | None | No | **All 7 SELECTED** → Sub-batch C |

**Totals across tiers:** 41 items, ~47.5 dev-days, 4 small additive migrations.

**2026-04-28 batch:** 30 of 41 items selected (T1 + T2 + T5 + T6 in full); ~29.5 dev-days; 4 sub-batches (A → B → C → D). Consolidated batch plan: [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md).

---

## What "above our baseline text consult code" means

The current production code (`frontend/components/consultation/TextConsultRoom.tsx` + `backend/src/services/text-session-supabase.ts` + migrations 051 / 052 / 062 / 078–082) implements everything the foundation plans specify, with the one Plan-06 patient-voice gap noted above.

**The tier plans T1–T6 are the entire planned work above that line.** There is no other text-consult planning hidden in `Daily-plans/`, `inbox.md`, or `capture/features/`. If something doesn't appear in this folder, it isn't on the text-consult roadmap.

---

## Symmetric voice-consult roadmap

The peer folder [`../voice-consult/`](../voice-consult/) is the same shape for the voice modality (T1–T6 + roadmap + foundation status). The two roadmaps are designed to be picked from together — see the symmetry table at the bottom of [plan-00](./plan-00-text-consult-roadmap.md).

---

## Conventions

- **Status legend** (used by every file): `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.
- **Item IDs** are tier-prefixed and sequential: T1.1 / T1.2 ... T6.42. They never renumber.
- **Selection markers**: when items are picked for an implementation batch, they're tagged `[SELECTED YYYY-MM-DD]` inline in their tier plan, and a consolidated batch plan lands in `Daily-plans/<month>/<date>/`.
- **Foundation status pages** (`plan-f0X`) link to the canonical original in `Daily-plans/`. Don't fork the originals — update them in-place if Plan-04/06/07/10 work resumes.

---

**Created:** 2026-04-28.  
**Owner:** TBD (each tier picks its own owner at commit time).
