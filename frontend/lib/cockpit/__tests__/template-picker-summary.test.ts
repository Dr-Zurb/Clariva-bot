import { describe, expect, it } from "vitest";
import {
  formatTemplateSummary,
  templateHasScopedContent,
  templateMatchesSearch,
} from "@/lib/cockpit/template-picker-summary";
import type { DoctorRxTemplate } from "@/types/rx-template";

function baseTemplate(over: Partial<DoctorRxTemplate> = {}): DoctorRxTemplate {
  return {
    id: "t1",
    doctor_id: "d1",
    name: "Test",
    description: null,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    medicines_json: [],
    subjective_json: {},
    pmh_json: {},
    allergies_json: {},
    scope: "subjective_full",
    use_count: 0,
    last_used_at: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
    ...over,
  };
}

describe("templateHasScopedContent", () => {
  it("detects PMH and allergy scoped content", () => {
    expect(
      templateHasScopedContent(
        baseTemplate({ pmh_json: { conditions: [{ condition: "HTN" }] } }),
        "past_medical",
      ),
    ).toBe(true);
    expect(
      templateHasScopedContent(
        baseTemplate({ allergies_json: { allergies: [{ allergen: "Penicillin" }] } }),
        "allergies",
      ),
    ).toBe(true);
  });

  it("detects complaint scoped content", () => {
    expect(
      templateHasScopedContent(
        baseTemplate({
          subjective_json: { complaints: [{ id: "1", name: "Headache" }] },
        }),
        "chief_complaints",
      ),
    ).toBe(true);
  });
});

describe("formatTemplateSummary", () => {
  it("formats PMH counts", () => {
    const summary = formatTemplateSummary(
      baseTemplate({
        pmh_json: {
          conditions: [{ condition: "DM" }, { condition: "HTN" }],
          medications: [{ drugName: "Metformin" }],
        },
      }),
      "past_medical",
    );
    expect(summary).toBe("2 conditions · 1 medication");
  });

  it("formats subjective_full composite", () => {
    const summary = formatTemplateSummary(
      baseTemplate({
        subjective_json: {
          complaints: [{ id: "1", name: "Fever" }],
          familyHistory: "Mother — migraine",
        },
        pmh_json: { conditions: [{ condition: "Asthma" }] },
      }),
      "subjective_full",
    );
    expect(summary).toContain("1 complaint");
    expect(summary).toContain("family history");
    expect(summary).toContain("1 condition");
  });

  it("includes custom sections in subjective_full summary", () => {
    const summary = formatTemplateSummary(
      baseTemplate({
        subjective_json: {
          customSubsections: [
            { id: "c1", title: "Travel history", body: null, children: [] },
          ],
        },
      }),
      "subjective_full",
    );
    expect(summary).toBe("1 custom section");
  });

  it("keeps subjective_full summary aligned with content filter", () => {
    const template = baseTemplate({
      subjective_json: {
        customSubsections: [
          { id: "c1", title: "Occupational exposure", body: null, children: [] },
        ],
      },
    });
    expect(templateHasScopedContent(template, "subjective_full")).toBe(true);
    expect(formatTemplateSummary(template, "subjective_full")).not.toBe("Empty template");
  });

  it("ignores blank PMH rows for past_medical scope", () => {
    expect(
      templateHasScopedContent(
        baseTemplate({ pmh_json: { conditions: [{ condition: "" }] } }),
        "past_medical",
      ),
    ).toBe(false);
  });
});

describe("templateMatchesSearch", () => {
  it("matches PMH condition names", () => {
    expect(
      templateMatchesSearch(
        baseTemplate({ pmh_json: { conditions: [{ condition: "Hypertension" }] } }),
        "past_medical",
        "hyper",
      ),
    ).toBe(true);
  });

  it("matches allergy allergen names", () => {
    expect(
      templateMatchesSearch(
        baseTemplate({ allergies_json: { allergies: [{ allergen: "Latex" }] } }),
        "allergies",
        "latex",
      ),
    ).toBe(true);
  });
});
