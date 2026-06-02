# Task cv2-09: Aux-surface contracts + Cmd+K placeholder bar

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 2, Lane β step 0 — **S, ~4h**

---

## Task overview

The source plan ([`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — R-FUTURE-PROOFING) commits to **five auxiliary surface patterns** that Phase 2 / 3 will use to host non-core content (labs, medical records, AI summaries, AI assist, chatbots, etc.) without growing the core 8-pane layout:

1. **Tabs within a sub-pane** — multiple content streams sharing a single leaf (e.g., "Past Rx | Vitals timeline" within the History pane).
2. **Side sheets** — dockable drawer slide-in from the right edge (e.g., "Previous Rx side-sheet anchored to the Plan pane").
3. **Floating dockable panels** — draggable / pinnable floaters (e.g., "AI scribe live transcript").
4. **Modal dialogs** — standard send-Rx-confirm modal pattern; no new contract needed but documented for completeness.
5. **Cmd+K command bar** — global keyboard-driven palette (e.g., "Open today's first patient", "Jump to vitals timeline").

This task lands all five **as TypeScript contracts only** — types, registries, slot interfaces, but **no runtime renderers** except for the Cmd+K keyboard handler + placeholder dialog. Phase 2 / 3 surfaces that need each renderer pay the implementation cost when they need it. The point is that they consume an already-typed contract instead of inventing one.

The single runtime piece in this task is `<CommandBar>` — a component mounted in `PatientProfilePage.tsx` for both `/v2` and `/v2-tree` routes that binds `Cmd+K` (Mac) / `Ctrl+K` (Win/Linux) to open a placeholder `<Dialog>` saying "Coming soon. Phase 3 will wire commands here." It reserves the keyboard handler and exercises the Modal pattern's contract.

This task also extends `PaneDefinition` with three new optional fields the future renderers will consume:

- `tabs?: PaneTabDefinition[]` — when present, the leaf renders a tab strip; each tab's `render()` replaces the pane's body.
- `aiSummarySlot?: SlotRenderer` — a Phase 3 surface that renders an AI summary above the pane body.
- `aiAssistButtonSlot?: SlotRenderer` — a Phase 3 surface that renders an AI-assist button next to the pane header.

All three are **ignored by `<PatientProfileShell>` in Phase 1** — they exist so Phase 2 / 3 don't have to bump `PaneDefinition`'s shape later.

**Estimated time:** ~4h (30min `PaneDefinition` extensions + 1h `aux-surfaces.ts` contracts + 30min `CommandBar.tsx` + 30min keyboard handler + 30min `PatientProfilePage` mount + 1h verification).

**Status:** Pending.

**Hard deps:** cv2-01 (extends the same `PaneDefinition` interface; needs the post-cv2-01 shape to extend cleanly).

**Source:** [plan-cockpit-v2-batch.md § Wave 2](../plan-cockpit-v2-batch.md#wave-2--backend-migration--future-proofing-contracts-2-tasks-5h-2-parallel-lanes-after-cv2-01-ships) + R-FUTURE-PROOFING + DL-19..DL-21 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. This task is type-heavy plumbing with one bounded runtime component (Cmd+K dialog mount). The hardest decision (the contract shape for each of the 5 aux-surface patterns) is locked in DL-19; nothing to invent.

**Per-message escalation rule:** if Auto stalls on the SlotRenderer type signature (a higher-order TS type can occasionally confuse models), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/lib/patient-profile/types.ts` (post-cv2-01 — the `PaneDefinition` interface this task extends).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (where the `<CommandBar>` mounts; both `/v2` and the new `/v2-tree` route from cv2-03 will use this page — the mount lives once, applies to both).
- `frontend/components/ui/dialog.tsx` (shadcn dialog primitive for the Cmd+K placeholder).
- `frontend/hooks/` directory (look for an existing `useHotkey` / `useKeyboard` hook; if absent, the keyboard handler is inline `useEffect`).
- `frontend/.eslintrc.json` (the ppr-03 content-agnosticism zone; `aux-surfaces.ts` is in the allowed import path and is intentionally a peer to `types.ts`).
- Source plan §R-FUTURE-PROOFING + §DL-19..DL-21.

**Estimated turns:** 3–4 turns (1 PaneDefinition extension + 1 aux-surfaces.ts + 1 CommandBar + 1 verification).

---

## Acceptance criteria

### Step 1 — Extend `PaneDefinition` with three optional aux-surface fields

- [ ] In `frontend/lib/patient-profile/types.ts`, **add** three optional fields to `PaneDefinition`. Place them after the existing `children?` field for diff clarity:

  ```ts
  /**
   * RESERVED FOR PHASE 2 — R-CHART / R-HISTORY. When present, the leaf
   * renders a tab strip above its body; each tab's `render()` replaces
   * the pane body when the tab is active. v1 (this task) types the
   * field; the renderer ships in the first Phase 2 task that needs it.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  tabs?: PaneTabDefinition[];

  /**
   * RESERVED FOR PHASE 3 — R-RX-POLISH. When present, the pane body
   * renders this slot above the main render output (typical use: a
   * compact AI-generated summary card). v1 types the field; renderer
   * ships in Phase 3.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  aiSummarySlot?: SlotRenderer;

  /**
   * RESERVED FOR PHASE 3 — R-RX-POLISH. When present, the pane header
   * renders this slot next to the title (typical use: an AI-assist
   * button that opens a side-sheet). v1 types the field; renderer
   * ships in Phase 3.
   *
   * Ignored by `<PatientProfileShell>` in Phase 1.
   */
  aiAssistButtonSlot?: SlotRenderer;
  ```

- [ ] **Define** `PaneTabDefinition` and `SlotRenderer` in the same file (right above or below `PaneDefinition`):

  ```ts
  /**
   * One tab in a tabbed sub-pane (PaneDefinition.tabs).
   */
  export interface PaneTabDefinition {
    /** Stable id, unique within this pane's tab set. */
    id: string;
    /** Label shown in the tab strip. */
    label: string;
    /** Render function for the tab body — replaces pane.render() when active. */
    render: () => React.ReactNode;
    /** Optional icon shown to the left of the label. */
    icon?: LucideIcon;
    /** Optional badge shown to the right of the label (e.g. unread count). */
    badge?: () => React.ReactNode;
  }

  /**
   * A render slot — used for `aiSummarySlot` and `aiAssistButtonSlot` and
   * any future aux-surface slot pattern. The receiving renderer decides
   * the layout context the slot is mounted into.
   */
  export type SlotRenderer = () => React.ReactNode;
  ```

- [ ] **Preserve** all existing fields and types. The new fields are optional; no consumer is forced to provide them. **Type-check** `pnpm --filter frontend tsc --noEmit` clean.

- [ ] **`<PatientProfileShell>` does NOT consume any of the three new fields in this task.** Phase 1's renderer ignores them entirely. Adding a `// TODO(phase-2 — first consumer):` comment next to each field in the Shell's destructuring is good hygiene if the Shell touches them; otherwise the renderer simply doesn't read them.

### Step 2 — Define the 5 aux-surface contracts in `frontend/lib/patient-profile/aux-surfaces.ts`

- [ ] **Create** `frontend/lib/patient-profile/aux-surfaces.ts` with five exported contract types. The file is **types-only** — no runtime exports.

  ```ts
  // ============================================================================
  // aux-surfaces.ts — type contracts for auxiliary surfaces (R-FUTURE-PROOFING).
  // ============================================================================
  // Phase 1 ships these as TypeScript contracts only. The first Phase 2 / 3
  // surface that needs each renderer pays the implementation cost. The point
  // of this file is to prevent ad-hoc patterns: when Phase 2 wants to add a
  // "Previous Rx" side-sheet, the type for it ALREADY EXISTS here.
  //
  // No runtime exports. No React components. No imports from
  // @/components/** to keep the content-agnosticism zone honest.
  // ============================================================================

  import type React from 'react';
  import type { LucideIcon } from 'lucide-react';

  // ---------------------------------------------------------------------------
  // 1. Tabs in panes — see PaneDefinition.tabs in types.ts.
  // ---------------------------------------------------------------------------
  // The contract lives on PaneDefinition; this file re-exports for callers
  // that want to import "aux-surfaces" as the single namespace.
  export type { PaneTabDefinition } from './types';

  // ---------------------------------------------------------------------------
  // 2. Side sheets — dockable drawer slide-in from the right edge.
  //    Typical use: "Previous Rx side-sheet anchored to the Plan pane."
  //    Anchored to a specific pane by id; the side-sheet host renders
  //    above the shell with a backdrop dimming the rest of the page.
  // ---------------------------------------------------------------------------
  export interface SideSheetAnchor {
    /** Stable id; how the side-sheet is referenced by openers. */
    id: string;
    /** Display title in the sheet's header strip. */
    title: string;
    /** Pane id this sheet is *contextually* anchored to (for hover-link / focus return). Optional. */
    anchorPaneId?: string;
    /** Renderer for the sheet body. */
    render: () => React.ReactNode;
    /** Sheet width as a % of viewport (default 35). Min 20, max 60. */
    widthPct?: number;
    /** Whether ESC closes (default true). */
    closeOnEscape?: boolean;
  }

  /**
   * Registry shape — the side-sheet host (Phase 2 ships it) maintains a Map
   * keyed by anchor id. Openers call `openSideSheet(id)`; the host renders
   * the active anchor's body inside an overlay.
   */
  export interface SideSheetRegistry {
    register: (anchor: SideSheetAnchor) => void;
    unregister: (id: string) => void;
    open: (id: string) => void;
    close: (id: string) => void;
    isOpen: (id: string) => boolean;
  }

  // ---------------------------------------------------------------------------
  // 3. Floating dockable panels — draggable / pinnable floaters.
  //    Typical use: "AI scribe live transcript that doctors drag around."
  //    The floater overlays the shell; can be docked to an edge or undocked
  //    to free positioning. Persists position in localStorage.
  // ---------------------------------------------------------------------------
  export type DockPosition =
    | { kind: 'docked'; edge: 'top' | 'right' | 'bottom' | 'left' }
    | { kind: 'floating'; x: number; y: number }
    | { kind: 'hidden' };

  export interface FloatingPanelDefinition {
    /** Stable id; how the panel is referenced. */
    id: string;
    /** Display title in the panel's drag bar. */
    title: string;
    /** Renderer for the panel body. */
    render: () => React.ReactNode;
    /** Default size (px). */
    defaultSize: { width: number; height: number };
    /** Default position. */
    defaultPosition: DockPosition;
    /** Whether the panel allows resize via a corner handle (default true). */
    canResize?: boolean;
    /** Whether the panel is initially open (default true). */
    initiallyOpen?: boolean;
  }

  /**
   * Registry shape — the floating-panel host (Phase 3 ships it) renders
   * every registered panel above the shell.
   */
  export interface FloatingPanelRegistry {
    register: (panel: FloatingPanelDefinition) => void;
    unregister: (id: string) => void;
    setPosition: (id: string, position: DockPosition) => void;
    setOpen: (id: string, open: boolean) => void;
  }

  // ---------------------------------------------------------------------------
  // 4. Modal dialogs — standard shadcn <Dialog> pattern.
  //    Documented here for completeness; no new contract needed beyond
  //    what shadcn provides. Phase 1 uses the modal pattern for the Cmd+K
  //    placeholder; Phase 3 uses it for the pre-send Rx confirmation.
  // ---------------------------------------------------------------------------
  /**
   * Re-export of the shape shadcn dialog already consumes. No new types
   * — listed here so the aux-surfaces.ts file is the single discovery
   * point for "where do I find each pattern?".
   */
  export interface ModalDialogContract {
    /** See @/components/ui/dialog.tsx — the contract is `<Dialog open={...} onOpenChange={...}>` etc. */
    readonly _shadcnDialogReference: '@/components/ui/dialog';
  }

  // ---------------------------------------------------------------------------
  // 5. Cmd+K command bar — global keyboard-driven palette.
  //    Phase 1 wires the keyboard handler + a placeholder dialog. Phase 3
  //    fills the commands registry. The command shape is locked here so
  //    Phase 2 surfaces can pre-emit their commands (they won't render
  //    until Phase 3 ships the palette UI, but the type is stable).
  // ---------------------------------------------------------------------------
  export interface CommandBarCommand {
    /** Stable id; routes the command. */
    id: string;
    /** Display label in the palette. */
    label: string;
    /** Optional secondary text shown below the label. */
    description?: string;
    /** Optional icon. */
    icon?: LucideIcon;
    /** Optional keyboard shortcut hint (e.g. "Cmd+Shift+R"). */
    shortcut?: string;
    /** Grouping bucket in the palette (e.g. "Navigation", "Rx", "Patient"). */
    group?: string;
    /** Score / boost for ranking (higher = sticks at top). Default 0. */
    score?: number;
    /** Handler invoked when the command is selected. */
    run: () => void | Promise<void>;
  }

  /**
   * Registry shape — Phase 3 ships the palette UI. Commands register on
   * mount and unregister on unmount; the palette filters / ranks them
   * by typed query.
   */
  export interface CommandBarRegistry {
    register: (command: CommandBarCommand) => () => void; // returns unregister fn
    list: () => CommandBarCommand[];
  }

  // ---------------------------------------------------------------------------
  // Versioning note for future maintainers.
  // ---------------------------------------------------------------------------
  // When a Phase 2 / 3 surface needs to extend one of these contracts (add a
  // new field, narrow a type), do it ADDITIVELY (new optional field) and
  // bump the JSDoc with the consuming R-item name. Breaking changes need a
  // new contract type; old consumers keep working until they migrate.
  // ============================================================================
  ```

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.

- [ ] **No runtime code.** `rg "function\|class\|=>" frontend/lib/patient-profile/aux-surfaces.ts` returns zero matches (all `=>` in the file are in TS function-type annotations like `() => void`, not runtime arrow functions). The file compiles to **zero JavaScript output** under the standard tsc / Next.js pipeline.

- [ ] **No content-imports.** `rg "from \"@/components/" frontend/lib/patient-profile/aux-surfaces.ts` returns zero. The file is a peer to `types.ts` in the content-agnosticism zone.

### Step 3 — Create `<CommandBar>` with the Cmd+K placeholder

- [ ] **New file** `frontend/components/patient-profile/CommandBar.tsx` (~80 LOC). Implementation outline:

  ```tsx
  'use client';

  import React, { useEffect, useState } from 'react';
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
  } from '@/components/ui/dialog';
  import { Sparkles } from 'lucide-react';

  /**
   * `<CommandBar>` — Phase 1 placeholder for the Cmd+K command palette.
   *
   * Binds Cmd+K (Mac) / Ctrl+K (Win/Linux) to open a placeholder <Dialog>.
   * Phase 3 (`cockpit-command-bar` batch) replaces the placeholder with a
   * real command palette that filters / ranks registered CommandBarCommand
   * entries (see aux-surfaces.ts).
   *
   * Mount once at the page root (PatientProfilePage), not inside the shell.
   * The keyboard handler is global; mounting inside the shell would scope
   * it to the shell's focus tree.
   */
  export default function CommandBar() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        // Cmd+K on Mac, Ctrl+K elsewhere. Skip when an input has focus and
        // the user is typing — the palette should never preempt active text
        // entry. (Phase 3 will revisit; for the placeholder, this is fine.)
        const isMod = e.metaKey || e.ctrlKey;
        if (!isMod || e.key !== 'k') return;
        // Allow input-focused users to opt in by holding Shift (Mac
        // convention for "open palette over my input"). Phase 3 may
        // refine; this matches VS Code's Cmd+Shift+P pattern.
        const target = e.target as HTMLElement | null;
        const isInTextField =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable === true;
        if (isInTextField && !e.shiftKey) return;

        e.preventDefault();
        setOpen((prev) => !prev);
      }
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              Command bar
            </DialogTitle>
            <DialogDescription>
              Coming soon. Phase 3 will wire commands here — quick patient
              navigation, Rx shortcuts, modality jumps. For now, this is the
              placeholder.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p>Press <kbd className="rounded border bg-background px-1.5 py-0.5">Esc</kbd> to close.</p>
            <p className="mt-2">
              Surfaces interested in registering commands now (so they're
              ready when Phase 3 ships): see{' '}
              <code>frontend/lib/patient-profile/aux-surfaces.ts</code> →{' '}
              <code>CommandBarCommand</code>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **The keyboard handler is the runtime contribution of this task.** ESC closes via the shadcn `<Dialog>`'s built-in handling. No commands registry is wired (the registry interface is in `aux-surfaces.ts`; Phase 3 ships the runtime).

- [ ] **Telemetry-light.** Optional: emit a `cockpit_v2.command_bar_opened` event on first open per session (used to measure interest). Skip if the telemetry primitive isn't readily available in the file's import path; not blocking.

### Step 4 — Mount `<CommandBar>` in `PatientProfilePage.tsx`

- [ ] In `frontend/components/patient-profile/PatientProfilePage.tsx`, **add** the `<CommandBar />` mount as a sibling of `<PatientProfileShell>`:

  ```tsx
  // (Existing imports above.)
  import CommandBar from '@/components/patient-profile/CommandBar';

  export default function PatientProfilePage({ ... }: PatientProfilePageProps) {
    // (Existing logic.)
    return (
      <>
        {/* Mount the keyboard handler once at the page root. */}
        <CommandBar />
        <PatientProfileShell ... />
      </>
    );
  }
  ```

  (Exact placement depends on the existing page shape; if there's already a wrapper `<div>`, mount `<CommandBar />` as the first child inside it. The component renders nothing in the visual tree until Cmd+K is pressed.)

- [ ] **Both `/v2` (existing) and `/v2-tree` (cv2-03) pages get the command bar** because both routes mount `<PatientProfilePage>`. Verify via manual smoke: open `/dashboard/appointments/[id]/v2` → Cmd+K opens dialog. Open `/dashboard/appointments/[id]/v2-tree` (post-cv2-03) → Cmd+K opens dialog.

  (If cv2-03 hasn't shipped yet, only `/v2` can be smoked in this task. That's fine — Wave 3's gate covers the `/v2-tree` smoke.)

- [ ] **No regression on other pages.** `<CommandBar>` is only mounted on patient-profile pages. The page route `/dashboard/opd-today`, `/dashboard/appointments` (list view), and the global app layout do NOT mount it. Cmd+K does nothing on those pages.

### Step 5 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean. The new fields on `PaneDefinition` compile. `aux-surfaces.ts` compiles. `<CommandBar>` compiles.

- [ ] **Lint:** `pnpm --filter frontend lint` clean.

- [ ] **`rg` checks:**
  - `rg "\.tabs\b" frontend/components` returns zero matches in component code (the field is typed but unused by any consumer in Phase 1).
  - `rg "aiSummarySlot\|aiAssistButtonSlot" frontend/components` returns zero matches.
  - `rg "from \"@/lib/patient-profile/aux-surfaces\"" frontend` returns zero matches (no runtime consumer in Phase 1).
  - `rg "from \"@/components/" frontend/lib/patient-profile/aux-surfaces.ts` returns zero (content-agnosticism preserved).

- [ ] **Manual smoke on `/dashboard/appointments/[id]/v2`:**
  - Cmd+K (or Ctrl+K) opens the placeholder dialog.
  - ESC closes the dialog.
  - Cmd+K twice toggles open / closed.
  - With focus inside an input on the page (e.g. a future cockpit input — for now any global input works), pressing Cmd+K does NOT open the dialog. Pressing Cmd+Shift+K does open it.
  - No console errors / warnings.
  - The page renders identically to pre-cv2-09 visually (the `<CommandBar>` renders nothing until opened).

- [ ] **No regression on the flat shell** — `/v2` resize / collapse / reorder still work as before.

- [ ] **No new Sentry errors** in a 2-min smoke session.

---

## Out of scope

- **Real Cmd+K commands registry** — Phase 3 (`cockpit-command-bar` batch). This task only ships the keyboard handler + placeholder dialog.
- **Side-sheet runtime host** — Phase 2's first side-sheet consumer (likely `cockpit-history-pane` or `cockpit-middle-bottom` for the Previous-Rx side-sheet) ships the host. This task only types the contract.
- **Floating-panel runtime host** — Phase 3. Likely shipped with the AI scribe feature.
- **Tabs renderer in `<PatientProfileShell>`** — Phase 2's first tabbed-pane consumer ships the renderer (R-CHART for Snapshot tabs, R-HISTORY for History tabs).
- **`aiSummarySlot` / `aiAssistButtonSlot` consumers** — Phase 3 (`rx-polish-densification`).
- **Replacing the modal pattern with a custom one** — none planned. Shadcn `<Dialog>` is sufficient.
- **Cross-route Cmd+K** — Phase 1 only mounts the bar on patient-profile pages. Phase 3 may promote it to the global layout if other pages also want it.
- **Command-bar style theming or shortcut indicator** — Phase 3.
- **AI / chatbot features** — explicitly deferred. The contracts exist; no Phase 1 surface consumes them.

---

## Files expected to touch

**New:**

- `frontend/lib/patient-profile/aux-surfaces.ts` (~150 LOC — type contracts).
- `frontend/components/patient-profile/CommandBar.tsx` (~80 LOC — keyboard handler + placeholder Dialog).

**Modified:**

- `frontend/lib/patient-profile/types.ts` (~50 LOC delta — three new optional fields on `PaneDefinition` + `PaneTabDefinition` + `SlotRenderer` types).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~5 LOC delta — mount `<CommandBar />`).

**Read but do not modify:**

- `frontend/components/patient-profile/Shell.tsx` (post-cv2-01 — Shell does not consume the new aux fields in Phase 1).
- `frontend/components/ui/dialog.tsx` (shadcn primitive consumed by `<CommandBar>`).
- `frontend/.eslintrc.json` (content-agnosticism zone — `aux-surfaces.ts` is in the allowed import path; no changes needed).

**Tests:** No new automated test files. The keyboard handler smoke in Step 5 is the verification.

---

## Notes / open decisions

1. **Why land all 5 contracts now instead of one at a time?** Two reasons. (a) Defining them together forces consistency — every contract has the same shape (id, render, registry interface). Adding them piecemeal would invite drift. (b) The source plan explicitly commits to "all 5" as one R-item. Splitting it across batches would obscure the "5 escape hatches" principle that justifies the plan's "AI never gets a permanent pane" guarantee.

2. **Why is the Cmd+K placeholder the only runtime piece?** Because Cmd+K is a global keyboard handler — it doesn't matter which surface uses commands first; the bar has to be mounted globally to capture the keypress. The other four contracts are surface-specific (a side-sheet is anchored to a pane; a floater is anchored to the page; tabs are anchored to a leaf) — they have no runtime work to do until a Phase 2 / 3 surface mounts a host.

3. **Why exempt Cmd+K from input-focused contexts (except with Shift)?** Doctors will type heavily in the cockpit; intercepting Cmd+K in a text field would break copy-paste-adjacent muscle memory (some apps use Cmd+K for "insert link" in rich-text editors). The Shift modifier matches VS Code's Cmd+Shift+P convention for "force open palette over my input." Phase 3 may refine.

4. **Why is `aux-surfaces.ts` types-only?** The shell's ESLint zone bans content imports from `@/lib/patient-profile/*`. Runtime aux-surface implementations need to import from content (a Side-sheet host renders side-sheet bodies, which are content). Splitting types from implementations is the cleanest way to keep `aux-surfaces.ts` in the allowed import path while letting Phase 2 / 3 ship hosts in `@/components/patient-profile/*-host.tsx` files that import the types and the content.

5. **What about the modal pattern's "no new contract" entry?** A meta-comment on the registry — the modal pattern is the only one of the 5 that doesn't need a new type because shadcn already provides one. Documenting it in the registry prevents "wait, why are there only 4 types when the plan said 5?" confusion.

6. **Why does the placeholder dialog mention `aux-surfaces.ts`?** Because the bar is a discovery surface. A doctor pressing Cmd+K finds it; a developer opening it learns where to register commands. The dialog body's "Surfaces interested in registering commands now…" line points future Phase 2 / 3 contributors at the right file.

7. **Should `<CommandBar>` accept a `commands?` prop to allow Phase 2 to ship the first batch of commands?** Tempting, but no. The point of Phase 1 is type contracts + placeholder. Allowing Phase 2 to ship commands now would let `CommandBar` partially implement what's supposed to be Phase 3's responsibility — and the placeholder UI would have to grow to render real commands, defeating the "placeholder" framing. Keep it strict: Phase 1 placeholder, Phase 3 real palette.

8. **Could the keyboard handler be a `useHotkey` hook instead of inline `useEffect`?** Yes if the repo already has one. Pre-load step verifies; if absent, inline is fine (the handler is ~15 LOC). Don't add a new hook abstraction just for this.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:** as above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § R-FUTURE-PROOFING + DL-19..DL-21](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 2 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-2-gate-after-cv2-04--cv2-09).
- **Parallel task in Wave 2:** [`task-cv2-04-soap-fields-migration.md`](./task-cv2-04-soap-fields-migration.md) — Lane α of Wave 2. Backend migration. Independent of this task; can run in parallel.
- **Previous task:** [`task-cv2-01-recursive-shell-render.md`](./task-cv2-01-recursive-shell-render.md) — must be merged or green. This task extends the `PaneDefinition` interface cv2-01 leaves stable.
- **Next task:** N/A. This task is a leaf in its lane. Wave 3 (`cv2-02`, `cv2-05`) does not consume this task's outputs directly.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
