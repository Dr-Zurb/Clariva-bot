# Task ppr-02: `PaneDefinition` types + `useShellLayout` hook

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 1, Lane α step 1 — **S, ~2h**

---

## Task overview

Author the **layout contract** the new shell consumes:

- `PaneDefinition` — what the shell knows about a single pane.
- `PatientProfileLayout` — the layout state shape.
- `useShellLayout` — the hook that owns the state + setters + persistence.

This is `frontend/lib/patient-profile/`'s first commit. **Zero React rendering** in this task — types, a hook, and unit tests only. The shell (ppr-03) imports from here next.

The contract here is the **single most important interface in the new shell**. Get it right and Wave 2 → Wave 5 is mechanical. Get it wrong and we re-litigate everything.

**Estimated time:** ~2h (45 min types, 45 min hook, 30 min tests).

**Status:** Pending.

**Hard deps:** ppr-01 (folder structure + ESLint zone in place).

**Source:** R1.4 + DL-4 + DL-7 + DL-8 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- [Product plans/plan-patient-profile-shell-rebuild.md § DL-4, DL-7](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md) (the canonical contract).
- `frontend/lib/consultation/cockpit-layout.ts` (the OLD shape — read for the `validateLayout` style, do NOT copy the structure).

**Estimated turns:** 3–4 turns.

**This task can be stitched onto ppr-01's chat** if Sonnet is still in context.

---

## Acceptance criteria

### `frontend/lib/patient-profile/types.ts`

- [ ] Create the file. Public exports:

  ```ts
  /**
   * The single contract the patient-profile shell knows about.
   *
   * Adding a 4th pane (e.g. AI chat) is a one-diff append to the panes array
   * in `<PatientProfilePage>`. The shell has no knowledge of which pane is
   * "chart" vs "body" vs "rx" — it iterates `paneOrder` and looks up each
   * `PaneDefinition` by id.
   *
   * Future-proof fields (DL-5): `children?` will enable vertical split inside
   * a column when authored as a recursive PaneDefinition; v1 ignores this
   * field and renders `render()` instead.
   */
  export interface PaneDefinition {
    /** Stable id; used as the layout key. Examples: "chart", "body", "rx", "ai-chat". */
    id: string;
    /** Header title shown in the column header when expanded. */
    title: string;
    /** Render function for the expanded pane body. */
    render: () => React.ReactNode;
    /**
     * Render function for the 40px collapsed strip. Falls back to a generic
     * chevron-only stub if omitted.
     */
    collapsedRender?: () => React.ReactNode;
    /** Minimum width as a % of the group. Defaults to 12. */
    minSizePct?: number;
    /**
     * Natural width as a % of the group. Used as the initial size and as
     * the restore target on uncollapse. Defaults to 33.
     */
    naturalSizePct?: number;
    /** Whether this pane is allowed to collapse. Defaults to true. */
    canCollapse?: boolean;
    /**
     * Optional hotkey to focus/expand this pane (e.g. "mod+1" for chart).
     * Hotkeys live on the pane definition so adding a 4th pane brings its
     * own binding — keeps `useShellHotkeys` (ppr-10) generic.
     */
    hotkey?: string;
    /**
     * RESERVED FOR FUTURE — DL-5. When present, the shell renders these as
     * a nested resizable group (vertical split) inside the column instead
     * of calling `render()`. v1 MUST ignore this field (the shell schema is
     * still horizontal-only). Adding the recursive renderer is a separate
     * task; this field is here so the type is forward-compatible.
     */
    children?: PaneDefinition[];
  }

  /** Per-pane runtime state — sizing + collapse flag. */
  export interface PaneRuntimeState {
    /** Current width as a % of the group. 0 ≤ sizePct ≤ 100. */
    sizePct: number;
    /** Collapsed to the fixed 40px strip. */
    collapsed: boolean;
  }

  /**
   * The single layout-state shape persisted to localStorage.
   *
   * Replaces the four-tuple `CockpitLayout` shape (slots + widths + collapsed
   * + middleCollapseSide) from `frontend/lib/consultation/cockpit-layout.ts`.
   * Key changes:
   *   - `paneOrder` is a plain string[] (no fixed length); supports N panes.
   *   - `paneState` is keyed by pane id (not slot index); pane state survives
   *     reorders for free.
   *   - No `middleCollapseSide`. The middle pane collapses uniformly via the
   *     same chevron as the sides (DL-6).
   *   - Schema version `2` marks the new shape so legacy v1 payloads can be
   *     identified and translated on read (ppr-08).
   */
  export interface PatientProfileLayout {
    version: 2;
    paneOrder: string[];
    paneState: Record<string, PaneRuntimeState>;
  }
  ```

