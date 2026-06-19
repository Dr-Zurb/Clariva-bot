import {
  reorderInsertAfterIndex,
  reorderInsertBeforeIndex,
} from "@/lib/cockpit/complaint-drag";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

export type SectionDropIntent = "before" | "after";

export const SUBJECTIVE_SECTION_DRAG_MIME = "application/x-subjective-section-id";

/** Before/after split at vertical midpoint (matches CustomSubsectionsField). */
export function resolveSectionDropIntent(
  clientY: number,
  rect: Pick<DOMRect, "top" | "height">,
): SectionDropIntent {
  const height = Math.max(rect.height, 1);
  if (!Number.isFinite(clientY)) return "before";
  return clientY - rect.top <= height / 2 ? "before" : "after";
}

export function readSubjectiveSectionDragId(
  dataTransfer: DataTransfer | null,
): SubjectiveSectionId | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(SUBJECTIVE_SECTION_DRAG_MIME);
  return raw ? (raw as SubjectiveSectionId) : null;
}

/** Move one slot up/down; no-op at bounds. */
export function moveSectionInOrder(
  order: readonly SubjectiveSectionId[],
  fromIndex: number,
  direction: "up" | "down",
): SubjectiveSectionId[] {
  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= order.length || fromIndex === toIndex) {
    return [...order];
  }
  const next = [...order];
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}

/** Reorder by source index onto a target row with before/after intent. */
export function reorderSectionInOrder(
  order: readonly SubjectiveSectionId[],
  fromIndex: number,
  targetIndex: number,
  intent: SectionDropIntent,
): SubjectiveSectionId[] {
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    targetIndex < 0 ||
    targetIndex >= order.length
  ) {
    return [...order];
  }

  const insertAt =
    intent === "before"
      ? reorderInsertBeforeIndex(fromIndex, targetIndex)
      : reorderInsertAfterIndex(fromIndex, targetIndex);

  if (insertAt === fromIndex) return [...order];

  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(insertAt, 0, item);
  return next;
}
