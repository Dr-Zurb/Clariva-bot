# Plan — Booking review redesign

## Turn the Booking-review inbox from a generic V0 data table into a fast, design-system-native triage queue — and surface the urgency, AI assist, and context signals that are already in the data but invisible today

> **Source thread:** 2026-05-30 chat. The doctor looked at the shipped Booking-review tab and said it is *"too basic looking"* and asked to *"redesign … and also suggest adding more features and improvements."* This plan captures both: a reskin onto the shipped design system **and** the feature/workflow wins that the current screen leaves on the table.
>
> **What this page is:** the staff inbox for **AI service-match reviews** from Instagram DMs. When the bot is not confident which catalog service a patient's reason-for-visit maps to, it queues a review; staff **Confirm / Reassign / Cancel**, and confirming DMs the patient a booking link. Lives at [`frontend/app/dashboard/booking-review/page.tsx`](../../../frontend/app/dashboard/booking-review/page.tsx) → [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx).
>
> **Status:** `Drafted (live)` — open for planning. No implementation until promotion to a daily-plans batch (see "Plan rules"). Phase 1 has **zero backend changes**; later phases flag the one place a backend read is needed.
>
> **Strategy:** in-place rewrite of the one inbox component onto shadcn/ui primitives (no Strangler Fig — it is a single self-contained component with no behaviour worth preserving in a parallel tree), then additive feature work in layered phases. Consumes the existing `GET /api/v1/service-staff-reviews` contract, so it is decoupled from the in-flight `serviceMatch` state-namespacing refactor ([`task-rcp-16`](../Daily-plans/May%202026/30-05-2026/receptionist-rearchitecture/p4-state/Tasks/task-rcp-16-namespace-service-match.md), which is internal conversation state and does not change the list-API shape).
>
> **Depends on:** the design system shipped by [`plan-ui-system-redesign.md`](./plan-ui-system-redesign.md) (U1.1 shadcn primitives, U1.3 lucide, U1.4 Inter + tabular-nums) and the route/label rename from [`plan-sidebar-restructure.md`](./plan-sidebar-restructure.md) (DL-4 / DL-5).
>
> **Status legend (matches `ehr/` convention):** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Selection markers per R-item:** `Decision: [ ] Yes / [ ] No / [ ] Modify`. Tick exactly one before promotion to a daily-plans batch.

---

## Why this plan exists now

`ServiceReviewsInbox` **skipped the UI-system redesign** that the rest of the dashboard adopted (`plan-ui-system-redesign.md`, shipped May 2026). The whole app moved to shadcn/ui primitives, `lucide-react` icons, Inter + `tabular-nums`, and CSS design tokens — but this one component still hand-rolls everything with raw `gray-*` / `blue-*` Tailwind. That is the entire reason it "looks basic," and it has three consequences:

1. **It violates the design-system contract.** It hand-rolls confidence chips (`confidenceClass`, [`ServiceReviewsInbox.tsx:42`](../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx)), tab pills, OK/err banners, modals, and buttons — even though [`frontend/components/ui/badge.tsx`](../../../frontend/components/ui/badge.tsx) literally states *"DO NOT add per-page chip styles — extend Badge variants instead"* and already ships `success` / `warning` / `info` / `destructive` variants. There is no `Card`, `Tabs`, `Dialog`, `Sheet`, `Tooltip`, `Skeleton`, or a single icon anywhere in the file.

2. **It hides signals the bot already computed.** The list payload (`ServiceStaffReviewListItem`, [`frontend/types/service-staff-review.ts`](../../../frontend/types/service-staff-review.ts)) carries fields that are fetched and then never rendered:
   - `sla_deadline_at` — these reviews **auto-cancel on a timeout**, yet there is **no urgency cue anywhere**. This is the single biggest miss.
   - `assist_hint.top_resolutions` — "similar cases were resolved as X (5×)" is rendered as a sentence (`:373`) but is **not actionable**; the obvious one-tap resolve is missing.
   - `conversation_id` — present on every row but there is **no way to read the actual IG thread**; staff decide from a one-line sanitized preview.
   - `resolved_by_user_id` / `resolution_internal_note` — captured but **not shown** in the resolved tabs (no audit trail for "who/why").

3. **It is an inbox that does not behave like one.** No auto-refresh (manual "Refresh" button only, `:201`), every action refetches the whole list (`:157`) instead of optimistic update, no filter/search/sort (pending is hardcoded oldest-first), no keyboard navigation, no skeletons (bare spinner, `:247`), and on small screens it degrades to a horizontal-scrolling 6–7 column table with no card fallback.