- [ ] Export-only. No runtime values.

### `frontend/lib/patient-profile/useShellLayout.ts`

- [ ] Create the file. Hook signature:

  ```ts
  "use client";

  import { useCallback, useEffect, useState } from "react";
  import type {
    PaneDefinition,
    PaneRuntimeState,
    PatientProfileLayout,
  } from "./types";

  export interface UseShellLayoutOptions {
    /** localStorage key for persisting the layout. */
    storageKey: string;
    /** Pane ids in their initial left-to-right order. */
    defaultPaneOrder: string[];
    /**
     * Initial sizePct + collapsed per pane. The shell falls back to
     * `defaults` only when storage is empty or unparseable.
     */
    defaultPaneState: Record<string, PaneRuntimeState>;
    /**
     * Optional callback fired when the persisted layout was rehydrated from
     * the v1-shape legacy key. Lets the caller log telemetry without
     * involving the shell. (ppr-08 supplies the actual seed reader.)
     */
    onLegacySeed?: () => void;
  }

  export interface UseShellLayoutResult {
    paneOrder: string[];
    paneState: Record<string, PaneRuntimeState>;
    /** Reorder by swapping `fromId` with the slot currently held by `toId`. */
    reorderPane: (fromId: string, toId: string) => void;
    /** Set the absolute sizePct for one pane (used by resize handles). */
    setPaneSize: (id: string, sizePct: number) => void;
    /** Toggle a pane's collapsed bit. The shell owns the absorber math. */
    setPaneCollapsed: (id: string, collapsed: boolean) => void;
    /** Reset to defaults (used by "Reset layout" preset). */
    resetLayout: () => void;
    /** Apply a preset snapshot (used by `applyPreset` in ppr-09). */
    applyLayout: (layout: PatientProfileLayout) => void;
  }

  export function useShellLayout(opts: UseShellLayoutOptions): UseShellLayoutResult { ... }
  ```

- [ ] Implementation requirements:
  - On mount, read `localStorage[storageKey]`. If JSON-parseable AND `validateLayout()` accepts it, hydrate state from it.
  - On every state change (debounced 200ms is fine), write the layout back to `localStorage[storageKey]`.
  - **Do NOT do legacy-shape seeding in ppr-02.** That belongs to ppr-08. ppr-02 simply ignores `onLegacySeed` if no caller wires it.
  - `reorderPane`: pure array-move via `paneOrder.indexOf(fromId)` ↔ `paneOrder.indexOf(toId)` swap.
  - `setPaneSize`: clamp to `[0, 100]`; reject NaN; write back.
  - `setPaneCollapsed`: just flips the bit. The shell (ppr-03) computes the absorber math; this hook stores the bit.
  - `applyLayout`: validates against `validateLayout`, replaces state on success, noops on failure (caller logs).
  - SSR-safe: no `window` access at module scope; gate reads/writes on `typeof window !== "undefined"`.

- [ ] Co-located `validateLayout` (pure):

  ```ts
  export function validateLayout(raw: unknown): PatientProfileLayout | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (r.version !== 2) return null;
    if (!Array.isArray(r.paneOrder)) return null;
    if (!r.paneOrder.every((id): id is string => typeof id === "string")) return null;
    if (new Set(r.paneOrder).size !== r.paneOrder.length) return null; // no dupes
    if (!r.paneState || typeof r.paneState !== "object") return null;
    const state = r.paneState as Record<string, unknown>;
    for (const id of r.paneOrder) {
      const s = state[id];
      if (!s || typeof s !== "object") return null;
      const sObj = s as Record<string, unknown>;
      if (typeof sObj.sizePct !== "number" || !Number.isFinite(sObj.sizePct)) return null;
      if (sObj.sizePct < 0 || sObj.sizePct > 100) return null;
      if (typeof sObj.collapsed !== "boolean") return null;
    }
    return raw as PatientProfileLayout;
  }
  ```

  - **Why reject duplicates in `paneOrder`?** A duplicated id means two panes with the same render key — React would warn and the layout state would be incoherent.
  - **Why not validate the sum of `sizePct`?** The shell normalises on render (the spacer panel absorbs the remainder). Persisting sizes that sum to e.g. 99.7% should not invalidate the whole payload; round-trip drift is expected.

