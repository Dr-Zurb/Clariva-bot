import { scrollCollapsibleToTop } from "@/lib/cockpit/collapse-scroll";

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

/**
 * After switching the active complaint card, glide its header to the top of the
 * scroll pane (under the sticky section header — the card header carries the
 * matching `scroll-mt`) so the body expands downward in view. Uses the shared
 * collapse glide (ease-out, distance-independent) so it feels the same as the
 * Objective sections/cards instead of the old instant jump.
 */
export function scrollComplaintCardHeaderIntoView(instanceId: string): void {
  if (typeof document === "undefined" || !instanceId) return;

  const root = document.querySelector(`[${COMPLAINT_CARD_INSTANCE_ATTR}="${instanceId}"]`);
  const header = root?.querySelector(`[${COMPLAINT_CARD_HEADER_ATTR}]`);
  if (header instanceof HTMLElement) {
    scrollCollapsibleToTop(header);
  }
}

/**
 * After a deliberate card collapse, bring the whole chief-complaints container
 * back into view (header + capture field + collapsed list) so the doctor can add
 * another complaint or pick the next card. Glides the section wrapper — not just
 * the input — so the "Chief complaints" title stays visible, using the same shared
 * glide as everywhere else. Does not focus the input (avoids keyboard pop / steal).
 */
export function scrollComplaintCaptureIntoView(): void {
  if (typeof document === "undefined") return;

  const section = document.getElementById(CHIEF_COMPLAINTS_SECTION_ID);
  if (section instanceof HTMLElement) {
    scrollCollapsibleToTop(section);
    return;
  }

  // Fallback when the section id is absent (tests / legacy markup).
  const input = document.getElementById(COMPLAINT_CAPTURE_INPUT_ID);
  if (input instanceof HTMLElement) {
    scrollCollapsibleToTop(input);
  }
}
