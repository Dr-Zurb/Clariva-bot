# Plan 00 — Text consult UX roadmap (master index for tiers T1–T6)

## Make the existing Supabase-Realtime chat feel like a proper clinical messaging product, in tiered slices

> **Foundation reference:** [plan-f04-text-foundation-status.md](./plan-f04-text-foundation-status.md) — Decision 1 LOCKED (text = Supabase Realtime + Postgres, NOT Twilio Conversations / WhatsApp), Decision 5 LOCKED (live-only writes for v1; messaging-mode async deferred to v2+ as additive `mode` column). Plan 04 shipped the bones (`<TextConsultRoom>`, `consultation_messages`, RLS, Realtime subscription, presence + typing). **This roadmap is everything that comes _after_ Plan 04** — i.e. the polish, clinical workflow, post-chat, reliability and mobile-native layers that turn the bones into a product.
>
> **Companion text channel for voice/video:** [plan-f06-companion-text-status.md](./plan-f06-companion-text-status.md) reuses `<TextConsultRoom>` wholesale inside `<VoiceConsultRoom>` and `<VideoRoom>`. **Every tier item below ships in all three host surfaces simultaneously** (standalone, panel, canvas) unless explicitly scoped to one — that's the "no duplication" doctrine inherited from Plan 06. **One outstanding patient-side gap** is booked as Sub-batch 0 in the [28-04-2026 voice batch](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md).
>
> **Post-consult chat history:** [plan-f07-recording-replay-status.md](./plan-f07-recording-replay-status.md) extends `<TextConsultRoom>` with `mode='readonly'`. Tier items that introduce composer/lifecycle behaviour MUST verify they're gated off in `mode='readonly'` — that's a hard invariant.
>
> **AI clinical assist (deferred):** [plan-f10-ai-clinical-assist-status.md](./plan-f10-ai-clinical-assist-status.md) — Decision 6 LOCKED. **5 of 7 T3 items hard-block on Plan 10**, which is parked until v1 GA stable. The other 3 T3 items (T3.19 / T3.21 / T3.24) can ship without it.

---

## Goal

Take `frontend/components/consultation/TextConsultRoom.tsx` from "Plan 04 MVP that works" to "feels like Telegram / WhatsApp polish, but clinical". Each tier is an independently shippable slice with its own plan file.

---

## Foundation plans (in this folder, above the baseline code)

These four `plan-fXX` files capture the foundation Plans 04 / 06 / 07 / 10 — what shipped, what's outstanding, where the code lives. They live in this folder so the entire text-consult roadmap (foundation + tiers) is a single browseable directory above the baseline `TextConsultRoom.tsx` code. Originals are preserved in `Daily-plans/April 2026/19-04-2026/Plans/` for cross-modality references.

| File | Plan | Status | Outstanding |
|------|------|--------|-------------|
| [plan-f04-text-foundation-status.md](./plan-f04-text-foundation-status.md) | Plan 04 — text consult Supabase backbone | ✅ Fully shipped | None. |
| [plan-f06-companion-text-status.md](./plan-f06-companion-text-status.md) | Plan 06 — companion chat for voice/video | 🟡 Mostly shipped | One patient-side gap; booked as Sub-batch 0 in [28-04-2026 voice batch](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). |
| [plan-f07-recording-replay-status.md](./plan-f07-recording-replay-status.md) | Plan 07 — replay + post-consult history | 🟢 Text slice fully shipped | None for text. |
| [plan-f10-ai-clinical-assist-status.md](./plan-f10-ai-clinical-assist-status.md) | Plan 10 — AI clinical assist | ⏸ Parked (Decision 6 LOCKED) | Whole plan; **5 of 7 T3 items hard-block** on this. |

**Read these before the tier plans** if you don't already have the baseline state in your head — they're the "why" behind every cross-cutting principle below.

---

## What already exists (so the tier plans don't re-propose it)

Pulled from `frontend/components/consultation/TextConsultRoom.tsx` (~1760 lines), `frontend/app/c/text/[sessionId]/page.tsx`, migrations 051 / 052 / 062 / 082, and `backend/src/services/text-session-supabase.ts`:

| Capability | Where | Notes |
|------------|-------|-------|
| Branded chat UI (header, bubbles, composer) | `TextConsultRoom.tsx` | Three layouts: `standalone` / `panel` / `canvas` (Plan 06). |
| Supabase Realtime INSERT subscription + Postgres storage | `TextConsultRoom.tsx` (`insertChannelRef`) | Backed by `consultation_messages` table + RLS (migrations 051/052). |
| Patient JWT exchange via HMAC `?t=` token | `/c/text/[sessionId]/page.tsx` + `exchangeTextConsultTokenHandler` | Custom-claim JWT minted by `text-session-supabase.ts`. |
| Doctor uses dashboard Supabase auth session directly | `<LiveConsultPanel>` mount path | RLS keys on `auth.uid() = doctor_id`. |
| Optimistic send with retry on failure | `TextConsultRoom.tsx` (`mergeMessages`, `sending` state) | Pending bubble + retry CTA on RLS reject / network. |
| Reconnect with exponential backoff | `TextConsultRoom.tsx` (`RECONNECT_BACKOFF_MS`) | 1s → 2s → 4s → 8s → 16s → 30s. |
| Typing indicator (broadcast every ≤1s, idle 3s) | `TextConsultRoom.tsx` (`typingTimerRef`, `lastTypingBroadcastRef`) | Presence channel `text-presence:{sessionId}`. |
| Counterparty online dot via presence | `TextConsultRoom.tsx` (`counterpartyOnline`) | Presence sync events. |
| Attachments (Plan 06) — gallery + camera + PDF | `fileInputRef` + `cameraInputRef` | MIME allowlist mirrored from migration 082; 10 MiB cap. |
| Signed-URL minting for attachments | `signAttachmentUrls` | Backend service-role; 1h TTL; lazy mint per row. |
| System messages (Plan 06 / 07) | `kind='system'` rows + `system_event` tag | Banner-line render with clock icon. |
| Read-only mode for post-consult history | `mode='readonly'` (Plan 07) | Composer DOM-removed; presence/typing gone; watermark with `consultEndedAt`. |
| Live-only write enforcement | RLS policy `consultation_messages_insert_live_participants` | Decision 5 LOCKED at the DB layer. |
| 401 handling + token refresh callback | `onRequestTokenRefresh` prop | Transparent JWT swap mid-session. |
| Visibility-aware reconnect | `hiddenAtRef` + `visibilitychange` handler | Avoids unnecessary churn on brief tab switches. |
| IG-DM "consult ready" ping | `sendConsultationReadyToPatient` | Plan 04 caller; opens the patient link. |
| Plan 06 system-message kinds | `mute_changed`, `hold_changed`, `consult_started`, `recording_paused`, `recording_resumed`, `party_joined`, `consult_ended`, `modality_switched` | Used by voice/video hosts for inline banners. |

**Anything outside this table is fair game for a tier below.** The tier plans assume this baseline and will not re-propose any of it.

---

## Tier overview

| Tier | Theme | Items | Effort (rough) | Status snapshot |
|------|-------|-------|----------------|-----------------|
| [T1 — Quick wins](./plan-t1-text-quick-wins.md) | Same-day chat polish — composer hints, jump-to-latest button, timestamp grouping, send-state feedback. | 8 | ~1.5 days | **All 8 SELECTED 2026-04-28** → Sub-batch A in [batch plan](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md). |
| [T2 — Real polish](./plan-t2-text-real-polish.md) | Reactions, reply-to-message, edit window, soft-delete, markdown-lite, pinned messages, multi-attachment composer. | 8 | ~5 days | **All 8 SELECTED 2026-04-28** → Sub-batch B (one migration). |
| [T3 — Clinical workflow](./plan-t3-text-clinical-workflow.md) | Doctor-side suggested replies, quick-insert templates, AI summary pane, structured intake forms, translation, PHI redaction warning. | 7 | ~12 days (most items hard-depend on Plan 10) | `Drafted` — **NOT in 2026-04-28 batch** (5 of 7 items hard-block on parked Plan 10). |
| [T4 — Post-chat](./plan-t4-text-post-chat.md) | Post-chat summary screen, patient rating, PDF transcript export, searchable archive across consults. | 4 | ~6 days | `Drafted` — **NOT in 2026-04-28 batch** (deferred for usage data). |
| [T5 — Reliability / safety / scale](./plan-t5-text-reliability-safety.md) | Multi-tab kick, composer-draft crash recovery, browser-push when message arrives in unfocused tab, mobile-PWA push, virtualization (>200 msgs), rate limiting, delivery health metrics. | 7 | ~14 days | **All 7 SELECTED 2026-04-28** → Sub-batch D (three migrations + Web Push backend). |
| [T6 — Mobile-native niceties](./plan-t6-text-mobile-native.md) | Swipe-to-reply, long-press for reactions, hardware-keyboard shortcuts, image lightbox with pinch-zoom, voice-to-text dictation, camera-direct polish, PWA share-intent receive. | 7 | ~9 days | **All 7 SELECTED 2026-04-28** → Sub-batch C (after Sub-batch B). |

