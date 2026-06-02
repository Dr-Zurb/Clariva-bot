# text-consult-selected-features — execution order

> Sibling document of [`plan-text-consult-selected-features.md`](../../Plans/plan-text-consult-selected-features.md) and the task index [`README.md`](./README.md). The plan covers what and why; the README enumerates the task files; **this doc covers who-runs-what-when and which model.**

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)

**Sibling batches that have already shipped reusable foundation work:**

- **Video Sub-batch E.5** shipped [`frontend/hooks/useTabPresenceClaim.ts`](../../../../../../frontend/hooks/useTabPresenceClaim.ts) — **text D2** is now mostly mount + smoke (~1 day, not the full ~6h spec).
- **Video Sub-batch F.4** shipped `frontend/public/sw.js` (messaging service worker) — **text D6b** has the SW already partially extended; this batch's text-push handler stacks on top instead of starting fresh.

**Cross-batch coordination point:**

- **text D6a ↔ voice C3.** Both batches need `push-notification-service.ts` + `web_push_subscriptions` table + VAPID keys. **Whichever batch ships D6a first owns the file**; the other consumes. Voice C3 is gated on this — see [`EXECUTION-ORDER-voice.md` § Wave 6 Lane β](./EXECUTION-ORDER-voice.md). The text batch is the recommended owner because the text batch's Sub-batch D has the full D6a/b/c trio specced; the voice batch can mount voice push as a thin consumer.

**Status:** All 32 tasks **Drafted**. Recommended next chat = Wave 1 Lane α (start with A2 in a fresh Composer 2 Fast chat — cheapest warm-up).

---

## Wave plan (8 waves)

```
Wave 1 (Sub-batch A quick wins — ~10h, 2 parallel lanes — fully independent):
  Lane α  ──── A2 (XS, Composer 2) ──> A1 (S, Auto) ──> A3 (S, Auto) ──> A7 (M, Auto)                  [composer chrome + pill + send-button states + delivered/seen presence]
  Lane β  ──── A4 (S, Auto) ──> A5 (S, Auto) ──> A6 (S, Auto)                                          [day separators + typing-indicator + failed-send retry polish]

Wave 2 (Sub-batch B schema + refactor — ~7h, single lane sequential):
  Lane α  ──── B1 (M, Opus 4.7) ──> B2 (S, Auto)
                                                                                                       [migration (reactions table + view + 2 RLS + auto-unpin trigger) + extract <MessageBubble>]

Wave 3 (Sub-batch B fan-out — ~31h, 2 parallel lanes — fully independent):
  Lane α  ──── B3 (M, Auto) ──> B4 (M, Auto) ──> B5 (M, Auto) ──> B6 (M, Auto) ──> B7 (M, Auto)        [<MessageBubble> body extensions: markdown / reply / reactions / edit-delete / pinned]
  Lane β  ──── B8 (M, Auto) ──> B9 (S, Auto)                                                           [composer extensions: multi-attachment + drag-and-drop]

Wave 4 (Sub-batch C mobile native polish — ~33h, 2 parallel lanes — fully independent):
  Lane α  ──── C1 (S, Auto) ──> C2 (M, Auto) ──> C7 (M, Auto)                                          [camera attachment polish + image lightbox + PWA share-target]
  Lane β  ──── C3 (M, Auto) ──> C4 (S, Auto) ──> C5 (M, Auto) ──> C6 (S, Auto)                          [voice dictation + long-press reactions + swipe-to-reply + kbd shortcuts]

Wave 5 (Sub-batch D warm-up + virtualization — ~5 days, 2 parallel lanes — fully independent):
  Lane α  ──── D1 (S, Composer 2) ──> D2 (S, Auto)                                                     [composer-draft crash recovery + multi-tab kick (mounts video E.5 hook)]
  Lane β  ──── D3 (L, Auto)                                                                            [message-list virtualization with react-virtuoso — preserves A1 + A4 semantics]

Wave 6 (Sub-batch D telemetry + rate-limit — ~13h, single lane sequential):
  Lane α  ──── D4 (M, Auto) ──> D5 (M, Opus 4.7)
                                                                                                       [chat-quality telemetry migration + RLS-rewrite for rate-limit (RLS rewrite → hard-rules #1)]

Wave 7 (Sub-batch D push backend trio — ~5 days, single lane sequential):
  Lane α  ──── D6a (L, Auto) ──> D6b (L, Auto) ──> D6c (M, Auto)
                                                                                                       [push migration + service / subscribe + opt-in + SW handler / end-to-end verification]

Wave 8 (Sub-batch D local browser-push fallback — ~6h, single lane sequential):
  Lane α  ──── D7 (M, Auto)
                                                                                                       [tab-hidden fallback; ships after D6 so SW handler exists]
```

