import { describe, expect, it } from "vitest";
import {
  buildCustomBlockTemplateApplyActions,
  buildCustomBlockTemplateSavePayload,
  buildFullTemplateCustomSubsectionsApplyActions,
  buildScopedTemplateApplyActions,
  buildScopedTemplateSavePayload,
  buildSubjectiveTemplateApplyActions,
  buildSubjectiveTemplateSavePayload,
  customBlockSectionHasContent,
  fullSubjectiveHasContent,
  rxFormHasSubjectiveContent,
  scopeHasContent,
  subjectiveComplaintCount,
  templateCustomBlockSourceSectionId,
  templateHasSubjectiveContent,
} from "@/lib/cockpit/apply-subjective-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import {
  createEmptyRxFormFields,
  rxFormReducer,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import type { CustomSubsection } from "@/types/prescription";
import { sortCustomBlockTemplatesForSection } from "@/lib/cockpit/template-picker-summary";

function makeTemplate(overrides: Partial<DoctorRxTemplate> = {}): DoctorRxTemplate {
  return {
    id: "tpl-1",
    doctor_id: "doc-1",
    name: "Migraine subjective",
    description: null,
    cc: null,
    hopi: null,
    provisional_diagnosis: "Tension headache",
    investigations: "CBC",
    follow_up: "1 week",
    patient_education: null,
    clinical_notes: null,
    medicines_json: [{ medicineName: "Paracetamol", sortOrder: 0 }],
    subjective_json: {
      complaints: [{ id: "c-1", name: "Headache", severity: "7/10" }],
      familyHistory: "Mother — migraine",
      socialHistory: "Office worker",
      pastSurgicalHistory: null,
    },
    pmh_json: {},
    allergies_json: {},
    scope: "subjective_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const emptyFields = () => createEmptyRxFormFields();

describe("apply-subjective-template", () => {
  it("detects subjective content on templates and form fields", () => {
    expect(templateHasSubjectiveContent(makeTemplate())).toBe(true);
    expect(
      templateHasSubjectiveContent(
        makeTemplate({ subjective_json: {}, medicines_json: [{ medicineName: "X", sortOrder: 0 }] }),
      ),
    ).toBe(false);

    expect(rxFormHasSubjectiveContent(emptyFields())).toBe(false);
    expect(
      rxFormHasSubjectiveContent({
        ...emptyFields(),
        complaints: [{ id: "1", name: "Fever", category: "default" }],
      }),
    ).toBe(true);
  });

  it("builds save payload with complaints + histories only (empty medicines)", () => {
    const payload = buildSubjectiveTemplateSavePayload({
      ...emptyFields(),
      complaints: [
        { id: "c-1", name: "  Cough  ", category: "respiratory", severity: "mild" },
        { id: "c-2", name: "", category: "default" },
      ],
      familyHistory: " Father — DM ",
      socialHistory: "",
      pastSurgicalHistory: "None",
    });

    expect(payload.medicines).toEqual([]);
    expect(payload.subjective?.complaints).toHaveLength(1);
    expect(payload.subjective?.complaints?.[0].name).toBe("Cough");
    expect(payload.subjective?.familyHistory).toBe("Father — DM");
    expect(payload.subjective?.pastSurgicalHistory).toBe("None");
    expect(payload.subjective?.socialHistory).toBeNull();
  });

  it("builds save payload with structured social history", () => {
    const fields = createEmptyRxFormFields();
    fields.socialHistoryStructured = {
      smoking: { status: "never", products: [] },
      notes: "Office worker",
    };

    const payload = buildSubjectiveTemplateSavePayload(fields);
    expect(payload.subjective?.socialHistoryStructured?.smoking?.status).toBe("never");
    expect(payload.subjective?.socialHistory).toContain("Non-smoker");
    expect(payload.subjective?.socialHistory).toContain("Office worker");
  });

  it("apply actions touch only subjective fields (not Dx/meds)", () => {
    const actions = buildSubjectiveTemplateApplyActions(
      makeTemplate({
        subjective_json: {
          complaints: [{ id: "c-1", name: "Headache", severity: "7/10" }],
          familyHistory: "Mother — migraine",
          socialHistoryStructured: {
            alcohol: {
              status: "current",
              drinks: [{ id: "d1", type: "spirits" }],
              cage: { cutDown: true, annoyed: false, guilty: false, eyeOpener: false },
            },
          },
        },
      }),
    );

    const types = actions.map((a) => a.type);
    expect(types).toEqual([
      "SET_COMPLAINTS",
      "SET_FAMILY_HISTORY_STRUCTURED",
      "SET_SOCIAL_HISTORY_STRUCTURED",
    ]);

    const socialAction = actions.find((a) => a.type === "SET_SOCIAL_HISTORY_STRUCTURED");
    expect(socialAction).toMatchObject({
      type: "SET_SOCIAL_HISTORY_STRUCTURED",
      structured: expect.objectContaining({
        alcohol: expect.objectContaining({ status: "current" }),
      }),
    });
  });

  it("builds save payload with structured family and past surgical history", () => {
    const fields = createEmptyRxFormFields();
    fields.familyHistoryStructured = {
      relatives: { father: [{ id: "fh-1", condition: "htn" }] },
    };
    fields.pastSurgicalHistoryStructured = {
      procedures: [{ id: "psh-1", procedure: "appendectomy", agoValue: 16, agoUnit: "years" }],
    };

    const payload = buildSubjectiveTemplateSavePayload(fields);
    expect(payload.subjective?.familyHistoryStructured?.relatives?.father?.[0]).toMatchObject({
      condition: "htn",
    });
    expect(payload.subjective?.familyHistory).toBe("Father: Hypertension");
    expect(payload.subjective?.pastSurgicalHistoryStructured?.procedures?.[0]).toMatchObject({
      procedure: "appendectomy",
      agoValue: 16,
      agoUnit: "years",
    });
    expect(payload.subjective?.pastSurgicalHistory).toBe("Appendectomy (16 years ago)");
  });

  it("counts named complaints for picker summary", () => {
    expect(subjectiveComplaintCount(makeTemplate())).toBe(1);
    expect(
      subjectiveComplaintCount(
        makeTemplate({
          subjective_json: {
            complaints: [{ id: "1", name: "A" }, { id: "2", name: "" }],
          },
        }),
      ),
    ).toBe(1);
  });

  it("round-trips phase-2 structured social history on save and apply (sh-08)", () => {
    const normalizedDiet = { type: "vegetarian" as const };
    const normalizedCaffeine = {
      status: "current" as const,
      items: [
        {
          id: "caf-test",
          type: "tea" as const,
          amount: 2,
          frequencyUnit: "day" as const,
          frequency: 1,
          phase: "current" as const,
        },
      ],
    };
    const phase2 = {
      diet: normalizedDiet,
      caffeine: normalizedCaffeine,
      sleep: { hoursPerNight: 6, quality: "poor" as const },
      stress: { level: "high" as const, support: "limited" as const },
      sexual: { enabled: true, active: true, protection: "sometimes" as const },
    };

    const fields = createEmptyRxFormFields();
    fields.socialHistoryStructured = phase2;

    const payload = buildSubjectiveTemplateSavePayload(fields);
    expect(payload.subjective?.socialHistoryStructured).toMatchObject(phase2);
    expect(payload.subjective?.socialHistory).toContain("Diet: Vegetarian");
    expect(payload.subjective?.socialHistory).toContain("Sexual: active");

    const actions = buildSubjectiveTemplateApplyActions(
      makeTemplate({ subjective_json: payload.subjective ?? {} }),
    );
    const socialAction = actions.find((a) => a.type === "SET_SOCIAL_HISTORY_STRUCTURED");
    expect(socialAction).toMatchObject({
      type: "SET_SOCIAL_HISTORY_STRUCTURED",
      structured: expect.objectContaining({
        sleep: { hoursPerNight: 6, quality: "poor" },
        sexual: expect.objectContaining({ enabled: true, active: true }),
      }),
    });
  });

  it("round-trips phase-3 alcohol fields on save and apply (sh-13)", () => {
    const phase3 = {
      alcohol: {
        status: "current" as const,
        drinks: [
          {
            id: "d1",
            type: "beer",
            amount: 330,
            amountUnit: "ml" as const,
            abv: 8,
            frequency: 2,
            frequencyUnit: "interval" as const,
          },
        ],
        auditC: { frequency: 3, typicalQuantity: 2, bingeFrequency: 1 },
        maxPerSession: { amount: 8, amountUnit: "peg" as const },
      },
    };

    const fields = createEmptyRxFormFields();
    fields.socialHistoryStructured = phase3;

    const payload = buildSubjectiveTemplateSavePayload(fields);
    expect(payload.subjective?.socialHistoryStructured?.alcohol).toMatchObject({
      auditC: { frequency: 3, typicalQuantity: 2, bingeFrequency: 1 },
      maxPerSession: { amount: 8 },
    });
    expect(payload.subjective?.socialHistoryStructured?.alcohol?.drinks?.[0]).toMatchObject({
      abv: 8,
      frequencyUnit: "interval",
    });

    const actions = buildSubjectiveTemplateApplyActions(
      makeTemplate({ subjective_json: payload.subjective ?? {} }),
    );
    const socialAction = actions.find((a) => a.type === "SET_SOCIAL_HISTORY_STRUCTURED");
    expect(socialAction).toMatchObject({
      type: "SET_SOCIAL_HISTORY_STRUCTURED",
      structured: expect.objectContaining({
        alcohol: expect.objectContaining({
          auditC: { frequency: 3, typicalQuantity: 2, bingeFrequency: 1 },
          maxPerSession: expect.objectContaining({ amount: 8 }),
        }),
      }),
    });
  });

  describe("scoped templates (subj-16)", () => {
    it("scopeHasContent guards per scope", () => {
      const fields = emptyFields();
      expect(scopeHasContent("chief_complaints", fields)).toBe(false);
      expect(scopeHasContent("family_history", fields)).toBe(false);

      fields.complaints = [{ id: "1", name: "Fever", category: "default" }];
      expect(scopeHasContent("chief_complaints", fields)).toBe(true);
      expect(scopeHasContent("family_history", fields)).toBe(false);

      fields.familyHistoryStructured = {
        relatives: { father: [{ id: "fh-1", condition: "htn" }] },
      };
      expect(scopeHasContent("family_history", fields)).toBe(true);
    });

    it("buildScopedTemplateSavePayload saves only the scope slice", () => {
      const fields = emptyFields();
      fields.complaints = [{ id: "c-1", name: "Cough", category: "respiratory" }];
      fields.familyHistory = "Father — DM";
      fields.socialHistoryStructured = {
        smoking: { status: "never", products: [] },
      };
      fields.pastSurgicalHistory = "Appendectomy";

      const ccPayload = buildScopedTemplateSavePayload("chief_complaints", fields);
      expect(ccPayload.scope).toBe("chief_complaints");
      expect(ccPayload.subjective?.complaints).toHaveLength(1);
      expect(ccPayload.subjective?.familyHistory).toBeUndefined();
      expect(ccPayload.subjective?.socialHistoryStructured).toBeUndefined();
      expect(ccPayload.subjective?.pastSurgicalHistory).toBeUndefined();

      const fhPayload = buildScopedTemplateSavePayload("family_history", fields);
      expect(fhPayload.subjective?.familyHistory).toBe("Father — DM");
      expect(fhPayload.subjective?.complaints).toBeUndefined();

      const shPayload = buildScopedTemplateSavePayload("social_history", fields);
      expect(shPayload.subjective?.socialHistoryStructured?.smoking?.status).toBe("never");
      expect(shPayload.subjective?.complaints).toBeUndefined();

      const pshPayload = buildScopedTemplateSavePayload("past_surgical", fields);
      expect(pshPayload.subjective?.pastSurgicalHistory).toBe("Appendectomy");
      expect(pshPayload.subjective?.complaints).toBeUndefined();
    });

    it("buildScopedTemplateApplyActions touches only the scoped slice", () => {
      const template = makeTemplate({
        scope: "chief_complaints",
        subjective_json: {
          complaints: [{ id: "c-1", name: "Headache" }],
          familyHistory: "Mother — migraine",
          socialHistoryStructured: {
            smoking: { status: "never", products: [] },
          },
          pastSurgicalHistory: "Appendectomy",
        },
      });

      expect(buildScopedTemplateApplyActions("chief_complaints", template).map((a) => a.type)).toEqual([
        "SET_COMPLAINTS",
      ]);
      expect(buildScopedTemplateApplyActions("family_history", template).map((a) => a.type)).toEqual([
        "SET_FAMILY_HISTORY_STRUCTURED",
      ]);
      expect(buildScopedTemplateApplyActions("social_history", template).map((a) => a.type)).toEqual([
        "SET_SOCIAL_HISTORY_STRUCTURED",
      ]);
      expect(buildScopedTemplateApplyActions("past_surgical", template).map((a) => a.type)).toEqual([
        "SET_PAST_SURGICAL_HISTORY_STRUCTURED",
      ]);
    });
  });

  describe("whole-subjective bundle (subj-18)", () => {
    it("full save includes pmh_json alongside subjective_json and stamps subjective_full scope", () => {
      const fields = emptyFields();
      fields.complaints = [{ id: "c-1", name: "Fever", category: "default" }];
      const pmh = {
        conditions: [{ condition: "Diabetes", status: "active" as const }],
        medications: [{ drugName: "Metformin", strength: "500mg" }],
      };

      const payload = buildSubjectiveTemplateSavePayload(fields, pmh);
      expect(payload.scope).toBe("subjective_full");
      expect(payload.subjective?.complaints).toHaveLength(1);
      expect(payload.pmh).toEqual(pmh);
      expect(payload.medicines).toEqual([]);
    });

    it("full save omits pmh when snapshot is empty", () => {
      const payload = buildSubjectiveTemplateSavePayload(emptyFields(), { conditions: [], medications: [] });
      expect(payload.pmh).toBeUndefined();
    });

    it("fullSubjectiveHasContent accepts form-state or PMH snapshot", () => {
      expect(fullSubjectiveHasContent(emptyFields(), null)).toBe(false);
      expect(
        fullSubjectiveHasContent(emptyFields(), {
          conditions: [{ condition: "HTN" }],
        }),
      ).toBe(true);
      expect(
        fullSubjectiveHasContent(
          { ...emptyFields(), complaints: [{ id: "1", name: "Pain", category: "default" }] },
          null,
        ),
      ).toBe(true);
    });

    it("templateHasSubjectiveContent includes PMH but not allergies-only templates", () => {
      expect(
        templateHasSubjectiveContent(
          makeTemplate({
            subjective_json: {},
            pmh_json: { conditions: [{ condition: "Asthma" }] },
          }),
        ),
      ).toBe(true);
      expect(
        templateHasSubjectiveContent(
          makeTemplate({
            subjective_json: {},
            pmh_json: {},
            allergies_json: { allergies: [{ allergen: "Penicillin" }] },
          }),
        ),
      ).toBe(false);
    });

    it("full apply actions still touch only form-state fields (PMH is server-backed)", () => {
      const actions = buildSubjectiveTemplateApplyActions(
        makeTemplate({
          pmh_json: { conditions: [{ condition: "Diabetes" }] },
        }),
      );
      expect(actions.every((a) => a.type !== "SET_PMH")).toBe(true);
      expect(actions.map((a) => a.type)).toEqual([
        "SET_COMPLAINTS",
        "SET_FAMILY_HISTORY_STRUCTURED",
        "SET_SOCIAL_HISTORY_STRUCTURED",
      ]);
    });

    it("subjective_full save captures customSubsections alongside static fields (subj-41)", () => {
      const fields = emptyFields();
      fields.customSubsections = [
        {
          id: "sec-a",
          title: "Diet",
          body: "Low salt",
          children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
        },
        { id: "sec-b", title: "", body: null, children: [] },
      ];

      const payload = buildSubjectiveTemplateSavePayload(fields);
      expect(payload.subjective?.customSubsections).toEqual([
        {
          id: "sec-a",
          title: "Diet",
          body: "Low salt",
          children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
        },
      ]);
    });

    it("subjective_full apply merges custom sections by id (overwrite + create) (subj-41)", () => {
      const existing = {
        id: "sec-a",
        title: "Diet",
        body: "Old",
        children: [] as CustomSubsection["children"],
      };
      const fields = emptyFields();
      fields.customSubsections = [existing];

      const template = makeTemplate({
        scope: "subjective_full",
        subjective_json: {
          customSubsections: [
            {
              id: "sec-a",
              title: "Diet advice",
              body: "Low salt",
              children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
            },
            {
              id: "sec-b",
              title: "Exercise",
              body: "Walk daily",
              children: [],
            },
          ],
        },
      });

      const actions = buildSubjectiveTemplateApplyActions(template, fields);
      expect(actions.filter((a) => a.type.startsWith("SET_")).length).toBeGreaterThan(0);
      expect(
        actions.filter(
          (a) => a.type === "UPDATE_CUSTOM_SUBSECTION" || a.type === "ADD_CUSTOM_SUBSECTION",
        ),
      ).toEqual([
        {
          type: "UPDATE_CUSTOM_SUBSECTION",
          index: 0,
          patch: {
            title: "Diet advice",
            body: "Low salt",
            children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
          },
        },
        {
          type: "ADD_CUSTOM_SUBSECTION",
          section: {
            id: "sec-b",
            title: "Exercise",
            body: "Walk daily",
            children: [],
          },
        },
      ]);
    });

    it("buildFullTemplateCustomSubsectionsApplyActions resurrects a deleted section (subj-41)", () => {
      const fields = emptyFields();
      const actions = buildFullTemplateCustomSubsectionsApplyActions(
        [{ id: "sec-a", title: "Diet", body: "Low salt", children: [] }],
        fields,
      );
      expect(actions).toEqual([
        {
          type: "ADD_CUSTOM_SUBSECTION",
          section: { id: "sec-a", title: "Diet", body: "Low salt", children: [] },
        },
      ]);
    });

    it("fullSubjectiveHasContent includes custom sections (subj-41)", () => {
      const fields = emptyFields();
      fields.customSubsections = [
        { id: "sec-a", title: "Diet", body: "Low salt", children: [] },
      ];
      expect(fullSubjectiveHasContent(fields, null)).toBe(true);
    });

    it("templateHasSubjectiveContent includes customSubsections (subj-41)", () => {
      expect(
        templateHasSubjectiveContent(
          makeTemplate({
            subjective_json: {
              customSubsections: [{ id: "sec-a", title: "Diet", body: "Low salt", children: [] }],
            },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("custom_block templates (subj-40)", () => {
    const sectionA: CustomSubsection = {
      id: "sec-a",
      title: "Diet advice",
      body: "Low salt",
      children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
    };

    const sectionB: CustomSubsection = {
      id: "sec-b",
      title: "Exercise",
      body: "Walk daily",
      children: [],
    };

    function makeCustomBlockTemplate(section: CustomSubsection): DoctorRxTemplate {
      return makeTemplate({
        scope: "custom_block",
        subjective_json: { customSubsections: [section] },
      });
    }

    it("customBlockSectionHasContent requires body or child content, not title alone", () => {
      expect(customBlockSectionHasContent({ id: "1", title: "Only title", body: null, children: [] })).toBe(
        false,
      );
      expect(customBlockSectionHasContent(sectionA)).toBe(true);
      expect(
        customBlockSectionHasContent({
          id: "2",
          title: "X",
          body: null,
          children: [{ id: "c", title: "", body: "notes" }],
        }),
      ).toBe(true);
    });

    it("buildCustomBlockTemplateSavePayload snapshots only the target section", () => {
      const fields = emptyFields();
      fields.customSubsections = [sectionA, sectionB];

      const payload = buildCustomBlockTemplateSavePayload("sec-a", fields);
      expect(payload).toEqual({
        scope: "custom_block",
        medicines: [],
        subjective: {
          customSubsections: [
            {
              id: "sec-a",
              title: "Diet advice",
              body: "Low salt",
              children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
            },
          ],
        },
      });
      expect(buildCustomBlockTemplateSavePayload("sec-b", fields)?.subjective?.customSubsections).toHaveLength(
        1,
      );
      expect(buildCustomBlockTemplateSavePayload("missing", fields)).toBeNull();
      expect(
        buildCustomBlockTemplateSavePayload("sec-a", {
          ...fields,
          customSubsections: [{ ...sectionA, body: null, children: [] }],
        }),
      ).toBeNull();
    });

    it("apply overwrites an existing section with the same id", () => {
      const fields = emptyFields();
      fields.customSubsections = [{ ...sectionA, body: "Old body", children: [] }];

      const actions = buildCustomBlockTemplateApplyActions(
        "sec-a",
        makeCustomBlockTemplate(sectionA),
        fields,
      );

      expect(actions).toEqual([
        {
          type: "UPDATE_CUSTOM_SUBSECTION",
          index: 0,
          patch: {
            title: "Diet advice",
            body: "Low salt",
            children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
          },
        },
      ]);
    });

    it("cross-apply fills the current header section without changing its title", () => {
      const fields = emptyFields();
      fields.customSubsections = [sectionB];

      const actions = buildCustomBlockTemplateApplyActions(
        "sec-b",
        makeCustomBlockTemplate(sectionA),
        fields,
      );

      expect(actions).toEqual([
        {
          type: "UPDATE_CUSTOM_SUBSECTION",
          index: 0,
          patch: {
            body: "Low salt",
            children: [{ id: "child-a", title: "Breakfast", body: "Oats" }],
          },
        },
      ]);
    });

    it("apply creates the section when the template id is absent from the form", () => {
      const fields = emptyFields();
      fields.customSubsections = [];

      const actions = buildCustomBlockTemplateApplyActions(
        "sec-a",
        makeCustomBlockTemplate(sectionA),
        fields,
      );

      expect(actions).toEqual([{ type: "ADD_CUSTOM_SUBSECTION", section: sectionA }]);
    });

    it("malformed or empty templates are a safe no-op", () => {
      const fields = emptyFields();
      fields.customSubsections = [sectionB];

      expect(
        buildCustomBlockTemplateApplyActions(
          "sec-b",
          makeTemplate({ scope: "custom_block", subjective_json: { customSubsections: [] } }),
          fields,
        ),
      ).toEqual([]);
      expect(
        buildCustomBlockTemplateApplyActions(
          "sec-b",
          makeCustomBlockTemplate({ id: "x", title: "Title only", body: null, children: [] }),
          fields,
        ),
      ).toEqual([]);
    });

    it("templateCustomBlockSourceSectionId exposes the stamped section id for picker surfacing", () => {
      expect(templateCustomBlockSourceSectionId(makeCustomBlockTemplate(sectionA))).toBe("sec-a");
      expect(
        templateCustomBlockSourceSectionId(
          makeTemplate({ scope: "custom_block", subjective_json: { customSubsections: [] } }),
        ),
      ).toBeNull();
    });

    it("sortCustomBlockTemplatesForSection lists own-id templates first", () => {
      const own = makeCustomBlockTemplate(sectionA);
      const other = makeCustomBlockTemplate(sectionB);
      const sorted = sortCustomBlockTemplatesForSection([other, own], "sec-a");
      expect(sorted.map((t) => templateCustomBlockSourceSectionId(t))).toEqual(["sec-a", "sec-b"]);
    });
  });

  describe("tolerant reconciliation (subj-42)", () => {
    function makeState(fields = createEmptyRxFormFields()): RxFormState {
      return {
        fields,
        isDirty: false,
        isSaving: false,
        isSubmitting: false,
        lastSavedAt: null,
        submitError: null,
      };
    }

    function applyTemplateActions(state: RxFormState, template: DoctorRxTemplate) {
      const actions = buildSubjectiveTemplateApplyActions(template, state.fields);
      return actions.reduce(rxFormReducer, state);
    }

    it("subjective_full apply re-creates a deleted section without duplicating on re-apply", () => {
      const template = makeTemplate({
        scope: "subjective_full",
        subjective_json: {
          customSubsections: [
            { id: "sec-a", title: "Diet", body: "Low salt", children: [] },
          ],
        },
      });

      const first = applyTemplateActions(makeState(), template);
      expect(first.fields.customSubsections).toHaveLength(1);
      expect(first.fields.customSubsections[0]?.id).toBe("sec-a");

      const second = applyTemplateActions(first, template);
      expect(second.fields.customSubsections).toHaveLength(1);
      expect(second.fields.customSubsections[0]?.body).toBe("Low salt");
    });

    it("custom_block apply re-creates an absent section for a stale embedded id", () => {
      const template = makeTemplate({
        scope: "custom_block",
        subjective_json: {
          customSubsections: [
            { id: "sec-stale", title: "Notes", body: "Important", children: [] },
          ],
        },
      });

      const actions = buildCustomBlockTemplateApplyActions("sec-stale", template, emptyFields());
      expect(actions).toEqual([
        {
          type: "ADD_CUSTOM_SUBSECTION",
          section: { id: "sec-stale", title: "Notes", body: "Important", children: [] },
        },
      ]);
    });

    it("drops malformed customSubsections entries without failing the whole apply", () => {
      const fields = emptyFields();
      fields.customSubsections = [{ id: "sec-a", title: "Keep", body: "Old", children: [] }];

      const actions = buildFullTemplateCustomSubsectionsApplyActions(
        [
          { id: "sec-a", title: "Keep", body: "New", children: [] },
          { id: "bad", title: "   ", body: "drop me", children: [] },
          { id: "", title: "Also bad", body: null, children: [] },
        ],
        fields,
      );

      expect(actions).toEqual([
        {
          type: "UPDATE_CUSTOM_SUBSECTION",
          index: 0,
          patch: { title: "Keep", body: "New", children: [] },
        },
      ]);
    });
  });
});
