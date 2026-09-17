import {
  measureStackedStickyOffset,
  scrollCollapsibleIntoViewIfNeeded,
} from "@/lib/cockpit/collapse-scroll";

/** Scroll anchor id on the expanded complaint card header row. */
export const COMPLAINT_CARD_HEADER_ATTR = "data-complaint-card-header";

/** Instance id on the complaint card root (list row or associated child). */
export const COMPLAINT_CARD_INSTANCE_ATTR = "data-complaint-instance";

/** `id` on the chief-complaint capture input (`ComplaintCaptureBar`). */
export const COMPLAINT_CAPTURE_INPUT_ID = "complaint-capture";

/** `id` on the chief-complaints `CollapsibleContainer` wrapper. */
export const CHIEF_COMPLAINTS_SECTION_ID = "chief-complaints";

/** How a complaint card was collapsed — drives post-collapse scroll behaviour. */
export type ComplaintCollapseSource = "explicit" | "blur";

function complaintCardRoot(instanceId: string): HTMLElement | null {
  if (typeof document === "undefined" || !instanceId) return null;
  const root = document.querySelector(`[${COMPLAINT_CARD_INSTANCE_ATTR}="${instanceId}"]`);
  return root instanceof HTMLElement ? root : null;
}

function complaintCardsInListContainer(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const root =
      child.matches(`[${COMPLAINT_CARD_INSTANCE_ATTR}]`) ?
        child
      : child.querySelector(`[${COMPLAINT_CARD_INSTANCE_ATTR}]`);
    if (root instanceof HTMLElement) roots.push(root);
  }
  return roots;
}

/**
 * Sum sticky header heights of expanded complaint cards that precede `cardRoot`
 * in the same associated-symptom list. Nested cards stack under their parent
 * via {@link StickyStackProvider}; main CC siblings pin at the same offset and
 * must not use this (it over-counts and parks the header one row too low).
 */
export function measurePrecedingComplaintCardStickyOffset(cardRoot: HTMLElement): number {
  let listParent: HTMLElement | null = cardRoot.parentElement;
  while (listParent) {
    const cards = complaintCardsInListContainer(listParent);
    const index = cards.indexOf(cardRoot);
    if (index >= 0 && (index > 0 || cards.length > 1)) {
      let total = 0;
      for (let i = 0; i < index; i++) {
        const header = cards[i]?.querySelector(`[${COMPLAINT_CARD_HEADER_ATTR}]`);
        if (header instanceof HTMLElement) {
          total += header.offsetHeight;
        }
      }
      return total;
    }
    listParent = listParent.parentElement;
  }
  return 0;
}

/** True when `cardRoot` is an associated symptom nested inside a parent CC card. */
function isAssociatedComplaintCard(cardRoot: HTMLElement): boolean {
  const parentCard = cardRoot.parentElement?.closest(
    `[${COMPLAINT_CARD_INSTANCE_ATTR}]`,
  );
  return parentCard instanceof HTMLElement && parentCard !== cardRoot;
}

function complaintCardScrollMargin(root: HTMLElement): number {
  const base = measureStackedStickyOffset(root);
  if (!isAssociatedComplaintCard(root)) return base;
  return base + measurePrecedingComplaintCardStickyOffset(root);
}

/**
 * After switching the active complaint card, nudge it into view only if the
 * opened card is clipped. Preceding sibling margin applies only to associated
 * symptoms.
 */
export function scrollComplaintCardIntoView(instanceId: string): void {
  const root = complaintCardRoot(instanceId);
  if (!root) return;
  scrollCollapsibleIntoViewIfNeeded(root, {
    pinTopIfTaller: true,
    scrollMarginTopPx: complaintCardScrollMargin(root),
  });
}

/**
 * @deprecated Prefer {@link scrollComplaintCardIntoView}. Kept for existing call sites.
 */
export function scrollComplaintCardHeaderIntoView(instanceId: string): void {
  scrollComplaintCardIntoView(instanceId);
}

/**
 * After closing an associated symptom card — stay put.
 */
export function scrollParentComplaintCardIntoView(_parentInstanceId: string): void {}

/**
 * After a deliberate card collapse — stay put.
 */
export function scrollComplaintCaptureIntoView(): void {}
