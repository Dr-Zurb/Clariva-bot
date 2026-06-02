# Booking review redesign — Phase 3: depth + platform (detail drawer · mobile cards · keyboard triage) — 31 May 2026 batch plan

> **Phase 3 of the Booking-review redesign program — depth + platform.** Phase 1 made the inbox look native and surfaced SLA urgency; Phase 2 made it fast (quick-resolve, optimistic + undo, auto-refresh, filters). Phase 3 adds the **context to decide well** (a detail drawer with full match signals, candidates, and resolved audit), makes it **first-class on mobile** (stacked cards, not a scrolling table), and makes it **keyboard-clearable** (j/k/c/r/x + bulk select). Still **no backend changes** — the one item that would need backend (the live IG conversation) is explicitly carved out (see P3-BRR-2).
>
> **Source plan:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-DRAWER + R-MOBILE + R-KEYBOARD in §R-item details / §Sequencing Phase 3.
>
> **Builds on Phases 1–2 ([reskin+SLA](../p1-reskin/), [workflow](../p2-workflow/), shipped 2026-05-31).** The component is design-system-native with `ConfidenceBadge` / `SlaCountdown`, the `displayReviews` filter/sort pipeline, the optimistic/deferred-commit dispatcher + `ActionToast`, quick-resolve, and visibility-aware auto-refresh. Phase 3 adds surfaces *around* those; it does not change the action flow.
>
> **Prefix note:** tasks continue the `brr-*` numbering (Phase 1 = brr-01..04, Phase 2 = brr-05..09, Phase 3 = brr-10..13).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; four Auto (brr-10..13). The only Opus-candidate in the whole program — the doctor-scoped IG-conversation read endpoint — is **deferred out of this batch** (P3-BRR-2) precisely because it carries backend + RLS + PHI risk; this batch stays frontend-only.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p3-booking-review-depth.md`](./Tasks/EXECUTION-ORDER-p3-booking-review-depth.md).

---

## What Phase 3 does (one sentence)

> **Give staff the full context to decide (a right-side detail drawer with all match signals, candidate services, AI proposal/final, and the resolved-by/note audit), a real mobile experience (stacked review cards that open the same drawer), and keyboard-speed triage (selection + j/k/c/r/x and bulk-confirm) — all dispatching through the Phase-2 action flow, with the live IG conversation deferred to a separate backend-gated task.**

After Phase 3, a doctor can: click/tap a row to open a drawer with everything the matcher knew + who resolved it and why; work the queue on a phone without horizontal scrolling; and clear a run of confident items with the keyboard or a bulk-confirm. What Phase 3 does *not* ship is the live Instagram thread inside the drawer — that needs a new backend read and is carved out (P3-BRR-2 / BR-Q3).

---

## BR-Q3 resolution (the gating finding for this phase)

The product plan flagged **BR-Q3** ("can the drawer reuse the patients-v2 conversation read path, or is a new backend read needed?") as the gating unknown. Investigation settled it:

- The patients-v2 [`ConversationsTab`](../../../../../../frontend/components/patients-v2/tabs/ConversationsTab.tsx) does **not** render an IG DM thread — it lists *consultation sessions* (keyed off `consultation_session.id`) and links out. It cannot show the booking-review `conversation_id`.
- `conversation_id` on a review row is the **Instagram DM conversation** (used server-side for conversation *state* and to send DMs via `platform_conversation_id`, per [`service-staff-review-service.ts`](../../../../../../backend/src/services/service-staff-review-service.ts)). There is **no doctor-facing endpoint that returns the DM message transcript** — not in [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts), not in the backend v1 routes.
- Therefore rendering the live conversation requires a **new doctor-scoped read endpoint** (sanitized DM messages by `conversation_id`) with **RLS + PHI review** — real backend work and the one plausible Opus-tier task in the program.

**Decision (P3-BRR-2):** carve the conversation out of this batch. The drawer ships with everything already on the wire + a graceful conversation **placeholder** (and a deep-link if a safe one exists). The conversation read becomes its own scoped backend follow-up (spec sketch in §Out-of-scope) that later "lights up" the placeholder. This honours BR-DL-6 (conversation is additive, read-only) and BR-R4 (drawer degrades gracefully without the thread), and keeps Phase 3 frontend-only.

---

## What's already in place (so the scope stays bounded)

- **The row + action flow exist** — `displayReviews`, the optimistic/deferred-commit dispatcher (`deferred-commit.ts` + `ActionToast`), quick-resolve, and the 409 reconcile ([`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx)). Phase 3's drawer / mobile / keyboard all dispatch **through** these — no new call paths.
- **The drawer's content is already fetched** — `match_reason_codes`, `candidate_labels`, `match_confidence`, proposal/final keys, and the audit fields `resolved_by_user_id` + `resolution_internal_note` are on `ServiceStaffReviewListItem` ([`types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts)). The match-explain helper renders the signals copy. The drawer reshapes the existing inline "Show technical detail" expander into a `Sheet`.
- **The `Sheet` primitive exists** — [`frontend/components/ui/sheet.tsx`](../../../../../../frontend/components/ui/sheet.tsx) (right-side by default). No new primitive needed.
- **A keyboard-hook convention exists** — [`use-composer-hotkeys.ts`](../../../../../../frontend/lib/text/use-composer-hotkeys.ts) (effect-bound, priority-ordered, guards against firing while typing). Phase 3 mirrors this pattern.

