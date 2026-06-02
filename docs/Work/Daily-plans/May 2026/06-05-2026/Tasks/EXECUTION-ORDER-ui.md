# UI system redesign — Execution order (authoritative)

**Status:** Drafted — awaiting commit-start. Sub-batches A / B / C / D all in `Drafted` state.  
**Last doc sync:** 2026-05-06  
**Owner:** TBD  
**Scope:** 17 UI tasks across Sub-batches A–D (U1 + U2 + U3 + U4 from the source plan)  
**Total estimate:** ~6–7 dev-days solo · ~4 calendar days with B/C/D running in parallel after A  
**Parent batch plan:** [plan-ui-system-redesign-batch.md](../plan-ui-system-redesign-batch.md)  
**Source plan (living):** [plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md)  
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **Execute by Step column, not ID.** A1 → A2 → A3 ‖ A4 → A5 → (B / C / D in parallel). The Step column reflects real dependencies; the U-IDs are just stable identifiers.
2. **Sub-batch A is the hard prerequisite for everything.** Until tokens (A1) and shadcn primitives (A2) ship, B / C / D have nothing to compose against.
3. Within each sub-batch, the order respects: **hard intra-batch deps → cheapest unblocking item first → architectural items get Opus turns**.
4. **One topic per chat.** Each task file's `Model & execution guidance` block tells you what model to pick and what to pre-load. **Start a fresh chat per task.**
5. **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
6. After each task ships, update its row in the task file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-ui-system-redesign-batch.md](../plan-ui-system-redesign-batch.md). Three-way sync with the source U-ID in [plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md) at sub-batch close.

---

## Pre-flight — confirm before starting

```
- [ ] U0 strategic locks confirmed in plan-ui-system-redesign.md (user did this 2026-05-06)
- [ ] Brand identity question (U6.1) answered — see brand decision in task-ui-A5
- [ ] Frontend dev server runs clean: cd frontend && npm run dev
- [ ] Frontend type-check + lint clean BEFORE starting (so any new errors are clearly ours):
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] Recent screenshot of current dashboard saved for before/after comparison at the close-gate
```

If those are green, A1 is unblocked.

---

## Model-tier glossary (used in the tables below)

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label in tables | Model | Use for |
|---|---|---|---|
| 1 | **Opus** | Opus 4.7 Extra High | Architectural / multi-file decisions, security-sensitive code, close-gate review |
| 2 | **Sonnet** | Sonnet 4.6 Medium | Default workhorse — bounded UI tasks with clear specs |
| 3 | **Codex** | Codex 5.3 Medium | Sonnet alternative — pure code-gen / TS-error fix; alternate per task |
| 4 | **Composer** | Composer 2 Fast | Doc sync, status updates, file moves, markdown edits |

**Per-message escalation:** if Sonnet gets stuck on a single message (asks the same question twice, or ships type-failing code on a non-obvious error), **escalate that one message to Opus**. Don't switch the whole chat. Cursor's per-message picker handles this.

---

## Sub-batch A — Foundation (~1.5 days, 5 tasks)

Design-system spine. **Hard prerequisite for B, C, D.** No backend changes; new npm deps only.

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Unblocks |
|---|---|---|---|---|---|---|---|
| A1 | [A1 — Design tokens (CSS vars + Tailwind theme)](./task-ui-A1-design-tokens.md) | S (~3h) | — | brand decision (A5 / U6.1) — choose default if unanswered | **Sonnet** | Yes | A2 (shadcn reads tokens), every styling change downstream |
| A2 | [A2 — Bootstrap shadcn/ui primitives](./task-ui-A2-shadcn-bootstrap.md) | M (~5h) | A1 | — | **Sonnet** | Yes | B1, B2, B4, C1–C5, D1–D3 (all consume primitives) |
| A3 | [A3 — Inter via `next/font` + tabular-nums](./task-ui-A3-inter-typography.md) | XS (~1h) | — (parallel with A2) | — | **Sonnet** or **Composer** | Yes (or batch in same chat as A4) | C5 (schedule clock readability), D1 (vitals/dosage rows) |
| A4 | [A4 — `lucide-react` + replace inline SVGs](./task-ui-A4-lucide-icons.md) | XS (~2h) | — (parallel with A2 / A3) | — | **Sonnet** | Yes (or batch with A3) | B2 (sidebar icons), every icon use downstream |
| A5 | [A5 — Brand assets + `BRAND.md`](./task-ui-A5-brand-assets-and-doc.md) | S (~3h) | A1 (palette is referenced by tokens) | brand decision (U6.1) | **Sonnet** for `BRAND.md`; **Composer** for asset file drop | Yes for `BRAND.md`; Composer can stay in same session | All visual work downstream |