**Total wall-clock with parallelism:** ~26 dev-days (~5.5 weeks) for a single engineer running both lanes in worktrees where Shape B applies.

**Total agent-time (sequential equivalent):** ~32 dev-days (~6.5 weeks) for a single engineer running every lane back-to-back.

The bottleneck is **Wave 3 (~31h / ~4 dev-days)** — Lane α is single-sequential by design because all five tasks (B3–B7) extend `<MessageBubble>` and reasonable file overlap means we don't fan-out further. Lane β is independent (composer surfaces) and finishes ~2 days ahead, leaving spare cycles to pre-read Wave 4 / draft the Sub-batch C task pre-load lists.

**Why Shape B (parallel) lanes in Waves 1, 3, 4, 5 are legitimate:**

- **Wave 1 (A quick wins):** Lane α touches the composer footer + jump-to-latest pill + send-button state machine + the presence channel for delivered/seen (`viewed-bottom` broadcast). Lane β touches the message-list rendering (day separators) + typing-indicator avatar + failed-send retry styling. The §5 lane gate passes all six points: (1) both lanes can run from t=0 against `main`. (2) Lane α touches `<TextConsultRoom>` composer area + a new `<TextChatJumpToLatest>` component; Lane β touches `<TextConsultRoom>` message-list area + a new typing-indicator extract — overlap on `<TextConsultRoom>` is real but disjoint by function (one footer-ward, one list-ward). (3)/(4) Neither lane reads the other's WIP mid-wave. (5) No task in Wave 1 consumes outputs from both lanes. (6) Each lane ≥ 5h. **Coordinate at PR time on the `<TextConsultRoom>` import block** if both lanes touch the imports.
- **Wave 3 (B fan-out):** Lane α (`B3` → `B4` → `B5` → `B6` → `B7`) lives entirely inside `<MessageBubble>` (post-B2 extraction) + supporting modules (`markdown-lite`, `<QuotedParentPreview>`, `<ReactionPicker>`, edit-mode state, pinned-messages banner). Lane β (`B8` → `B9`) lives in the composer + new `<MultiAttachmentComposer>` + `<AttachmentDropZone>`. The §5 lane gate passes: disjoint files (Lane α = `<MessageBubble>` and message-render path, Lane β = composer and attachment pipeline); both lanes ≥ several hours; only convergence happens at the wave gate.
- **Wave 4 (C mobile native polish):** Lane α (camera + lightbox + PWA share-target) lives in camera APIs + lightbox primitive + manifest + SW route. Lane β (dictation + long-press + swipe-to-reply + kbd shortcuts) lives in WebSpeech API + bubble gesture handlers + global keyboard handlers. Disjoint files, no convergence.
- **Wave 5 (D warm-up + virtualization):** Lane α (`D1` crash recovery + `D2` multi-tab kick) lives in a new `useComposerDraft` hook + mount of video E.5's already-shipped `useTabPresenceClaim`. Lane β (`D3` virtualization) lives in `<TextConsultRoom>` message-list refactor + `react-virtuoso` integration. Lane β is a structural refactor — bias toward isolating it in its own lane so the chat owning it can keep `<TextConsultRoom>` in heavy edit mode without colliding with Lane α's tiny touches.

**Why every other wave is single-lane (no parallelism):**