Net new surface: **a `ReviewDetailSheet`, a `ReviewCard` (mobile), a keyboard/selection hook + bulk bar** — all under `frontend/components/service-reviews/` + `frontend/lib/service-reviews/`.

---

## Decision lock

The product plan's **BR-DL-1 .. BR-DL-9**, Phase 1's **P1-BRR-1..4**, and Phase 2's **P2-BRR-1..5** carry forward. Especially binding: **BR-DL-5 (PHI in-session, no new logging)**, **BR-DL-6 (conversation read-only/additive)**, **BR-DL-7 (actions reconcile)**, **BR-DL-8 (mobile cards)**.

These five are **Phase-3-specific**, frozen for this batch:

**P3-BRR-1 — The drawer replaces the inline expander and is frontend-only.** A right-side `Sheet` shows: full match summary + all reason codes (via the match-explain helper), candidate services considered, AI proposal + final visit type, and — for resolved rows — the audit (`resolved_by_user_id`, `resolution_internal_note`). All from data already fetched. It supersedes the "Show technical detail" expand-row. PHI renders in-session only (BR-DL-5).

**P3-BRR-2 — The live IG conversation is deferred to a scoped backend task (resolves BR-Q3).** No doctor-facing read endpoint exists for a DM thread by `conversation_id`. The drawer ships a graceful conversation **placeholder** ("Conversation view coming soon" + a safe deep-link if available); the read endpoint + RLS + PHI review is its own follow-up (spec in §Out-of-scope). Batch close does **not** depend on the conversation.

**P3-BRR-3 — Mobile is stacked cards, not the scrolling table (BR-DL-8).** Below `lg`, render `ReviewCard`s (patient, reason, AI proposal + `ConfidenceBadge`, `SlaCountdown`/queued-age, primary **Confirm** + an overflow menu for Reassign/Cancel); tapping a card opens the same `ReviewDetailSheet`. The desktop table stays `lg+`. The filter/sort toolbar + "N new" pill + toasts work in both.

**P3-BRR-4 — Keyboard + bulk dispatch through the Phase-2 flow, never a new call path (BR-DL-7 / P2-BRR-1).** Shortcuts (`j`/`k` move, `c` confirm, `r` reassign, `x` cancel, `Enter` open drawer, `/` focus filter, `?` help) act on the selected row via the existing dispatcher. Bulk-select → bulk-confirm fires per-row through the same deferred-commit dispatcher (per-row reconcile incl. 409); a single batch toast offers Undo over the batch. No bulk reassign/cancel in this phase.

**P3-BRR-5 — Shortcuts are inert while typing or in a dialog/drawer.** The keyboard handler ignores events when focus is in an input/textarea/select or a `Dialog`/`Sheet` is open (mirroring `use-composer-hotkeys` guards), so triage keys never fire mid-typing or over a modal. Accessible: visible focus, `aria` selection state, a discoverable `?` help, and no focus trap.

---

## Why this batch (Phase 3 specifically)

