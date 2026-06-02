# Task cv2-03: Telemed-Video template literal + `<PanePlaceholder>` + `/v2-tree` route

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 3, Lane α step 1 — **S, ~5h**

---

## Task overview

End-to-end smoke for the Phase 1 shell tree: ship a real `PaneDefinition` tree that renders the 8-pane Telemed-Video default layout sketch from the source plan, mount it at a new side-by-side route `/dashboard/appointments/[id]/v2-tree`, and verify the recursive renderer + tree persistence + the future-proofing contracts (cv2-09) all hold together.

The renderer leaves all 8 leaves as **synthetic `<PanePlaceholder>` components** — each shows its pane title + icon + "Phase 2 will mount real content here" line. The point is to prove the *shell* end-to-end without dragging Phase 2 content (Snapshot, History, Body, Assessment, Investigations-orders, Plan, Subjective, Objective panes) forward. Those extractions belong in Phase 2 batches (R-CHART, R-HISTORY, R-MIDDLE).

The existing `/v2` route is **left untouched** — it remains the regression-safe rollback path. Both routes coexist throughout Phase 1; Phase 2 promotes `/v2-tree` to `/v2`'s slot once R-MIDDLE + R-CHART + R-HISTORY have shipped real content.

**Estimated time:** ~5h (1.5h Telemed-Video template literal in `templates.ts` + 30min `<PanePlaceholder>` component + 1h `/v2-tree` page route + 30min PatientProfilePage prop plumbing + 1h verification + 30min docs).

**Status:** Pending.

**Hard deps:** cv2-02 (the `PaneTreeNode` shape + new storage key + tree-aware hook setters).

