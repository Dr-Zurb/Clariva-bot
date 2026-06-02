/**
 * `applyDragWithCascade` — pure, unit-testable layout transformation that
 * implements the patient-profile shell's *cascading* resize behaviour
 * (ppr-11 follow-up, issue #19 in `task-ppr-11-parity-qa-matrix.md`).
 *
 * Motivation
 * ----------
 * The default `react-resizable-panels` `Separator` only redistributes width
 * between the two adjacent panels. Once the shrinking neighbour hits its
 * minimum size the drag refuses to continue — even when the panel on the
 * *other* side of the shrinking neighbour still has plenty of headroom.
 *
 * The user-visible behaviour we want instead (Cursor / VS Code inspired):
 *
 *   [  A  |  B  |  C  ]
 *
 *   Dragging the A↔B handle to the RIGHT:
 *     • A grows
 *     • B shrinks first, until it reaches its minimum
 *     • Once B is at min the drag *continues* by shrinking C, until C also
 *       reaches its minimum (or the drag direction reverses)
 *
 * The cascade is one-sided: only the pane *immediately adjacent* on the
 * grow side absorbs the total delta; the panes on the shrink side queue
 * up in order of proximity to the handle.
 *
 * Contract
 * --------
 *   • Input `layout` and `mins` are arrays of the same length, indexed in
 *     left-to-right visual order.
 *   • `handleIndex = i` means the handle separates `layout[i]` and
 *     `layout[i+1]`. Valid range: `0 ≤ i ≤ layout.length - 2`.
 *   • `deltaPct > 0` ⇒ handle moves RIGHT ⇒ `layout[i]` grows;
 *     cascade-shrinks `layout[i+1], layout[i+2], …, layout[n-1]`.
 *   • `deltaPct < 0` ⇒ handle moves LEFT ⇒ `layout[i+1]` grows;
 *     cascade-shrinks `layout[i], layout[i-1], …, layout[0]`.
 *   • Sum of `layout` is **conserved** — every unit subtracted from a
 *     shrink pane is added to the single grow pane.
 *   • No pane is ever reduced below its `mins[k]`. If the cascade list is
 *     exhausted before absorbing the full requested delta, the result is
 *     `clamped = true` and `appliedDelta` reflects the actual (smaller)
 *     magnitude that was applied.
 *
 * Units are agnostic: the function preserves whatever scale the caller
 * uses (typically viewport-percent in our codebase, but pixels work
 * equally). Both `layout` and `mins` must use the same scale.
 *
 * The function is pure — it never mutates the inputs.
 */

export interface CascadeInput {
  /** Visible pane sizes in left-to-right order. */
  layout: number[];
  /** Per-pane minimum sizes, same length as `layout`. */
  mins: number[];
  /** Index `i` — handle separates `layout[i]` and `layout[i+1]`. */
  handleIndex: number;
  /** Signed delta. Positive = handle moved RIGHT (left side grows). */
  deltaPct: number;
}

export interface CascadeResult {
  /** New layout (same length, same total). */
  layout: number[];
  /**
   * Signed magnitude actually applied. `|appliedDelta| ≤ |deltaPct|`. Sign
   * matches `deltaPct`. Useful for caller bookkeeping (e.g. updating an
   * imperative drag start-x reference when the request was clamped).
   */
  appliedDelta: number;
  /**
   * `true` when the cascade ran out of shrinkable panes before the full
   * `deltaPct` was absorbed. The caller may use this to short-circuit
   * further pointer movement in the same direction.
   */
  clamped: boolean;
}

/**
 * Floating-point epsilon used to decide when the remaining shrink budget
 * is "effectively zero". Chosen well below the smallest practical pct
 * change (sub-millimetre on a 4K viewport) yet large enough to swallow
 * `0.30000000000000004`-style drift from repeated subtractions.
 */
const EPS = 1e-9;

export function applyDragWithCascade(input: CascadeInput): CascadeResult {
  const { layout, mins, handleIndex, deltaPct } = input;
  const n = layout.length;

  if (n !== mins.length) {
    throw new Error(
      `applyDragWithCascade: layout (${n}) and mins (${mins.length}) length mismatch`,
    );
  }

  if (
    n < 2 ||
    handleIndex < 0 ||
    handleIndex >= n - 1 ||
    !Number.isFinite(deltaPct) ||
    deltaPct === 0
  ) {
    return { layout: [...layout], appliedDelta: 0, clamped: false };
  }

  const next = [...layout];

  if (deltaPct > 0) {
    let remaining = deltaPct;
    for (let k = handleIndex + 1; k < n && remaining > EPS; k++) {
      const headroom = Math.max(0, next[k] - mins[k]);
      if (headroom <= 0) continue;
      const take = Math.min(headroom, remaining);
      next[k] -= take;
      remaining -= take;
    }
    const applied = deltaPct - remaining;
    next[handleIndex] += applied;
    return {
      layout: next,
      appliedDelta: applied,
      clamped: remaining > EPS,
    };
  }

  // deltaPct < 0 — handle moves left
  let remaining = -deltaPct;
  for (let k = handleIndex; k >= 0 && remaining > EPS; k--) {
    const headroom = Math.max(0, next[k] - mins[k]);
    if (headroom <= 0) continue;
    const take = Math.min(headroom, remaining);
    next[k] -= take;
    remaining -= take;
  }
  const applied = -deltaPct - remaining;
  next[handleIndex + 1] += applied;
  return {
    layout: next,
    appliedDelta: -applied,
    clamped: remaining > EPS,
  };
}