> **2026-04-28 batch summary** — 30 of 41 items selected (T1 + T2 + T5 + T6 in full); ~29.5 dev-days; 4 sub-batches (A → B → C → D). T3 + T4 explicitly excluded. See [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for the full sub-batch sequencing, dependency graph, decisions checklist, and acceptance criteria.

---

## Sequencing recommendation

```
Now              Next sprint              After Plans 07 + 10            Late v1 / v2
 │                  │                         │                              │
 ▼                  ▼                         ▼                              ▼
T1 (full)  →   T2 picks: 9 → 10 → 13   →   T3 (Plan 10 dep)       →   T5 + T6
                       T4.25 + T4.27       T4 (rest)
                                            T2 leftovers (14 / 15 / 17)
```

Rationale (mirrors the voice-consult sequencing doctrine):

- **T1 first** — every item is local to `TextConsultRoom.tsx`, no backend changes, no schema, no RLS. All eight items together still ship in under two days. The marginal product-quality lift is the largest in the roadmap.
- **T2 selected picks** — items 9 / 10 / 13 (reactions / reply-to / markdown-lite) are the items that pull a chat from "MVP" to "feels like a real chat". 11 (edit window) and 12 (soft-delete) raise compliance + UX trade-offs (clinical record immutability) — defer until clinical advisor weighs in.
- **T3 deferred** — five of seven T3 items hard-depend on Plan 10 (AI clinical assist) being in place first. The two that don't (T3.21 structured intake form + T3.24 PHI redaction warning) are still useful in isolation but are best batched with the AI-assisted ones for a coherent doctor-side surface.
- **T4 partial** — T4.25 (summary screen) + T4.27 (PDF transcript) are immediately useful for clinical records. T4.26 (rating) overlaps with the existing `service-reviews` flow. T4.28 (cross-consult search) is large and benefits from waiting for usage data.
- **T5 + T6 deferred** — these are "scale-out" and "wrap-as-native" concerns. Both are real but premature against current load (avg consult <50 messages today; revisit virtualization at first 200-msg session).

**This file is the single source of truth for tier status.** Each tier plan links back here.

---

## Cross-cutting principles (apply to every tier)

1. **No new vendor.** Every tier MUST work on Supabase Realtime + Postgres. No Twilio Conversations, no WhatsApp Business API, no Sendbird, no Stream.io. Decision 1 LOCKED.
2. **Three-host parity from day one.** Every item ships simultaneously in `<TextConsultRoom layout='standalone'>` (patient `/c/text/[sessionId]`), `<TextConsultRoom layout='panel'>` (inside `<VideoRoom>`), and `<TextConsultRoom layout='canvas'>` (inside `<VoiceConsultRoom>`). If a layout cannot accommodate an item, the item ships disabled with a documented degrade — never "standalone-only".
3. **`mode='readonly'` invariant.** Any item that introduces composer behaviour, mutation actions, or write-side affordances MUST be gated off when `mode === 'readonly'` (Plan 07 contract). Verify by spot-checking `/c/history/[sessionId]` after every PR.
4. **Live-only write boundary preserved.** Decision 5 LOCKED — RLS rejects writes to `'ended'` / `'cancelled'` sessions. Tier items that look like they extend the write window (edit-after-end, post-consult reaction, etc.) DO NOT subvert this; they either ship pre-end-only or get the explicit Decision 5 → Decision 5b LOCKED treatment in their own plan revision.
5. **PHI hygiene at the wire.** Message bodies stay on the wire to Supabase. Tier items that introduce client-side processing (markdown render, AI summary, translation) MUST NOT log body text to console / Sentry / analytics. The "no PHI in logs" rule from Plan 04 binds every tier.
6. **Schema additivity only for v1.** Tier-introduced columns are additive and nullable; existing rows remain valid. T2's reactions table is the one exception (new table) and is already shaped as additive ↔ pre-T2 sessions render with zero reactions.
7. **AI is opt-in, never default.** T3 items that surface AI-generated content (suggested replies, summaries, translations) ALWAYS show a "✨ AI" tag and a one-tap dismiss. Doctors are the gatekeeper; nothing AI-generated reaches the patient without a doctor send.
8. **Mobile parity from day one.** Every tier item must work on iOS Safari + Android Chrome at parity with desktop, or explicitly degrade with a documented fallback.

---

## How to consume this folder

- **First-time read:** open [README.md](./README.md) for the folder overview, then this file. Skim the four `plan-fXX` foundation status pages if you're new to the codebase.
- **Picking work:** the user picks a tier (or a subset of items inside a tier). The corresponding tier plan is the source of truth for that slice — it lists every item with its own task ID, effort, and acceptance criteria.
- **Granularity:** for T1 / T2, items are already small enough that they don't need their own task files; the plan IS the task list. T3+ items will spawn their own task files when committed.
- **Status updates:** when a tier is committed, this index is updated to flip its status from `Drafted` → `Active` → `Shipped`. When a foundation plan resumes work (e.g. Plan 10 unblocks), update the corresponding `plan-fXX` page in-place, NOT the original — the original is the historical record.

---

## Files expected to touch (across all tiers, for forward planning)

**Frontend (will own ~80% of changes across tiers):**

- `frontend/components/consultation/TextConsultRoom.tsx` — every tier touches this.
- `frontend/components/consultation/TextChatJumpToLatest.tsx` (**new**, T1).
- `frontend/components/consultation/MessageBubble.tsx` (**likely new extract**, T2 — reactions / reply / edit make the inline JSX unwieldy).
- `frontend/components/consultation/ReactionPicker.tsx` (**new**, T2).
- `frontend/components/consultation/QuickInsertTemplatesMenu.tsx` (**new**, T3).
- `frontend/components/consultation/AiChatSummaryPane.tsx` (**new**, T3 — Plan 10 dep).
- `frontend/components/consultation/TextPostChatSummary.tsx` (**new**, T4).
- `frontend/components/consultation/ChatTranscriptPdfButton.tsx` (**new**, T4).
- `frontend/lib/text/markdown-lite.ts` (**new**, T2) — strict allow-list renderer.
- `frontend/hooks/useComposerDraft.ts` (**new**, T5) — sessionStorage-backed.

**Backend (small, only where tiers genuinely require it):**

- `backend/src/services/text-chat-pdf-service.ts` (**new**, T4) — server-side PDF render.
- `backend/src/services/ai-chat-summary-service.ts` (**new**, T3 — Plan 10 dep).
- `backend/src/services/chat-quality-service.ts` (**new**, T5) — delivery health metrics.
- `backend/src/utils/dm-copy.ts` (**extend**, T4) — post-chat summary CTA copy.
- Companion message kinds (**extend Plan 06's enum**, T2 + T3) — `'reaction'`, `'message_edited'`, `'message_deleted'`, `'message_pinned'`, `'ai_suggested_reply'` (when surfaced as a system row, e.g. for audit trail).

**Schema:**

- T2 — `consultation_message_reactions` (small additive table, new — the only T2 schema work).
- T2 — `consultation_messages.edited_at` + `deleted_at` columns (additive nullable).
- T2 — `consultation_messages.pinned_at` + `pinned_by` columns (additive nullable).
- T2 — `consultation_messages.reply_to_id` column (additive FK to self).
- T3 — `doctor_quick_insert_templates` (additive table, doctor-scoped).
- T5 — `text_chat_quality` (small additive table, telemetry only).

All other tiers are schema-free.

---

## Status legend (used by every tier plan)

- `Drafted` — plan exists; no implementation started.
- `Committed` — owner assigned; implementation in progress.
- `Shipped` — merged + verified in production.
- `Deferred` — explicitly parked with rationale; revisit trigger documented.
- `Killed` — decided against; rationale documented.

---

## Symmetry with the voice-consult roadmap

This roadmap deliberately mirrors [`voice-consult/plan-00-voice-consult-roadmap.md`](../voice-consult/plan-00-voice-consult-roadmap.md):

| Voice tier theme | Text tier theme | Same / different |
|------------------|------------------|------------------|
| T1 quick wins (call timer, mic check, etc.) | T1 quick wins (composer hints, jump-to-latest, etc.) | **Same theme** — same-day polish, no schema. |
| T2 real polish (reconnection UX, lobby, caller card) | T2 real polish (reactions, reply, edit, markdown) | **Same theme** — next-sprint polish, schema-light additive. |
| T3 clinical workflow (captions, noise suppression, in-call quick actions) | T3 clinical workflow (suggested replies, templates, AI summary, intake forms, translation) | **Same theme** — both heavily Plan 10 dependent. |
| T4 post-call (summary, rating, replay) | T4 post-chat (summary, rating, PDF, archive search) | **Same theme** — direct one-to-one. |
| T5 reliability / safety (multi-tab, crash recovery, push, QoS) | T5 reliability / safety / scale (same + virtualization + rate limit) | **Same theme** — text adds virtualization / rate-limit because chat is long-tail. |
| T6 mobile native (Bluetooth, volume keys, foreground notif, proximity) | T6 mobile native (swipe-to-reply, long-press, lightbox, dictation, share intent) | **Same theme** — different gestures because the surface is different. |

A future "consult roadmap superset" can sequence the two roadmaps together; this file is the entry point for the text half.

---

**Owner:** TBD (each tier picks its own owner at commit time).  
**Created:** 2026-04-28.  
**Last updated:** 2026-04-28 — owner selected T1 + T2 + T5 + T6 in full (30 of 41 items); see [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for the consolidated batch plan with sub-batch sequencing, dependency graph, and the cross-cutting decisions checklist. T3 + T4 remain `Drafted` and are explicitly out of the 2026-04-28 batch.  
**Status:** T1 / T2 / T5 / T6 → `[SELECTED 2026-04-28]`; T3 / T4 → `Drafted`. Awaiting commit-start on Sub-batch A.
