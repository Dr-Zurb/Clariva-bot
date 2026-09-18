# Interactions Inbox

> Read-only, pre-consult **Inbox** — one channel-agnostic feed of every lead/conversation. Doctor sees the patient's path + thread; AI receptionist stays in control. Booking review folds in as a filter.

**Parent product plan:** [`../../../Product plans/integrations/plan-02-interactions-inbox.md`](../../../Product%20plans/integrations/plan-02-interactions-inbox.md)  
**Roadmap:** Axis A consumption surface — [`plan-00-integrations-roadmap.md`](../../../Product%20plans/integrations/plan-00-integrations-roadmap.md)  
**Task prefix:** `ibi`  
**Depends on:** Shared engine tables already exist (`conversations`, `messages`, `comment_leads`, `appointments`). Facebook Messenger channel (feeds more rows) may land in parallel; Inbox is channel-agnostic.

---

## Execute in order

| Phase | Folder | Theme | Status |
|-------|--------|-------|--------|
| **p1** | [`p1-comment-conversation-link/`](./p1-comment-conversation-link/) | Wire `linkCommentLeadToConversation` so comment → DM path is honest | ✅ Done (2026-07-27) |
| **p2** | [`p2-thread-drawer/`](./p2-thread-drawer/) | Doctor-scoped messages API + read-only thread drawer inside Booking review | ✅ Done (2026-07-27) |
| **p3** | [`p3-inbox-tab/`](./p3-inbox-tab/) | List/detail API, path timeline, comment-only leads, standalone Inbox tab, merge Booking review | ✅ Done (2026-07-27) |
| **p4** | [`p4-inbox-filters/`](./p4-inbox-filters/) | Pinned Needs review + channel/status/date filters + Hide quiet chats | ✅ Done (2026-07-27) |
| **p5** | [`p5-inbox-funnel/`](./p5-inbox-funnel/) | Left funnel rail + counts; drop WA/no-show; custom date; reschedule Path event | ✅ Done (2026-07-27) |

---

## Decision lock (program-level)

Inherit **IB1…IB5** from the product plan. Program defaults for remaining open questions:

| ID | Decision |
|----|----------|
| **IB1** | **Read-only v1.** No doctor reply / AI takeover. |
| **IB2** | **Pre-consult only.** Receptionist `messages` + leads + booking status. No `consultation_messages`. |
| **IB3** | **Merge Booking review INTO Inbox** as **Needs review** at the top of the funnel rail. |
| **IB4** | **Show comment-only leads** (no DM yet) as rows. |
| **IB5** | **Default list = signal-bearing** via **"Hide quiet chats"** (on by default); date default last 30 days. |
| **IBI-D1** | **UI label = "Inbox".** API resource = `/api/v1/interactions` (list + `/:id` detail + `/:id/messages`). Avoids overloading the overloaded word "conversations" in worker code. *(locks IBQ1)* |
| **IBI-D2** | **Comment-only leads:** service builds a unified list DTO — conversations query + separate unlinked `comment_leads` query, merge/sort in service (not SQL UNION). *(locks IBQ2)* |
| **IBI-D3** | **Signal default** = row has ≥1 of: comment lead (linked or unlinked), appointment, pending/any `service_staff_review_request`, or conversation booking state past greeting/intake. Exact predicate documented in `ibi-06`. *(locks IBQ3)* |
| **IBI-D4** | **Pagination:** cursor by `updated_at` (conversations) / `created_at` (comment-only leads), `limit` default 50. *(locks IBQ4)* |
| **IBI-D5** | **Identity:** show MRN when present; else a stable lead label from `(platform, platform_external_id)` (never log raw PSIDs as PII in app logs — follow existing patterns). |
| **IBI-D6** | **Opus gate:** any new doctor-facing read that returns PHI (`messages.content`, patient name/phone) or changes RLS → **Opus**. Auto/Composer OK for UI wiring once APIs exist. |
| **IBI-D7** | Doctor reply / handoff is **out of this program** (separate future plan). |

---

## Task index

| Task | Phase | Title | Model |
|------|-------|-------|-------|
| ibi-01 | p1 | Wire `linkCommentLeadToConversation` on first DM from commenter | Sonnet |
| ibi-02 | p1 | Close gate p1 | Composer |
| ibi-03 | p2 | Doctor-scoped `GET …/interactions/:id/messages` (IDOR-safe) | **Opus** |
| ibi-04 | p2 | Read-only thread drawer in Booking review | Sonnet |
| ibi-05 | p2 | Close gate p2 | Composer |
| ibi-06 | p3 | List/detail interactions API + enrichment + signal filter | **Opus** |
| ibi-07 | p3 | Comment-only leads in list (IB4) | Sonnet |
| ibi-08 | p3 | Path timeline payload on interaction detail | Sonnet |
| ibi-09 | p3 | Inbox UI tab + merge Booking review + sidebar | Sonnet |
| ibi-10 | p3 | Badge migration + polling | Composer / Sonnet |
| ibi-11 | p3 | Close gate p3 | Composer / Founder |
| ibi-12 | p4 | Filters API: cancelled/no_show + date + multi-status | Sonnet |
| ibi-13 | p4 | Filter bar UI + pinned Needs review | Sonnet |
| ibi-14 | p4 | Close gate p4 | Composer |
| ibi-15 | p5 | Stage counts + rescheduled Path timeline | Sonnet |
| ibi-16 | p5 | Funnel rail UI + toolbar + custom date | Sonnet |
| ibi-17 | p5 | Close gate p5 | Composer |

---

## Scope / risk

Per [`.cursor/rules/00-agent-contract.mdc`](../../../../../.cursor/rules/00-agent-contract.mdc): PHI columns + new doctor-facing read endpoints + IDOR-sensitive message read. **`ibi-03` and `ibi-06` = Opus.** Do not Auto-drive the API layers.

---

**Created:** 2026-07-27.  
**Status:** ✅ v1 Inbox + funnel rail complete (2026-07-27). Doctor reply / handoff remains a separate future plan (IBI-D7).  
**One-liner:** Wire comment→DM link → thread drawer → Inbox tab → funnel rail (journey spine + Needs review).
