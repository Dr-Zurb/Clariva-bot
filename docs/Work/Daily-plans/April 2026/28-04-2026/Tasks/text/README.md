# Tasks: Text consult — Selected features batch (2026-04-28)

**Initiative status:** ⏳ **Drafted, awaiting commit-start.** All 32 task files below are ready for pickup; recommended start point per the execution order is **task-text-A2** (Composer 2 Fast warm-up — cheapest item in Wave 1 Lane α).

**▶ Execution order (who-runs-what-when + model picks):** [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) — wave plan, lane assignment, per-task model recommendation (Auto / Composer 2 / Opus 4.7), acceptance gates, cost estimate. **Read this before opening any task file.**

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — when to escalate to Opus, when Auto suffices, when Composer 2 Fast wins. The hard-rules list drives B1 + D5 → Opus in this batch.

**Wave / lane conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — the shape every exec-order doc must follow.

**Parent batch plan:** [plan-text-consult-selected-features.md](../Plans/plan-text-consult-selected-features.md)
**Sibling batch (voice):** [plan-voice-consult-selected-features.md](../Plans/plan-voice-consult-selected-features.md) — Sub-batch 0 (companion-chat hotfix) is the only cross-batch coordination point. **Sibling exec-order:** [EXECUTION-ORDER-voice.md](../voice/EXECUTION-ORDER-voice.md) — voice C3 (browser push) is gated on this batch's D6a.