1. **Staff still decide from a one-line preview.** The matcher's full reasoning + the candidates it weighed are computed and hidden behind a cramped expander. A proper drawer turns a guess into an informed call — and the audit fields finally answer "who resolved this and why."
2. **The inbox is unusable on a phone.** The Phase-1/2 table degrades to horizontal scroll `<lg`. For a product whose users live on social media, a real mobile card view is table stakes (BR-DL-8).
3. **Volume needs keyboard speed.** Once the queue is filterable and actions are instant (Phase 2), the remaining bottleneck is the mouse. j/k/c/x + bulk-confirm makes clearing a run of confident items a few keystrokes.
4. **It closes the program's UI surface.** After Phase 3 the only open thread is the (backend-gated) live conversation — cleanly isolated for its own PHI-reviewed task.

This batch closes Phase 3 with **4 tasks across 3 waves**, **~6–10 dev-days**, **zero migrations, zero backend changes, zero Opus build tasks** (the conversation endpoint is deferred). Close-gate artifact: click/tap any row → a drawer with all signals + candidates + audit; shrink the viewport → stacked cards that open the same drawer; press `j j c` → the third row confirms (with Undo); select three rows → bulk-confirm with one Undo; and Confirm/Reassign/Cancel still send exactly what Phase 2 sent.

---

## Cross-cutting acceptance gate (whole batch)

### Detail drawer (brr-10)

- [ ] Clicking a row (desktop) opens a right `Sheet` with: match summary + all reason codes, candidate services, AI proposal + final visit type, and (resolved rows) `resolved_by_user_id` + `resolution_internal_note` (P3-BRR-1).
- [ ] The drawer replaces the inline "Show technical detail" expander.
- [ ] A graceful conversation placeholder renders (no backend call); drawer works fully without it (P3-BRR-2 / BR-R4).
- [ ] PHI renders in-session only; nothing logged (BR-DL-5).

### Mobile cards (brr-11)

- [ ] `<lg` renders stacked `ReviewCard`s (no horizontal scroll); each shows patient, reason, proposal + `ConfidenceBadge`, SLA/queued-age, Confirm + overflow (Reassign/Cancel); tap opens the drawer (P3-BRR-3 / BR-DL-8).
- [ ] `lg+` still renders the desktop table; toolbar + "N new" pill + toasts work in both.

### Keyboard + bulk (brr-12)

- [ ] `j`/`k` move selection; `c`/`r`/`x` act on the selected row; `Enter` opens the drawer; `/` focuses filter; `?` shows help (P3-BRR-4).
- [ ] Bulk-select → bulk-confirm fires per-row via the deferred-commit dispatcher (per-row 409 reconcile); one batch toast offers Undo over the batch.
- [ ] Shortcuts are inert while typing or while a `Dialog`/`Sheet` is open; visible focus + `aria` selection; no focus trap (P3-BRR-5).
- [ ] All keyboard/bulk actions fire the same endpoints + payloads as the mouse path (BR-DL-7 / P2-BRR-1).

### Integration + parity (brr-13)

- [ ] Drawer / mobile / keyboard all dispatch through the Phase-2 flow; action-call parity preserved (manual + quick-resolve + bulk); 409 reconciles everywhere.
- [ ] No PHI added to logs / analytics / telemetry (drawer audit, card, keyboard paths) (BR-DL-5).
- [ ] No row lost/double-sent across bulk + Undo + the Phase-2 edge cases.

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings ok).
- [ ] Phase 3 test suites green (drawer content render, mobile card actions, keyboard nav + bulk routing). Targeted suites.
- [ ] No edit to `frontend/app/dashboard/booking-review/page.tsx`, the backend, or `staff-review-match-explain.ts` copy.

### Documentation

- [ ] `docs/Work/capture/inbox.md` gains a line: Phase 3 (drawer + mobile + keyboard) shipped frontend-only; live IG conversation deferred to a scoped backend read (BR-Q3) — see the spec sketch; this closes the booking-review UI program pending that one backend follow-up.

---

## Phase plan position

This is **Phase 3 of 3 (Depth + platform)** — the last UI phase.

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Foundation: reskin + SLA | ✅ Shipped (brr-01..04) |
| Phase 2 | Workflow: quick-resolve, optimistic + undo + auto-refresh, filters | ✅ Shipped (brr-05..09) |
| **Phase 3** | **Depth + platform: drawer, mobile cards, keyboard (R-DRAWER, R-MOBILE, R-KEYBOARD)** | ▶ This batch (brr-10..13) |
| Follow-up | Live IG conversation in drawer — new doctor-scoped read + RLS + PHI review (BR-Q3) | Deferred (own scoped task/plan) |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| **Live IG conversation in the drawer** | **Its own scoped backend task (P3-BRR-2)** — see spec sketch below |
| Bulk reassign / bulk cancel | Future — Phase 3 bulk is confirm-only (low-risk batch) |
| Saved views / per-doctor default filter | Fast-follow after Phase 2's filters (B4.4) |
| Throughput analytics | Future `Insights` page (B4.1) |
| App-wide toast provider | Still out of scope (P2-BRR-3) |

