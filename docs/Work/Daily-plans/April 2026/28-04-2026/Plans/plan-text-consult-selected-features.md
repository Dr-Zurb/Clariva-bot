# Text consult — Selected features batch (2026-04-28)

## The 30 text-consult items committed for implementation, pulled from T1 + T2 + T5 + T6

> **Source plans (single source of truth for each item):**
> - [Text T1 — Quick wins](../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
> - [Text T2 — Real polish](../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
> - [Text T5 — Reliability / safety / scale](../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
> - [Text T6 — Mobile native niceties](../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
> - [Text consult roadmap index](../../../Product%20plans/text-consult/plan-00-text-consult-roadmap.md)
>
> **Foundation context (already shipped, do not re-implement):**
> - [Plan F04 — text-consult Supabase backbone](../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md) (status: ✅ fully shipped)
> - [Plan F06 — companion text channel](../../../Product%20plans/text-consult/plan-f06-companion-text-status.md) (status: 🟡 mostly shipped — patient-side gap is **Sub-batch 0** in [plan-voice-consult-selected-features.md](./plan-voice-consult-selected-features.md))
> - [Plan F07 — recording replay & post-consult chat history](../../../Product%20plans/text-consult/plan-f07-recording-replay-status.md) (status: 🟢 text slice fully shipped, including `mode='readonly'`)
> - [Plan F10 — AI clinical assist](../../../Product%20plans/text-consult/plan-f10-ai-clinical-assist-status.md) (status: ⏸ deferred — explains why T3 is NOT in this batch)
>
> Each item below is implemented per the contract spelled out in its source plan. This file is the **batch backlog and sequencing doc** — it does not redefine items; it commits them.

---

## What this is

A user-curated cross-tier slice of the text-consult roadmap, selected on 2026-04-28. Spans **all of T1, T2, T5, T6** — every quick win, every polish item, every reliability/safety item, every mobile-native nicety.

**Explicitly NOT in this batch:** T3 (clinical workflow — 5 of 7 items hard-block on the deferred Plan 10) and T4 (post-chat surfaces — wait until usage tells us patients want a summary screen and a searchable archive).

This is a **commitment**, not a wish-list. Each item below has its source plan, its effort estimate, and its dependencies. The sequencing in this doc respects those dependencies so we don't build things twice.

> **Companion-chat dependency note.** Plan 06's patient-side companion-chat gap is captured as **Sub-batch 0** in the [voice-consult batch plan](./plan-voice-consult-selected-features.md). The text-consult tier items in **this** batch are unaffected by that gap (they ship inside `<TextConsultRoom>` directly, which patients reach via `/c/text/[sessionId]` — that path is healthy). Voice-consult Sub-batch 0 should still ship before either batch wraps so Plan 06 Decision 9 is honored end-to-end across modalities — but it is **not a hard gate** for any text-consult item below.

---

## Status

`Drafted, awaiting commit start` — 2026-04-28.

Once implementation starts, this file is updated in-place: items move from `pending` → `in-progress` → `shipped` (with dated check-marks). Each tier source plan keeps its own `[SELECTED 2026-04-28]` markers so the cross-reference is always traceable in either direction.

---

## What's NOT in this batch (explicitly deferred)

So we don't accidentally pull these in:

| Tier / Item | Why excluded |
|-------------|--------------|
| **T3 — entire tier (7 items)** | 5 of 7 items (T3.18 / T3.20 / T3.22 / T3.23) hard-block on Plan 10 (AI clinical assist), which is parked per Decision 6 LOCKED. The 3 non-AI items (T3.19 templates, T3.21 intake form, T3.24 PHI-redaction warning) could ship independently — explicitly held back to keep this batch coherent and to wait until Plan 10's unblock conversation. |
| **T4 — entire tier (4 items)** | Wait until v1 GA usage tells us patients actually want a summary screen + cross-consult archive search. T4.27 PDF export already exists at the chat-history surface (Plan F07 / Task 32 shipped); upgrading it isn't urgent. |

If priorities shift, we move items from this excluded list into a future batch — we don't redefine the source plans.

---

## The 30 selected items

Grouped by tier; sequencing is below in [§ Implementation order](#implementation-order).

### Tier 1 — Quick wins (8 of 8 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T1.1 | Jump-to-latest button (floating "↓ N new" pill) | S (~2h) | [T1 §T1.1](../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md) |
| T1.2 | Composer keyboard hints ("Enter to send · Shift+Enter for newline", dismissable) | XS (~30 min) | T1 §T1.2 |
| T1.3 | Send button states polish (idle / ready / sending / queued) | S (~2h) | T1 §T1.3 |
| T1.4 | Day separators in the message list (Today / Yesterday / "Mon, 28 Apr") | S (~2h) | T1 §T1.4 |
| T1.5 | Delivered ✓ / Seen ✓✓ indicators (presence-derived) | M (~4h) | T1 §T1.5 |
| T1.6 | Composer character counter (500+ display, 4000-char hard cap with "attach as file" CTA) | XS (~30 min) | T1 §T1.6 |
| T1.7 | Counterparty typing-indicator polish (avatar dot + animated three-dots) | S (~2h) | T1 §T1.7 |
| T1.8 | Failed-send retry polish (red-bordered bubble, inline retry/discard) | S (~3h) | T1 §T1.8 |

**Tier-1 subtotal:** ~1.5 days. Frontend-only, no schema, no backend changes. Day-separator locale pinned to `en-GB` per the [deferred date-locale hydration sweep](../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md).

### Tier 2 — Real polish (8 of 8 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T2.9 | Message reactions (👍 / ❤️ / ✓ / ❓ / 😮; long-press / right-click picker; aggregated counts) | M (~6h) | [T2 §T2.9](../../../Product%20plans/text-consult/plan-t2-text-real-polish.md) |
| T2.10 | Reply-to-message (one-level quoted preview; tap-on-quote scrolls + highlights parent) | M (~6h) | T2 §T2.10 |
| T2.11 | Edit window (60 s, sender-only; "edited" tag with original-time tooltip) | M (~6h) | T2 §T2.11 |
| T2.12 | Soft-delete (60 s window; body nulled in view; "(deleted by Dr. X)" placeholder) | S (~4h) | T2 §T2.12 |
| T2.13 | Markdown-lite rendering (5 inline + 1 block patterns; XSS-safe by construction; optional Slack-style toolbar in `standalone`) | M (~5h) | T2 §T2.13 |
| T2.14 | Pinned messages (doctor-only, 3-cap; collapsed banner above message list) | M (~5h) | T2 §T2.14 |
| T2.15 | Multi-attachment composer (up to 5 attachments per send; thumbnails in composer; `batch_id`-grouped) | M (~5h) | T2 §T2.15 |
| T2.17 | Drag-and-drop attachment on desktop (`standalone` + `canvas` only; `panel` excluded — narrow-width ambiguity) | S (~3h) | T2 §T2.17 |

**Tier-2 subtotal:** ~5 days. **One migration** (the only schema work in this batch outside T5): `consultation_message_reactions` table + 5 nullable columns on `consultation_messages` (`reply_to_id`, `edited_at`, `deleted_at`, `pinned_at`, `pinned_by`, plus T2.15's `batch_id`) + `consultation_messages_view` + 2 new RLS policies. **All RLS uses `public.safe_uuid_sub()`** per Plan F04 invariant.

T2.16 is intentionally absent — voice-notes were killed by Plan 06's audio-MIME exclusion (`migration 082`). Re-introducing them is a Decision change, not a tier item.

### Tier 5 — Reliability / safety / scale (7 of 7 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T5.29 | Multi-tab kick (patient-side only; `chat-presence-claim` broadcast; "Take over" CTA) | M (~6h) | [T5 §T5.29](../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md) |
| T5.30 | Composer-draft crash recovery (`useComposerDraft` hook → `sessionStorage`; clears on send) | S (~3h) | T5 §T5.30 |
| T5.31 | Browser push when tab hidden (`navigator.serviceWorker.showNotification`; first-message-arrived consent prompt) | M (~6h) | T5 §T5.31 |
| T5.32 | Mobile-PWA push (true push, app backgrounded; Web Push + VAPID; `web_push_subscriptions` table; opt-in flow) | L (~5 days) | T5 §T5.32 |
| T5.33 | Virtualization (`react-virtuoso` for messages > 100; preserves T1.1 jump-to-latest + T1.4 day separators) | L (~3 days) | T5 §T5.33 |
| T5.34 | Server-side rate limit (≤30 msg/min, ≤200 msg/hour per sender per session; SQL function + RLS-side guard; inline "slow down" toast) | M (~6h) | T5 §T5.34 |
| T5.35 | Delivery health metrics (`text_chat_quality` table; per-message RTT + reconnect counts + presence flaps; doctor-side "Connection: Excellent / Fair / Poor" badge) | M (~7h) | T5 §T5.35 |

**Tier-5 subtotal:** ~14 days. **Three migrations:**
1. `web_push_subscriptions` (T5.32)
2. `consultation_messages_rate_limit` — extends `consultation_sessions.message_counts` JSONB + adds `check_chat_insert_rate(...)` SQL function + rewrites the existing INSERT RLS to chain it (T5.34)
3. `text_chat_quality` (T5.35)

**New env vars:** `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT_EMAIL` (T5.32). Provision in dev + staging + prod before commit-start.

**Cross-batch infra share:** T5.32 push backend SHOULD be shared with the voice-consult batch's T5.32 (browser push when remote joins). Implement once in `backend/src/services/push-notification-service.ts` and consume from both modalities. The voice batch's T5.32 is a smaller surface (one-shot "remote joined" notification) and ships in voice Sub-batch C; coordinate with whoever picks up that item.

### Tier 6 — Mobile native niceties (7 of 7 items, all)

| ID | Item | Effort | Dep | Source |
|----|------|--------|-----|--------|
| T6.36 | Swipe-to-reply gesture (drag bubble right ~60 px → opens reply mode) | M (~5h) | **T2.10** | [T6 §T6.36](../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md) |
| T6.37 | Long-press for reactions (300 ms hold → `<ReactionPicker>`; `navigator.vibrate(15)`) | S (~3h) | **T2.9** | T6 §T6.37 |
| T6.38 | Hardware-keyboard shortcuts (Esc clear / ↑ edit-last / Cmd+Enter force-send) | S (~3h) | **T2.11** | T6 §T6.38 |
| T6.39 | Image lightbox with pinch-zoom (full-screen black backdrop; swipe-down dismiss; arrow-nav across all chat images) | M (~6h) | None | T6 §T6.39 |
| T6.40 | Voice-to-text dictation (Web Speech API; locale-aware; partial-text styled distinctly; auto-stop 30 s silence; PHI hygiene — partials never leave device) | M (~6h) | None | T6 §T6.40 |
| T6.41 | Camera-direct attachment polish (in-composer camera button + preview-before-send + "switch to gallery" toggle) | S (~4h) | None | T6 §T6.41 |
| T6.42 | PWA share-intent receive (manifest `share_target` POST entry + `/c/share-target` route + SW intercept; iOS unsupported — documented degradation) | M (~6h) | None | T6 §T6.42 |

**Tier-6 subtotal:** ~9 days. **No backend changes. No schema changes.** All 7 items live frontend-only (manifest + service-worker tweaks for T6.42 are static assets, not backend code).

T6.36 / T6.37 / T6.38 hard-depend on T2.10 / T2.9 / T2.11 respectively — sequence T6 **after** T2.

---

## Total effort estimate

| Tier | Items | Effort |
|------|-------|--------|
| T1 | 8 | ~1.5 days |
| T2 | 8 | ~5 days |
| T5 | 7 | ~14 days |
| T6 | 7 | ~9 days |
| **Total** | **30** | **~29.5 dev-days (~6 calendar weeks at solo pace, ~3 weeks at 2-dev pace)** |

This is a **multi-month commitment for a solo dev**. Recommend slicing the implementation into 4 deliverable sub-batches (A → B → C → D) so we can validate each before moving to the next.

---

## Implementation order

Sequencing respects:

1. **Hard dependencies** between selected items (T6.36 / T6.37 / T6.38 hard-dep T2.10 / T2.9 / T2.11; T5.34 rate-limit RLS lands cleanest after T2's RLS work; T5.33 virtualization plays with T1.1 + T1.4).
2. **Risk locality** — ship local-only, no-schema items first so we can iterate without migration overhead.
3. **User-visible step changes first** — T1 + T2 polish is what doctors and patients SEE; T5 reliability is what they FEEL only when something goes wrong.
4. **Schema co-location** — T2 is one migration, T5 is three. Don't interleave T6 frontend work between T5 migrations or rollbacks become awkward.

### Sub-batch A — "Quick wins" (~1.5 days)

User-visible quality jump. **All frontend, no schema, no backend.** Risk-free first slice.

1. T1.2 — composer keyboard hints (cheapest; ~30 min)
2. T1.6 — char counter + 4000-char hard cap (~30 min)
3. T1.1 — jump-to-latest pill
4. T1.3 — send button states (idle / ready / sending / queued)
5. T1.4 — day separators (en-GB locale pinned)
6. T1.7 — typing-indicator polish (avatar + animated dots)
7. T1.8 — failed-send retry polish (red-bordered bubble)
8. T1.5 — delivered ✓ / seen ✓✓ (last in A; touches presence channel — verify no regression on existing presence subscribers)

**Sub-batch A acceptance:** all 8 source-plan acceptance criteria for T1; manual smoke on standalone + panel + canvas layouts (Plan 06 three-host parity); `mode='readonly'` unaffected (Plan 07 invariant); no hydration mismatch on day-separator labels.

### Sub-batch B — "Real polish + first migration" (~5 days)

The only schema slice in the entire frontend-leaning half of the batch. **One migration**, then 8 frontend items that consume it.

9. **Migration `0XX_text_t2_chat_polish.sql`** lands first — `consultation_message_reactions` + 5 nullable columns on `consultation_messages` (incl. T2.15's `batch_id`) + `consultation_messages_view` + 2 RLS policies (`consultation_messages_update_recent`, `consultation_messages_pin_doctor_only`). **All RLS uses `public.safe_uuid_sub()`** — Plan F04 invariant.
10. Extract `<MessageBubble>` from inline JSX in `TextConsultRoom.tsx` (refactor; precondition for items 11–18 to share render context).
11. T2.13 — markdown-lite rendering (lands first inside `<MessageBubble>` so quoted-parent previews in T2.10 inherit it consistently)
12. T2.10 — reply-to-message (composer reply-affordance + quoted-parent preview; tap-on-quote scrolls + highlights)
13. T2.9 — reactions (long-press / right-click picker; reactions Realtime channel)
14. T2.11 — edit window (60 s, sender-only; ticker re-render to auto-hide menu when window closes)
15. T2.12 — soft-delete (UPDATE → `deleted_at`; view nulls `body` on the wire)
16. T2.14 — pinned messages (doctor-only `<PinnedMessagesBanner>` above the message list)
17. T2.15 — multi-attachment composer (`batch_id`-grouped; up to 5 per send; thumbnails in composer)
18. T2.17 — drag-and-drop attachment on desktop (`standalone` + `canvas` only; `panel` excluded)

**Sub-batch B acceptance:** all 8 T2 source-plan acceptance criteria; migration reversible (down migration drops view → columns → table); `mode='readonly'` hides every per-bubble menu, banner action, and composer-side affordance introduced; live-only invariant verified (RLS rejects all mutations against `'ended'` sessions).

### Sub-batch C — "Mobile-native" (~9 days)

Pure frontend; soft-blocks on B (T6.36 / T6.37 / T6.38 hard-dep T2 items). PWA tweaks for T6.42.

19. T6.41 — camera-direct attachment polish (no T2 dep; ships first to validate the new `<MessageBubble>` from B doesn't break attachment render)
20. T6.39 — image lightbox (no T2 dep; consumes the messages array)
21. T6.40 — voice-to-text dictation (PHI hygiene: partials local-only, never sent)
22. T6.37 — long-press for reactions (T2.9 dep)
23. T6.36 — swipe-to-reply (T2.10 dep)
24. T6.38 — hardware-keyboard shortcuts (T2.11 dep; extends T1.2 hint string)
25. T6.42 — PWA share-intent receive (manifest + SW intercept + new `/c/share-target` route)

**Sub-batch C acceptance:** all 7 T6 source-plan acceptance criteria; gestures degrade gracefully on desktop (swipe ignores mouse; long-press uses right-click); lightbox images never leak beyond in-memory blob URL; share-target works on Android (after PWA install) and degrades on iOS (documented).

### Sub-batch D — "Production-grade" (~14 days)

Reliability, safety, scale. **Three migrations** + Web Push backend + virtualization. The heaviest tier; ships last.

26. T5.30 — composer-draft crash recovery (`useComposerDraft` → `sessionStorage`; ~3h; cheapest item; ships first as a warm-up)
27. T5.29 — multi-tab kick (patient only; doctor side legitimately uses multi-monitor)
28. T5.33 — virtualization (`react-virtuoso`; mount only when `messages.length > 100`; preserves T1.1 jump-to-latest semantics)
29. **Migration `0XX_text_chat_quality.sql`** + T5.35 backend ingestion + frontend QoS sampler + doctor-side "Connection" badge
30. **Migration `0XX_consultation_messages_rate_limit.sql`** + T5.34 SQL function + RLS chain + frontend "you're sending too fast" toast
31. **Migration `0XX_web_push_subscriptions.sql`** + T5.32 backend `push-notification-service.ts` + VAPID env vars provisioned + opt-in flow on patient first chat + SW push handler
32. T5.31 — browser push (local-only fallback; first-message-arrived consent prompt; PHI hygiene) ✓ **Shipped 2026-05-24** (`frontend/lib/push/local-notifications.ts`)

**Sub-batch D acceptance:** all 7 T5 source-plan acceptance criteria; quality table populates within 30 s of session start; rate-limit triggers cleanly + composer auto-recovers after 5 s; push fires within 5 s on patient device with PWA backgrounded; multi-tab kick within 1 s; 1000-message session scrolls at 60 fps on mid-tier Android; PHI hygiene verified across push payload + quality telemetry + new logs.

---

## Dependency graph (selected-items only)

```
Sub-batch A (T1) — frontend-only, no deps
   T1.1 ─┐
   T1.2 ─┤
   T1.3 ─┤
   T1.4 ─┼──→ Sub-batch B + C + D consume the polished baseline
   T1.5 ─┤
   T1.6 ─┤
   T1.7 ─┤
   T1.8 ─┘

Sub-batch B (T2) — one migration, then 8 frontend items
   migration ──→ <MessageBubble> extract ──┐
                                            ├──→ T2.13 (markdown)
                                            ├──→ T2.10 (reply-to)
                                            ├──→ T2.9  (reactions)
                                            ├──→ T2.11 (edit 60s)
                                            ├──→ T2.12 (soft-delete)
                                            ├──→ T2.14 (pin)
                                            ├──→ T2.15 (multi-attach)
                                            └──→ T2.17 (drag-drop)

Sub-batch C (T6) — pure frontend; hard-deps on B
   T2.10 ───────→ T6.36 (swipe-to-reply)
   T2.9  ───────→ T6.37 (long-press picker)
   T2.11 ───────→ T6.38 (Up = edit-last)
   no dep ──→ T6.39 / T6.40 / T6.41 / T6.42

Sub-batch D (T5) — three migrations + backend infra
   T5.30 (sessionStorage)         — frontend-only, ships first
   T5.29 (multi-tab kick)         — frontend-only
   T5.33 (virtualization)         — frontend; verify T1.1 + T1.4 unaffected
   T5.35 (quality)                — migration + backend ingest + UI badge
   T5.34 (rate limit)             — migration + RLS rewrite + UI toast
   T5.32 (push)                   — migration + backend + SW + opt-in flow
   T5.31 (browser push)           — frontend; SW handler shared with T5.32

Foundation invariants (every sub-batch respects):
   Plan F04 → safe_uuid_sub() in every new RLS  (B + D)
   Plan F06 → three-host parity (standalone / panel / canvas) for every UI item
   Plan F07 → mode='readonly' hides every new mutation affordance

Cross-batch coordination:
   Voice-consult batch Sub-batch 0 (companion-chat hotfix) — should ship before
     either batch wraps so Plan 06 Decision 9 is honored end-to-end across
     modalities. Not a hard gate for any text item below.
   Voice-consult T5.32 (browser push when remote joins) and text-consult T5.32
     (chat push) — share `backend/src/services/push-notification-service.ts`
     and the `web_push_subscriptions` table. Whoever ships first owns the file;
     the other consumes.
```

No selected item depends on Plan 10 (AI clinical assist), so there's no AI blocker for any sub-batch.

---

## Cross-cutting decisions needed before commit-start

These are decisions the source plans flagged as "decide at commit time". For this batch, we owe answers before sub-batch boundaries:

### Before sub-batch A starts

1. **Day-separator locale** (T1.4) — pin to `en-GB` per the [deferred date-locale hydration sweep](../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md). Confirmed; default for this batch.
2. **Hint dismissal scope** (T1.2) — local-storage per-device (recommended; hint is cheap).
3. **Composer hard cap** (T1.6) — 4000 chars (recommended; ~1 page of dense text).
4. **Seen-indicator strictness** (T1.5) — reset on scroll-up (matches WhatsApp's "you're not actually reading" honesty; recommended).
5. **Failed-send discard confirmation** (T1.8) — no confirmation (the message never persisted; confirmation adds friction with no safety value).

### Before sub-batch B starts

6. **Reactions emoji set** (T2.9) — `👍 / ❤️ / ✓ / ❓ / 😮` (recommended; expand only if doctors ask). Also: **reactions on system messages disabled** (system rows are informational; reactions add noise).
7. **Edit window length** (T2.11) — 60 s (recommended; clinical record immutability matters; longer raises audit-trail concerns).
8. **Delete-ability of attachments** (T2.12) — soft-delete also revokes the signed URL (recommended; body nulled in view AND storage object becomes inaccessible; row kept for audit).
9. **Multi-attach schema shape** (T2.15) — option (a): `batch_id` nullable column on `consultation_messages` (recommended; preserves Plan 06 single-attachment contract; option (b) child-table breaks it).
10. **Pinned messages cap** (T2.14) — 3 (recommended; banner stays compact).
11. **Markdown render in `panel` / `canvas`** (T2.13) — render markdown but hide the composer toolbar in narrow layouts (recommended; render is free, toolbar needs space).
12. **Soft-delete + pinned interaction** — if a pinned message is soft-deleted, does it stay pinned? Recommendation: no — auto-unpin on delete (otherwise the banner shows "(deleted by Dr. X)" which is awkward). Add to migration: trigger that nulls `pinned_at` + `pinned_by` when `deleted_at` becomes non-null.
13. **`<MessageBubble>` extraction scope** — full extraction (entire bubble + quoted-parent + reactions row + per-bubble menu) vs partial. Recommendation: full — splitting later costs more than splitting now.

### Before sub-batch C starts

14. **Swipe-to-reply direction** (T6.36) — right-swipe (WhatsApp; recommended for the Indian patient demographic).
15. **Long-press duration** (T6.37) — 300 ms (recommended; matches WhatsApp).
16. **Dictation language source** (T6.40) — `patient.locale` by default + a "Change language" link inside the dictating UI (recommended).
17. **Lightbox prefetching** (T6.39) — yes; prefetch next/prev when lightbox opens (recommended; signed URLs already in memory).
18. **Camera retake button** (T6.41) — re-prompt OS camera (recommended; simpler).
19. **Share-target prompt UX** (T6.42) — "send to most-recent active consult within last 60 min" with a "different consult" link (recommended; matches WhatsApp share UX).
20. **Hardware "Up to edit" scope** (T6.38) — own messages only (recommended; editing someone else's is conceptually wrong).

### Before sub-batch D starts

21. **Virtualization library choice** (T5.33) — `react-virtuoso` (recommended; 8KB gz, MIT, scroll-anchoring + follow-output non-trivial to hand-roll).
22. **Multi-tab kick on doctor side** (T5.29) — no kick; show a small "Open in 2 tabs" badge so doctor knows. Patient side: kick (recommended).
23. **Push body content** (T5.31 + T5.32) — truncated body with inline PHI redaction (Aadhaar / PAN / phone / card patterns scrubbed; recommended; UX materially better and PHI risk bounded). The redactor is implemented inline in T5.31 with a TODO to consolidate when T3.24 lands.
24. **Rate-limit thresholds** (T5.34) — 30/min + 200/hour as starting numbers; calibrate after 2 weeks of production data. Doctor and patient share the same quota (no need to differentiate; doctors organically don't hit it; recommended).
25. **Virtualization mount threshold** (T5.33) — render virtuoso always once shipped (recommended; eliminates a code branch + overhead is negligible).
26. **Quality badge audience** (T5.35) — doctor only for v1 (recommended; patient-side QoS badges add anxiety more than utility).
27. **Push consent surface** (T5.31) — first-message-arrived moment (recommended; context concrete, prompt feels earned).
28. **VAPID key provisioning** (T5.32) — generate per-environment with `web-push` CLI; store in env vars; rotate annually (operational decision; flag for ops review at PR time).
29. **PWA push opt-in scope** (T5.32) — patient + doctor both can opt in; doctor side mostly redundant with the dashboard's existing real-time presence (recommended: patient-only at first, doctor opt-in deferred to a follow-up PR).

---

## Files expected to touch (consolidated across all 30 items)

### Frontend (~13 new files, ~5 extends)

**New components:**
- `frontend/components/consultation/TextChatJumpToLatest.tsx` — T1.1
- `frontend/components/consultation/MessageBubble.tsx` — T2 host (extracted from inline JSX in `TextConsultRoom.tsx`)
- `frontend/components/consultation/ReactionPicker.tsx` — T2.9
- `frontend/components/consultation/QuotedParentPreview.tsx` — T2.10
- `frontend/components/consultation/PinnedMessagesBanner.tsx` — T2.14
- `frontend/components/consultation/VirtualizedMessageList.tsx` — T5.33
- `frontend/components/consultation/ImageLightbox.tsx` — T6.39
- `frontend/components/consultation/AttachmentPreview.tsx` — T6.41

**New hooks:**
- `frontend/hooks/useComposerDraft.ts` — T5.30

**New libraries:**
- `frontend/lib/text/markdown-lite.ts` — T2.13
- `frontend/lib/gestures/use-swipe-to-reply.ts` — T6.36
- `frontend/lib/gestures/use-long-press.ts` — T6.37
- `frontend/lib/speech/dictation.ts` — T6.40
- `frontend/lib/push/local-notifications.ts` — T5.31
- `frontend/lib/push/web-push-subscribe.ts` — T5.32

**New routes:**
- `frontend/app/c/share-target/page.tsx` — T6.42

**New assets / config:**
- `frontend/tailwind.config.ts` — T1.7 (`animate-typing-dot` keyframe)
- `frontend/public/manifest.json` — T6.42 (`share_target` POST entry)

**Extends:**
- `frontend/components/consultation/TextConsultRoom.tsx` — every item touches this; refactored mid-Sub-batch B to consume `<MessageBubble>` + `<PinnedMessagesBanner>` + `<VirtualizedMessageList>` (the latter mounts when `messages.length > 100`)
- `frontend/public/sw.js` — T5.31 + T5.32 + T6.42 (push handlers + share-target POST intercept)

### Backend (~5 new files, ~2 extends)

**New:**
- `backend/src/services/push-notification-service.ts` — T5.32 (shared with voice batch's T5.32)
- `backend/src/services/chat-quality-service.ts` — T5.35
- `backend/src/controllers/push-controller.ts` — T5.32 (subscribe / unsubscribe)
- `backend/src/controllers/text-chat-quality-controller.ts` — T5.35 ingest endpoint

**Extends:**
- `backend/src/controllers/consultation-controller.ts` — T5.35 quality ingest sibling endpoint OR keep T5.35 in its own controller (decision flagged at PR time; recommendation: own controller for testability)
- `backend/src/services/text-session-supabase.ts` — no functional change; verify T5.34 rate-limit RLS doesn't break the patient-JWT path that 079–082 hardened

### Migrations (4 total)

- `backend/migrations/0XX_text_t2_chat_polish.sql` — Sub-batch B (reactions + nullable cols + view + 2 RLS policies; soft-delete-auto-unpin trigger from decision 12)
- `backend/migrations/0XX_web_push_subscriptions.sql` — Sub-batch D / T5.32
- `backend/migrations/0XX_consultation_messages_rate_limit.sql` — Sub-batch D / T5.34 (extends `consultation_sessions.message_counts` JSONB + adds `check_chat_insert_rate(...)` SQL function + rewrites the existing `consultation_messages_insert_live_participants` to chain it)
- `backend/migrations/0XX_text_chat_quality.sql` — Sub-batch D / T5.35

All migrations forward + reverse cleanly. All new RLS uses `public.safe_uuid_sub()` per Plan F04 invariant.

### Plan 06 system-message enum extensions (single line each)

- `'message_edited'` — T2.11 (optional; surfaces "Dr. Sharma edited a message" as an audit row)
- `'message_deleted'` — T2.12 (optional; surfaces "Patient deleted a message")
- `'message_pinned'` — T2.14 (optional; surfaces "Dr. Sharma pinned a message")

(Owned formally by Plan 06; T2.11 / T2.12 / T2.14 are first consumers. Decide at PR time whether these system rows are emitted or whether the per-bubble UI is sufficient; recommendation: skip in v1 — the per-bubble "edited" / "(deleted)" / pin-banner UI is enough. If audit demands it later, the enum extension is one line.)

### Ops

**New env vars (Sub-batch D / T5.32):**
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_CONTACT_EMAIL`

Generate with `npx web-push generate-vapid-keys` per environment (dev / staging / prod). The PUBLIC key is loaded into the frontend bundle at build time; the PRIVATE key stays server-side.

**New npm dep (Sub-batch D / T5.33):**
- `react-virtuoso` (frontend; ~8KB gz)

**New npm dep (Sub-batch D / T5.32):**
- `web-push` (backend; standard implementation of the Web Push protocol)

### What does NOT change

- No DM-copy changes (T3 / T4 would have needed copy; not selected).
- No new vendor (Web Push is a W3C spec; `react-virtuoso` is OSS; everything else is in-house).
- No native shell.
- No new authentication / authorization surface (T5.32 push subscribe uses existing patient HMAC + doctor JWT auth).
- No RLS rewrites that bypass `safe_uuid_sub()` (Plan F04 invariant LOCKED).

---

## Acceptance for the whole batch

When all 30 items have shipped:

- [ ] All 30 source-plan acceptance criteria pass (8 T1 + 8 T2 + 7 T5 + 7 T6).
- [ ] Manual smoke: doctor + patient on different devices for a 30-min chat exercises every item without hitting a console error.
- [ ] Three-host parity verified (every UI item works at parity in `<TextConsultRoom layout='standalone' | 'panel' | 'canvas'>`) — Plan F06 invariant.
- [ ] `mode='readonly'` invariant verified — every new mutation affordance is hidden / DOM-removed in readonly views — Plan F07 invariant.
- [ ] Mobile parity verified on at least one iOS Safari device and one Chrome Android device (with documented degradations on iOS for T6.40 dictation pre-16.4 and T6.42 share-target).
- [ ] PHI hygiene: no message body in push payload beyond what the inline T5.31 redactor permits; no body in T5.35 quality telemetry; no body in any new logs; T6.39 lightbox images never cached to disk; T6.40 dictation partials never leave device.
- [ ] All 4 migrations forward + reverse cleanly; tested against an empty DB AND against a DB with existing Plan-04 / Plan-06 / Plan-07 / T1 rows.
- [ ] All new RLS uses `public.safe_uuid_sub()`; `backend/scripts/diagnose-text-consult-jwt.ts` still returns "✅ Verdict: secret MATCHES" after every sub-batch.
- [ ] 1000-message session scrolls at 60 fps on a mid-tier Android device with virtualization on.
- [ ] Backend + frontend type-check + lint clean.
- [ ] Backend + frontend test suites green.
- [ ] One docs PR adds a brief "text consult features" runbook to `docs/Work/runbooks/` covering doctor-side "pinned messages", "edit window", "rate-limit triage", "push subscription debug".

---

## Documentation hygiene

When an item ships:

1. Mark it ✓ in this file's tier section (with date).
2. Update the source plan's `Status` row for that item from `[SELECTED 2026-04-28]` → `[SHIPPED YYYY-MM-DD]`.
3. Update the [text-consult roadmap index](../../../Product%20plans/text-consult/plan-00-text-consult-roadmap.md) tier row's status snapshot if the whole tier (or the selected subset) is done.
4. If an item is dropped mid-batch, add a "Dropped" row in this doc with the reason, and revert the source plan's `[SELECTED]` marker to `[DEFERRED]` with a note pointing here.

---

## References

- [Text consult roadmap index](../../../Product%20plans/text-consult/plan-00-text-consult-roadmap.md)
- [T1 — Quick wins](../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- [T2 — Real polish](../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- [T5 — Reliability / safety / scale](../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- [T6 — Mobile native niceties](../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- [Foundation: Plan F04 — text-consult Supabase backbone](../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md) (`safe_uuid_sub()` invariant)
- [Foundation: Plan F06 — companion text channel](../../../Product%20plans/text-consult/plan-f06-companion-text-status.md) (three-host parity; system-message enum)
- [Foundation: Plan F07 — recording replay & history](../../../Product%20plans/text-consult/plan-f07-recording-replay-status.md) (`mode='readonly'` invariant)
- [Foundation: Plan F10 — AI clinical assist](../../../Product%20plans/text-consult/plan-f10-ai-clinical-assist-status.md) (explains why T3 is excluded)
- [Sibling batch: Voice consult selected features](./plan-voice-consult-selected-features.md) (Sub-batch 0 companion-chat hotfix; T5.32 push backend share)
- [Deferred: date-locale hydration sweep](../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md) (T1.4 day-separator locale)

---

**Owner:** TBD (one or two devs depending on slicing).  
**Created:** 2026-04-28.  
**Status:** Drafted; awaiting commit-start. Recommended order: **A → B → C → D**. T3 and T4 are explicitly out of scope for this batch (T3 blocked on Plan 10; T4 deferred for usage data). Tell me which sub-batch to start with and I'll switch to Agent mode and begin.