**Source:** [plan-cockpit-v2-batch.md § Wave 3 Lane α](../plan-cockpit-v2-batch.md#wave-3--shell-continuation--rx-form-refactor-4-tasks-24h-with-parallelism-2-parallel-lanes-after-wave-2-ships) + the 8-pane layout sketch in [Product plans/plan-cockpit-v2.md § The 8-pane default layout](../../../Product%20plans/plan-cockpit-v2.md#the-8-pane-default-layout) + DL-2, DL-3, DL-4.

---

## Model & execution guidance

**Recommended model:** **Auto** (default). One template literal + one placeholder component + one page route. Mechanical wiring; the layout sketch in the source plan dictates every leaf's id + title + icon + relative sizes.

**Per-message escalation rule:** if Auto stalls on the placeholder's icon imports (the 8 leaves use 8 different `lucide-react` icons), escalate that **one message** to Opus 4.7 Extra High.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/lib/patient-profile/layout-tree.ts` (post-cv2-02 — the `PaneTreeNode` shape).
- `frontend/lib/patient-profile/types.ts` (post-cv2-01 + cv2-09 — the `PaneDefinition` shape).
- `frontend/components/patient-profile/Shell.tsx` (post-cv2-01 + cv2-02 — the consumer).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the mount pattern from ppr-07).
- `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (the existing flat-shell route — this task copies the file structure to `/v2-tree`).
- `frontend/app/dashboard/appointments/[id]/page.tsx` (the appointment-detail mount — verify nothing about it changes).
- Source plan §"The 8-pane default layout" (the visual reference).

**Estimated turns:** 3 turns (1 templates.ts + PanePlaceholder, 1 page route + PatientProfilePage prop, 1 verification).

---

## Acceptance criteria

### Step 1 — `<PanePlaceholder>` component

- [ ] **New file** `frontend/components/patient-profile/PanePlaceholder.tsx`:

  ```tsx
  'use client';

  import type { LucideIcon } from 'lucide-react';
  import { cn } from '@/lib/utils';

  export interface PanePlaceholderProps {
    /** Pane title (also shown in the shell's pane header). */
    title: string;
    /** Optional Lucide icon shown above the title. */
    icon?: LucideIcon;
    /** Phase 2 / 3 R-item that will replace this placeholder. */
    futureRItem?: string;
    /** Tailwind classes for the wrapper (defaults to a muted card). */
    className?: string;
  }

  /**
   * Synthetic leaf used by the cv2-03 Telemed-Video template to prove the
   * shell tree without depending on Phase 2 content. Renders a centered
   * card with the pane's title + icon + a "Phase 2 will mount real content
   * here" line tagged with the responsible R-item.
   *
   * Retired by Phase 2: each pane's first content task imports the real
   * component and removes its PanePlaceholder leaf from templates.ts.
   */
  export function PanePlaceholder({
    title,
    icon: Icon,
    futureRItem,
    className,
  }: PanePlaceholderProps) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center',
          'bg-muted/20 text-muted-foreground',
          className,
        )}
        data-pane-placeholder={title}
      >
        {Icon && <Icon className="h-8 w-8" aria-hidden />}
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="max-w-xs text-xs leading-relaxed">
          Phase 2 will mount real content here
          {futureRItem ? ` (${futureRItem})` : null}.
        </p>
      </div>
    );
  }

  export default PanePlaceholder;
  ```

### Step 2 — Telemed-Video template literal

- [ ] **New file** `frontend/lib/patient-profile/templates.ts`:

  ```ts
  /**
   * templates.ts — modality-aware layout templates (cv2-03 ships the
   * Telemed-Video template only; R-MOD adds the other three +
   * In-Clinic variants in Phase 2).
   *
   * Each template is a PaneDefinition tree. The tree's leaves render
   * synthetic <PanePlaceholder> in Phase 1; Phase 2 / 3 swaps real
   * content in as their R-items ship.
   */

  import type { PaneDefinition } from './types';
  import { PanePlaceholder } from '@/components/patient-profile/PanePlaceholder';
  import {
    Heart,           // Snapshot
    Clock,           // History
    Video,           // Body
    ClipboardCheck,  // Assessment
    Beaker,          // Investigations-orders
    Pill,            // Plan
    MessageSquare,   // Subjective
    Activity,        // Objective
  } from 'lucide-react';

  // ---------------------------------------------------------------------------
  // Telemed-Video default layout. See plan-cockpit-v2.md § "The 8-pane
  // default layout" for the visual sketch.
  //
  //  ┌──────────────┬───────────────────────┬──────────────┐
  //  │ Snapshot     │ Body                  │ Subjective   │
  //  │  ────────    │  ──────────────────── │  ──────────  │
  //  │ History      │ (Assessment sticky)   │ Objective    │
  //  │              │  Investigations | Plan│              │
  //  └──────────────┴───────────────────────┴──────────────┘
  //
  // - Outer group: horizontal, 3 columns (left 22% / middle 56% / right 22%).
  // - Left column: vertical, Snapshot top 40% / History bottom 60%.
  // - Middle column: vertical, Body top 50% / Bottom 50%. The Bottom
  //   region is itself a horizontal group: Investigations 40% / Plan 60%.
  //   The Assessment "sticky strip" is rendered as a third sibling of
  //   the inner horizontal — explicitly direction-overridden to render
  //   above the Investigations | Plan row.
  // - Right column: vertical, Subjective top 50% / Objective bottom 50%.
  // ---------------------------------------------------------------------------

  export const TELEMED_VIDEO_TEMPLATE: PaneDefinition[] = [
    {
      id: 'left-column',
      title: 'Patient',
      render: () => null, // group node — Shell ignores render() when children present
      children: [
        {
          id: 'snapshot',
          title: 'Snapshot',
          icon: Heart,
          render: () => (
            <PanePlaceholder
              title="Snapshot"
              icon={Heart}
              futureRItem="R-CHART"
            />
          ),
          naturalSizePct: 40,
          minSizePx: 200,
        },
        {
          id: 'history',
          title: 'History',
          icon: Clock,
          render: () => (
            <PanePlaceholder
              title="History"
              icon={Clock}
              futureRItem="R-HISTORY"
            />
          ),
          naturalSizePct: 60,
          minSizePx: 240,
        },
      ],
      naturalSizePct: 22,
      minSizePx: 240,
    },
    {
      id: 'middle-column',
      title: 'Consult',
      render: () => null,
      children: [
        {
          id: 'body',
          title: 'Body (Video)',
          icon: Video,
          render: () => (
            <PanePlaceholder
              title="Body (Video)"
              icon={Video}
              futureRItem="R-MIDDLE (top)"
            />
          ),
          naturalSizePct: 50,
          minSizePx: 280,
        },
        {
          id: 'middle-bottom',
          title: 'Plan & Investigations',
          render: () => null,
          direction: 'horizontal',
          children: [
            {
              id: 'investigations-orders',
              title: 'Investigations',
              icon: Beaker,
              render: () => (
                <PanePlaceholder
                  title="Investigations (orders)"
                  icon={Beaker}
                  futureRItem="R-MIDDLE (bottom-left)"
                />
              ),
              naturalSizePct: 40,
              minSizePx: 200,
            },
            {
              id: 'plan',
              title: 'Plan (Rx)',
              icon: Pill,
              render: () => (
                <PanePlaceholder
                  title="Plan (Rx)"
                  icon={Pill}
                  futureRItem="R-MIDDLE (bottom-right) + R-RX-FORM"
                />
              ),
              naturalSizePct: 60,
              minSizePx: 280,
            },
          ],
          naturalSizePct: 50,
          minSizePx: 360,
        },
      ],
      naturalSizePct: 56,
      minSizePx: 480,
    },
    {
      id: 'right-column',
      title: 'Notes',
      render: () => null,
      children: [
        {
          id: 'subjective',
          title: 'Subjective',
          icon: MessageSquare,
          render: () => (
            <PanePlaceholder
              title="Subjective (CC + HOPI)"
              icon={MessageSquare}
              futureRItem="R-MIDDLE (right-top)"
            />
          ),
          naturalSizePct: 50,
          minSizePx: 220,
        },
        {
          id: 'objective',
          title: 'Objective',
          icon: Activity,
          render: () => (
            <PanePlaceholder
              title="Objective (vitals, exam)"
              icon={Activity}
              futureRItem="R-MIDDLE (right-bottom)"
            />
          ),
          naturalSizePct: 50,
          minSizePx: 220,
        },
      ],
      naturalSizePct: 22,
      minSizePx: 240,
    },
  ];
  ```

- [ ] **Why no Assessment leaf in this template?** The source plan's Assessment "sticky strip" sits *above* the Investigations | Plan horizontal split, not as a sibling pane. Implementing the sticky strip requires the shell to support a non-leaf-render slot inside a group — that's Phase 2 (R-MIDDLE) work. For Phase 1, the Assessment placeholder is folded into the `middle-bottom` group's title until R-MIDDLE ships the strip renderer. **Note in `templates.ts`:** add a comment explaining the omission and pointing to R-MIDDLE.

- [ ] **All 8 sub-pane ids (`snapshot`, `history`, `body`, `investigations-orders`, `plan`, `subjective`, `objective`, + the implicit Assessment which is bundled with `middle-bottom`) are documented** in the file with their Phase 2 / 3 R-item owner. The cv2-09 contracts the future surfaces will consume (`tabs?`, `aiSummarySlot?`) are NOT used in this task — leaves are pure placeholders.

### Step 3 — `/v2-tree` page route

- [ ] **New file** `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx`. Mirror the structure of the existing `/v2/page.tsx` exactly, but:
  - Import `TELEMED_VIDEO_TEMPLATE` from `@/lib/patient-profile/templates`.
  - Pass it to `<PatientProfilePage panes={TELEMED_VIDEO_TEMPLATE} storageKey={...} />`.
  - Use a unique storage key (e.g. `cockpit-v2/telemed-video/${appointmentId}` — distinct from the `/v2` route's key so the two routes' layouts don't fight).

  ```tsx
  // frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx
  import PatientProfilePage from '@/components/patient-profile/PatientProfilePage';
  import { TELEMED_VIDEO_TEMPLATE } from '@/lib/patient-profile/templates';

  export default function V2TreePage({ params }: { params: { id: string } }) {
    return (
      <PatientProfilePage
        appointmentId={params.id}
        panes={TELEMED_VIDEO_TEMPLATE}
        storageKey={`cockpit-v2/telemed-video/${params.id}`}
      />
    );
  }
  ```

  (Adapt to the existing `/v2/page.tsx`'s exact prop contract — pre-load the existing file before writing.)

- [ ] **Existing `/v2/page.tsx` is unchanged.** Verify byte-identical to pre-task.

- [ ] **Route shows in dev nav** (if there's a dev menu that lists routes; otherwise skip). The route is *not* linked from production navigation — it's only reachable by typing the URL directly (matches the "side-by-side" intent: Phase 1 ships it for verification, Phase 2 promotes to the canonical `/v2` slot).

### Step 4 — Mount verification (per cv2-09's CommandBar)

- [ ] **The Cmd+K bar** mounted by cv2-09 in `PatientProfilePage.tsx` applies to both `/v2` AND `/v2-tree` automatically (both routes mount `<PatientProfilePage>`). Verify by visiting `/v2-tree` and pressing Cmd+K → placeholder dialog opens.

- [ ] **Storage key namespacing** — opening `/v2` writes to `patient-profile/v4-tree-layout::<storageKey-from-v2-page>`; opening `/v2-tree` writes to `patient-profile/v4-tree-layout::cockpit-v2/telemed-video/<appointmentId>`. Verify in DevTools → Application → localStorage that the two keys are distinct and don't overwrite each other.

### Step 5 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.

- [ ] **Lint:** `pnpm --filter frontend lint` clean. The new ESLint rule from cv2-01 still passes (no `<ResizablePanelGroup>` outside `Shell.tsx`).

- [ ] **Visual smoke on `/dashboard/appointments/[id]/v2-tree`:**
  - 8 placeholder leaves render (Snapshot, History, Body, Investigations-orders, Plan, Subjective, Objective + the bundled Assessment label). Each shows its icon + title + "Phase 2 will mount real content here (R-...)".
  - The outer group has 2 column boundaries (Left↔Middle, Middle↔Right). The Left column has 1 internal boundary (Snapshot↔History). The Middle column has 1 internal boundary (Body↔Bottom). The Bottom region has 1 internal boundary (Investigations↔Plan). The Right column has 1 internal boundary (Subjective↔Objective). Total = 6 resize handles.
  - Drag any handle → the corresponding pair resizes. Cross-group bleed-through is absent (drag Left↔Middle doesn't move Snapshot/History; drag Investigations↔Plan doesn't move Body).
  - Drag-to-reorder via header GripVertical works at each level (drop Snapshot onto History swaps them within the Left column; drop Left-Column onto Right-Column swaps the outer columns).
  - Pane visibility: hide Plan via the toggle bar → the Bottom region collapses to just Investigations. Re-show Plan → both reappear.
  - Layout persists across reloads (verify by resizing, reloading, confirming sizes survive).

- [ ] **Visual smoke on `/dashboard/appointments/[id]/v2`** — unchanged from pre-task. Visual diff zero.

- [ ] **Mobile branch (< 1024px viewport) on `/v2-tree`:** every leaf renders stacked vertically (no resize handles, no group headers). MobileShell flattens the tree per cv2-01.

- [ ] **`rg` checks:**
  - `rg "TELEMED_VIDEO_TEMPLATE" frontend/` returns the export + the page route's consumer.
  - `rg "<PanePlaceholder" frontend/` returns the 8 leaf renderers inside `templates.ts` + the component definition.
  - `rg "/v2-tree" frontend/app` returns the new page route.
  - `rg "<ResizablePanelGroup" frontend/components --files-with-matches` returns only `Shell.tsx`.

- [ ] **No console errors / warnings** on `/v2-tree` for resize, reorder, collapse, hide.

- [ ] **`Cmd+K` works on `/v2-tree`** — placeholder dialog opens. Verified per cv2-09's mount.

---

## Out of scope

- **Real content in any of the 8 leaves.** Phase 2 (R-MIDDLE, R-CHART, R-HISTORY).
- **Assessment sticky strip renderer.** Phase 2 (R-MIDDLE). The placeholder bundles it into the bottom group's title.
- **Telemed-Voice / Telemed-Text / In-Clinic templates.** Phase 2 (R-MOD).
- **Modality template chooser UI.** Phase 2 (R-MOD).
- **Promoting `/v2-tree` to replace `/v2`.** Phase 2 close-gate — after R-MIDDLE + R-CHART + R-HISTORY ship real content.
- **Per-pane `tabs?` / `aiSummarySlot?` / `aiAssistButtonSlot?` usage.** Phase 2 / 3 — first consumer of each pays the implementation cost.
- **Production navigation link** to `/v2-tree`. Side-by-side route accessed by URL only.
- **Cross-route layout import** (e.g. "if you customised `/v2`, prefill `/v2-tree` with the same shape"). Phase 2 — first user that asks for it.

---

## Files expected to touch

**New:**

- `frontend/components/patient-profile/PanePlaceholder.tsx` (~40 LOC).
- `frontend/lib/patient-profile/templates.ts` (~150 LOC — Telemed-Video template literal + extensive header comments).
- `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx` (~20 LOC — page route).

**Modified:**

- (None — `PatientProfilePage.tsx` already accepts a `panes` prop from cv2-01 / ppr-07.)

**Read but do not modify:**

- `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (the existing flat-shell route; mirror its structure).
- `frontend/components/patient-profile/Shell.tsx` (post-cv2-01 + cv2-02 — the consumer).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (post-cv2-09 — the page shell with `<CommandBar>` mount).

