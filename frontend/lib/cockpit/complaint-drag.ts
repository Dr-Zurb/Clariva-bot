/** Fraction of card height used for reorder-before / reorder-after edge zones. */
export const COMPLAINT_DROP_EDGE_RATIO = 0.2;

export type MainComplaintDropIntent = "before" | "after" | "nest";

export const MAIN_COMPLAINT_DRAG_MIME = "application/x-complaint-main-index";

export function resolveMainComplaintDropIntent(
  clientY: number,
  rect: Pick<DOMRect, "top" | "height">,
): MainComplaintDropIntent {
  const height = Math.max(rect.height, 1);
  if (!Number.isFinite(clientY)) {
    return "before";
  }
  const relativeY = clientY - rect.top;

  // Very short hit targets (tests / compact rows): reorder only, no accidental nest.
  if (height < 32) {
    return relativeY <= height / 2 ? "before" : "after";
  }

  const edge = height * COMPLAINT_DROP_EDGE_RATIO;
  if (relativeY < edge) return "before";
  if (relativeY > height - edge) return "after";
  return "nest";
}

/** Target index for array splice when inserting before `targetIndex`. */
export function reorderInsertBeforeIndex(fromIndex: number, targetIndex: number): number {
  if (fromIndex < targetIndex) return targetIndex - 1;
  return targetIndex;
}

/** Target index for array splice when inserting after `targetIndex`. */
export function reorderInsertAfterIndex(fromIndex: number, targetIndex: number): number {
  if (fromIndex < targetIndex) return targetIndex;
  return targetIndex + 1;
}

export function readMainComplaintDragIndex(dataTransfer: DataTransfer | null): number | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(MAIN_COMPLAINT_DRAG_MIME);
  if (!raw) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isFinite(index) ? index : null;
}