**Sub-batch A acceptance** (close gate):

- [ ] All 5 tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] `frontend/app/globals.css` declares `:root` (light) + `.dark` (placeholder) blocks with the canonical token names.
- [ ] `frontend/tailwind.config.ts` `theme.extend.colors` reads CSS vars via `hsl(var(--…))`.
- [ ] `frontend/components/ui/` contains `button`, `card`, `badge`, `input`, `select`, `tabs`, `dialog`, `sheet`, `dropdown-menu`, `tooltip`, `command`, `skeleton`, `separator`, `scroll-area`, plus refactored `SaveButton` / `FieldLabel` / `UnsavedLeaveGuard` composing primitives.
- [ ] `frontend/app/layout.tsx` loads Inter via `next/font`; `<html>` has `font-sans antialiased`.
- [ ] `lucide-react` installed; at least the existing 4 inline `<svg>` blocks are replaced with `<lucide-react>` icons.
- [ ] `frontend/public/brand/` has `logo.svg`, `logomark.svg`, `og.png`. Favicon source updated.
- [ ] `docs/Reference/business/BRAND.md` exists with palette HSL values, type scale, voice/tone notes.
- [ ] Frontend type-check + lint clean.
- [ ] **Close-gate review:** fresh Opus chat with the diff: "review Sub-batch A against the acceptance checklist above; flag any gaps before B/C/D unblock."

---

## Sub-batches B, C, D — run in PARALLEL after A

Three parallel tracks. Different files. Same `frontend/components/ui/` only at the import line.

- **B = shell** (Header / Sidebar / DashboardShell + Cmd-K). Visible immediately on every page.
- **C = cockpit** (`app/dashboard/page.tsx` body). Highest-leverage single page.
- **D = reference pages** (appointment detail, patient detail, list-page pattern). Sets the migration template.

Solo: ship B first (highest perceived impact — every page lights up); C second (the home page becomes a product); D third (sets pattern for everything else). Two devs: split B + C across the same day.

### Sub-batch B — Shell (~1.5 days, 4 tasks)

Header + Sidebar + DashboardShell + global Cmd-K. New optional backend route for B3 counts.

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Unblocks |
|---|---|---|---|---|---|---|---|
| B1 | [B1 — `Header.tsx` redesign](./task-ui-B1-header-redesign.md) | M (~5h) | A2 close | A5 (logo asset) | **Sonnet** | Yes | — |
| B2 | [B2 — `Sidebar.tsx` 4-section regrouping + lucide icons](./task-ui-B2-sidebar-regrouping.md) | M (~4h) | A2 close, A4 (lucide) | — | **Sonnet** | Yes | B3 (counts mount in regrouped sidebar) |
| B3 | [B3 — Sidebar badge counts + desktop collapse](./task-ui-B3-sidebar-counts-and-collapse.md) | M (~5h) | B2 | optional `/v1/dashboard/counts` aggregator | **Sonnet**; **Opus** if you decide to ship the aggregator (security/RLS path) | Yes | — |
| B4 | [B4 — Cmd-K global search](./task-ui-B4-cmd-k-global-search.md) | L (~6h) | A2 (Command primitive) | — (parallel with B1–B3) | **Opus** for design turn, **Sonnet** for impl | Yes (split: 1 Opus chat for design, 1 Sonnet chat for impl) | — |

**Sub-batch B acceptance** (close gate):

- [ ] All 4 tasks marked `Status: Shipped`.
- [ ] Header shows brand mark + practice pill + Start consult CTA + bell + profile dropdown. No raw "Logged in as ..." text.
- [ ] Sidebar regrouped into TODAY / CARE / INBOX / SETUP with lucide icons + live badge counts.
- [ ] Cmd-K palette opens via `Cmd+K` / `Ctrl+K` from any dashboard page; searches patients (V1).
- [ ] Mobile drawer behavior preserved (no regression).
- [ ] Type-check + lint clean.
- [ ] Close-gate Opus review with diff.

### Sub-batch C — Today cockpit (~1.5–2 days, 5 tasks)

