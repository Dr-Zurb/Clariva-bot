# Task oq-03: `<OpdQueueDenseRow>` — single-row dense component

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 2, Lane β step 1 — **M, ~6h**

---

## Task overview

The clinical-grade single-row component the entire dense table (`oq-04`) renders for each queue entry. **Single line** at ~32 px (Default) / ~28 px (Compact). 12 columns. All info — name, MRN, phone, age/gender, service, modality, reason, scheduled time, waited time, status — visible at a glance with mono-tabular fields aligning down the columns. Hover-only action affordances. Tooltips for any field that has to truncate.

This is the **density keystone** of the batch — getting this row right is what makes 80-patient sessions tractable on one screen.

**Estimated time:** ~6h. The bulk is layout (column widths across breakpoints), tooltip wiring, modality icon mapping, status dot styling, and the click-to-copy phone affordance.

**Status:** Drafted.

**Hard deps:** [oq-02](./task-oq-02-frontend-types-update.md) shipped (so the typed row data is available).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D2, OQ-D4](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Bounded UI; primitives all exist (`getOpdStatusMeta`, `Badge`, `Tooltip`).

**Why not Opus:** layout is a single CSS grid; no transactional concerns; the visual primitives are already in the codebase.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/types/opd-doctor.ts` (post-oq-02).
- `frontend/lib/consultation/opd-status-meta.ts` (`getOpdStatusMeta` + `OpdStatus`).
- `frontend/components/ui/badge.tsx`, `frontend/components/ui/tooltip.tsx`.
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (precedent — copy the row visual language but go denser).
- Lucide icons: `Mic`, `Phone` (or `PhoneCall`), `MessageSquare`, `Video`, `Building`, `ChevronRight`, `MoreHorizontal`, `Copy`, `AlertCircle`.

**Composer-OK sub-steps:** none.

**Estimated turns:** 4–6 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueDenseRow.tsx` exporting:

  ```ts
  export type OpdQueueDensity = 'compact' | 'default';

  export interface OpdQueueDenseRowProps {
    entry: DoctorQueueSessionRow;
    /** Density preset; default `'default'`. */
    density?: OpdQueueDensity;
    /** When true, render the row in greyed-out "done" / "missed" style. */
    dimmed?: boolean;
    /** When true, render the "next up" left-accent treatment + (next) suffix. */
    isNextUp?: boolean;
    /** When true, the inline expand panel is open (parent owns the boolean). */
    expanded?: boolean;
    /** Toggles `expanded`. */
    onToggleExpand?: () => void;
    /** Click handler for the whole-row primary action. */
    onOpen: () => void;
    /** Slot for the right-edge action affordances (Open chevron + ⋯ overflow). Owned by oq-10. */
    actions?: React.ReactNode;
  }

  export function OpdQueueDenseRow(props: OpdQueueDenseRowProps): JSX.Element;
  ```

  - The `actions` slot is **non-negotiable** — it's how `oq-10` injects the action menu without `oq-03` and `oq-10` editing the same code path. If `actions` is `undefined`, the row renders an empty 64 px gutter (the eventual hover affordance area stays consistent).

### Layout (12 columns, single line, mono-tabular)

- [ ] Implement as a CSS grid (or flex with explicit basis) with the columns below. Default density = ~32 px row height. Compact density = ~28 px row height (set `text-xs leading-tight` + reduce `py-*`).

  | # | Name | Width (Default) | Content | Notes |
  |---|---|---|---|---|
  | 1 | Color bar | 4 px | `<div>` only — color from `getOpdStatusMeta(entry.queueStatus).badgeClassName` (background only) | No header in the parent table for this column. |
  | 2 | Token | 48 px mono | `#` + `tokenNumber` zero-padded if any row in the day has token ≥ 10 | Right-align. `font-tabular-nums`. |
  | 3 | Status | 110 px | Colored dot (8 px) + 1-word label from `getOpdStatusMeta` | Use `meta.icon` + `meta.label`. |
  | 4 | Patient | flex-1 | `entry.patientName`, **truncated** with ellipsis at column width. Tooltip = full name. | Bold. The only flex column. |
  | 5 | MRN | 120 px mono | `entry.medicalRecordNumber ?? '—'` | `font-tabular-nums text-muted-foreground`. |
  | 6 | Phone | 140 px mono | `entry.patientPhone` formatted | Click → copy to clipboard + 1 s "Copied" toast. Tooltip = "Click to copy". `font-tabular-nums`. |
  | 7 | Sex/Age | 70 px | `${gender ?? '—'} · ${age ?? '—'}` (no "y" suffix; e.g. `F · 42`) | Single token, no wrapping. |
  | 8 | Service | 140 px | `entry.serviceLabel ?? entry.catalogServiceKey ?? '—'` truncated | Tooltip = full label. |
  | 9 | Mode | 40 px | Modality icon (see icon map) | `aria-label` + `title` = full text ("In-clinic" / "Voice" / "Video" / "Text"). |
  | 10 | Reason | flex (max 280 px) | `entry.reasonForVisit ?? '—'` truncated | Tooltip = full reason. Subdued color. |
  | 11 | Sched | 64 px mono | Local-time `HH:mm` from `entry.scheduledAt` | `font-tabular-nums`. |
  | 12 | Waited | 64 px mono | See **Waited-time logic** | `font-tabular-nums`. |
  | 13 | Action slot | 64 px | `props.actions` (or empty gutter) | Right-aligned. Hover-only visibility (`opacity-0 group-hover:opacity-100 focus-within:opacity-100`). |

- [ ] On `<lg` breakpoints the row is **not used** — `oq-12` provides a separate `<OpdQueueMobileCard>`. The row component itself can return its grid output and the parent breakpoint-gates whichever component to render.

### Modality icon map

- [ ] Helper `function modalityIcon(t: string | null): { icon: LucideIcon; label: string }`:
  - `'in_clinic'` → `Building`, "In-clinic"
  - `'voice'` → `Phone` (or `Mic` — consult cockpit precedent), "Voice"
  - `'video'` → `Video`, "Video"
  - `'text'` → `MessageSquare`, "Text"
  - `null` / unknown → no icon, label `"—"`.
- [ ] Icons render at `h-4 w-4`, color from `text-muted-foreground` (or `text-foreground` when `entry.queueStatus === 'in_consultation'`).

### Status dot + label (column 3)

- [ ] Use `getOpdStatusMeta(entry.queueStatus)`:
  - The dot uses `meta.badgeClassName`'s background tone (extract via Tailwind utility or hardcode a mapping if extraction is awkward).
  - The label is `meta.label` (already short — "Waiting", "Called", "In consult", "Done", "No show", "Skipped", "Cancelled").
- [ ] When `dimmed`, opacity-60 the whole row (matches cockpit strip).

### Waited-time logic

- [ ] Compute `waitedMinutes = floor((Date.now() - new Date(entry.queueCreatedAt).getTime()) / 60_000)`.
- [ ] Render rules by status:
  - `waiting` / `called` → `${waitedMinutes} m`. Add a destructive `!` glyph when `waitedMinutes > 30`. Color: red-700.
  - `in_consultation` → render `'—'` (the doctor knows; not useful info on the row).
  - `completed` → render `'—'`.
  - `missed` / `skipped` / `cancelled` → render `'—'`.
- [ ] **Recompute on every render** but **don't re-render on a timer** — let the parent's polling interval (`useOpdSnapshot` ticks every 30 s) drive updates. **DO NOT** add a `setInterval` here.

### Phone click-to-copy

- [ ] On click of the phone cell:
  1. Call `navigator.clipboard.writeText(entry.patientPhone)`.
  2. Show a Sonner / toast saying "Phone copied" (use whatever toast lib the codebase uses — search `rg "useToast|toast(" frontend/` for the pattern).
  3. Stop propagation so the row click handler (`onOpen`) doesn't also fire.
- [ ] Tooltip on hover: "Click to copy".
- [ ] Keyboard: when the phone cell has focus, `Enter` / `Space` triggers the same copy + stop propagation.

### Whole-row click target

- [ ] The row `<tr>` (or grid container) has `onClick={onOpen}`, `role="button"`, `tabIndex={0}`, and `onKeyDown` to fire `onOpen()` on `Enter`.
- [ ] Children with their own click handlers (phone cell, action buttons) **must** call `e.stopPropagation()`.
- [ ] Cursor changes to pointer on hover.

### Visual differentiation — "next up"

- [ ] When `isNextUp === true` AND `entry.queueStatus === 'waiting'`:
  - Left accent border: 4 px solid primary color, replacing or layering the status color bar.
  - "(next)" suffix appended to the patient name with `text-primary text-xs font-medium ml-2`.
- [ ] Parent (`oq-04`) decides which row gets `isNextUp` (first `waiting` row, ordered by `tokenNumber`).

### "In consult" emphasis

- [ ] When `entry.queueStatus === 'in_consultation'`:
  - Subtle `bg-green-50/60` (light) / `bg-green-900/20` (dark) row background.
  - Pulsing dot in the status column (`animate-pulse` on the dot).

### Inline expand chevron (only used when `oq-05` lands)

- [ ] Replace the leading 4 px color bar with a chevron button when `onToggleExpand` is defined: `▶` / `▼` (rotate via CSS) at the row's left edge. Width still 4–8 px so the table doesn't reflow.
- [ ] When `onToggleExpand` is `undefined`, the color bar renders as before. (This decoupling lets `oq-04` ship without `oq-05` blocking it.)

### Accessibility

- [ ] Row `aria-label` = `"Token #{n}, {patientName}, {statusMeta.label}, waited {waitedMinutes} minutes"`.
- [ ] Phone copy button `aria-label` = `"Copy phone number {phone}"`.
- [ ] Modality icon has `aria-label` (no `aria-hidden`).
- [ ] Status dot is decorative (`aria-hidden`); the text label carries the meaning.
- [ ] Color is **never** the only signal — every status conveyance pairs color with text and/or icon.

### Snapshot test (light)

- [ ] One Vitest / RTL test under `frontend/__tests__/components/opd/OpdQueueDenseRow.test.tsx` covering:
  - Renders all 12 columns with a sample row.
  - Phone click copies + stops propagation (mock `navigator.clipboard`, assert `onOpen` wasn't called).
  - `isNextUp` adds the "(next)" suffix.
  - `dimmed` applies `opacity-60`.
  - `density='compact'` reduces row height (assert via class presence rather than getBoundingClientRect).

---

## Out of scope

- **The table shell** — `oq-04`.
- **The inline expand panel** — `oq-05`.
- **The action menu contents** — `oq-10`. This task ships an empty `actions` slot.
- **Filter / search** — `oq-07`, `oq-08`.
- **Density toggle UI** — `oq-12` adds the toggle; this task accepts `density` as a prop.
- **Mobile card** — `oq-12`.
- **Telemetry** — `oq-14`.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueDenseRow.tsx` (~280 LOC)
- `frontend/__tests__/components/opd/OpdQueueDenseRow.test.tsx` (~120 LOC)

**Modified:** none.

**Deleted:** none.

---

## Notes / open decisions

1. **Why a single component for both densities.** The visual primitives are identical; only the spacing scale differs. Two components would invite drift.
2. **Why no padding-left/right between columns.** The grid template handles spacing. Internal `px-2` per cell is fine; no `gap` between cells (cells are dividers themselves).
3. **Reason truncation length.** Cap at the first 40 characters; tooltip carries the rest. Don't try to be smart with word boundaries — just `text-overflow: ellipsis`.
4. **Mono fonts.** The codebase uses `font-tabular-nums` already (cockpit strip uses it). Do not import a new mono font.
5. **Phone formatting.** Pass through what the backend returns (`+91 98765 43210` style). Don't re-format here — that's a global concern; if the backend returns unformatted digits, the fix lives in the backend.
6. **Color bar vs. chevron decoupling.** The row needs to ship usefully **before** `oq-05` lands. The chevron variant is opt-in via `onToggleExpand`; absent that prop, the row keeps the color bar. `oq-04` initially passes `onToggleExpand` only after `oq-05` lands (or always, with the panel hidden).

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D2, OQ-D4](../plan-opd-queue-redesign-batch.md)
- **Status meta:** `frontend/lib/consultation/opd-status-meta.ts`
- **Cockpit precedent:** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx § QueueRow`
- **UI primitives:** `frontend/components/ui/{badge,tooltip,button}.tsx`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
