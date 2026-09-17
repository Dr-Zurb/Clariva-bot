import { scrollCollapsibleIntoViewIfNeeded } from "@/lib/cockpit/collapse-scroll";

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

/** Scroll anchor on an exam-system IPPA subsection (e.g. `general-demeanor`). */
export const EXAM_SUBSECTION_ATTR = "data-exam-subsection";

/** Top-of-tab anchor inside the Objective pane scroll root (L1 close target). */
export const OBJECTIVE_SCROLL_TOP_SELECTOR = '[data-testid="objective-scroll-top"]';

/** Top-of-tab anchor inside the Subjective pane scroll root (L1 close target). */
export const SUBJECTIVE_SCROLL_TOP_SELECTOR = '[data-testid="subjective-scroll-top"]';

/** Top-of-tab anchor inside the Plan pane scroll root (L1 close target). */
export const PLAN_SCROLL_TOP_SELECTOR = '[data-testid="plan-scroll-top"]';

export const ASSESSMENT_SCROLL_TOP_SELECTOR = '[data-testid="assessment-scroll-top"]';

/** CollapsibleContainer `<section>` for the Examination block (L1 close target). */
export const OBJECTIVE_EXAM_SECTION_SELECTOR =
  '[data-objective-section-id="exam"] > section';

function queryCard(attr: string, id: string): HTMLElement | null {
  if (typeof document === "undefined" || !id) return null;
  const el = document.querySelector(`[${attr}="${id}"]`);
  return el instanceof HTMLElement ? el : null;
}

/** Close an L0 objective section — stay put. */
export function scrollObjectiveTabToTop(): void {}

/** Close an L1 exam system card — stay put. */
export function scrollObjectiveExamSectionToTop(): void {}

/**
 * After expanding a systemic exam card, nudge it into view only if clipped.
 */
export function scrollExamSystemCardIntoView(systemId: string): void {
  scrollCollapsibleIntoViewIfNeeded(queryCard(EXAM_SYSTEM_CARD_ATTR, systemId), {
    pinTopIfTaller: true,
  });
}

/** Close an L2 exam subsection — stay put. */
export function scrollExamSystemCardToTop(_systemId: string): void {}

/** After expanding a General finding card, nudge it into view only if clipped. */
export function scrollExamGeneralFindingCardIntoView(findingId: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_GENERAL_FINDING_CARD_ATTR, findingId),
    { pinTopIfTaller: true },
  );
}

/** After expanding a CVS structured finding card, nudge it into view only if clipped. */
export function scrollExamCvsFindingCardIntoView(findingId: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_CVS_FINDING_CARD_ATTR, findingId),
    { pinTopIfTaller: true },
  );
}

/** After expanding a Respiratory structured finding card, nudge it into view only if clipped. */
export function scrollExamRespFindingCardIntoView(findingId: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_RESP_FINDING_CARD_ATTR, findingId),
    { pinTopIfTaller: true },
  );
}

/** After expanding an Abdomen structured finding card, nudge it into view only if clipped. */
export function scrollExamAbdFindingCardIntoView(findingId: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_ABD_FINDING_CARD_ATTR, findingId),
    { pinTopIfTaller: true },
  );
}

/** After expanding a CNS structured finding card, nudge it into view only if clipped. */
export function scrollExamCnsFindingCardIntoView(findingId: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_CNS_FINDING_CARD_ATTR, findingId),
    { pinTopIfTaller: true },
  );
}

/**
 * Open an exam subsection — nudge into view only if clipped. Close stays put
 * via {@link scrollExamSystemCardToTop}.
 */
export function scrollExamSubsectionIntoView(subsectionScrollKey: string): void {
  scrollCollapsibleIntoViewIfNeeded(
    queryCard(EXAM_SUBSECTION_ATTR, subsectionScrollKey),
    { pinTopIfTaller: false },
  );
}
