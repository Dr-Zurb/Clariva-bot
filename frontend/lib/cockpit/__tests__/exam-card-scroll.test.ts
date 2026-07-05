import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  EXAM_GENERAL_FINDING_CARD_ATTR,
  EXAM_SUBSECTION_ATTR,
  EXAM_SYSTEM_CARD_ATTR,
  scrollExamGeneralFindingCardIntoView,
  scrollExamSubsectionIntoView,
  scrollExamSystemCardIntoView,
} from "@/lib/cockpit/exam-card-scroll";

describe("exam-card-scroll", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls a systemic exam card into view", () => {
    document.body.innerHTML = `
      <article ${EXAM_SYSTEM_CARD_ATTR}="general">General</article>
    `;

    scrollExamSystemCardIntoView("general");

    const card = document.querySelector(`[${EXAM_SYSTEM_CARD_ATTR}="general"]`);
    expect(card?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("scrolls a General finding card into view", () => {
    document.body.innerHTML = `
      <article ${EXAM_GENERAL_FINDING_CARD_ATTR}="pallor">Pallor</article>
    `;

    scrollExamGeneralFindingCardIntoView("pallor");

    const card = document.querySelector(`[${EXAM_GENERAL_FINDING_CARD_ATTR}="pallor"]`);
    expect(card?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("scrolls an exam subsection into view", () => {
    document.body.innerHTML = `
      <section ${EXAM_SUBSECTION_ATTR}="resp-auscultation">Auscultation</section>
    `;

    scrollExamSubsectionIntoView("resp-auscultation");

    const section = document.querySelector(`[${EXAM_SUBSECTION_ATTR}="resp-auscultation"]`);
    expect(section?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("no-ops when the card is missing", () => {
    document.body.innerHTML = "";
    expect(() => scrollExamSystemCardIntoView("missing")).not.toThrow();
    expect(() => scrollExamGeneralFindingCardIntoView("missing")).not.toThrow();
    expect(() => scrollExamSubsectionIntoView("missing")).not.toThrow();
  });
});
