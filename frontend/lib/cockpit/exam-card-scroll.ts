import {
  reAnchorCollapsibleOnClose,
  scrollCollapsibleToTop,
} from "@/lib/cockpit/collapse-scroll";

/** Scroll anchor on each systemic examination card (General, CVS, Resp, …). */
export const EXAM_SYSTEM_CARD_ATTR = "data-exam-system-card";

/** Scroll anchor on each General-exam finding card (Pallor, Edema, …). */
export const EXAM_GENERAL_FINDING_CARD_ATTR = "data-exam-general-finding-card";

/** Scroll anchor on each CVS structured finding card (Murmur, Gallop, …). */
export const EXAM_CVS_FINDING_CARD_ATTR = "data-exam-cvs-finding-card";

/** Scroll anchor on each Respiratory structured finding card (Wheeze, Crackles, …). */
export const EXAM_RESP_FINDING_CARD_ATTR = "data-exam-resp-finding-card";

/** Scroll anchor on each Abdomen structured finding card (Tenderness, Mass, …). */
export const EXAM_ABD_FINDING_CARD_ATTR = "data-exam-abd-finding-card";

/** Scroll anchor on each CNS structured finding card (GCS, Weakness, …). */
export const EXAM_CNS_FINDING_CARD_ATTR = "data-exam-cns-finding-card";

/** Scroll anchor on an exam-system IPPA subsection (e.g. `resp-auscultation`). */
export const EXAM_SUBSECTION_ATTR = "data-exam-subsection";

function queryCard(attr: string, id: string): HTMLElement | null {
  if (typeof document === "undefined" || !id) return null;
  const el = document.querySelector(`[${attr}="${id}"]`);
  return el instanceof HTMLElement ? el : null;
}

/**
 * After expanding a systemic exam card, align it to the top of the viewport so
 * the body opens downward in view (offset by the sticky section header).
 */
export function scrollExamSystemCardIntoView(systemId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_SYSTEM_CARD_ATTR, systemId));
}

/** On collapse, re-anchor a systemic exam card only if it scrolled above the sticky line. */
export function reAnchorExamSystemCardOnClose(systemId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_SYSTEM_CARD_ATTR, systemId));
}

/** After expanding a General finding card, align it to the top of the viewport. */
export function scrollExamGeneralFindingCardIntoView(findingId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_GENERAL_FINDING_CARD_ATTR, findingId));
}

/** On collapse, re-anchor a General finding card only if it scrolled above the sticky line. */
export function reAnchorExamGeneralFindingCardOnClose(findingId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_GENERAL_FINDING_CARD_ATTR, findingId));
}

/** After expanding a CVS structured finding card, align it to the top of the viewport. */
export function scrollExamCvsFindingCardIntoView(findingId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_CVS_FINDING_CARD_ATTR, findingId));
}

/** On collapse, re-anchor a CVS finding card only if it scrolled above the sticky line. */
export function reAnchorExamCvsFindingCardOnClose(findingId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_CVS_FINDING_CARD_ATTR, findingId));
}

/** After expanding a Respiratory structured finding card, align it to the top of the viewport. */
export function scrollExamRespFindingCardIntoView(findingId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_RESP_FINDING_CARD_ATTR, findingId));
}

/** On collapse, re-anchor a Respiratory finding card only if it scrolled above the sticky line. */
export function reAnchorExamRespFindingCardOnClose(findingId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_RESP_FINDING_CARD_ATTR, findingId));
}

/** After expanding an Abdomen structured finding card, align it to the top of the viewport. */
export function scrollExamAbdFindingCardIntoView(findingId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_ABD_FINDING_CARD_ATTR, findingId));
}

/** On collapse, re-anchor an Abdomen finding card only if it scrolled above the sticky line. */
export function reAnchorExamAbdFindingCardOnClose(findingId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_ABD_FINDING_CARD_ATTR, findingId));
}

/** After expanding a CNS structured finding card, align it to the top of the viewport. */
export function scrollExamCnsFindingCardIntoView(findingId: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_CNS_FINDING_CARD_ATTR, findingId));
}

/** On collapse, re-anchor a CNS finding card only if it scrolled above the sticky line. */
export function reAnchorExamCnsFindingCardOnClose(findingId: string): void {
  reAnchorCollapsibleOnClose(queryCard(EXAM_CNS_FINDING_CARD_ATTR, findingId));
}

/**
 * After collapsing an auscultation finding card, glide the whole subsection
 * (heading + sibling cards) to the top so the doctor can pick the next item.
 */
export function scrollExamSubsectionIntoView(subsectionScrollKey: string): void {
  scrollCollapsibleToTop(queryCard(EXAM_SUBSECTION_ATTR, subsectionScrollKey));
}
