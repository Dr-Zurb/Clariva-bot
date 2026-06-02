# Task ui-C3: Cockpit OPD queue strip

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch C (Today cockpit) — **S item, ~3h**

---

## Task overview

OPD doctors spend the day inside the queue. Today they have to navigate to `/dashboard/opd-today` to see who's waiting; the cockpit's OPD strip surfaces the top 5 entries inline so a glance at the dashboard tells them everything they need.

The strip lives below the Now/Next card in the cockpit grid (C1 scaffold). Conditional render: **only doctors with OPD mode enabled in practice setup see this strip.** Doctors running pure online practice see nothing — no empty state, no placeholder, just absence (saves vertical space).

**Estimated time:** ~3h.

**Status:** Drafted.

**Hard deps:** C1 (cockpit scaffold mount point). A2 close (`Card`, `Badge`, `Skeleton`).

**Soft deps:** B3 (`useDashboardCounts` already polls `opdLive` count; the strip needs the actual top 5 entries — separate fetch).

**Source:** [U3.3 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u33--opd-queue-strip).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded; one fetch + render; conditional flag check. Sonnet handles cleanly.

**New chat?** Yes — fresh chat. Independent of C2.

**Pre-load (paste at start):**

- This task file.
- C1's resolved cockpit scaffold + `OpdQueueStrip.tsx` placeholder.
- The OPD service shape — paste `rg "queue" backend/src/services/opd-doctor-service.ts -l` and read the relevant function signatures, OR paste the existing snapshot endpoint's response shape.
- The doctor settings shape for the OPD-mode flag — paste from `backend/src/types/` or wherever defined.

**Estimated turns:** 1–2.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Conditional render

- [ ] **OPD-mode flag check.** Read from doctor settings (the same source the sidebar uses to show "OPD queue" item — verify in B2's nav config). If `opd_mode_enabled !== true`, the component returns `null`. No empty state, no banner.
- [ ] **Loading-state for the flag itself:** while the flag is fetching, show a 1-line `Skeleton` at the strip's height to avoid layout shift, then resolve to render-or-null.

### Data fetch

- [ ] **Use the OPD snapshot endpoint** that powers `/dashboard/opd-today`. Likely `GET /api/v1/opd/session/snapshot` (verify against [`backend/src/routes/api/v1/opd.ts`](../../../../../backend/src/routes/api/v1/opd.ts)).
- [ ] **Top 5 entries only.** If the API returns more, slice client-side. If <5 exist, render only what's there.
- [ ] **Polling cadence:** 30s (matches B3 cadence; if `useDashboardCounts` is already polling, don't double-poll the same endpoint — extract a shared hook OR accept the duplication for V1 simplicity).
- [ ] **Visibility-pause** like B3.

### Component render

- [ ] **`<Card>` with header**: title "OPD queue", subtitle muted "`<count>` waiting · est. wait `<minutes>m` median" (median wait is a stretch goal; if the snapshot endpoint doesn't expose it, drop and just show count).
- [ ] **Header right-side action**: link "View all →" routing to `/dashboard/opd-today`.
- [ ] **Body**: list of 5 entries. Each entry:
  ```
  ┌──────────────────────────────────────────────────────────┐
  │ #3  Patient name              waited 12m   [Call in]     │
  └──────────────────────────────────────────────────────────┘
  ```
  - Position number (`#1`, `#2`, ...).
  - Patient name (truncated at ~24 chars with ellipsis).
  - Wait time as `<n>m` or `<h>h <m>m`.
  - Status pill (`Badge` — "Waiting" / "Called" / "In consult" / "No show").
  - Inline mini-action (e.g., `Call in` → triggers the existing OPD service action) ONLY if the snapshot includes the action context; otherwise, a "→" routes to `/dashboard/opd-today` with the entry highlighted.

### Empty / error

- [ ] **Empty (zero entries, OPD-mode-enabled doctor):** "Queue is empty. Patients will appear here as they check in."
- [ ] **Error:** muted "Couldn't load queue. Tap to retry."

### General

- [ ] Wait time uses `font-tabular` (A3) so digits don't bounce.
- [ ] No PHI in telemetry — fire `cockpit.opd_strip.viewed` (count only, no patient IDs).
- [ ] Type-check + lint clean.
- [ ] Mobile breakpoints: list rows wrap acceptably or the action link drops below the wait time on `<sm`.

---

## Out of scope

- **Calling a patient in directly from the cockpit** beyond a single existing-API call. If the OPD service has a richer "call in" workflow, route to `/dashboard/opd-today` instead of replicating it here.
- **Drag-to-reorder queue.** OPD page owns it.
- **Patient details on hover.** The list is a strip, not a fly-out.
- **Showing entries beyond top 5.** Paginate at OPD page.

---

## Files expected to touch

**Frontend:**
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` — **edit** (~180 LOC, replaces C1 placeholder).
- `frontend/hooks/useOpdSnapshot.ts` (optional extract) — **new** (~80 LOC) if not already extracted from `/dashboard/opd-today` page.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **OPD-mode flag source.** Likely `doctor_settings.opd_mode_enabled` — confirm. If the sidebar (B2) doesn't already conditionally hide "OPD queue" for non-OPD doctors, this task surfaces that as a follow-up: hide the sidebar item for the same flag, for consistency.
2. **Reusing B3's count.** `useDashboardCounts.opdLive` and the strip's "n waiting" should match. If they're polling different endpoints with different cadences they'll drift; document the discrepancy or consolidate.
3. **Status pill colors.** Map to status enum: `Waiting` → muted; `Called` → info-blue; `In consult` → success-green; `No show` → destructive-red. Use semantic tokens, not raw colors.
4. **Why top 5 (not 3 or 10).** 5 is what fits at desktop without scrolling and matches the cockpit's information-density target (U0.4). Tunable later.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch C](../plan-ui-system-redesign-batch.md#sub-batch-c--today-cockpit-5-items-152-days)
- **Source item:** [U3.3 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u33--opd-queue-strip)
- **Hard deps:** [task-ui-C1-cockpit-scaffold.md](./task-ui-C1-cockpit-scaffold.md), [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** C2, C4, C5
- **Reuses:** OPD snapshot endpoint, `/dashboard/opd-today` page (link target)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on C1 close.