### Optional helpers (same file)

- [ ] `layoutsEqual(a, b)` — used by ppr-09 to mark the active preset with a check in the menu.
- [ ] `defaultLayout(panes, key)` — builds a `PatientProfileLayout` from a `PaneDefinition[]` + a storage key. The hook itself doesn't need it but ppr-07 will. Tiny helper, ship it now.

### Tests

- [ ] Create `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` covering:
  - `validateLayout` accepts a well-formed v2 payload.
  - `validateLayout` rejects: missing `version`, wrong `version`, duplicate ids, missing `paneState[id]`, out-of-range `sizePct`, non-boolean `collapsed`.
  - `reorderPane` swaps two ids; idempotent on `from === to`; no-op on unknown id.
  - `setPaneSize` clamps `< 0` to 0 and `> 100` to 100.
  - `setPaneCollapsed` flips the bit; doesn't touch `sizePct`.
  - `applyLayout` replaces state on a valid payload; rejects on invalid.
  - Persistence: write → read round-trip via a fake `localStorage`.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean (ESLint zone passes — `lib/patient-profile/` doesn't import medical concepts).

### Manual smoke

- [ ] None needed. ppr-02 ships types + a hook with unit tests. The next task (ppr-03) is the first observable behaviour.

---

## Out of scope

- **Rendering anything.** ppr-03 owns React.
- **One-time legacy localStorage seeding.** That's ppr-08 — the reader lives in `frontend/lib/patient-profile/migrate.ts`. ppr-02 must NOT touch the legacy `react-resizable-panels:cockpit-shell` key.
- **Preset application.** ppr-09 supplies the preset-aware variant of `applyLayout`. ppr-02 only ships the primitive `applyLayout(layout)` which takes a fully-translated v2 layout.
- **The recursive `children` rendering** (DL-5). Field is in the type; rendering is parked.

---

## Files expected to touch

**New:**
- `frontend/lib/patient-profile/types.ts` (~80 LOC).
- `frontend/lib/patient-profile/useShellLayout.ts` (~150 LOC).
- `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` (~120 LOC).

**Tests:** none removed.

---

## Notes / open decisions

1. **Why a `version: 2` discriminator?** The legacy `cockpit-layout:v1:*` payloads have no version field. By tagging the new shape with an explicit `version: 2`, the seed reader (ppr-08) can detect legacy payloads cleanly (any payload that lacks `version === 2` is legacy).
2. **Why `paneOrder: string[]` instead of `paneOrder: PaneId[]` (a union)?** Locking it to a union (`"chart" | "body" | "rx" | "ai-chat"`) would couple the layout type to the medical pane set — same trap as `ColumnType`. Strings keep the shell's type independent of which panes exist.
3. **Why is the spacer not represented in `paneOrder`?** The spacer is a shell implementation detail (the trailing invisible panel that absorbs leftover width). It has no state, no header, no hotkey. Treating it as a "first-class pane" would invite bugs like "user reordered the spacer to the middle". The shell appends it after iterating `paneOrder`.
4. **Why does `reorderPane` swap (not insert)?** Swap matches the cc-07 drag-to-reorder UX shipped today. If we later want "drop-between" insert semantics, we add a separate `movePane(fromId, toIndex)` and keep `reorderPane` for the existing surface.

---

## References

- **Affected files:**
  - new `frontend/lib/patient-profile/types.ts`
  - new `frontend/lib/patient-profile/useShellLayout.ts`
  - new `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts`
- **Source decisions:** [Product plans/plan-patient-profile-shell-rebuild.md § DL-4, DL-7, DL-8](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md), items R1.4.
- **Reference for the OLD shape (read-only):** `frontend/lib/consultation/cockpit-layout.ts`.
- **Next task:** [`task-ppr-03-patient-profile-shell.md`](./task-ppr-03-patient-profile-shell.md) — the shell itself. Fresh chat — ppr-03 is an Opus task.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
