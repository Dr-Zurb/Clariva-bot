# Plan p1 — Wire comment → conversation link (batch)

> **Status:** ✅ Done (2026-07-27).  
> **Program:** [`../README.md`](../README.md) · Prefix `ibi` · Tasks `ibi-01`…`ibi-02`  
> **One-line intent:** When a commenter DMs the doctor, link their `comment_leads` row to the new `conversations` row so the Inbox path timeline is honest.

---

## Why this phase

`linkCommentLeadToConversation` exists in `comment-lead-service.ts` but is **never called** (roadmap P0 gap). Without it, a comment lead and the DM it becomes look like two unrelated events — every later Inbox timeline is dishonest. Small, independently valuable; unblocks IB4 continuity.

**Not in this phase:** doctor-facing APIs, UI, Inbox tab.

---

## Decision lock

Inherit **IB1…IB5**, **IBI-D\*** from program README. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **IBI1-D1** | Call link on **first successful conversation create/find** for a sender who has an unlinked `comment_leads` row for this doctor (match `commenter_ig_id` / platform sender id + `doctor_id` + platform). | Idempotent — service already no-ops when linked. |
| **IBI1-D2** | Wire inside the DM turn path (`run-conversation-turn` or immediately after conversation resolve) — **not** a new cron. | Same request that creates the conversation stitches the lead. |
| **IBI1-D3** | Platform-aware: Instagram and Facebook commenters both use `comment_leads.platform` + sender id (migration 188). | Do not assume Instagram-only. |

---

## Scope guard

- **DO NOT** build Inbox UI or doctor APIs in this phase.
- **DO NOT** log comment text / PII.
- **DO NOT** invent a second link mechanism — use existing `linkCommentLeadToConversation`.
- Prefer existing patterns in `comment-lead-service` + DM webhook handler.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ibi-01` | Wire `linkCommentLeadToConversation` on first DM from commenter | S–M | Sonnet |
| `ibi-02` | Close gate p1 | S | Composer |

---

## Acceptance gate

- [x] High-intent comment creates `comment_leads` with `conversation_id` null. *(existing create path; unchanged)*
- [x] Same commenter sends a DM → after turn, that lead's `conversation_id` is set. *(wired via `maybeLinkCommentLeadAfterDm` in `run-conversation-turn`; unit-covered)*
- [x] Second DM does not error / does not overwrite incorrectly (idempotent).
- [x] Unit/integration coverage for the wire path.
- [x] Typecheck + targeted tests green.

---

**Created:** 2026-07-27.
