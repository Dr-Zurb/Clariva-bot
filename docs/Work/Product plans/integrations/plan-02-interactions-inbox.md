# Plan 02 — Interactions Inbox (read-only, pre-consult)

> **Status:** ✅ Done 2026-07-27 (v1 read-only Inbox). Execution: Daily-plans.  
> **Roadmap:** Consumes **Axis A** intake channels in [`plan-00-integrations-roadmap.md`](./plan-00-integrations-roadmap.md). This is the **doctor-facing consumption surface** for the multi-channel work, not a new channel.

## Execution

→ [`docs/Work/Daily-plans/July 2026/27-07-2026/interactions-inbox/`](../../Daily-plans/July%202026/27-07-2026/interactions-inbox/)  
**Task prefix:** `ibi` · Phases p1–p3 ✅. Doctor reply / AI handoff = separate future plan.

## Why this exists

The doctor is the **incharge of their digital clinic on social media**; Clariva is the **infrastructure/convenience layer** underneath. Today every intake channel (Instagram live, Facebook in flight, WhatsApp/web later) funnels into shared tables — but there is **no doctor-facing surface to browse those interactions, follow a patient's path, or read a thread.** The doctor cannot see "who reached out, on which channel, where they are in the funnel, and what was said."

Concretely, the gaps are:

- No doctor-facing API to **list conversations** or **read a DM thread** (`getConversationMessages` is worker/trust-the-caller only).
- **Booking review** is a *partial* inbox — it only shows the AI service-match triage queue (`service_staff_review_requests`), not all conversations. Its detail drawer even says *"Conversation view coming soon."*
- The **comment → DM link is dead code** — `linkCommentLeadToConversation` is defined but never called, so a comment lead and the DM it becomes look like two unrelated events.
- **Patient identity is thin pre-payment** — MRN is only assigned at first payment; before that a lead is a "Placeholder" patient keyed by `platform_external_id`, surfaced only as a raw PSID in the Patients v2 "source" column. There is no first-class lead identity a doctor can refer to.

## Decisions LOCKED (2026-07-27, founder discussion)

| ID | Decision | Implication |
|----|----------|-------------|
| **IB1** | **Read-only v1.** Doctor sees the path + thread; the AI receptionist stays fully in control. | No send path, no takeover, no handoff state in the turn engine. Doctor-reply is a separate future plan. |
| **IB2** | **Pre-consult scope only.** Comment leads + receptionist DMs (`messages`) + booking/appointment status. | Live-consult chat (`consultation_messages`) is **out** of the timeline for v1 — avoids reconciling two message stores. |
| **IB3** | **Merge Booking review INTO the Inbox.** Booking review becomes a *filter/state* within one Inbox tab, not a second inbox-y sidebar item. | Removes the confusing "two inboxes" problem; service-match triage is one lane of the unified feed. |
| **IB4** | **Include comment-only leads as rows** — even when they never turned into a DM. | Doctor sees leads that never converted, not just active DM threads. Requires surfacing `comment_leads` rows without a `conversation_id`. |
| **IB5** | **Default the list to signal-bearing interactions** via **"Focus on leads"** (on by default). | Avoid an inbox full of "hi". Default view = leads/conversations with intent, a booking, or a review; toggle off to reveal every conversation. |

## Outcome

A single channel-agnostic **Inbox** tab that is the doctor's front-desk log:

- **List** of interactions across channels (IG/FB now; WA/web later), with channel badge, patient-or-placeholder identity, last-message snippet, and a **fused status chip**.
- **Detail** = the patient's **path timeline** (comment → first DM → slot chosen → booked → paid) plus the **read-only message thread**, with quick links to the patient profile, the appointment, and the source comment.
- **Booking review** lives here as a **pinned Needs review lane** above the feed (service-match triage), not a separate tab.

## Non-goals (explicitly deferred)

- Doctor replying / AI takeover / handoff state (separate future plan).
- Live-consult chat history (`consultation_messages`) in the timeline.
- WhatsApp (still I8 / post-sales) and owned web widget (P3 / drafted) — the model is channel-agnostic so they slot in later without rework.
- A generalized cross-channel identity-merge (one person across IG + WhatsApp phone) — parked with the WhatsApp phase (I7).

---

## Product context — the spine already exists

One **interaction row ≈ one `conversations` row**, enriched by joins that are all already present:

| Table | Role in the inbox | Notes |
|-------|-------------------|-------|
| `conversations` | The row. `(doctor_id, platform, platform_conversation_id)` unique; has `patient_id`, `status`. | List anchor. No list API today. |
| `messages` | The read-only thread (`sender_type` patient/doctor/system, `content`, `intent`). | `getConversationMessages` is trust-the-caller — **not** doctor-scoped. |
| `comment_leads` | "Came from a comment: `<intent>`". Platform-discriminated (migration 188). `conversation_id` nullable. | IB4: also show rows with **no** `conversation_id`. |
| `appointments` | Booking/paid outcome. Carries both `conversation_id` and `patient_id`. | Drives the status chip. |
| `patients` | Display name-or-placeholder, MRN, `platform` + `platform_external_id`. | Identity anchor pre-payment. |

RLS is already in place as defense-in-depth: `conversations` uses `USING (auth.uid() = doctor_id)` (migration 002) and `messages` uses the EXISTS-join-on-conversations policy (migration 002). The backend still filters explicitly via the service-role client, matching the rest of the codebase.

---

## Prerequisite (do first — it's an independent P0 gap)

**Wire `linkCommentLeadToConversation` on the first DM from a commenter.** It exists but is never called (roadmap P0 gap). Without it, the path timeline is dishonest — the comment and the DM it becomes are not stitched. Small, independently valuable, and unblocks IB4's comment→conversation continuity.