- **Wave 2 (B1 → B2):** B1 is the migration; B2 is the refactor extract that everything in Wave 3 builds on. Both gate the rest of the batch — one chat owning the schema then handing to the refactor chat keeps the dependency cliff clean per [`EXECUTION-ORDER-GUIDELINES.md` §0.5 "Cut 1 — Dependency cliff"](../../../../../EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). The Opus chat for B1 stays focused on the migration; switch to Auto for B2's mechanical refactor.
- **Wave 6 (D4 → D5):** D4 ships its own migration + table + telemetry ingest endpoint; D5 rewrites the existing chat-insert RLS to add the rate-limit gate. RLS rewrites are the highest-blast-radius surface in the whole batch — single sequential lane keeps the rewrite isolated.
- **Wave 7 (D6a → D6b → D6c):** Push trio is a hard sequential dependency chain (D6b needs D6a's backend; D6c needs both). Single sequential lane.
- **Wave 8 (D7):** One task; nothing to parallelise.

---

## Lane-by-lane details

### Wave 1 — Sub-batch A quick wins (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [A2](./task-text-A2-composer-footer-hints-and-counter.md) | XS | Composer 2 Fast | This task file; `frontend/components/consultation/TextConsultRoom.tsx` (the composer footer area); source plan T1.2 + T1.6. | Two-in-one quick win (keyboard hints + char counter). Composer's sweet spot — 30-LOC dismissable hints + a 20-LOC counter helper. |
| 1 (Lane α) | [A1](./task-text-A1-jump-to-latest-pill.md) | S | Auto | This task file; `<TextConsultRoom>` (`wasAtBottomRef` + INSERT subscription path); source plan T1.1. | New `<TextChatJumpToLatest>` (~50 LOC) + counter state in host. |
| 2 (Lane α) | [A3](./task-text-A3-send-button-states.md) | S | Auto | This task file; `<TextConsultRoom>` send-button area + send-pipeline state; source plan T1.3. | State-machine extension on the send button (idle / ready / sending / queued). |
| 3 (Lane α) | [A7](./task-text-A7-delivered-seen-indicators.md) | M | Auto | This task file; post-A1/A2/A3 (sibling); `<TextConsultRoom>` Supabase presence channel; source plan T1.5. | Extends presence channel with a `viewed-bottom` broadcast. **Ship LAST in Lane α** because presence-channel changes have the largest blast radius in this lane. |
| 0 (Lane β) | [A4](./task-text-A4-day-separators.md) | S | Auto | This task file; `<TextConsultRoom>` message-list render path; source plan T1.4. | Pure presentational; bucket messages by day with sticky separator labels. |
| 1 (Lane β) | [A5](./task-text-A5-typing-indicator-polish.md) | S | Auto | This task file; `<TextConsultRoom>` presence channel + typing indicator render; `frontend/tailwind.config.ts` (add the dot-pulse keyframe); source plan T1.7. | Avatar dot + animated three-dots replacement. |
| 2 (Lane β) | [A6](./task-text-A6-failed-send-retry-polish.md) | S | Auto | This task file; `<TextConsultRoom>` failed-send branch (existing error state) + send-retry pipeline; source plan T1.8. | Red-bordered bubble + inline retry/discard buttons. |

**Branch suggestion:** `feature/text-A-quick-wins-alpha` (Lane α) and `feature/text-A-quick-wins-beta` (Lane β), both branched from `main`. Merge to `feature/text-A-quick-wins-merge` at the wave gate; Wave 2 stacks on the merged branch.

### Wave 2 — Sub-batch B schema + refactor (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [B1](./task-text-B1-t2-chat-polish-migration.md) | M | **Opus 4.7 Extra High** | This task file; `backend/migrations/082_*.sql` (last text-consult RLS hardening — the precedent for the new RLS shape); `backend/migrations/062_*.sql` (attachments migration — pattern for nullable cols + batch_id); `backend/src/utils/safe-uuid-sub.ts` (the RLS invariant per Plan F04); source plan T2 § schema. | **Opus per hard-rules list #1 + #3** (new migration with 2 RLS policies + new view + auto-unpin trigger; reactions table FKs `consultation_messages`). Migration claims `083_text_t2_chat_polish.sql`. Run `backend/scripts/diagnose-text-consult-jwt.ts` after applying to verify no regression. |
| 1 | [B2](./task-text-B2-message-bubble-extract.md) | S | Auto | This task file; `<TextConsultRoom>` (the entire ~1760-line file — the inline message-bubble JSX block lives ~mid-file); source plan T2 § refactor precondition. | Mechanical extract of inline JSX into `<MessageBubble>` + per-message Realtime subscription preservation. Auto handles this cleanly; per-message escalate to Opus only if React.memo + key strategy choice gets non-obvious. |

**Branch suggestion:** `feature/text-B-schema-refactor`. Opus chat for B1; new Auto chat for B2 — start of a new topic per the [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § One topic per chat rule](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#2-one-topic-per-chat).

### Wave 3 — Sub-batch B fan-out (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [B3](./task-text-B3-markdown-lite-renderer.md) | M | Auto | This task file; post-B2 (`<MessageBubble>` exists); new `frontend/lib/markdown/markdown-lite.ts` (XSS-safe by construction — 5 inline + 1 block); source plan T2.13. | Replace plain-text body render with `<MarkdownLite>` inside `<MessageBubble>`. |
| 1 (Lane α) | [B4](./task-text-B4-reply-to-message.md) | M | Auto | This task file; post-B3 (markdown render lives inside `<QuotedParentPreview>` too); `<TextConsultRoom>` composer + scroll-to-parent logic; source plan T2.10. | Composer reply-affordance + `<QuotedParentPreview>` + reply-id column (already on schema from B1). |
| 2 (Lane α) | [B5](./task-text-B5-message-reactions.md) | M | Auto | This task file; post-B4 (sibling); `<MessageBubble>` per-bubble menu (introduced here and reused by B6/B7); new `<ReactionPicker>` + Supabase Realtime subscription on the reactions table from B1; source plan T2.9. | New `<ReactionPicker>` + aggregated badge renderer. |
| 3 (Lane α) | [B6](./task-text-B6-edit-and-soft-delete-window.md) | M | Auto | This task file; post-B5 (per-bubble menu); `<TextConsultRoom>` time-ticker for the 60s window; source plan T2.11 + T2.12. | Edit mode + soft-delete; view nulls body after delete (per B1 view definition). |
| 4 (Lane α) | [B7](./task-text-B7-pinned-messages.md) | M | Auto | This task file; post-B6 (per-bubble menu); new `<PinnedMessagesBanner>` (doctor-only, 3-cap); auto-unpin trigger from B1; source plan T2.14. | Doctor-only mutation; banner mounts at top of message list. |
| 0 (Lane β) | [B8](./task-text-B8-multi-attachment-composer.md) | M | Auto | This task file; post-B2 (`<MessageBubble>` exists for batch-id grouping render); `<TextConsultRoom>` attachment upload path (Plan 06 / migration 062); source plan T2.15. | New `<MultiAttachmentComposer>` + batch_id grouping (column from B1). Up to 5 attachments per batch. |
| 1 (Lane β) | [B9](./task-text-B9-drag-and-drop-attachment.md) | S | Auto | This task file; post-B8 (attachment pipeline); `<TextConsultRoom>` drop-zone area; source plan T2.17. | Desktop only (standalone + canvas layouts). Mobile not supported (silent-degrade). |

**Branch suggestion:** `feature/text-B-bubble-alpha` (Lane α) and `feature/text-B-composer-beta` (Lane β), both stacked on Wave 2's branch.

### Wave 4 — Sub-batch C mobile native polish (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [C1](./task-text-C1-camera-attachment-polish.md) | S | Auto | This task file; `<TextConsultRoom>` composer attachment area; existing attachment upload path; source plan T6.41. | In-composer camera button + preview + "switch to gallery". |
| 1 (Lane α) | [C2](./task-text-C2-image-lightbox.md) | M | Auto | This task file; new `<ImageLightbox>` (full-screen + pinch-zoom + prev/next + swipe-down dismiss); message-list image-render path; source plan T6.39. | Pure frontend; no schema. Replaces inline image render with click-to-expand. |
| 2 (Lane α) | [C7](./task-text-C7-pwa-share-target.md) | M | Auto | This task file; `frontend/public/manifest.json` (add `share_target` block); `frontend/public/sw.js` (extend with POST intercept — already extended for video F.4 + future text D6b); new `/c/share-target` route; source plan T6.42. | PWA manifest + SW intercept + new route to drop received share into the active text consult composer. |
| 0 (Lane β) | [C3](./task-text-C3-voice-dictation.md) | M | Auto | This task file; `<TextConsultRoom>` composer textarea; Web Speech API (`SpeechRecognition`) docs; source plan T6.40. | Locale-aware; partials stay local-only (no PHI in transcript before commit). |
| 1 (Lane β) | [C4](./task-text-C4-long-press-reactions.md) | S | Auto | This task file; post-Wave-3 B5 (reactions exist); `<MessageBubble>` long-press handler + `navigator.vibrate(15)`; source plan T6.37. | Soft-dep on Wave 3 Lane α's B5 — verify B5 shipped before opening this. |
| 2 (Lane β) | [C5](./task-text-C5-swipe-to-reply.md) | M | Auto | This task file; post-Wave-3 B4 (reply-to-message exists); `<MessageBubble>` swipe handler + spring-back animation; source plan T6.36. | Soft-dep on Wave 3 Lane α's B4. |
| 3 (Lane β) | [C6](./task-text-C6-hardware-keyboard-shortcuts.md) | S | Auto | This task file; post-Wave-3 B6 (edit-mode exists for the ↑ shortcut); `<TextConsultRoom>` global keydown handler; source plan T6.38. | Esc clear / ↑ edit-last (soft-dep on B6) / Cmd+Enter force-send. |

**Branch suggestion:** `feature/text-C-polish-alpha` (Lane α) and `feature/text-C-gestures-beta` (Lane β), both stacked on Wave 3's merged branch.

### Wave 5 — Sub-batch D warm-up + virtualization (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [D1](./task-text-D1-composer-draft-crash-recovery.md) | S | Composer 2 Fast | This task file; `<TextConsultRoom>` composer state; new `frontend/hooks/useComposerDraft.ts` (~50 LOC, sessionStorage; clears on send); source plan T5.30. | Cheapest item in Sub-batch D. Composer-tier — pure sessionStorage hook + one mount site. |
| 1 (Lane α) | [D2](./task-text-D2-multi-tab-kick.md) | S | Auto | This task file; `frontend/hooks/useTabPresenceClaim.ts` (shipped by video E.5 — REUSE verbatim with `role='patient'` and text-specific `consult-tab-presence-${sessionId}` channel name); `frontend/components/consultation/MultiTabKickBanner.tsx` (shipped by video E.5 — REUSE); `<TextConsultRoom>` mount point; source plan T5.29. | Hook already shipped by video E.5 per [E.5 spec "ship the foundation here per voice C4 contract" (extends to text D2 by the same hook-reuse pattern)](./EXECUTION-ORDER-video.md). Mount + smoke. Reduced from M to S. |
| 0 (Lane β) | [D3](./task-text-D3-message-list-virtualization.md) | L | Auto | This task file; `<TextConsultRoom>` message-list render (post-Wave 3 B5 + B6 + B7 — bubbles are mature); `react-virtuoso` docs (`pnpm list react-virtuoso` to confirm installed; if not, task installs); the A1 `wasAtBottomRef` semantics (must preserve); the A4 day-separator render (must integrate); source plan T5.33. | **Structural refactor** — bias toward isolating in its own lane per [`EXECUTION-ORDER-GUIDELINES.md` §7](../../../../../EXECUTION-ORDER-GUIDELINES.md#7-sequential-vs-parallel--bias-hard-toward-sequential). Auto with per-message escalation to Opus if virtuoso integration + day-separator sticky behavior collide. Threshold: virtualize only when message count > 100. |

**Branch suggestion:** `feature/text-D-warmup-alpha` (Lane α) and `feature/text-D-virtualization-beta` (Lane β), both stacked on Wave 4's merged branch.

### Wave 6 — Sub-batch D telemetry + rate-limit (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [D4](./task-text-D4-chat-quality-telemetry.md) | M | Auto | This task file; `backend/migrations/086_video_call_quality.sql` (video E.7 precedent for `text_chat_quality` table + RLS shape); `backend/src/services/safe-uuid-sub.ts`; new `backend/src/services/text-chat-quality-service.ts` mirroring video E.7's pattern; source plan T5.35. | New migration `084_text_chat_quality.sql` (or next free) + ingest endpoint + frontend sampler + doctor-side badge. Auto with **per-message escalate to Opus for the migration's RLS spec turn** — the precedent makes this safe but the RLS-write turn deserves one Opus message. |
| 1 | [D5](./task-text-D5-rate-limit-rls-and-toast.md) | M | **Opus 4.7 Extra High** | This task file; `backend/migrations/082_*.sql` + the most recent text-consult RLS policies on `consultation_messages` (the policies this task **rewrites**); new `check_chat_insert_rate()` SQL function; `<TextConsultRoom>` toast surface for rate-limit hits; source plan T5.34. | **Opus per hard-rules list #1 + #3** — **rewrites** existing RLS policy on `consultation_messages` to add the rate-limit gate. RLS rewrites are the highest-blast-radius surface in the whole batch; rewriting wrong silently disables doctor-side message inserts. Migration `085_text_rate_limit.sql` (or next free). |

**Branch suggestion:** `feature/text-D-telemetry-rate-limit`. Auto chat for D4; new Opus chat for D5 — start of a new topic per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § One topic per chat](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#2-one-topic-per-chat).

### Wave 7 — Sub-batch D push backend trio (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [D6a](./task-text-D6a-web-push-migration-and-service.md) | L | Auto | This task file; new `backend/migrations/0XX_web_push_subscriptions.sql`; new `backend/src/services/push-notification-service.ts`; `.env.example` (add VAPID keys); source plan T5.32 part 1/3. | **First batch to ship push owns the file** — coordinate at PR time with voice C3. Auto with **per-message escalate to Opus for the migration's RLS spec turn** (subscriptions table is doctor- AND patient-scoped; RLS isolation matters). Two safe escalations budgeted in this wave. |
| 1 | [D6b](./task-text-D6b-push-subscribe-and-opt-in.md) | L | Auto | This task file; post-D6a; new `subscribePushHandler` + `unsubscribePushHandler` controllers; `<TextConsultRoom>` opt-in CTA flow; `frontend/public/sw.js` extension (push handler — stacks on F.4's existing message handler); source plan T5.32 part 2/3. | Frontend opt-in + SW push handler. Largest item in Wave 7 by frontend LOC. |
| 2 | [D6c](./task-text-D6c-push-end-to-end-verification.md) | M | Auto | This task file; post-D6b; end-to-end smoke checklist; cross-modality suppression rule (no push when text tab is active); source plan T5.32 part 3/3. | Verification + active-tab suppression rule. |

**Branch suggestion:** `feature/text-D-push-trio`. Single chat per task — D6a/b/c are big enough to warrant fresh chats per task.

### Wave 8 — Sub-batch D local browser-push fallback (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [D7](./task-text-D7-local-browser-push.md) | M | Auto | This task file; post-Wave 7 (SW push handler exists); `<TextConsultRoom>` tab-visibility detection; inline PHI redactor (message preview must not contain raw body when no PWA subscription); source plan T5.31. | Tab-hidden fallback when no PWA subscription. Wave 7 must ship first so the SW handler is in place. |

**Branch suggestion:** `feature/text-D-local-push`. Single Auto chat.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| A1 | S | Auto | Existing `wasAtBottomRef` + INSERT subscription path; bounded pill + counter. |
| A2 | XS | Composer 2 Fast | Two-in-one quick chip + counter. Composer's sweet spot per [Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns). |
| A3 | S | Auto | Send-button state machine; bounded. |
| A4 | S | Auto | Pure presentational; bucket by day. |
| A5 | S | Auto | Tailwind keyframe + render. |
| A6 | S | Auto | Failed-send branch; existing state. |
| A7 | M | Auto | Presence channel extension — largest blast radius in Wave 1. Per-message escalate to Opus only if a presence-channel race surprises. |
| B1 | M | **Opus 4.7 Extra High** | New migration with 2 RLS policies + view + trigger; reactions FKs `consultation_messages`. Hard-rules #1 + #3. |
| B2 | S | Auto | Mechanical extract; well-precedented. |
| B3 | M | Auto | XSS-safe-by-construction markdown lite; bounded. |
| B4 | M | Auto | Composer reply UI + scroll-to-parent; B3 markdown in `<QuotedParentPreview>`. |
| B5 | M | Auto | Reactions UI + Realtime channel; uses B1 schema. |
| B6 | M | Auto | Edit + soft-delete + 60s ticker. |
| B7 | M | Auto | Doctor-only banner + auto-unpin trigger (already in B1's migration). |
| B8 | M | Auto | Multi-attachment composer + batch_id grouping (column from B1). |
| B9 | S | Auto | Drag-and-drop handler on top of B8 pipeline; desktop-only. |
| C1 | S | Auto | Camera input + preview; bounded. |
| C2 | M | Auto | Lightbox primitive — pinch-zoom is the trickiest bit; many React libraries; pick one with a permissive license. |
| C3 | M | Auto | Web Speech API integration; locale-aware; partials local-only. |
| C4 | S | Auto | Long-press handler + haptic. Soft-dep on B5. |
| C5 | M | Auto | Swipe gesture + spring-back. Soft-dep on B4. |
| C6 | S | Auto | Global keydown handlers. Soft-dep on B6. |
| C7 | M | Auto | PWA share-intent + SW route. |
| D1 | S | Composer 2 Fast | `useComposerDraft` hook + mount site. Composer-tier. |
| D2 | S | Auto | Mount of video E.5's already-shipped hook. Reduced scope. |
| D3 | L | Auto | Virtualization is structural but well-precedented; per-message escalate to Opus only if virtuoso + day-separator sticky behaviors collide. |
| D4 | M | Auto | New migration mirroring video E.7's pattern; per-message escalate to Opus for the RLS-write turn. |
| D5 | M | **Opus 4.7 Extra High** | RLS rewrite on `consultation_messages` — highest blast radius in batch. Hard-rules #1 + #3. |
| D6a | L | Auto | Migration + service mirroring video E.7's RLS pattern; per-message escalate to Opus for the RLS-write turn. |
| D6b | L | Auto | Frontend + SW handler; mechanical but large. |
| D6c | M | Auto | Verification + suppression. |
| D7 | M | Auto | Tab-hidden fallback + PHI redactor. |

**Opus caps:** ≤ 1 per wave (Wave 2: B1; Wave 6: D5). ≤ 2 per batch (B1 + D5 = exactly 2). Strict cap met.

**Per-message Opus escalations budgeted:** A7 (presence-channel race), D3 (virtuoso + day-separator), D4 (RLS spec), D6a (RLS spec). Each is one expected Opus turn inside an otherwise-Auto chat — don't switch the whole chat over.

**Composer 2 Fast budget:** A2, D1 = 2 tasks (~6% of batch by count; conservative because Sub-batch B and Sub-batch D dominate and they're not Composer-tier). Increase if any Sub-batch A/C task turns out tighter than spec'd.

---

## Acceptance gates per wave

### Wave 1 gate (after A1 + A2 + A3 + A4 + A5 + A6 + A7)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Lane α surfaces:** composer footer renders dismissable keyboard hint + char counter (500+ display, 4000 hard cap); jump-to-latest pill appears within ~100ms of INSERT-while-scrolled-up; send button transitions through idle / ready / sending / queued; delivered ✓ / seen ✓✓ indicators update within ~1s of counterparty scroll-to-bottom.
- [ ] **Lane β surfaces:** day separators render Today / Yesterday / "Mon, 28 Apr" correctly; typing indicator shows animated dots with counterparty avatar; failed-send bubble renders red-bordered with inline retry/discard.
- [ ] `mode='readonly'` hides every new mutation affordance (composer footer / send button / pill).
- [ ] All three layouts (`standalone` / `panel` / `canvas`) render correctly.
- [ ] No PHI in console / Sentry / analytics (message bodies stay local).

### Wave 2 gate (after B1 + B2)

- [ ] All Wave 1 gates still green.
- [ ] Migration `083_text_t2_chat_polish.sql` applies cleanly on fresh DB AND on DB with rows; reverse migration verified.
- [ ] `backend/scripts/diagnose-text-consult-jwt.ts` confirms no RLS regression.
- [ ] **RLS smoke** — Doctor A INSERT on Patient B's consult returns 403 (no cross-tenant leak via the new reactions table or the new view).
- [ ] Reactions table FKs `consultation_messages` correctly; auto-unpin trigger fires on edit-window expiry.
- [ ] `<MessageBubble>` extracted; every existing message renders pixel-identical to pre-B2 (visual regression check at standalone + panel + canvas layouts).
- [ ] Per-message Realtime subscriptions preserved (no over-subscribe or under-subscribe).

### Wave 3 gate (after B3 + B4 + B5 + B6 + B7 + B8 + B9)

- [ ] All Wave 2 gates still green.
- [ ] **Lane α surfaces:** markdown-lite renders bold / italic / underline / strike / code + blockquote (the only block); reply-to-message UI works end-to-end with `<QuotedParentPreview>` and scroll-to-parent; reactions add / remove / aggregate correctly; edit + soft-delete works within the 60s window; pinned messages render in `<PinnedMessagesBanner>` (doctor-only, 3-cap, auto-unpin on edit-window expiry).
- [ ] **Lane β surfaces:** multi-attachment composer supports up to 5 files with batch_id grouping; drag-and-drop works on desktop (standalone + canvas only).
- [ ] All Wave 3 surfaces respect `mode='readonly'`.

### Wave 4 gate (after C1 + C2 + C7 + C3 + C4 + C5 + C6)

- [ ] All Wave 3 gates still green.
- [ ] **Lane α surfaces:** in-composer camera button + preview + "switch to gallery"; image lightbox with pinch-zoom + prev/next + swipe-down dismiss; PWA share-target receives shared content into the active text consult.
- [ ] **Lane β surfaces:** voice dictation works with WebSpeech API (partials local-only); long-press for reactions (300ms + 15ms vibrate); swipe-to-reply (drag right ~60px + spring-back); hardware keyboard shortcuts (Esc clear / ↑ edit-last / Cmd+Enter force-send).
- [ ] No PHI in WebSpeech partials buffer (cleared on commit / cancel).

### Wave 5 gate (after D1 + D2 + D3)

- [ ] All Wave 4 gates still green.
- [ ] **Lane α surfaces:** composer-draft survives crash + reload (sessionStorage); multi-tab kick — opening text consult in a second patient tab kicks the older tab.
- [ ] **Lane β surfaces:** virtualization activates only when message count > 100; A1 jump-to-latest still works correctly; A4 day separators still render at viewport edges (sticky behavior preserved); scroll performance smooth at 1000+ messages.
- [ ] Hook unit tests added to `frontend/hooks/__tests__/useTabPresenceClaim.test.ts` (deferred by video E.5 to text D2 / voice C4 pickup — close the loop here OR in voice C4, whichever ships first).

### Wave 6 gate (after D4 + D5)

- [ ] All Wave 5 gates still green.
- [ ] Migration `084_text_chat_quality.sql` applies cleanly; RLS uses `safe_uuid_sub()`.
- [ ] `POST /api/v1/consultation/:sessionId/text-chat-quality` ingests samples (doctor JWT + patient HMAC both pass auth); doctor-side badge displays sampled quality.
- [ ] Migration `085_text_rate_limit.sql` applies cleanly; `check_chat_insert_rate()` SQL function correctly rate-limits inserts; RLS rewrite verified by `backend/scripts/diagnose-text-consult-jwt.ts` (no regression on the existing `consultation_messages` access patterns).
- [ ] Doctor-side toast surfaces when patient hits the rate-limit (informational; doesn't block the doctor).
- [ ] No legitimate user (doctor or patient at normal pace) hits the rate-limit during a 10-message smoke session.

### Wave 7 gate (after D6a + D6b + D6c)

- [ ] All Wave 6 gates still green.
- [ ] Migration `0XX_web_push_subscriptions.sql` applies cleanly; RLS isolates doctor + patient subscriptions correctly.
- [ ] VAPID keys provisioned in `.env` (dev) and target environments (staging / prod).
- [ ] `push-notification-service.ts` sends to subscribed endpoints; SW push handler shows notification with `tag: session_id:text`.
- [ ] Subscribe / unsubscribe round-trip works; opt-in CTA renders correctly.
- [ ] Active-tab suppression: no push when text tab is foreground (verified in DevTools Network tab).
- [ ] Cross-modality coordination: text push and (future) voice push don't replace each other in OS tray (`tag` discriminator).
- [ ] **Cross-batch unblock:** [`EXECUTION-ORDER-voice.md` Wave 6 Lane β](./EXECUTION-ORDER-voice.md) is now unblocked — voice C3 can ship as a thin consumer of D6a's service.

### Wave 8 gate (after D7)

- [ ] All Wave 7 gates still green.
- [ ] Local browser push fires when tab is hidden AND user has no PWA subscription.
- [ ] PHI redactor strips message body from local push payload (only sender role + char count in preview).
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–8 diff grading against this exec-order's gates + the cross-cutting acceptance criteria from [`plan-text-consult-selected-features.md`](../../Plans/plan-text-consult-selected-features.md). Skip if every deterministic gate passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | 7 | 6/7 | 1/7 | 0/7 | ~10h (parallel) / ~14h (sequential) |
| Wave 2 | 2 | 1/2 | 0/2 | 1/2 | ~7h |
| Wave 3 | 7 | 7/7 | 0/7 | 0/7 | ~31h (parallel) / ~38h (sequential) |
| Wave 4 | 7 | 7/7 | 0/7 | 0/7 | ~33h (parallel) / ~38h (sequential) |
| Wave 5 | 3 | 2/3 | 1/3 | 0/3 | ~5 days (parallel) / ~7 days (sequential) |
| Wave 6 | 2 | 1/2 | 0/2 | 1/2 | ~13h |
| Wave 7 | 3 | 3/3 | 0/3 | 0/3 | ~5 days |
| Wave 8 | 1 | 1/1 | 0/1 | 0/1 | ~6h |
| **Total** | **32** | **28** | **2** | **2** | **~26 dev-days (parallel) / ~32 (sequential)** |

**Opus budget:** B1 (~80–120k input + ~40–60k output ≈ $20–30 from the API pool) + D5 (~60–100k input + ~30–50k output ≈ $15–25). **Total Opus spend: ~$35–55** for the batch (excluding optional close-gate review).

**Per-message Opus escalations** (budgeted across A7, D3, D4, D6a): ~10–20k tokens each ≈ $3–5 per escalation × 4 = ~$15–20 additional Opus draw from the API pool.

**Auto + Composer budget:** ~2.5M input + ~1.3M output across 30 Auto/Composer chats. **Total Auto+Composer spend: ~$8–12** drawn from the cheaper Auto+Composer pool.

**Total batch spend: ~$60–90** plus the optional close-gate Opus turn (~$10–15).

---

## References

- [plan-text-consult-selected-features.md](../../Plans/plan-text-consult-selected-features.md) — the *what / why* sibling.
- [README.md](./README.md) — task index + dep graph + foundation invariants.
- [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) — sibling voice exec-order; documents the cross-batch push coordination point (voice C3 ↔ text D6a).
- [EXECUTION-ORDER-video.md](./EXECUTION-ORDER-video.md) — sibling video exec-order; documents the foundation work video E.5 shipped that text D2 mounts.
- [`Daily-plans/May 2026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md`](../../../../May%202026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md) — recent exec-order using the same conventions; visual / structural template.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list that drives B1 + D5 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Drafted; recommended next chat = Wave 1 Lane α (start with A2 in a fresh Composer 2 Fast chat — cheapest warm-up).