Doing this now (a) closes the last "generic V0" surface left after the UI-system redesign, and (b) is cheap because the data is already on the wire — most Tier-1 wins are pure rendering.

---

## North star

From [ehr/plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md):

> "doctor opens it, taps two chips, sends in 30 seconds, and the patient gets a properly branded PDF in their inbox"

Generalised to the receptionist inbox:

> A doctor opens Booking review, sees at a glance **what is most urgent**, **what the AI suggests**, and **why** — and clears each item in **one tap** (or one keystroke), confident the right booking link went to the right patient. Nothing in the queue should require horizontal scrolling, a refresh click, or a guess about how long it has been waiting.

Every R-item below either makes that statement truer or preserves an existing behaviour while the surface changes. If an item doesn't ladder to it, flag it in `Notes:` and probably reject.

---

## Decision locks (BR-DL-1 .. BR-DL-9)

Locked at plan creation (2026-05-30 thread). Reopening any of these belongs in a `Decision: … [x] Modify` block on the affected R-item with written rationale — not mid-execution.

- **BR-DL-1 — Reskin onto the shipped design system; no new visual language.** Every hand-rolled element is replaced by an existing primitive: `Card`, `Badge` (use `success`/`warning`/`info`/`destructive` for confidence + outcome), `Button`, `Tabs`, `Dialog`, `Sheet`, `Tooltip`, `HoverCard`, `Skeleton`, `Alert`, plus `lucide-react` icons and `tabular-nums` for timestamps/counts. **No new per-page chip styles** (per `badge.tsx`). If a needed variant is missing, extend the primitive, don't fork it locally.

- **BR-DL-2 — Phase 1 is frontend-only and behaviour-preserving.** The reskin must not change which rows appear, the confirm/reassign/cancel semantics, the success/error copy intent, or the API calls. It consumes the existing `ServiceStaffReviewListItem` contract verbatim. Pixels and interactions change; outcomes do not.

- **BR-DL-3 — Surface urgency from `sla_deadline_at`.** Pending rows show a live countdown ("Due in 38m") that escalates visually under a threshold and reads "Overdue" past the deadline. Pending sort defaults to most-urgent-first. **No new SLA logic** is invented client-side — we only render the deadline the backend already sets. If `sla_deadline_at` is null, degrade gracefully to the queued-age cue.

- **BR-DL-4 — One-tap resolve from assist hints, without removing the explicit path.** The top `assist_hint` resolution becomes an action ("Resolve as Ortho · used 5×") that performs a reassign/confirm to that service. The full Confirm / Reassign / Cancel controls remain. Assist is a shortcut, never the only path, and never auto-resolves.

- **BR-DL-5 — PHI stays in-session; no new logging.** Carry forward the existing rule (component header: *"PHI is shown only in-session; avoid console logging patient or reason text"*). The conversation drawer (BR-DL-6) and any patient mini-profile render in-session only; no patient/reason text enters logs, analytics, or telemetry payloads.

- **BR-DL-6 — Conversation context is read-only and additive.** The detail drawer may show the IG thread for `conversation_id` to give deciding context, but Booking review does **not** become a messaging surface — no reply/compose here. Reuse the patients-v2 conversation read path; do not build a new one. This is the **one** item that may require a backend read (see BR-R4 / BR-Q3).

- **BR-DL-7 — Optimistic actions must be reconciled, not assumed.** Confirm/Reassign/Cancel may update the UI optimistically, but must reconcile against the server response and preserve the existing **409 "already resolved → refetch"** handling ([`ServiceReviewsInbox.tsx:162`](../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx)). An undo affordance, if shipped, calls a real inverse action — it never just "puts the row back" locally.

- **BR-DL-8 — Mobile gets a real card layout, not a scrolling table.** Below `lg`, render stacked review **cards** (patient, reason, proposal+confidence, SLA, actions), not the desktop table with `overflow-x-auto`. The desktop table/list stays `lg+`.