Replaces `app/dashboard/page.tsx` body. Composes existing data sources only.

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Unblocks |
|---|---|---|---|---|---|---|---|
| C1 | [C1 — Cockpit scaffold + KPI strip](./task-ui-C1-cockpit-scaffold.md) | S (~3h) | A2 close | B1 (Header pulls Start consult, but cockpit can render with header in old state) | **Sonnet** | Yes | C2, C3, C4, C5 |
| C2 | [C2 — Now / Next card](./task-ui-C2-cockpit-now-next.md) | M (~5h) | C1 | — | **Sonnet** | Yes | — |
| C3 | [C3 — OPD queue strip](./task-ui-C3-cockpit-opd-strip.md) | S (~3h) | C1 | — (parallel with C2) | **Sonnet** | Yes | — |
| C4 | [C4 — Inbox column](./task-ui-C4-cockpit-inbox-column.md) | M (~5h) | C1 | — (parallel with C2 / C3) | **Sonnet** | Yes | — |
| C5 | [C5 — Today's schedule](./task-ui-C5-cockpit-todays-schedule.md) | S (~3h) | C1 | — (parallel with C2 / C3 / C4) | **Sonnet** | Yes | — |

**Sub-batch C acceptance** (close gate):

- [ ] All 5 tasks marked `Status: Shipped`.
- [ ] `app/dashboard/page.tsx` body is the cockpit composition. The "Welcome" sentence is gone.
- [ ] Now / Next card primary CTA gets the doctor into a consult in ≤2 clicks from login (per Success Criteria in source plan).
- [ ] OPD strip hidden for non-OPD doctors (verify via doctor settings flag).
- [ ] No vanity charts (U3.7 lock).
- [ ] Type-check + lint clean.
- [ ] Close-gate Opus review with diff.

### Sub-batch D — Reference pages (~1.5 days, 3 tasks)

Sets migration template for inner pages. Each task is independent; fully parallel-eligible.

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Unblocks |
|---|---|---|---|---|---|---|---|
| D1 | [D1 — Appointment detail 3-zone + tabs](./task-ui-D1-appointment-detail-three-zone.md) | L (~6h) | A2 close | B1 (Start consult CTA exists; if not, D1 ships its own header CTA) | **Opus** for tab routing decision; **Sonnet** for impl | Yes (split: 1 Opus chat for design, 1 Sonnet chat for impl) | Pattern for all detail pages |
| D2 | [D2 — Patient detail tabs + right rail](./task-ui-D2-patient-detail-tabs-and-rail.md) | L (~6h) | A2 close | D1 (reuses tab pattern) | **Sonnet** (D1 settles the pattern) | Yes | — |
| D3 | [D3 — List-page reskin pattern](./task-ui-D3-list-page-reskin-pattern.md) | M (~4h) | A2 close | — | **Sonnet** | Yes | Migration template for every other list page in the app |

**Sub-batch D acceptance** (close gate):

- [ ] All 3 tasks marked `Status: Shipped`.
- [ ] Appointment detail page is 3-zone with Tabs (Overview / Consult / Prescriptions / Artifacts).
- [ ] Patient detail page is header + Tabs + right rail with allergies/DDI banners + problem-list snapshot.
- [ ] AppointmentsList and PatientsList compose new primitives (no raw `bg-blue-600` etc. in those files).
- [ ] No regression in existing flows (smoke: open appointment → start consult → write Rx → send).
- [ ] Type-check + lint clean.
- [ ] Close-gate Opus review with diff.

---

## Whole-batch close gate

After all four sub-batches close, run the whole-batch acceptance from [plan-ui-system-redesign-batch.md § Whole-batch acceptance gate](../plan-ui-system-redesign-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, ask for a final grade against the success-criteria table from the source plan.

---

## Cost calibration for this batch

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns | Notes |
|---|---|---|---|---|
| Sub-batch A | 0–1 (close gate) | 4–6 | 1–2 (asset move) | A1 + A2 may need an Opus escalation if shadcn pattern surfaces a config decision |
| Sub-batch B | 2–3 (B4 design + B close gate; optional B3 if aggregator endpoint chosen) | 8–10 | 1 (status sync) | B4 is the heaviest — split design / impl chats |
| Sub-batch C | 1 (C close gate) | 6–8 | 1 (status sync) | Pure composition; Sonnet handles each card cleanly |
| Sub-batch D | 2–3 (D1 design + D close gate) | 6–8 | 1 (status sync) | D1 is architectural; D2 + D3 inherit pattern |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way sync `[SHIPPED]` markers) | |
| **Totals** | **~6–8** | **~25–30** | **~5–7** | Roughly 12–15% Opus / 70–75% Sonnet / 12–15% Composer — matches the guide's TL;DR ratios |

**Red flag heuristic:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file is the spec; if it's vague, every chat pays for the vagueness.

---

## References

- [plan-ui-system-redesign-batch.md](../plan-ui-system-redesign-batch.md) — master batch plan (this doc's parent)
- [plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md) — source product plan (living)
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- [Style precedent — EHR EXECUTION-ORDER](../../03-05-2026/Tasks/EXECUTION-ORDER-ehr.md)
- [Style precedent — text-consult task files](../../../April%202026/28-04-2026/Tasks/)

---

**Created:** 2026-05-06.  
**Status:** `Drafted` — awaiting commit-start.