## Derived status chip (answers "pending vs booked")

Fuse lead + booking + appointment into **one** server-computed status (no new column):

```
New → Chatting → Booking in progress → On calendar → Confirmed
(`new_lead` = early on the path, comment or DM; channel is a badge)
```

Plus a channel badge (IG/FB) and a comment-origin marker. Service-match triage (`service_staff_review_requests`) appears as a "Needs review" state — this is how Booking review folds in (IB3).

---

## Backend design (copy the booking-review read pattern)

The booking-review stack is the template: SSR fetch → client list + 30s poll → `asyncHandler` controller with Zod → service using `getSupabaseAdminClient()` + explicit `.eq('doctor_id', doctorId)`.

- **List:** `GET /api/v1/conversations` (naming TBD: `conversations` vs `interactions`) → `authenticateToken` → `asyncHandler` controller + Zod query (`channel`, `status`, `scope=signal|all`, pagination) → **new** `listConversationsForDoctor(doctorId, …)` in `conversation-service.ts`, enriched with patient + latest appointment via a second doctor-scoped query (mirror `listEnrichedServiceStaffReviewsForDoctor`). No conversation-list function exists today — this is genuinely new.
- **Comment-only leads (IB4):** either union `comment_leads` (where `conversation_id IS NULL`) into the list result, or expose them as a distinct lane the frontend merges. Decide in execution deep-dive.
- **Thread:** `GET /api/v1/conversations/:id/messages`.
  - ⚠️ **IDOR footgun:** `getConversationMessages` is trust-the-caller (no `doctor_id` filter — built for workers). The doctor endpoint MUST first verify `conversation.doctor_id === req.user.id` (or add a doctor-scoped variant) before returning messages. This is the one real security-sensitive piece.
- **Scoping:** RLS exists (002) as defense-in-depth; the live path uses the admin client + explicit `.eq('doctor_id', doctorId)` like every other doctor read.

## Frontend design

- **Sidebar:** rename/repoint to a single **Inbox** tab (reuse the existing `Inbox` icon). **Remove the separate Booking review item** (IB3) — its queue becomes the "Needs review" filter.
- **List:** SSR seed + optional 30s poll (mirror `ServiceReviewsInbox` + `useReviewsPolling`). Rows: channel badge, patient/MRN-or-placeholder, last-message snippet, fused status chip. Filters: channel, lifecycle status (incl. cancelled/no-show), date (default last 30d), and **Focus on leads** (IB5).
- **Detail drawer:** promote the existing "Conversation view coming soon" placeholder into (a) the **patient-path timeline** reconstructed from the joins, and (b) the **read-only thread**. Quick links → patient profile, appointment, source comment.
- **Identity (closes the core gap):** surface a stable per-doctor lead label even before MRN exists, anchored on `(doctor_id, platform, platform_external_id)`, so the doctor can refer to a specific patient/lead.
- **Badge:** reuse the list endpoint + `.length` in a TanStack query like `bookingReviewsUnconfirmed`, or add a dedicated count later if lists get large. Migrate the existing `bookingReviewsUnconfirmed` badge onto the Inbox item.

---

## Phasing

1. **Wire `linkCommentLeadToConversation`** (P0 gap; makes the path honest).
2. **Read-only thread drawer inside Booking review** — smallest honest slice; fills the existing placeholder without new nav.
3. **Standalone Inbox tab** — full list + path timeline + comment-only leads (IB4); fold Booking review in as a filter (IB3); migrate the badge.
4. **(Separate future plan)** doctor reply / AI handoff.

---

## Scope / risk flag

Per [`.cursor/rules/00-agent-contract.mdc`]: this build touches **PHI columns, RLS, a new doctor-facing read endpoint (with an IDOR-sensitive message read), and spans API + service + frontend** — plus likely a small migration-adjacent change to wire the comment→conversation link. That is an **Opus / reviewed-task** job with proper task files, **not an Auto drive-by**. This plan doc is safe to iterate anytime; the code is not.

---

## Open questions resolved

- **Two inboxes?** → Merge (IB3).
- **Comment-only leads?** → Show them (IB4).
- **Placeholder-lead noise?** → Default to signal-bearing, "All" filter available (IB5).

## Open questions — locked in Daily-plans (IBI-D1…D4)

| ID | Resolution |
|----|------------|
| **IBQ1** | UI **"Inbox"**; API `/api/v1/interactions` (IBI-D1). |
| **IBQ2** | Separate comment-leads query + merge in service (IBI-D2). |
| **IBQ3** | Signal = comment lead \| appointment \| service review \| booking state past greeting (IBI-D3; exact predicate in `ibi-06`). |
| **IBQ4** | Cursor pagination, limit 50 (IBI-D4). |

---

## Related

- Roadmap / Axis A → [`plan-00-integrations-roadmap.md`](./plan-00-integrations-roadmap.md)
- Facebook Messenger channel (feeds the inbox) → [`plan-01-facebook-messenger-channel.md`](./plan-01-facebook-messenger-channel.md)
- Booking-review redesign (closest prior "inbox" thinking) → [`../plan-booking-review-redesign.md`](../plan-booking-review-redesign.md)
- Channel engine → `backend/src/workers/channels/`; conversation engine → `run-conversation-turn.ts`

---

**Created:** 2026-07-27
**Owner:** Founder (product)
**One-liner:** Read-only, pre-consult Inbox — one channel-agnostic feed of every lead/conversation, each showing the patient's path and thread; Booking review folds in as a filter.
