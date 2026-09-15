import { describe, expect, it } from "vitest";
import {
  EMPTY_RX_MEDICINE,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import type { LastVisitMedicine } from "@/lib/api/last-visit-summary";
import {
  appendLastVisitAdvice,
  appendLastVisitInvestigation,
  appendLastVisitMedicines,
  applyLastVisitCourseNote,
  cloneComplaintForLastVisitRepeat,
  complaintAlreadyOnNote,
  complaintWithLastVisitCourse,
  diagnosisWithLastVisitAcuity,
  findDiagnosisOnNote,
  formatLastVisitFollowUp,
  formatLastVisitMedicineLabel,
  investigationAlreadyOnNote,
  lastVisitComplaintsHeadline,
  lastVisitCourseFromNotes,
  lastVisitDiagnosesForStrip,
  lastVisitFollowUpAlreadyApplied,
  lastVisitMedicinesHeadline,
  applyLastVisitText,
  lastVisitTextAlreadyApplied,
  findMatchingCustomSection,
  applyLastVisitCustomSection,
  lastVisitCustomSectionAlreadyApplied,
} from "@/lib/cockpit/last-visit-apply";
import type { Complaint, DiagnosisRow } from "@/types/prescription";

function priorMed(name: string, dosage = "1 tds"): LastVisitMedicine {
  return {
    medicineName: name,
    dosage,
    route: "",
    frequency: "",
    duration: "5 days",
    instructions: "",
    drugMasterId: null,
    frequencyCode: null,
    durationValue: 5,
    durationUnit: "days",
    routeCode: null,
    doseQty: 1,
    doseUnit: null,
    form: null,
    foodTiming: null,
  };
}

function currentMed(name: string, dosage = "1 tds"): RxMedicine {
  return { ...EMPTY_RX_MEDICINE, medicineName: name, dosage };
}

describe("last-visit-apply", () => {
  it("clears onset and duration when repeating a complaint", () => {
    const source: Complaint = {
      id: "c-1",
      name: "Cough",
      duration: "5 days",
      onset: "sudden",
      severity: "moderate",
      location: "chest",
      notes: "last visit free text",
    };
    const cloned = cloneComplaintForLastVisitRepeat(source);
    expect(cloned.id).not.toBe(source.id);
    expect(cloned.name).toBe("Cough");
    expect(cloned.severity).toBe("moderate");
    expect(cloned.location).toBe("chest");
    expect(cloned.onset).toBeUndefined();
    expect(cloned.duration).toBeUndefined();
    expect(cloned.notes).toBeUndefined();
  });

  it("writes a course note, swapping a previous course without overwriting free text", () => {
    expect(applyLastVisitCourseNote(undefined, "Improving")).toBe("Improving");
    expect(applyLastVisitCourseNote("Unchanged", "Worsening")).toBe(
      "Worsening"
    );
    expect(applyLastVisitCourseNote("worse at night", "Improving")).toBe(
      "worse at night; Improving"
    );
    expect(applyLastVisitCourseNote("Improving after rest", "Improving")).toBe(
      "Improving after rest"
    );
    expect(lastVisitCourseFromNotes("Unchanged")).toBe("Unchanged");
    expect(lastVisitCourseFromNotes("worse at night")).toBeNull();
    expect(
      complaintWithLastVisitCourse({ id: "c-1", name: "Cough" }, "Improving")
        .notes
    ).toBe("Improving");
  });

  it("treats equivalent complaint names as already on the note", () => {
    expect(
      complaintAlreadyOnNote([{ id: "a", name: "Cough" }], {
        id: "b",
        name: "cough",
      })
    ).toBe(true);
    expect(
      complaintAlreadyOnNote([{ id: "a", name: "Fever" }], {
        id: "b",
        name: "Cough",
      })
    ).toBe(false);
  });

  it("appends last-visit medicines without dropping typed rows", () => {
    const next = appendLastVisitMedicines(
      [currentMed("PCM", "650"), { ...EMPTY_RX_MEDICINE }],
      [priorMed("Dextromethorphan"), priorMed("PCM", "650")]
    );
    expect(next.map((m) => m.medicineName)).toEqual([
      "PCM",
      "Dextromethorphan",
      "",
    ]);
    expect(next[1]?.durationValue).toBe(5);
  });

  it("formats collapsed headlines", () => {
    expect(
      lastVisitComplaintsHeadline([
        { id: "1", name: "Cough" },
        { id: "2", name: "Fever" },
      ])
    ).toBe("Cough, Fever");
    expect(lastVisitMedicinesHeadline([priorMed("A"), priorMed("B")])).toBe(
      "2 meds"
    );
    expect(
      formatLastVisitMedicineLabel(priorMed("Dextromethorphan"))
    ).toContain("Dextromethorphan");
  });

  it("carries a last-visit diagnosis as ongoing or resolved without duplicating", () => {
    const prior: DiagnosisRow = {
      id: "dx-1",
      label: "Acute bronchitis",
      kind: "primary",
      certainty: "provisional",
      status: "new",
    };
    expect(
      lastVisitDiagnosesForStrip({ diagnoses: [], provisionalDiagnosis: null })
    ).toEqual([]);
    expect(
      lastVisitDiagnosesForStrip({
        diagnoses: [],
        provisionalDiagnosis: "Viral fever",
      })[0]?.label
    ).toBe("Viral fever");
    const cloned = diagnosisWithLastVisitAcuity(prior, "stable", []);
    expect(cloned.id).not.toBe(prior.id);
    expect(cloned.status).toBe("ongoing");
    expect(cloned.acuity).toBe("stable");
    expect(cloned.kind).toBe("primary");
    expect(cloned.note).toBeNull();
    const demoted = diagnosisWithLastVisitAcuity(prior, "worsening", [
      { ...prior, id: "today" },
    ]);
    expect(demoted.kind).toBe("secondary");
    expect(demoted.acuity).toBe("worsening");
    expect(findDiagnosisOnNote([prior], { ...prior, id: "other" })).toBe(prior);
  });

  it("appends last-visit investigations and advice without duplicating", () => {
    expect(appendLastVisitInvestigation("CBC", "LFT")).toBe("CBC; LFT");
    expect(appendLastVisitInvestigation("CBC", "CBC")).toBe("CBC");
    expect(investigationAlreadyOnNote("CBC; LFT", "lft")).toBe(true);
    expect(appendLastVisitAdvice("", "Rest")).toBe("Rest");
    expect(appendLastVisitAdvice("Rest", "Rest")).toBe("Rest");
    expect(
      formatLastVisitFollowUp({
        followUp: null,
        followUpValue: 7,
        followUpUnit: "days",
      })
    ).toBe("in 7 days");
    expect(
      lastVisitFollowUpAlreadyApplied(
        { followUp: "", followUpValue: 7, followUpUnit: "days" },
        { followUp: null, followUpValue: 7, followUpUnit: "days" }
      )
    ).toBe(true);
  });

  it("appends last-visit text and custom sections without duplicating", () => {
    expect(applyLastVisitText("", "Worse at night")).toBe("Worse at night");
    expect(applyLastVisitText("Worse at night", "Worse at night")).toBe(
      "Worse at night"
    );
    expect(lastVisitTextAlreadyApplied("Worse at night", "Worse at night")).toBe(
      true
    );
    const prior = {
      id: "sec-diet",
      title: "Diet",
      body: "Low salt",
      children: [],
    };
    expect(findMatchingCustomSection([], prior)).toBe(-1);
    expect(
      findMatchingCustomSection(
        [{ id: "other", title: "Diet", body: "", children: [] }],
        prior
      )
    ).toBe(0);
    const minted = applyLastVisitCustomSection(null, prior);
    expect(minted).toMatchObject({ id: "sec-diet", body: "Low salt" });
    expect(
      lastVisitCustomSectionAlreadyApplied(
        { id: "sec-diet", title: "Diet", body: "Low salt", children: [] },
        prior
      )
    ).toBe(true);
  });
});