**Tests:** None. Manual smoke covers the verification.

---

## Notes / open decisions

1. **Why 22 / 56 / 22 column split?** The source plan's layout sketch implies the Body pane is the visual centerpiece; the side columns are reference material. 22% is enough for icons + a one-line label per leaf; 56% gives the video + the bottom horizontal split breathing room. Phase 2 may tune.

2. **Why icons from `lucide-react`?** Already used elsewhere in the cockpit (ppr-15b's `<PaneToggleBar>`); consistent with the existing pane-header iconography. Picks: `Heart` (Snapshot — chronic conditions / allergies), `Clock` (History — past Rx), `Video` (Body — telemed video), `Beaker` (Investigations — orders), `Pill` (Plan — Rx), `MessageSquare` (Subjective — patient says), `Activity` (Objective — vitals + exam), `ClipboardCheck` (Assessment — reserved for Phase 2 even though Phase 1 doesn't render an Assessment leaf).

3. **Why is Assessment a leaf-less placeholder in Phase 1?** The "sticky strip" UX is non-trivial (a slot rendered above a group, not inside it). Adding the slot to the shell now would either (a) widen cv2-01's scope, or (b) introduce a hacky pattern. Bundling Assessment's visual real estate into the `middle-bottom` group's title is the cheapest Phase 1 lie; R-MIDDLE in Phase 2 ships the proper strip + Assessment placeholder.