**Source product plans (single source of truth for each item's contract):**
- [Text T1 — Quick wins](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- [Text T2 — Real polish](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- [Text T5 — Reliability / safety / scale](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- [Text T6 — Mobile native niceties](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- [Text consult roadmap index](../../../../Product%20plans/text-consult/plan-00-text-consult-roadmap.md)

**Foundation invariants every task respects** (drawn from the foundation status pages — DO NOT subvert):
- **`safe_uuid_sub()`** in every new RLS policy ([plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md))
- **Three-host parity** — every UI item works in `<TextConsultRoom layout='standalone' | 'panel' | 'canvas'>` ([plan-f06](../../../../Product%20plans/text-consult/plan-f06-companion-text-status.md))
- **`mode='readonly'`** — every new mutation affordance is hidden / DOM-removed in readonly views ([plan-f07](../../../../Product%20plans/text-consult/plan-f07-recording-replay-status.md))
- **Live-only writes** — RLS rejects all mutations against `'ended'` / `'cancelled'` sessions (Plan 04 Decision 5 LOCKED)
- **No PHI in logs** — message bodies never reach console / Sentry / analytics

**Prefix:** `task-text-XN-` where `X` is the sub-batch (A / B / C / D) and `N` is the order within the sub-batch. Sub-batch A tasks ship first; D last.

---

## Dependency graph (recommended order)

```text
Sub-batch A — frontend-only, no schema, no backend. Ship in any order; A7 last.
  A1 (jump-to-latest pill)
  A2 (composer footer: hints + char counter)        ── all 7 are independent
  A3 (send button states)                              of each other; sequence
  A4 (day separators)                                  by smallest-first if a
  A5 (typing indicator polish)                         single dev is shipping.
  A6 (failed-send retry polish)
  A7 (delivered ✓ / seen ✓✓ indicators)             ── last in A: extends presence channel
       │
       ▼
Sub-batch B — one migration, then 8 frontend items. B1 + B2 are preconditions.
  B1 (migration 0XX_text_t2_chat_polish.sql)          ── lands first (schema)
       │
       ▼
  B2 (extract <MessageBubble> from inline JSX)        ── refactor; precondition for B3+
       │
       ├──► B3 (markdown-lite renderer) ────────────┐ ── lands in <MessageBubble> body
       │                                              │    so quoted-parent + reactions
       │                                              │    inherit it consistently
       │                                              ▼
       ├──► B4 (reply-to-message)                   ── consumes B3 in quoted-parent preview
       │
       ├──► B5 (reactions: <ReactionPicker> + Realtime)
       │
       ├──► B6 (edit + soft-delete; 60s window)      ── shares per-bubble menu with B5/B7
       │
       ├──► B7 (pinned messages; doctor-only)
       │
       ├──► B8 (multi-attachment composer; batch_id) ── consumes B1's batch_id column
       │
       └──► B9 (drag-and-drop on desktop)            ── consumes B8's attachment pipeline

Sub-batch C — pure frontend; soft-deps on B for C4 / C5 / C6.
  C1 (camera-direct attachment polish)               ── no T2 dep; ship first
  C2 (image lightbox with pinch-zoom)                ── no T2 dep
  C3 (voice-to-text dictation)                       ── no T2 dep; PHI-local
       │
       ├──► C4 (long-press for reactions)            ── soft-dep on B5
       │
       ├──► C5 (swipe-to-reply)                      ── soft-dep on B4
       │
       └──► C6 (hardware-keyboard shortcuts)         ── soft-dep on B6 (Up = edit-last)

  C7 (PWA share-intent receive)                      ── no T2 dep; ships any time

Sub-batch D — three migrations + Web Push backend + virtualization.
  D1 (composer-draft crash recovery; sessionStorage) ── ~3h, frontend-only; warm-up
  D2 (multi-tab kick; presence broadcast)            ── frontend-only
  D3 (message-list virtualization; react-virtuoso)   ── frontend; verify A1+A4 unaffected
       │
       ▼
  D4 (chat quality telemetry)                        ── migration + backend + UI badge
  D5 (rate limit; SQL function + RLS rewrite + UI)   ── migration + RLS + UI toast
       │
       ▼
  D6a (Web Push migration + push-notification-service) ── shared with voice-T5.32
  D6b (subscribe/unsubscribe + opt-in flow + SW handler)
  D6c (end-to-end push verification + suppression)
       │
       ▼
  D7 (local browser push; tab-hidden fallback)       ── ships AFTER D6 so SW handler exists
```

---

## Task index

### Sub-batch A — Quick wins (7 tasks, ~1.5 days)

| ID | Title | Source item | Effort |
|----|-------|-------------|--------|
| [task-text-A1](./task-text-A1-jump-to-latest-pill.md) | Jump-to-latest pill (`<TextChatJumpToLatest>` + unread counter) | T1.1 | S (~2h) |
| [task-text-A2](./task-text-A2-composer-footer-hints-and-counter.md) | Composer footer: keyboard hints (dismissable) + char counter (500+ display, 4000 hard cap) | T1.2 + T1.6 | XS (~1h combined) |
| [task-text-A3](./task-text-A3-send-button-states.md) | Send button states polish (idle / ready / sending / queued) | T1.3 | S (~2h) |
| [task-text-A4](./task-text-A4-day-separators.md) | Day separators in message list (Today / Yesterday / "Mon, 28 Apr") | T1.4 | S (~2h) |
| [task-text-A5](./task-text-A5-typing-indicator-polish.md) | Counterparty typing indicator (avatar dot + animated three-dots) | T1.7 | S (~2h) |
| [task-text-A6](./task-text-A6-failed-send-retry-polish.md) | Failed-send retry polish (red-bordered bubble; inline retry/discard) | T1.8 | S (~3h) |
| [task-text-A7](./task-text-A7-delivered-seen-indicators.md) | Delivered ✓ / Seen ✓✓ indicators (presence-derived `viewed-bottom` broadcast) | T1.5 | M (~4h) |

### Sub-batch B — Real polish + first migration (9 tasks, ~5 days)

| ID | Title | Source item | Effort |
|----|-------|-------------|--------|
| [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) | Migration `0XX_text_t2_chat_polish.sql` (reactions table + nullable cols + view + 2 RLS policies + auto-unpin trigger) | T2 schema | M (~4h) |
| [task-text-B2](./task-text-B2-message-bubble-extract.md) | Extract `<MessageBubble>` from inline JSX in `TextConsultRoom.tsx` | T2 refactor precondition | S (~3h) |
| [task-text-B3](./task-text-B3-markdown-lite-renderer.md) | Markdown-lite renderer (5 inline + 1 block; XSS-safe by construction) | T2.13 | M (~5h) |
| [task-text-B4](./task-text-B4-reply-to-message.md) | Reply-to-message (composer reply-affordance + `<QuotedParentPreview>` + scroll-to-parent) | T2.10 | M (~6h) |
| [task-text-B5](./task-text-B5-message-reactions.md) | Reactions (`<ReactionPicker>` + Realtime channel + aggregated badges) | T2.9 | M (~6h) |
| [task-text-B6](./task-text-B6-edit-and-soft-delete-window.md) | Edit + soft-delete within 60 s (per-bubble menu, ticker re-render, view nulls body) | T2.11 + T2.12 | M (~7h combined) |
| [task-text-B7](./task-text-B7-pinned-messages.md) | Pinned messages (doctor-only, 3-cap, `<PinnedMessagesBanner>`) | T2.14 | M (~5h) |
| [task-text-B8](./task-text-B8-multi-attachment-composer.md) | Multi-attachment composer (up to 5; `batch_id`-grouped; thumbnails) | T2.15 | M (~5h) |
| [task-text-B9](./task-text-B9-drag-and-drop-attachment.md) | Drag-and-drop attachment on desktop (standalone + canvas only) | T2.17 | S (~3h) |

### Sub-batch C — Mobile native (7 tasks, ~9 days)

| ID | Title | Source item | Effort |
|----|-------|-------------|--------|
| [task-text-C1](./task-text-C1-camera-attachment-polish.md) | Camera-direct attachment polish (in-composer button + preview + "switch to gallery") | T6.41 | S (~4h) |
| [task-text-C2](./task-text-C2-image-lightbox.md) | Image lightbox with pinch-zoom (full-screen + prev/next + swipe-down dismiss) | T6.39 | M (~6h) |
| [task-text-C3](./task-text-C3-voice-dictation.md) | Voice-to-text dictation (Web Speech API; locale-aware; partials local-only) | T6.40 | M (~6h) |
| [task-text-C4](./task-text-C4-long-press-reactions.md) | Long-press for reactions (300 ms + `navigator.vibrate(15)`) | T6.37 | S (~3h) |
| [task-text-C5](./task-text-C5-swipe-to-reply.md) | Swipe-to-reply gesture (drag right ~60 px + spring-back) | T6.36 | M (~5h) |
| [task-text-C6](./task-text-C6-hardware-keyboard-shortcuts.md) | Hardware-keyboard shortcuts (Esc clear / ↑ edit-last / Cmd+Enter force-send) | T6.38 | S (~3h) |
| [task-text-C7](./task-text-C7-pwa-share-target.md) | PWA share-intent receive (manifest `share_target` + SW POST intercept + `/c/share-target` route) | T6.42 | M (~6h) |

### Sub-batch D — Production-grade (9 tasks, ~14 days)

| ID | Title | Source item | Effort |
|----|-------|-------------|--------|
| [task-text-D1](./task-text-D1-composer-draft-crash-recovery.md) | Composer-draft crash recovery (`useComposerDraft` → `sessionStorage`; clears on send) | T5.30 | S (~3h) |
| [task-text-D2](./task-text-D2-multi-tab-kick.md) | Multi-tab kick (patient-only; `chat-presence-claim` broadcast; "Take over" CTA) | T5.29 | M (~6h) |
| [task-text-D3](./task-text-D3-message-list-virtualization.md) | Virtualization (`react-virtuoso`; threshold > 100 msgs; preserves A1 + A4 semantics) | T5.33 | L (~3 days) |
| [task-text-D4](./task-text-D4-chat-quality-telemetry.md) | Quality telemetry (`text_chat_quality` migration + ingest + sampler + doctor-side badge) | T5.35 | M (~7h) |
| [task-text-D5](./task-text-D5-rate-limit-rls-and-toast.md) | Rate limit (migration + `check_chat_insert_rate(...)` SQL function + RLS rewrite + UI toast) | T5.34 | M (~6h) |
| [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) | Web Push part 1: migration `web_push_subscriptions` + `push-notification-service.ts` + VAPID env | T5.32 (1/3) | L (~2 days) |
| [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md) | Web Push part 2: subscribe/unsubscribe controllers + frontend opt-in flow + SW push handler | T5.32 (2/3) | L (~2 days) |
| [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md) | Web Push part 3: end-to-end smoke + suppression (active-tab) + cross-modality coordination | T5.32 (3/3) | M (~1 day) |
| [task-text-D7](./task-text-D7-local-browser-push.md) | Local browser push (tab-hidden fallback when no PWA subscription; inline PHI redactor) | T5.31 | M (~6h) |

---

## Code anchors (existing — audit at execution time)

| Area | Location |
|------|----------|
| Text consult room (every task touches this) | `frontend/components/consultation/TextConsultRoom.tsx` (~1760 lines) |
| Patient consult page (HMAC exchange + companion bootstrapping) | `frontend/app/c/text/[sessionId]/page.tsx` |
| Text-session adapter (Supabase JWT mint, RLS-gated) | `backend/src/services/text-session-supabase.ts` |
| Consultation controller (HMAC handler shared with voice/video) | `backend/src/controllers/consultation-controller.ts` |
| Consultation messages table baseline | migrations 051 / 052 (table + RLS) / 062 (attachments) / 078–082 (RLS hardening, `safe_uuid_sub()`) |
| Storage path convention | `consultation-attachments/{session_id}/{uuid}.{ext}` (Plan 06 / migration 062) |
| Voice room companion mount (parity reference) | `frontend/components/consultation/VoiceConsultRoom.tsx` |
| Video room companion mount (parity reference) | `frontend/components/consultation/VideoRoom.tsx` |
| Service worker (extends in C7 + D6b + D7) | `frontend/public/sw.js` |
| PWA manifest (extends in C7) | `frontend/public/manifest.json` |
| Tailwind config (extends in A5 typing-dot keyframe) | `frontend/tailwind.config.ts` |
| Notification service (extends for push fan-out) | `backend/src/services/notification-service.ts` |
| Diagnose script (run after every B1 + D4 + D5 + D6a migration) | `backend/scripts/diagnose-text-consult-jwt.ts` |

---

## Convention reminders

- **Mark tasks `Status: Implementation complete (YYYY-MM-DD)`** when the PR merges; flip to `Shipped (YYYY-MM-DD)` after staging smoke.
- **When a sub-batch closes,** update the parent batch plan (`plan-text-consult-selected-features.md`) tier-section row and the source product plan's `[SELECTED 2026-04-28]` marker → `[SHIPPED YYYY-MM-DD]`.
- **Migration numbering:** the next free migration number after `082` is `083`. Sub-batch B claims `083`; Sub-batch D claims `084`–`086` (one per migration in the order D4 → D5 → D6a — coordinate at PR time so numbers don't collide with the voice batch's `voice_call_quality` migration).
- **No task is allowed to:** rewrite an existing RLS policy without reusing `safe_uuid_sub()`; ship a UI affordance that's visible in `mode='readonly'` (unless explicitly read-only); log message bodies to console / Sentry / analytics; introduce a new vendor.

---

**Last Updated:** 2026-04-28