- **BR-DL-9 — Internal rename is optional and bundled, not a separate effort.** Since the file is being rewritten anyway, renaming `ServiceReviewsInbox` → `BookingReviewInbox` (folder + component) is **allowed within the reskin commit** to close the gap `plan-sidebar-restructure.md` S-Q5 deferred. It is not mandatory; if it inflates the diff or import churn, defer it. The backend endpoint/table names stay (that plan's DL-10).

---

## What changes vs what stays

### 🟢 Preserved unchanged

- `frontend/app/dashboard/booking-review/page.tsx` — server-side auth, parallel fetch of reviews + settings, cold-start error handling, and the `ServiceReviewsInbox` mount stay as-is (props may gain optional fields).
- The backend: `GET /api/v1/service-staff-reviews`, the confirm/reassign/cancel endpoints, and `service_staff_review_requests` are untouched in Phase 1–2.
- The matcher-explanation helpers [`frontend/lib/staff-review-match-explain.ts`](../../../frontend/lib/staff-review-match-explain.ts) (`matchExplanationSummary`, `matchReasonChipMeta`, `parseCandidateLabels`, `parseMatchReasonCodes`, `formatCandidateSummary`) — reused by reference; copy stays the single source of reason-code wording.
- The reassign "teaching moment" logic (`sanitizeReasonForHintSuggestion`, include-when/exclude-when append payloads) — re-homed into the new `Dialog`, behaviour identical.

### 🆕 Created (new files)

- A `BookingReviewInbox` (or kept name — BR-DL-9) composed of design-system primitives.
- Small presentational pieces: `SlaCountdown` (renders `sla_deadline_at` → live chip), `ConfidenceBadge` (maps confidence → `Badge` variant + meter), `ReviewRow` / `ReviewCard` (desktop/mobile), `ReviewDetailSheet` (drawer).
- A polling hook for the inbox (or reuse of the `useDashboardCounts` lineage) for auto-refresh.

### 🟡 Touched (substantive diffs)

- `ServiceReviewsInbox.tsx` — rewritten internals (the bulk of the work). External contract (`{ initialReviews, settings, token }`) preserved.
- Possibly `frontend/components/ui/badge.tsx` — only if a new status variant is genuinely needed (extend, per BR-DL-1).

### 🗑️ Deleted (within the reskin)

- `confidenceClass()` and every hand-rolled chip/pill/banner/modal/button class string in the file.
- The bare-spinner loading block; replaced by `Skeleton` rows.

### 🚫 Untouched

- Sidebar, route, redirect (already shipped by `plan-sidebar-restructure.md`).
- `useDashboardCounts` field names and the KPI strip semantics (we may *reuse* the polling pattern; we don't rename anything).

---

## Target layout (canonical)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Booking review                                  [⟳]  Auto-refresh ●   │
│  Confirm AI-suggested visit types from Instagram bookings.            │
│                                                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ Pending  4 │ │ Due <1h  1 │ │ Resolved   │ │ Avg conf.  │  ← KPI   │
│  │            │ │  (urgent)  │ │ today    7 │ │  Medium    │   cards  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘         │
│                                                                        │
│  [ Pending 4 ] [ Confirmed ] [ Reassigned ] [ Cancelled ]   ← Tabs    │
│  🔍 Filter patient / service…         Sort: Most urgent ▾   Density ▾  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ (PS) Priya S.   ·  "knee pain 2 weeks"        ⏳ due in 38m 🔴 │    │
│  │ AI → Orthopedic consult  [● Medium] ▓▓▓░░       queued 3h ago  │    │
│  │ Assist: resolved as Ortho (5×) · Physio (2×)                   │    │
│  │ [✓ Confirm]  [Resolve as Ortho]  [Reassign]  [⋯ Cancel]       │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ (RM) Rahul M.  …                              ⏳ due in 4h      │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                click a row → right-side Sheet: full match signals,
                candidates, IG conversation (read-only), patient mini-card
```

---

## R-item details

Eight R-items across four phases. Each: Why / What / Acceptance / Effort / Dependencies / Files / Decision.

### R-RESKIN · Design-system reskin (the foundation)

**Why:** The "too basic" complaint is almost entirely BR-DL-1. Swapping hand-rolled markup for primitives fixes ~80% of the perceived quality gap in one pass and unblocks every later item.

**What:**
- Replace tabs → `Tabs`; banners → `Alert`; reassign/cancel modals → `Dialog`; action/refresh buttons → `Button` + lucide icons; confidence chips → `Badge` variants; loading spinner → `Skeleton` rows; row containers → `Card`/`Table` primitives.
- Header zone: title + subtitle + `Button` Refresh (icon).
- `tabular-nums` on all timestamps and counts; consistent token colours (`text-foreground` / `text-muted-foreground`), no raw `gray-*`.
- Preserve every behaviour exactly (BR-DL-2): same rows, same actions, same 409 handling, same teaching-hint payloads.
- Optional: rename to `BookingReviewInbox` (BR-DL-9) if it doesn't balloon the diff.

**Acceptance:**
- No hand-rolled chip/pill/banner/modal class strings remain; `rg` finds no `confidenceClass`.
- Confirm / Reassign / Cancel produce byte-identical API calls and identical success/error outcomes to today.
- `npx tsc --noEmit` clean; no new lint errors; visual parity reviewed at 1366 / 1920 px.

**Effort:** 2–3 days. **Dependencies:** design system (shipped). **Files:** `ServiceReviewsInbox.tsx` (+ optional folder rename), maybe `badge.tsx`.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-SLA · SLA urgency + queued-age cues

**Why:** BR-DL-3 — the highest-value missing signal. Reviews auto-cancel on timeout and staff currently fly blind.

**What:**
- `SlaCountdown` renders `sla_deadline_at` as a live chip ("Due in 38m" / "Overdue 5m"), updating on a ~30 s tick; escalate `Badge` variant under a threshold (e.g. `warning` < 1h, `destructive` overdue).
- Pending default sort = soonest deadline first; rows with no deadline fall back to queued-age ("queued 3h ago", from `created_at`).
- Feed a "Due < 1h" count into the KPI strip (R-RESKIN header).

**Acceptance:**
- Each pending row shows an accurate countdown that escalates at the threshold and flips to "Overdue" past `sla_deadline_at`.
- Null `sla_deadline_at` degrades to the queued-age cue with no layout break.
- Pending list is sorted soonest-first by default.

**Effort:** 1–2 days. **Dependencies:** R-RESKIN. **Files:** `SlaCountdown`; sort util in the inbox.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-QUICKRESOLVE · One-tap resolve from assist hints

**Why:** BR-DL-4 — turns the already-computed `assist_hint.top_resolutions` from prose into the fastest path to clearing a confident item.

**What:**
- Render the top 1–2 assist resolutions as action buttons ("Resolve as {label} · {count}×"). Clicking performs the corresponding confirm (if it equals the proposal) or reassign (if different), reusing existing endpoints.
- Keep full Confirm / Reassign / Cancel visible; assist is additive (BR-DL-4).
- Reuse `formatCandidateSummary` / labels from the match-explain helper.

**Acceptance:**
- Quick-resolve fires the correct existing action and reconciles like the manual path (incl. 409).
- Hidden when no `assist_hint`; never auto-resolves.

**Effort:** 1–2 days. **Dependencies:** R-RESKIN. **Files:** inbox row; reuses `lib/api` + match-explain.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-OPTIMISTIC · Optimistic actions + auto-refresh + undo

**Why:** It is an inbox; it should feel instant and stay fresh without a manual click. Today every action refetches the whole list and freshness depends on the Refresh button.

**What:**
- Optimistically remove a resolved row, then reconcile with the server (BR-DL-7); preserve the 409 → refetch path.
- Background polling (reuse the `useDashboardCounts` visibility-aware pattern: poll while visible, pause when hidden, refetch on focus) with a non-disruptive "N new" pill rather than auto-yanking the list under the cursor.
- Undo affordance on Confirm/Cancel that calls a real inverse action. **Dependency note:** there is no toast primitive in `components/ui/` today — either add a minimal toast/sonner primitive (small, reusable) or implement undo inline on the existing `Alert` banner. Decide in BR-Q2.

**Acceptance:**
- Action feels instant; on server error the row is restored and an error `Alert`/toast shows; 409 still refetches.
- List auto-refreshes without stealing focus; "N new" pill appears on new pending items.
- Undo performs a real inverse (or is explicitly deferred via BR-Q2).

**Effort:** 2–3 days. **Dependencies:** R-RESKIN; (toast primitive if chosen). **Files:** inbox state; polling hook; optional `components/ui/toast`.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-FILTERS · Filter, search, sort, density

**Why:** Pending is hardcoded oldest-first with no way to slice the queue; at volume that is unworkable.

**What:**
- Text filter (patient name / service label / service key), confidence filter chips (e.g. "Low only"), and a sort control (Most urgent / Newest / Oldest / Confidence).
- Optional density toggle (comfortable / compact) persisted in `localStorage`.
- All client-side over the already-fetched rows (no API change).

**Acceptance:**
- Filter + sort update the visible list correctly and compose with the active tab.
- Empty filtered state has a clear "no matches" message distinct from the empty-queue state.

**Effort:** 1–2 days. **Dependencies:** R-RESKIN, R-SLA (for "Most urgent" sort). **Files:** inbox toolbar + filter/sort utils.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-DRAWER · Detail drawer (signals + candidates + conversation + audit)

**Why:** Staff decide from a one-line preview; the full picture (and the IG thread) is the difference between a guess and a correct routing. BR-DL-6.

**What:**
- Clicking a row opens a `Sheet` with: full match summary + all reason codes (from match-explain), candidate services considered, and — for resolved rows — `resolved_by_user_id` + `resolution_internal_note` (audit).
- Read-only IG conversation for `conversation_id`, reusing the patients-v2 conversation read path (no compose here, BR-DL-6).
- Patient mini-card (`HoverCard` or in-sheet) linking to `/dashboard/patients-v2/{patient_id}`.
- Replaces the current inline "Show technical detail" expand-row.

**Acceptance:**
- Drawer shows signals, candidates, and (resolved) audit fields; PHI stays in-session, nothing logged (BR-DL-5).
- Conversation renders read-only or degrades cleanly if the read path/permission is unavailable (BR-R4).

**Effort:** 3–5 days (conversation reuse drives the range). **Dependencies:** R-RESKIN; conversation read path (BR-Q3). **Files:** `ReviewDetailSheet`; reuse of patients-v2 conversation components.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-MOBILE · Mobile card layout

**Why:** BR-DL-8 — the current table becomes a horizontal-scroll mess on phones.

**What:**
- Below `lg`, render stacked review cards (patient, reason, proposal + confidence, SLA chip, primary Confirm + overflow for Reassign/Cancel). Tap opens the same `Sheet`.
- Desktop table/list stays `lg+`.

**Acceptance:**
- `<lg` shows cards with no horizontal scroll; all actions reachable; `lg+` unchanged.

**Effort:** 1–2 days. **Dependencies:** R-RESKIN (and ideally R-DRAWER for the tap target). **Files:** `ReviewCard`; responsive branch.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

### R-KEYBOARD · Keyboard-driven triage + bulk select

**Why:** Power-user inbox (Linear / Superhuman) feel; clears a queue far faster than mouse-only.

**What:**
- Shortcuts: `j`/`k` move selection, `c` confirm, `r` reassign, `x` cancel, `Enter` open drawer, `/` focus filter. Visible help (`?`).
- Optional multi-select to confirm several high-confidence rows at once (single batched pass over existing endpoints; respect 409 per row).
- Respect accessibility: focus management, `aria` selection state, no trap.

**Acceptance:**
- Each shortcut performs the labelled action on the selected row; help overlay lists them.
- Bulk confirm resolves each selected row and reconciles per-row (incl. 409); partial failures surface clearly.

**Effort:** 2–3 days. **Dependencies:** R-RESKIN, R-OPTIMISTIC (for snappy feedback). **Files:** keyboard hook; selection state in inbox.

**Decision:** [ ] Yes  [ ] No  [ ] Modify

---

## Decision matrix (single-screen overview)

### B0 — Strategic (locked above; column kept for audit)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|----|--------|-------|
| B0.1 | Reskin onto design system, no new visual language (BR-DL-1) | [ ] | [ ] | [ ] | |
| B0.2 | Phase 1 frontend-only, behaviour-preserving (BR-DL-2) | [ ] | [ ] | [ ] | |
| B0.3 | Surface SLA urgency from `sla_deadline_at` (BR-DL-3) | [ ] | [ ] | [ ] | |
| B0.4 | One-tap assist resolve, explicit path kept (BR-DL-4) | [ ] | [ ] | [ ] | |
| B0.5 | PHI in-session, no new logging (BR-DL-5) | [ ] | [ ] | [ ] | |
| B0.6 | Conversation read-only/additive (BR-DL-6) | [ ] | [ ] | [ ] | |
| B0.7 | Optimistic actions reconciled, 409 preserved (BR-DL-7) | [ ] | [ ] | [ ] | |
| B0.8 | Mobile card layout (BR-DL-8) | [ ] | [ ] | [ ] | |
| B0.9 | Optional bundled rename (BR-DL-9) | [ ] | [ ] | [ ] | |

### B1 — Foundation (Phase 1)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|----|--------|-------|
| R-RESKIN | Design-system reskin | [ ] | [ ] | [ ] | The "looks basic" fix |
| R-SLA | SLA urgency + queued-age cues | [ ] | [ ] | [ ] | Highest-value signal |

### B2 — Workflow (Phase 2)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|----|--------|-------|
| R-QUICKRESOLVE | One-tap assist resolve | [ ] | [ ] | [ ] | |
| R-OPTIMISTIC | Optimistic + auto-refresh + undo | [ ] | [ ] | [ ] | toast dep → BR-Q2 |
| R-FILTERS | Filter / search / sort / density | [ ] | [ ] | [ ] | |

### B3 — Depth + platform (Phase 3)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|----|--------|-------|
| R-DRAWER | Detail drawer + conversation + audit | [ ] | [ ] | [ ] | only item that may need backend (BR-R4) |
| R-MOBILE | Mobile card layout | [ ] | [ ] | [ ] | |
| R-KEYBOARD | Keyboard triage + bulk select | [ ] | [ ] | [ ] | |

### B4 — Out of scope here (parked; promote later)

| ID | Item | Promote? (Y/N) | Notes |
|----|------|----------------|-------|
| B4.1 | Throughput analytics (resolved/day, avg time-to-resolve, reassign rate) | [ ] | Belongs in the future `Insights` page (sidebar DL-3), not this inbox. |
| B4.2 | Reply / compose to the IG thread from the drawer | [ ] | BR-DL-6 forbids; messaging lives in Conversations. |
| B4.3 | Backend rename `service_staff_review_requests` / `/api/v1/service-staff-reviews` | [ ] | Cosmetic; sidebar DL-10 / S4.3 already parks it. |
| B4.4 | Saved views / per-doctor default filter | [ ] | Fast-follow once R-FILTERS lands and we see real usage. |

---

## Sequencing

Four phases. Within a phase, items can run in parallel chats once R-RESKIN lands.

### Phase 1 — Foundation (the "looks basic" fix)
| R-item | Effort | Notes |
|---|---|---|
| R-RESKIN | 2–3d | Primitives swap; behaviour-preserving |
| R-SLA | 1–2d | Starts once rows render as cards/rows |

**Gate:** the inbox is visually design-system-native, behaviour-identical to today, and every pending row shows accurate urgency. This alone closes the user's complaint.

### Phase 2 — Workflow wins
| R-item | Effort | Notes |
|---|---|---|
| R-QUICKRESOLVE | 1–2d | Assist hints become actions |
| R-OPTIMISTIC | 2–3d | Instant feel + auto-refresh (+ undo per BR-Q2) |
| R-FILTERS | 1–2d | Slice the queue |

**Gate:** clearing a confident item is one tap; the list stays fresh on its own; staff can filter/sort.

### Phase 3 — Depth + platform
| R-item | Effort | Notes |
|---|---|---|
| R-DRAWER | 3–5d | Context drawer (conversation reuse drives range) |
| R-MOBILE | 1–2d | Card layout `<lg` |
| R-KEYBOARD | 2–3d | Power-user triage |

**Gate:** staff can see full context before deciding; mobile is first-class; the queue is keyboard-clearable.

### Total effort estimate
**~13–20 dev-days serial** (~2.5–4 weeks one engineer; less with Phase 2/3 parallelised after R-RESKIN). Phase 1 (~3–5d) delivers the headline outcome on its own.

---

## Success criteria

| Metric | Today | Target after this plan |
|---|---|---|
| Hand-rolled chip/banner/modal class strings in the file | many | 0 (primitives only — BR-DL-1) |
| `lucide-react` icons in the inbox | 0 | yes (refresh, actions, status) |
| Urgency cue on pending rows (`sla_deadline_at` rendered) | none | live countdown + escalation (BR-DL-3) |
| Taps to clear a confident, assist-backed item | 1 (Confirm) — but no assist shortcut | 1 (Confirm **or** "Resolve as X") |
| List freshness | manual Refresh only | auto-refresh + "N new" pill |
| Action latency feel | full refetch each time | optimistic + reconcile (BR-DL-7) |
| Filter / search / sort | none (hardcoded oldest-first) | full toolbar |
| Read the actual IG conversation before deciding | no | read-only drawer (BR-DL-6) |
| Resolved audit (`resolved_by` / note) visible | no | yes, in drawer |
| Mobile experience | horizontal-scroll table | stacked cards (BR-DL-8) |
| Keyboard triage | none | j/k/c/r/x + bulk |
| Confirm/Reassign/Cancel semantics + 409 handling | work | unchanged (BR-DL-2 / BR-DL-7) |
| Backend changes (Phase 1–2) | n/a | 0 |

---

## Open questions (live — answer in chat, then lock here)

#### BR-Q1 — Confidence visualization
**Question:** Confidence is a free-form string ("high"/"medium"/"low" today). Render as just a coloured `Badge`, or `Badge` + a small 3-segment meter?
**Recommendation:** `Badge` + meter — the meter reads faster in a scan and differentiates better than colour alone (a11y). Lock before R-RESKIN.
**Decision:** [ ] Badge only  [ ] Badge + meter  [ ] Modify

#### BR-Q2 — Undo mechanism (toast vs inline)
**Question:** There is no toast primitive in `components/ui/` today. Add a minimal toast/sonner primitive for the undo affordance, or implement undo inline on the existing `Alert` banner?
**Recommendation:** Add a small reusable toast primitive — it's broadly useful beyond this inbox and gives the cleanest undo UX. If we want to keep Phase 2 tight, ship inline-banner undo first and promote toast later. Lock before R-OPTIMISTIC.
**Decision:** [ ] Add toast primitive  [ ] Inline banner undo  [ ] Defer undo

#### BR-Q3 — Conversation read path for the drawer
**Question:** Can the drawer reuse the patients-v2 conversation read path as-is for `conversation_id`, or is a new/adjusted backend read needed (and is it permissioned for the booking-review context)?
**Recommendation:** Spike the reuse first (BR-DL-6); if it needs a backend read, that is the only backend work in this plan and should be scoped as its own task with PHI review (BR-DL-5). Lock before R-DRAWER. **This is the gating unknown for Phase 3 effort.**
**Decision:** [ ] Reuse as-is  [ ] New backend read (scoped task)  [ ] Drop conversation from drawer

#### BR-Q4 — Auto-refresh interval + "N new" behaviour
**Question:** Poll interval (match `useDashboardCounts` 30 s?) and whether new rows insert silently behind a pill or animate in.
**Recommendation:** 30 s, visibility-aware, behind a "N new" pill (never reorder under the cursor). Lock before R-OPTIMISTIC.
**Decision:** [ ] 30 s + pill  [ ] Other (specify)

#### BR-Q5 — Bundle the `BookingReviewInbox` rename now? (BR-DL-9)
**Question:** Rename the component/folder during R-RESKIN, or leave for a follow-up (as `plan-sidebar-restructure.md` S-Q5 did)?
**Recommendation:** Bundle it into R-RESKIN since the file is already being rewritten — but drop it if import churn inflates the diff. Lock before R-RESKIN.
**Decision:** [ ] Rename in R-RESKIN  [ ] Leave for follow-up  [ ] Modify

---

## Risk register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| BR-R1 | Reskin silently changes an action's semantics (wrong link sent to a patient) | **High** | BR-DL-2 behaviour-preserving; diff the API calls; manual confirm/reassign/cancel smoke incl. the teaching-hint payload before merge. |
| BR-R2 | Optimistic update + the existing 409 race double-resolves or hides a real failure | **High** | BR-DL-7: reconcile against server, preserve the 409 → refetch path; undo is a real inverse, never local-only. |
| BR-R3 | SLA countdown drifts / shows wrong time across timezones | Med | Render only the backend `sla_deadline_at` (BR-DL-3); reuse `formatDateTime`/date utils; tick off a single clock; test around the threshold + overdue boundary. |
| BR-R4 | Conversation drawer needs an unavailable/unpermissioned backend read | Med | BR-DL-6 + BR-Q3 spike first; drawer degrades gracefully without the thread; conversation is additive, not required for triage. |
| BR-R5 | PHI leaks into logs/analytics via the new drawer or optimistic state | **High** | BR-DL-5 carries forward the no-log rule; review every new render path; nothing patient/reason-derived enters telemetry. |
| BR-R6 | Auto-refresh yanks the list while staff are mid-action | Med | BR-Q4: insert behind a "N new" pill; never reorder under the cursor; pause polling while a dialog/drawer is open. |
| BR-R7 | Scope creep into analytics/messaging | Low | B4.1 / B4.2 explicitly parked; analytics belongs to the future Insights page, messaging to Conversations. |
| BR-R8 | Decoupling assumption wrong — `task-rcp-16` changes the list-API shape | Low | The refactor is internal conversation state; the `ServiceStaffReviewListItem` contract is the boundary. Re-verify the type before promotion; if it shifts, treat as a small adapter task. |

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Phase 1–2 are frontend-only, no new persisted schema, no RLS, no novel security → **no Opus tasks**; Sonnet-tier throughout, Composer-tier sufficient for the lightest items (R-MOBILE, R-SLA chip). The only Opus-worthy candidate is the BR-Q3 spike **if** it turns into a permissioned PHI-bearing backend read for the conversation drawer (R-DRAWER) — scope that separately with a PHI review.

| Phase | R-items | Effort (serial) |
|---|---|---|
| Phase 1 — Foundation | R-RESKIN + R-SLA | ~3–5d |
| Phase 2 — Workflow | R-QUICKRESOLVE + R-OPTIMISTIC + R-FILTERS | ~4–7d |
| Phase 3 — Depth + platform | R-DRAWER + R-MOBILE + R-KEYBOARD | ~6–10d |

---

## Plan rules (pre-ship workflow)

1. **Editing this file is welcome under any `Notes:` line.** Don't edit headers, R-IDs, or BR-DL-IDs.
2. **Don't renumber items.** R-IDs and BR-DL-IDs are stable; killed items keep their ID + `[KILLED]` suffix with a one-line reason.
3. **BR-DL-IDs are locked.** Reopening one requires a `Decision: … [x] Modify` block on the affected R-item with written rationale.
4. **When all Phase 1 R-items have a `Decision:` ticked and BR-Q1/BR-Q5 are resolved, this plan promotes to a dated batch** under `docs/Work/Daily-plans/<Month>/<date>/booking-review-redesign/p1-reskin/plan-p1-booking-review-redesign-batch.md` and becomes `Committed`. **Later phases promote as sibling `p{N}-` subfolders under the same `booking-review-redesign/` folder created on the start date — not under the later day's date.** Folder rules: [`process/PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md).
5. **Implementation MUST NOT start until promotion.** R-IDs are decided here; the daily-plans batch derives per-task files from them.
6. **The behaviour-preserving check (BR-DL-2) and the PHI no-log check (BR-DL-5) re-run at every phase gate**, not just at the reskin.

---

## References

### Plans
- [plan-ui-system-redesign.md](./plan-ui-system-redesign.md) — shipped the shadcn primitives, lucide, Inter + tabular-nums, and tokens this plan reskins onto.
- [plan-sidebar-restructure.md](./plan-sidebar-restructure.md) — renamed the surface to "Booking review" and moved the route; this plan inherits that label/route (and revisits its deferred S-Q5 rename in BR-DL-9).
- [ehr/plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md) — north-star source.
- [task-rcp-16](../Daily-plans/May%202026/30-05-2026/receptionist-rearchitecture/p4-state/Tasks/task-rcp-16-namespace-service-match.md) — in-flight `serviceMatch` state namespacing; internal-only, does not change the list-API contract this UI consumes (BR-R8).

### Code surfaces
- **Touched (rewrite):** [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx).
- **Reused by reference:** [`frontend/lib/staff-review-match-explain.ts`](../../../frontend/lib/staff-review-match-explain.ts), `frontend/components/ui/*` (`card`, `badge`, `button`, `tabs`, `dialog`, `sheet`, `tooltip`, `hover-card`, `skeleton`, `alert`), the `useDashboardCounts` polling pattern, the patients-v2 conversation read path (R-DRAWER).
- **Contract (the boundary):** [`frontend/types/service-staff-review.ts`](../../../frontend/types/service-staff-review.ts) — `ServiceStaffReviewListItem` (note the currently-unused `sla_deadline_at`, `assist_hint`, `conversation_id`, `resolved_by_user_id`, `resolution_internal_note`).
- **Mount/data:** [`frontend/app/dashboard/booking-review/page.tsx`](../../../frontend/app/dashboard/booking-review/page.tsx).

---

**Created:** 2026-05-30.  
**Status:** `Drafted (live)`.  
**Owner:** TBD.  
**Promoted to:** _(daily-plans batch TBD once Phase 1 R-items are all decided)_.  
**Relationship:** Reskins the last "generic V0" surface left after `plan-ui-system-redesign.md`; consumes the stable service-staff-review list contract, decoupled from `task-rcp-16`.