4. **Could the placeholder show a clickable "Read more" link to the source plan section for the relevant R-item?** Nice idea, but Phase 1 sees these for ~6 weeks (until Phase 2 ships); over-investing in placeholder polish is wasted. Keep it simple.

5. **What if the doctor reorders columns on `/v2-tree` and then visits `/v2`?** Each route has its own storage key, so reordering one doesn't affect the other. Phase 2's `/v2` → `/v2-tree` promotion includes a migration that copies the latest `/v2-tree` layout to the new canonical key.

6. **Why no toggle bar above the shell?** The existing `<PatientProfileShell>` doesn't ship a toggle bar by default — `<PaneToggleBar>` (ppr-15b) is a separate component mounted by `PatientProfilePage`. The page-level mount works for both `/v2` and `/v2-tree`; verify in the pre-load that the toggle bar already iterates `panes[]` (and so will handle the new 8-leaf tree by listing all 8 leaves). If the toggle bar can't handle nested panes cleanly, add a comment in the task notes and defer the toggle-bar update to a follow-up (out of scope for cv2-03; Phase 2 owns the toggle bar's tree-awareness).

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § The 8-pane default layout + DL-2..DL-4](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-3-gate-after-cv2-02--cv2-03--cv2-05--cv2-06).
- **Previous task:** [`task-cv2-02-layout-tree-state-and-persistence.md`](./task-cv2-02-layout-tree-state-and-persistence.md) — must be merged.
- **Next task in lane:** N/A (Wave 3 Lane α ends with cv2-03).
- **Parallel lane:** [`task-cv2-05`](./task-cv2-05-rx-form-context.md) + [`task-cv2-06`](./task-cv2-06-section-component-extractions.md) — Lane β of Wave 3.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
