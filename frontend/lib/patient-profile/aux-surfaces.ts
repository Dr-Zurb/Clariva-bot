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

import type React from "react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// 1. Tabs in panes — see PaneDefinition.tabs in types.ts.
// ---------------------------------------------------------------------------
// The contract lives on PaneDefinition; this file re-exports for callers
// that want to import "aux-surfaces" as the single namespace.
export type { PaneTabDefinition } from "./types";

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
 * Imperative open payload for `<SideSheetHost>` / `useSideSheet()` (cce-01).
 * One sheet at a time — `open()` replaces any active sheet. DL-4: fixed
 * right-edge slide-in; `defaultWidth` defaults to 480px. `canDock` is
 * type-level only in v1 (host always behaves as undocked).
 */
export interface SideSheetDefinition {
  id: string;
  title: string;
  content: React.ComponentType<unknown> | React.ReactNode;
  /** Panel width in px (default 480 per DL-4). */
  defaultWidth?: number;
  /** Reserved for Phase 3 docking — ignored by the v1 host. */
  canDock?: boolean;
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
  | { kind: "docked"; edge: "top" | "right" | "bottom" | "left" }
  | { kind: "floating"; x: number; y: number }
  | { kind: "hidden" };

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
  readonly _shadcnDialogReference: "@/components/ui/dialog";
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
