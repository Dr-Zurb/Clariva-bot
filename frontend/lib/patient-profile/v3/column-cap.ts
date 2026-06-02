/**
 * column-cap.ts — viewport-aware grid budget + balanced auto-stack targeting (P5).
 *
 * The v3 canvas lays palette-added panes out as side-by-side *columns* under the
 * horizontal `__root__`. Letting that grow without bound either (a) shrinks every
 * column below a usable width or (b) forces a horizontal scrollbar — both bad for
 * a consult cockpit. Instead we treat the canvas as a *comfortable grid*:
 *
 *   1. Spread panes across columns until the viewport can't fit another
 *      `MIN_COMFORTABLE_COLUMN_PX`-wide column (`maxComfortableColumns`).
 *   2. Once columns are spent, stack further panes as *rows* — but spread them
 *      into the **shortest** (fewest-row) column so the grid stays balanced
 *      instead of growing one lopsided tower (`findBalancedStackTarget`). Rows
 *      keep stacking until a column can't fit another `MIN_COMFORTABLE_ROW_PX`
 *      tall row (`maxRowsPerColumn`).
 *   3. When the grid is genuinely full the caller falls back to *tabbing* the new
 *      pane into the shortest column (Phase-3 overflow, handled in the layout
 *      hook), so nothing is ever crushed below a usable size.
 *
 * This module is pure (no React, no DOM) so it is trivially unit-testable and
 * usable from both the shell (viewport measure) and the layout hook (targeting).
 */
import { MAX_LEAVES, type PaneTreeNode } from "@/lib/patient-profile/v3/foundation";

/**
 * Minimum width (px) we consider "comfortable" for a single column. The widest
 * clinical panes (Plan / Rx) declare `minSizePx: 280`; 340 keeps that content
 * plus the resize-handle gutter and a little breathing room before we stop
 * adding columns and start stacking rows.
 */
export const MIN_COMFORTABLE_COLUMN_PX = 340;

/**
 * Minimum height (px) we consider "comfortable" for a single stacked row. Below
 * this a pane header + a couple of content lines start to clip, so we stop
 * stacking and fall back to tabs instead.
 */
export const MIN_COMFORTABLE_ROW_PX = 150;

/**
 * How many root-level columns fit comfortably at `widthPx`. Floors at 1 (always
 * allow at least one column) and ceilings at `MAX_LEAVES` (the absolute layout
 * cap) so an ultrawide monitor can't request an absurd number of columns.
 *
 * @param widthPx measured canvas width (e.g. `el.clientWidth`)
 */
export function maxComfortableColumns(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  const fits = Math.floor(widthPx / MIN_COMFORTABLE_COLUMN_PX);
  return Math.max(1, Math.min(MAX_LEAVES, fits));
}

/**
 * How many rows a single column can stack comfortably at `heightPx`. Floors at 1
 * and ceilings at `MAX_LEAVES`. Used as the Phase-2→Phase-3 threshold: once the
 * shortest column already holds this many rows, stacking would crush them, so
 * the caller tabs instead.
 *
 * @param heightPx measured canvas height (e.g. `el.clientHeight`)
 */
export function maxRowsPerColumn(heightPx: number): number {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 1;
  const fits = Math.floor(heightPx / MIN_COMFORTABLE_ROW_PX);
  return Math.max(1, Math.min(MAX_LEAVES, fits));
}

/**
 * Count visible *columns* — the direct, non-hidden children of the horizontal
 * root. A nested split (e.g. a vertically-stacked column) still counts as ONE
 * column. A bare leaf root counts as one column when visible.
 */
export function countVisibleRootColumns(root: PaneTreeNode): number {
  if (!root.children?.length) {
    return root.hidden ? 0 : 1;
  }
  return root.children.filter((child) => !child.hidden).length;
}

/** Visible leaf (row) count under `node` — how "tall" a column currently is. */
function countVisibleLeaves(node: PaneTreeNode): number {
  if (!node.children?.length) {
    return node.hidden ? 0 : 1;
  }
  let count = 0;
  for (const child of node.children) count += countVisibleLeaves(child);
  return count;
}

/**
 * Deepest last-visible leaf under `node`, descending through the last visible
 * child at each level. Returns `null` when the subtree has no visible leaf.
 */
function lastVisibleLeafId(node: PaneTreeNode): string | null {
  if (!node.children?.length) {
    return node.hidden ? null : node.id;
  }
  const visible = node.children.filter((child) => !child.hidden);
  for (let i = visible.length - 1; i >= 0; i--) {
    const id = lastVisibleLeafId(visible[i]!);
    if (id) return id;
  }
  return null;
}

/** Where a balanced auto-stack should land. */
export interface BalancedStackTarget {
  /**
   * The leaf to drop the new pane *south of* (engine targets must be leaves).
   * Dropping south of a leaf whose parent is already a vertical group makes the
   * engine insert a *sibling* (a flat stack) rather than nesting a new split.
   */
  leafId: string;
  /** Visible row count of the column that leaf lives in (its current height). */
  rowCount: number;
}

/**
 * Pick the balanced stack target once the column budget is spent: the **shortest**
 * visible column (fewest rows), so panes spread evenly instead of piling into one
 * lopsided tower. Ties go to the *rightmost* eligible column, which keeps the
 * primary left columns tall the longest. The returned `rowCount` lets the caller
 * decide between stacking another row and falling back to tabs (Phase-3).
 *
 * Returns `null` when there is no visible leaf to stack onto (caller falls back
 * to a plain unhide / no-op).
 */
export function findBalancedStackTarget(root: PaneTreeNode): BalancedStackTarget | null {
  if (!root.children?.length) {
    if (root.hidden) return null;
    return { leafId: root.id, rowCount: 1 };
  }
  const visibleColumns = root.children.filter((child) => !child.hidden);
  if (visibleColumns.length === 0) return null;

  let bestColumn = visibleColumns[0]!;
  let bestCount = countVisibleLeaves(bestColumn);
  for (let i = 1; i < visibleColumns.length; i++) {
    const column = visibleColumns[i]!;
    const count = countVisibleLeaves(column);
    // `<=` makes ties resolve to the later (rightmost) column.
    if (count <= bestCount) {
      bestColumn = column;
      bestCount = count;
    }
  }

  const leafId = lastVisibleLeafId(bestColumn);
  if (!leafId) return null;
  return { leafId, rowCount: bestCount };
}
