# UI system redesign — implementation batch (2026-05-06)

## The 17 UI redesign items committed for implementation, pulled from U1 + U2 + U3 + U4 of the source plan

> **Source plan (single source of truth, living):**
> - [plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md) — U0–U5, all approved by user 2026-05-06.
>
> **Cost-aware model strategy:**
> - [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat-management heuristics applied per-task.
>
> **Per-sub-batch execution checklists:** [EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md). Per-task spec files: [Tasks/](./Tasks/).
>
> Each item below is implemented per the contract spelled out in the corresponding U-section of the source plan. This file is the **batch backlog and sequencing doc** — it does not redefine items; it commits them.

---

## What this is

A user-approved cross-section slice of the UI system redesign plan, locked on 2026-05-06. Spans **all of U1, U2, U3, U4** — every foundation item, every shell item, every cockpit item, every reference-page item.

**Explicitly NOT in this batch (parked, U5 in source plan):**
- U5.1 — Inside-call rooms (`VideoRoom` / `TextConsultRoom` / `VoiceConsultRoom`) full restructure
- U5.2 — Settings tree visual refresh beyond chrome
- U5.3 — Patient-facing surfaces (`/r/[id]`, `/consult/join`, `/book`, `/my-visit`) restructure
- U5.4 — Dim mode / dark theme palette
- U5.5 — Mobile bottom-tab nav
- U5.6 — Per-doctor white-labeling beyond practice pill

These are deferred items the user can promote later by ticking `Yes` on U5 in the source plan; they get their own batch.

This is a **commitment**, not a wish-list. Each item below has its source U-ID, its effort estimate, its dependencies, and a per-task spec file in [Tasks/](./Tasks/). The sequencing in this doc respects those dependencies so we don't build things twice.

---

## Status

`Drafted, awaiting commit-start` — 2026-05-06.

Once implementation starts, this file is updated in-place: items move from `Drafted` → `In progress` → `Shipped (YYYY-MM-DD)`. The source plan also gets a `[SHIPPED 2026-05-06+N]` marker on each U-ID as it lands so the cross-reference is traceable in either direction.

---

## U0 — Strategic locks (confirmed by user 2026-05-06)

These locks gate every item below. If any is challenged later, the affected items must be re-spec'd before implementation continues.

| ID | Lock |
|---|---|
| U0.1 | IA philosophy = workflow command center (Today cockpit, not generic landing) |
| U0.2 | Brand register = clinical, calm, modern (teal-leaning primary, warm accent for "Sent" only) |
| U0.3 | Patient portal stays out of V1 — token-gated patient surfaces only |
| U0.4 | Density target = information-rich (Linear / Plaid Dashboard density) |
| U0.5 | Adopt one component primitives library = **shadcn/ui** + lucide-react + Tailwind tokens |

---

## The 17 selected items

Grouped by sub-batch; sequencing is below in [§ Implementation order](#implementation-order).

### Sub-batch A — Foundation (5 items, ~1.5 days)

The design-system spine. Hard prerequisite for B, C, D.

| ID | U-ID(s) | Item | Effort | Spec |
|---|---|---|---|---|
| A1 | U1.2 | Tokens layer: CSS vars in `globals.css` + Tailwind theme extension reading them | S (~3h) | [task-ui-A1-design-tokens.md](./Tasks/task-ui-A1-design-tokens.md) |
| A2 | U1.1 | Bootstrap shadcn/ui primitives in `components/ui/` + refactor existing 3 utility files | M (~5h) | [task-ui-A2-shadcn-bootstrap.md](./Tasks/task-ui-A2-shadcn-bootstrap.md) |
| A3 | U1.4 | Wire Inter via `next/font` + tabular-nums utility for numeric tables | XS (~1h) | [task-ui-A3-inter-typography.md](./Tasks/task-ui-A3-inter-typography.md) |
| A4 | U1.3 | Adopt `lucide-react` + replace inline SVGs across the codebase | XS (~2h) | [task-ui-A4-lucide-icons.md](./Tasks/task-ui-A4-lucide-icons.md) |
| A5 | U1.5 + U1.6 | Brand assets (`public/brand/`) + author `docs/Reference/business/BRAND.md` | S (~3h) | [task-ui-A5-brand-assets-and-doc.md](./Tasks/task-ui-A5-brand-assets-and-doc.md) |

**Sub-batch A subtotal:** ~14h (~1.5 days). No backend changes. No migrations. New deps: `lucide-react` (A4), `tailwindcss-animate` + `class-variance-authority` (A2 via shadcn init).

### Sub-batch B — Shell (4 items, ~1.5 days)

Header + Sidebar + DashboardShell redesign.

| ID | U-ID(s) | Item | Effort | Spec |
|---|---|---|---|---|
| B1 | U2.1 + U2.2 + U2.3 + U2.4 + U2.5 | `Header.tsx` redesign: brand mark + practice pill + Start consult CTA + profile dropdown + bell | M (~5h) | [task-ui-B1-header-redesign.md](./Tasks/task-ui-B1-header-redesign.md) |
| B2 | U2.6 + U2.7 | `Sidebar.tsx` 4-section regrouping (TODAY / CARE / INBOX / SETUP) + lucide icons | M (~4h) | [task-ui-B2-sidebar-regrouping.md](./Tasks/task-ui-B2-sidebar-regrouping.md) |
| B3 | U2.8 + U2.9 | Sidebar badge counts (live polling) + desktop collapse-to-icons toggle | M (~5h) | [task-ui-B3-sidebar-counts-and-collapse.md](./Tasks/task-ui-B3-sidebar-counts-and-collapse.md) |
| B4 | U2.10 | Cmd-K global search palette (patients V1; appointments / drugs / settings V1.1) | L (~6h) | [task-ui-B4-cmd-k-global-search.md](./Tasks/task-ui-B4-cmd-k-global-search.md) |

**Sub-batch B subtotal:** ~20h (~1.5 days). One optional new backend endpoint (`GET /api/v1/dashboard/counts` for B3) — see Notes in B3 task. No migrations.

### Sub-batch C — Today cockpit (5 items, ~1.5–2 days)

Replaces the `app/dashboard/page.tsx` body.

| ID | U-ID(s) | Item | Effort | Spec |
|---|---|---|---|---|
| C1 | U3.1 + U3.6 + U3.7 | Cockpit page scaffold (responsive grid) + KPI strip + explicit "no vanity charts" guardrail | S (~3h) | [task-ui-C1-cockpit-scaffold.md](./Tasks/task-ui-C1-cockpit-scaffold.md) |
| C2 | U3.2 | Now / Next card (active session OR next confirmed appointment OR empty state) | M (~5h) | [task-ui-C2-cockpit-now-next.md](./Tasks/task-ui-C2-cockpit-now-next.md) |
| C3 | U3.3 | OPD queue strip (top 5 with wait times; conditional on OPD-mode-enabled) | S (~3h) | [task-ui-C3-cockpit-opd-strip.md](./Tasks/task-ui-C3-cockpit-opd-strip.md) |
| C4 | U3.4 | Inbox column (match-reviews + dashboard events + post-call follow-ups) | M (~5h) | [task-ui-C4-cockpit-inbox-column.md](./Tasks/task-ui-C4-cockpit-inbox-column.md) |
| C5 | U3.5 | Today's schedule (compact agenda grouped by hour) | S (~3h) | [task-ui-C5-cockpit-todays-schedule.md](./Tasks/task-ui-C5-cockpit-todays-schedule.md) |

**Sub-batch C subtotal:** ~19h (~2 days). No new backend endpoints (composes existing `getAppointments`, OPD snapshot, dashboard events, match-reviews list). No migrations.

### Sub-batch D — Reference page redesigns (3 items, ~1.5 days)

Sets the migration template for inner pages.

| ID | U-ID(s) | Item | Effort | Spec |
|---|---|---|---|---|
| D1 | U4.1 + U4.2 | Appointment detail 3-zone layout (chart rail / Tabs / context column on `xl+`) | L (~6h) | [task-ui-D1-appointment-detail-three-zone.md](./Tasks/task-ui-D1-appointment-detail-three-zone.md) |
| D2 | U4.3 + U4.4 | Patient detail header + Tabs (Chart / Visits / Prescriptions / Conversations) + right rail | L (~6h) | [task-ui-D2-patient-detail-tabs-and-rail.md](./Tasks/task-ui-D2-patient-detail-tabs-and-rail.md) |
| D3 | U4.5 | List-page reskin pattern (AppointmentsList + PatientsList using new primitives — template for the rest) | M (~4h) | [task-ui-D3-list-page-reskin-pattern.md](./Tasks/task-ui-D3-list-page-reskin-pattern.md) |

**Sub-batch D subtotal:** ~16h (~1.5 days). No backend changes. No migrations.

---

## Implementation order

See [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md) for the authoritative step-by-step order with hard/soft deps and per-step model-tier recommendations.

**Quick visual:**

```
A1 → A2 → A3 ‖ A4 → A5
              │
              ├──→ B1 → B2 → B3 ‖ B4
              │
              ├──→ C1 → C2 ‖ C3 ‖ C4 ‖ C5
              │
              └──→ D1 ‖ D2 ‖ D3
```

`‖` = parallel-eligible; `→` = serial.

---

## Files expected to touch (whole-batch view)

**New files (~17):**

- `frontend/components/ui/{button,card,badge,input,select,tabs,dialog,sheet,dropdown-menu,tooltip,command,skeleton,separator,scroll-area,...}.tsx` — A2 (shadcn primitives)
- `frontend/lib/ui/cn.ts` (or update existing `lib/utils.ts`) — A2
- `frontend/components/dashboard/cockpit/{NowNextCard,OpdQueueStrip,InboxColumn,TodaysSchedule,KpiStrip}.tsx` — C2–C5
- `frontend/components/layout/{HeaderProfileMenu,GlobalCommandPalette}.tsx` — B1, B4
- `frontend/hooks/{useDashboardCounts,useGlobalSearch,useTodaysAppointments}.ts` — B3, B4, C5
- `frontend/lib/search/{patients,appointments,drugs}.ts` — B4
- `frontend/public/brand/{logo.svg,logomark.svg,og.png}` + `frontend/app/icon.svg` (favicon source) — A5
- `docs/Reference/business/BRAND.md` — A5

**Modified files (~10):**

- `frontend/app/globals.css` — A1
- `frontend/tailwind.config.ts` — A1
- `frontend/app/layout.tsx` — A3, A5 (font + metadata)
- `frontend/components/layout/Header.tsx` — B1
- `frontend/components/layout/Sidebar.tsx` — B2, B3
- `frontend/components/layout/DashboardShell.tsx` — B3 (collapse state)
- `frontend/app/dashboard/page.tsx` — C1
- `frontend/app/dashboard/appointments/[id]/page.tsx` — D1
- `frontend/app/dashboard/patients/[id]/page.tsx` — D2
- `frontend/components/appointments/AppointmentsListWithFilters.tsx` — D3
- `frontend/components/patients/PatientsListWithFilters.tsx` — D3
- `frontend/components/ui/{SaveButton,FieldLabel,UnsavedLeaveGuard}.tsx` — A2 (refactor to compose new primitives)

**New deps:**

- `lucide-react` (A4) — icon set, tree-shakable
- `tailwindcss-animate` (A2 — shadcn dep)
- `class-variance-authority` (A2 — shadcn dep)
- `cmdk` (A2 / B4 — shadcn `Command` dep, palette engine)

**Optional new backend route:**

- `GET /api/v1/dashboard/counts` (B3) — aggregator returning `{ matchReviews: number, opdLive: number, dashboardEventsUnread: number }`. Cheap thin handler over existing services. Can be deferred and B3 can poll three endpoints client-side instead — Notes in [task-ui-B3](./Tasks/task-ui-B3-sidebar-counts-and-collapse.md) call this out.

---

## Whole-batch acceptance gate

Sub-batch A close gates B/C/D start; B/C/D close gates the whole batch. The full close-gate checklist:

- [ ] All 17 task files marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] Source plan ([plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md)) has `[SHIPPED YYYY-MM-DD]` markers on every U-ID listed in this batch.
- [ ] No regression in existing flows: log in → dashboard renders → list appointments → open appointment → start a consult → write Rx → send → receive on patient `/r/[id]` link. Smoke-test full round-trip.
- [ ] No raw `bg-blue-600` / `bg-blue-700` etc. in shell or reference-page files (semantic tokens only — `bg-primary`, `bg-muted`, `text-foreground`, etc.). Other inner pages may still use raw classes — they migrate later.
- [ ] All shell + cockpit components compose `components/ui/` primitives, not raw classes.
- [ ] `frontend/public/brand/` exists with `logo.svg`, `logomark.svg`, `og.png`. Favicon updated. Next metadata references the OG image.
- [ ] `docs/Reference/business/BRAND.md` exists with the resolved palette and voice/tone guidelines.
- [ ] Mobile breakpoints verified at 375 / 768 / 1024 / 1440 for the shell + cockpit + appointment detail.
- [ ] Type-check + lint clean across `frontend/`.
- [ ] No new console errors / warnings on the redesigned pages.
- [ ] Time-to-action measurement: log in → next consult started in ≤2 clicks (per Success Criteria in source plan).
- [ ] **Close-gate review** done in a fresh Opus chat per [efficiency guide Pattern A step 4](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-a-standard-sub-batch-execution-the-80-case): paste full diff, ask for grade against this checklist.

---

## Risks (from source plan, restated for this batch)

- **Scope creep on cockpit widgets.** Lock C to U3.2–U3.6 only. New cockpit widgets after this batch ships need their own plan.
- **shadcn lock-in.** Mitigated by code ownership — primitives live in our repo; can be forked any time.
- **Brand bikeshedding.** A5 task spec says: if undecided, default to slate + teal-600 primary + amber-500 accent and iterate later. Don't block A5 on a 1-week brand sprint.
- **Cmd-K scope.** B4 ships patients-only V1 and a scaffold for V1.1 (appointments / drugs / settings). Don't fan-scope B4 to all four sources at once.

---

## Cost calibration for this batch

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **Opus turns expected:** ~3–4 across the whole batch — B4 design (Cmd-K), D1 design (appointment-detail tab routing), one close-gate per sub-batch (×4).
- **Sonnet turns expected:** ~25–30 across the 17 tasks (1–2 turns per task on average).
- **Composer turns expected:** ~10–15 for doc-sync + status updates + brand-asset file moves.
- **Anti-pattern to watch:** "let me just keep going in this chat" across multiple tasks. Cut chat at task boundaries — each task file's `Model & execution guidance` block tells you what to pre-load.

---

## References

- **Source plan (living):** [plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- **Execution order:** [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md)
- **Companion agent plan (paused):** `c:\Users\abhisheksahil\.cursor\plans\clariva-ui-system-redesign_9a557ed2.plan.md`
- **Style precedents:** [text-consult batch](../../April%202026/28-04-2026/) for per-task `.md`s; [EHR batch](../03-05-2026/) for batch structure.

---

**Created:** 2026-05-06.  
**Status:** `Drafted, awaiting commit-start`.  
**Owner:** TBD.