### Spec sketch — deferred IG-conversation read (the one backend follow-up)

> Scope when promoted (own task, **Opus-candidate** per the efficiency guide — PHI + RLS):
> - **Backend:** `GET /api/v1/service-staff-reviews/:id/conversation` (or `…/conversations/:conversationId/messages`) → returns a **sanitized, doctor-scoped** recent slice of the IG DM thread for the review's `conversation_id`. RLS: the conversation must belong to the authenticated doctor. PHI: return only what's needed to decide; never log message bodies; rate-limit.
> - **Frontend:** a `lib/api` client + a read-only thread panel that replaces the drawer placeholder; loading/empty/error states; still no compose (BR-DL-6).
> - **Tests:** RLS (cross-doctor denied), sanitization, drawer renders thread / degrades on error.

---

## Cost estimate

| Wave | Tasks | Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | brr-10 | 1/1 | 0/1 | ~4–6h (drawer shell) |
| Wave 2 | brr-11, brr-12 | 2/2 | 0/2 | ~7–10h (serial — same component) |
| Wave 3 | brr-13 | 1/1 | 0/1 | ~2–3h |
| **Total** | **4** | **4** | **0** | **~13–19h (~6–10 dev-days incl. review/QA)** |

**No Opus build tasks** — the only Opus-candidate (conversation read) is deferred (P3-BRR-2). No PHI write path, no RLS, no migration in this batch. Optional **light** review after brr-13 of the bulk + keyboard action-call parity.

---

## Sequencing notes (the why behind the waves)

- **brr-10 first, alone.** The drawer is the shared detail surface mobile cards and the keyboard `Enter` both open; build it before the surfaces that target it.
- **Wave 2 (brr-11 → brr-12) is serial.** Both edit the inbox and both open the drawer (brr-10): mobile cards on tap, keyboard on `Enter`. Keyboard also leans on the Phase-2 dispatcher for bulk.
- **brr-13 last** — parity + a11y + the bulk/Undo edges + tests.
- **Conversation is intentionally absent.** It is the one backend/PHI/Opus concern; isolating it keeps this batch frontend-only and reviewable, and lets the drawer ship now (placeholder) and light up later (P3-BRR-2).

---

## References

- **Source:** [`Product plans/plan-booking-review-redesign.md`](../../../../../Product%20plans/plan-booking-review-redesign.md) — R-DRAWER, R-MOBILE, R-KEYBOARD, BR-DL-5/6/8, BR-Q3, BR-R4.
- Phase 1 / Phase 2 batches: [`p1-reskin/`](../p1-reskin/) · [`p2-workflow/`](../p2-workflow/).
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — inline expander (~570) the drawer replaces; the action dispatcher Phase 3 reuses.
- [`frontend/components/ui/sheet.tsx`](../../../../../../frontend/components/ui/sheet.tsx) — the drawer primitive.
- [`frontend/lib/text/use-composer-hotkeys.ts`](../../../../../../frontend/lib/text/use-composer-hotkeys.ts) — the keyboard-hook convention to mirror.
- [`frontend/components/patients-v2/tabs/ConversationsTab.tsx`](../../../../../../frontend/components/patients-v2/tabs/ConversationsTab.tsx) — why conversation reuse doesn't apply (BR-Q3).
- [`backend/src/services/service-staff-review-service.ts`](../../../../../../backend/src/services/service-staff-review-service.ts) — `conversation_id` semantics (DM state, not a transcript API).
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p3-booking-review-depth.md`](./Tasks/EXECUTION-ORDER-p3-booking-review-depth.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 3 of the p1-booking-review-redesign program — final UI phase).  
**Closes:** when all four brr tasks' gates + the cross-cutting gate above pass.  
**Next:** the deferred IG-conversation read (BR-Q3) — promote to its own backend task/plan when prioritised.
