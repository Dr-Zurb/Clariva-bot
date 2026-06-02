# Task oq-05: `<OpdQueueRowExpanded>` — inline-expand secondary panel

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 2, Lane β step 3 — **S, ~4h**

---

## Task overview

Optional inline-expand row that appears beneath a clicked row to reveal the **secondary clinical context** the dense row can't carry: last-visit date, allergies / flags, episode link, full reason text, and the patient's notes-for-doctor. Doctor can peek at deeper context **without** leaving the queue page (faster than navigating to the appointment detail and back, then losing scroll position on the queue).

**Estimated time:** ~4h. Bulk is the data fetcher (lazy load on first expand) + skeleton + the panel layout.

**Status:** Drafted.

**Hard deps:** [oq-03](./task-oq-03-dense-row-component.md) shipped (the row provides the chevron toggle).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D4 (inline expand)](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why not Opus:** the data is doctor-already-authorized PHI from existing endpoints; we just compose it into a panel.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueDenseRow.tsx` (post-oq-03).
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- Existing patient-chart endpoint discovery — search `rg "patient-chart|/api/v1/patients/.*chart" frontend/lib/api.ts` to find the existing client function. If none, see Notes #1 below.

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueRowExpanded.tsx` exporting:

  ```ts
  export interface OpdQueueRowExpandedProps {
    entry: DoctorQueueSessionRow;
    /** Doctor JWT for fetching the side data. */
    token: string;
    /** Optional callback fired when the panel data finishes its first load (telemetry, pre-warm). */
    onLoaded?: () => void;
  }

  export function OpdQueueRowExpanded(props: OpdQueueRowExpandedProps): JSX.Element;
  ```

### Layout

- [ ] Renders as a single full-width row spanning all columns of `OpdQueueTable`. Use `<tr><td colSpan={…}>` if the table is `<table>`, or a full-width grid item if it's CSS-grid.
- [ ] Background: subtle `bg-muted/40` so it visually nests under the parent row.
- [ ] Internal layout — three columns at `lg+`:

  ```
  ┌── Column 1 (flex-1) ──────────┬── Column 2 (flex-1) ──┬── Column 3 (flex-1) ──┐
  │ Last visit · 12-Apr-2026      │ Allergies (red ⚠)     │ Episode               │
  │ Service: GP consult           │  · Penicillin         │  · cough/2026-04      │
  │ Diagnosis: viral URI          │  · Sulfa drugs        │  · 3rd visit          │
  │                               │ Flags                 │  → Open episode       │
  │                               │  · Pregnant           │                       │
  ├───────────────────────────────┴───────────────────────┴───────────────────────┤
  │ Reason for visit (full text):                                                 │
  │ Acidity / 4 days. Worse at night. Tried OTC antacid …                         │
  ├───────────────────────────────────────────────────────────────────────────────┤
  │ Patient note for doctor (booking message):                                    │
  │ "I had this same issue last year…"                                            │
  └───────────────────────────────────────────────────────────────────────────────┘
  ```

  Below `lg`, stack the 3 columns vertically. Below `md`, also stack reason / note inline.

### Data sources (read-only — no new endpoints)

- [ ] **Last visit + last diagnosis** — derive from the existing patient appointments list. Find the most recent `status === 'completed'` appointment for the same `patient_id` with `appointment_date < entry.scheduledAt`. If a helper already exists in `lib/api.ts` (search `getPatientAppointments` / `listPatientAppointments`) use it; otherwise add a small fetcher locally that consumes whatever endpoint is closest. **DO NOT** create a new endpoint in this task — if no read path exists, render `Last visit: —` and add a "Fetch helper TBD" comment.
- [ ] **Allergies + flags** — call the patient-chart `allergies` endpoint already wired by the EHR foundation batch (search `rg "chart/allergies\b" frontend/lib/api.ts`). If a `getPatientAllergies(token, patientId)` already exists, use it. Render up to 3 chips inline; show `+N more` for the rest with a tooltip listing all.
- [ ] **Episode** — when `entry.episodeId` is non-null, render a link `Episode {episode.label}` with episode visit count if cheaply available; otherwise just the link `→ Open episode`. Episode lookup helper: search `rg "getEpisode|episodes/.*api" frontend/lib/api.ts`. Skip the episode column entirely when `episodeId` is null.
- [ ] **Reason for visit** — already on `entry.reasonForVisit`; render full text (no truncation). When null, render `—`.
- [ ] **Patient note** — comes from the appointment's `notes` column (PHI; doctor-authorized). If the queue endpoint payload doesn't already include `notes`, **do not extend `oq-01`** — add a tiny `appointmentId → notes` fetch on demand. **OR** add `notes` to the payload in `oq-01` (cheap; same row already has the appointment). Pick the latter — file an `oq-01` follow-up if needed.

### Lazy fetching

- [ ] The component fetches **only on mount** (i.e., the first time the row is expanded). Once data is loaded, keep it in memory until unmount.
- [ ] Use the codebase's existing fetcher pattern (React Query / `useEffect` + `useState`). If React Query is the standard (search `useQuery` in `frontend/hooks/`), use it with cache key `['opd-row-expanded', entry.appointmentId]` and a 5-minute stale time.
- [ ] **Loading state:** three skeleton blocks matching the 3-column layout. ~16 px tall blocks.
- [ ] **Error state:** muted notice "Couldn't load patient context. [Retry]".
- [ ] **Empty / partial:** render whatever did load; missing fields show `—`.

### Wiring into `OpdQueueTable`

- [ ] `OpdQueueTable` (oq-04) accepts `expandedEntryId` and `onToggleExpand`. This task wires the actual mount:
  - When `expandedEntryId === entry.entryId`, render `<OpdQueueRowExpanded>` directly **after** the parent row (sibling sibling — same parent container).
  - Single-row expand at a time. Toggling another row's chevron auto-collapses the previous.
- [ ] `oq-03`'s row component accepts an `expanded` boolean and rotates its chevron via CSS.

### Accessibility

- [ ] Panel `role="region"`, `aria-label="Patient context for token #${tokenNumber}"`.
- [ ] Episode link / Open episode action has a real `<a>` (or Next `<Link>`).
- [ ] Allergy chips have `role="img"` + descriptive `aria-label` so screen readers announce "Allergy: penicillin".

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Adding new API endpoints** — the panel composes only from already-authorized doctor surfaces.
- **Editing patient data from the panel** — read-only. Editing flows live on the patient profile page.
- **Persisting expand state across reloads** — single-session memory only.
- **Multi-row simultaneous expand** — single-row at a time.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueRowExpanded.tsx` (~220 LOC)

**Modified:**
- `frontend/components/opd/OpdQueueTable.tsx` (~10 LOC — wire the expanded mount)
- `frontend/components/opd/OpdQueueDenseRow.tsx` (~5 LOC — chevron toggle behavior wired to `onToggleExpand`)

**Deleted:** none.

---

## Notes / open decisions

1. **No patient-chart endpoint helpers in `lib/api.ts` yet?** The EHR foundation batch (T1.x) added them. If you can't find any, **stop and check `backend/src/routes/api/v1/patient-chart-routes.ts`** — the routes exist server-side; the frontend client wiring may be on a parallel branch. Worst case, add the missing client function here as a tiny additive helper (~15 LOC).
2. **`appointment.notes` exposure.** The doctor already sees this on the appointment detail page; it's safe to surface here. If `oq-01`'s payload doesn't yet include it, ship a follow-up edit on `oq-01` (one-line widening) rather than a second fetch.
3. **Cache key strategy.** Keying by `appointmentId` (not `entryId`) because the patient context is appointment-scoped, not queue-entry-scoped. Re-queueing doesn't change the underlying patient data.
4. **Why not a side drawer instead of inline expand.** Source plan (OQ-D4) prefers inline because it preserves scroll context and lets the doctor compare two patients quickly by expanding-collapsing different rows. Drawer is a fallback if the inline panel proves too cramped on `<lg`.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D4](../plan-opd-queue-redesign-batch.md)
- **Row component:** [task-oq-03-dense-row-component.md](./task-oq-03-dense-row-component.md)
- **Table shell:** [task-oq-04-table-shell-grouping.md](./task-oq-04-table-shell-grouping.md)
- **Existing patient-chart routes:** `backend/src/routes/api/v1/patient-chart-routes.ts`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
