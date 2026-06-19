import { describe, expect, it } from "vitest";
import {
  countLinkedCustomSectionTemplates,
  subjectiveFullTemplateEmbedsSectionId,
} from "@/lib/cockpit/custom-section-linked-templates";
import type { DoctorRxTemplate } from "@/types/rx-template";

function makeTemplate(overrides: Partial<DoctorRxTemplate> = {}): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "Template",
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
    scope: "custom_block",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("custom-section-linked-templates (subj-41)", () => {
  it("counts linked custom_block and subjective_full templates for a section id", () => {
    const customBlock = [
      makeTemplate({
        id: "cb-1",
        scope: "custom_block",
        subjective_json: {
          customSubsections: [{ id: "sec-a", title: "Diet", body: "Low salt", children: [] }],
        },
      }),
      makeTemplate({
        id: "cb-2",
        scope: "custom_block",
        subjective_json: {
          customSubsections: [{ id: "sec-b", title: "Exercise", body: "Walk", children: [] }],
        },
      }),
    ];
    const subjectiveFull = [
      makeTemplate({
        id: "sf-1",
        scope: "subjective_full",
        subjective_json: {
          customSubsections: [
            { id: "sec-a", title: "Diet", body: "Low salt", children: [] },
            { id: "sec-c", title: "Sleep", body: null, children: [] },
          ],
        },
      }),
      makeTemplate({
        id: "sf-2",
        scope: "subjective_full",
        subjective_json: { complaints: [{ id: "c-1", name: "Fever" }] },
      }),
    ];

    const counts = countLinkedCustomSectionTemplates("sec-a", customBlock, subjectiveFull);
    expect(counts.customBlockCount).toBe(1);
    expect(counts.subjectiveFullCount).toBe(1);
    expect(counts.customBlockTemplates.map((t) => t.id)).toEqual(["cb-1"]);
    expect(counts.subjectiveFullTemplates.map((t) => t.id)).toEqual(["sf-1"]);
  });

  it("subjectiveFullTemplateEmbedsSectionId matches any embedded custom section", () => {
    const template = makeTemplate({
      scope: "subjective_full",
      subjective_json: {
        customSubsections: [{ id: "sec-x", title: "Notes", body: "Text", children: [] }],
      },
    });
    expect(subjectiveFullTemplateEmbedsSectionId(template, "sec-x")).toBe(true);
    expect(subjectiveFullTemplateEmbedsSectionId(template, "sec-y")).toBe(false);
  });
});
