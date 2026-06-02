# Task ui-D3: List-page reskin pattern — AppointmentsList + PatientsList using new primitives

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch D (Reference page redesigns) — **M item, ~4h**

---

## Task overview

The two main list pages — [`AppointmentsListWithFilters.tsx`](../../../../../frontend/components/appointments/AppointmentsListWithFilters.tsx) and `PatientsListWithFilters.tsx` — each ship 100+ lines of `cn(...)` chip / button / card / filter copy-paste. They work, but they don't compose new primitives, they hard-code blue/gray Tailwind classes, and they drift visually with each new feature.

This task **reskins both** to use `Card`, `Button`, `Badge`, `Input`, `Select` from A2. Behavior is preserved exactly — same filters, same routing, same modals. The visual register changes; the API stays untouched.

**More importantly:** D3 establishes the **migration template** for every other list-style page in the app (settings sub-pages, opd-today list, service-reviews list, etc.). After D3 ships, the post-batch playbook is "do what AppointmentsListWithFilters does."

**Estimated time:** ~4h.

**Status:** Drafted.

**Hard deps:** A2 close (all primitives used by the reskin must exist).

**Soft deps:** B1 (the headers' "Add appointment" / "Add patient" CTAs become consistent with the new `Button` primitive).

**Source:** [U4.5 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u45--list-page-reskin-pattern).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded; pattern-match work; no architectural calls. D3 ports proven layout to new primitives.

**New chat?** Yes — fresh chat. Can be done in parallel with D1 + D2 (different files, no shared decisions).

**Pre-load (paste at start):**

- This task file (full).
- Current contents of [`AppointmentsListWithFilters.tsx`](../../../../../frontend/components/appointments/AppointmentsListWithFilters.tsx) and `PatientsListWithFilters.tsx`.
- A2's resolved primitives list.

**Estimated turns:** 2 (one per file).

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Filter row pattern

- [ ] **Filters wrap in a `<Card>`** with consistent padding (`p-4`).
- [ ] **Each filter** uses A2 primitives:
  - Status filter: `<Select>`.
  - Date filters: `<Input type="date">` (shadcn `Input` styles a native date input acceptably; if not, leave native input but skin via tokens).
  - Patient name search: `<Input type="search">` with a lucide `Search` icon prefix (use `Input` slot pattern or wrap in a `<div className="relative">`).
- [ ] **Labels** use the existing `<FieldLabel>` (refactored in A2 to compose shadcn `Label`).
- [ ] **Filter row layout** preserved: 4-column grid on `lg+`, 2-column on `sm`, 1-column on `<sm`.
- [ ] **`role="group"` + `aria-label`** preserved on the wrapping element.

### Header / actions

- [ ] **Page title** as `<h1 className="text-2xl font-semibold">`.
- [ ] **Action buttons** on the right: `<Button>` primitive instead of raw classes:
  - "Add appointment" / "Add patient" — `<Button variant="default">`.
  - "OPD today" link → `<Button variant="outline" asChild><Link>...</Link></Button>` (use `asChild` so Link composition works).
- [ ] **Spacing** preserved (`flex flex-wrap gap-4`).

### Result list

- [ ] **Each row is a `<Card>`** with hover state (`hover:bg-muted/50`).
- [ ] **Status pill** is a `<Badge variant="secondary">` (or color-mapped variant per existing logic).
- [ ] **Click target** is the whole card (`<Link>` wraps the `<Card>` content); preserves keyboard focus ring via shadcn `Card`'s focus styles.
- [ ] **Empty state** preserved: "No appointments match the current filters." / "No patients yet." — wrap in a centered `<Card>` with muted text.

### Token migration

- [ ] **Zero raw `bg-blue-*`, `bg-amber-*`, `bg-green-*`, `bg-gray-*`, `text-gray-*`, `border-gray-*`** in the two files post-reskin. Use:
  - `bg-card`, `text-card-foreground`, `border-border` for cards.
  - `bg-primary text-primary-foreground` for primary buttons.
  - `bg-success/10 text-success` (or `bg-success`) for success badges.
  - Map status colors via a small helper:
    ```ts
    const STATUS_BADGE: Record<AppointmentStatus, { variant: BadgeVariant; label: string }> = {
      confirmed: { variant: "success", label: "Confirmed" },
      pending: { variant: "warning", label: "Pending" },
      cancelled: { variant: "secondary", label: "Cancelled" },
      completed: { variant: "info", label: "Completed" },
    };
    ```
  - Add `success` / `warning` / `info` variants to the shadcn `Badge` component (variants live in the `Badge` file from A2; `class-variance-authority` config — extend it).

### Behavior preserved

- [ ] **Filtering logic untouched.** Same status filter, same date range, same name search. No regression.
- [ ] **Modals untouched.** `AddAppointmentModal`, `MergePatientsModal` etc. behave identically.
- [ ] **Navigation untouched.** Click row → detail page.
- [ ] **`router.refresh()` calls preserved** (used after add/merge to re-fetch).

### Migration template (this is the deliverable for the rest of the codebase)

- [ ] **Add a one-page comment block** at the top of `AppointmentsListWithFilters.tsx` describing the pattern:
  ```
  // List-page pattern (D3 reference implementation):
  //
  // 1. Filters in a <Card>, grid responsive (4/2/1 cols).
  // 2. Header with <h1> + right-aligned action <Button>s.
  // 3. List items as <Card> with hover state, full-card click target.
  // 4. Status as <Badge variant=...>; map status enum → variant via a const.
  // 5. Token-driven colors only (bg-card, bg-primary, success/warning/info).
  // 6. Empty state as a centered muted <Card>.
  //
  // To migrate another list page:
  //  - Copy the structure here, swap the data shape.
  //  - Status helpers live in lib/ui/status.ts (extracted in V1.1).
  //  - DO NOT add per-page chip styles — extend Badge variants instead.
  ```

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No regression on filter / search / route behavior.
- [ ] Mobile breakpoints OK at 375 / 768 / 1024 / 1440.

---

## Out of scope

- **Migrating other list pages** (settings, opd-today, service-reviews). They follow the pattern in a future batch.
- **Server-side filtering / pagination.** Existing pages are client-side filtered; this task doesn't change that.
- **Sorting.** No sort UI today; D3 doesn't add it.
- **Bulk actions.** None today; D3 doesn't add them.
- **Saved-filter chips.** Out of V1.

---

## Files expected to touch

**Frontend:**
- `frontend/components/appointments/AppointmentsListWithFilters.tsx` — **edit** (~200 LOC reflowed).
- `frontend/components/patients/PatientsListWithFilters.tsx` — **edit** (~150 LOC reflowed).
- `frontend/components/ui/badge.tsx` — **edit** (extend `class-variance-authority` variants to include `success`, `warning`, `info`).
- `frontend/lib/ui/status.ts` (optional) — **new** if you decide to extract the status-to-variant mapping; alternatively inline. Recommended: extract.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Adding Badge variants.** shadcn `Badge` ships with `default`, `secondary`, `destructive`, `outline` only. Add `success`, `warning`, `info` to match the status palette. This is a one-time edit to `frontend/components/ui/badge.tsx`'s CVA config; document the variants in the comment block at the top of the file so future contributors know they're project-extensions.
2. **`<Card>` as a clickable wrap.** shadcn `Card` is just a styled container. Wrap with `<Link href={...} className="block">` and the whole thing becomes the click target. Don't fight it.
3. **AddAppointmentModal etc.** These are big components; D3 doesn't reskin them in this task — they stay as-is (with possibly raw classes inside) until they're migrated in a follow-up. Document this in the migration playbook block.
4. **Why patients list isn't D2.** D2 is `patients/[id]` (the detail). D3 is `patients/` (the list). Two different files, two different concerns; bundling D3 with D2 muddles the deliverable.
5. **No SSR refactor.** The pages are RSC + client component split today; that stays.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch D](../plan-ui-system-redesign-batch.md#sub-batch-d--reference-page-redesigns-3-items-15-days)
- **Source item:** [U4.5 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u45--list-page-reskin-pattern)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** D1 (appointment detail), D2 (patient detail)
- **Reuses:** [`AddAppointmentModal`](../../../../../frontend/components/appointments/AddAppointmentModal.tsx), [`MergePatientsModal`](../../../../../frontend/components/patients/MergePatientsModal.tsx).
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on A2 close.
