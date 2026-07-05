import { describe, expect, it } from "vitest";
import {
  bpPresetBothArms,
  bpPresetOrthostatic,
  bpPresetWouldDropReadings,
  computeAverageBp,
  computeInterArmDelta,
  computeOrthostaticDrop,
  createEmptyBpReading,
  DEFAULT_BP_CONTEXT,
  deriveExtraBpReadingsText,
  derivePrimaryBpReadingSupplementText,
  hydrateBpContextFromPrescription,
  hydrateBpReadingsFromPrescription,
  mergeBpReadingsWithPreset,
  normalizeBpContext,
  normalizeBpReadings,
  resolveEffectiveBpProvenance,
  resolvePrimaryBpForPayload,
  serializeBpContextForVitalsJson,
  serializeBpReadingsForVitalsJson,
} from "@/lib/cockpit/bp-readings";
import { assembleVitalsJsonPayload, createEmptyJsonVitalFields, deriveVitalsText } from "@/lib/cockpit/vitals-json";
import { buildRxPayload, createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

describe("bp-readings", () => {
  it("normalizeBpReadings drops empty rows and clamps invalid numbers", () => {
    expect(
      normalizeBpReadings([
        { systolic: 120, diastolic: 80 },
        { systolic: null, diastolic: null },
        { systolic: 500, diastolic: 80 },
      ]),
    ).toEqual([
      {
        systolic: 120,
        diastolic: 80,
        posture: null,
        limb: null,
        sequenceLabel: null,
        measuredBy: null,
        method: null,
        setting: null,
        note: null,
      },
      {
        systolic: null,
        diastolic: 80,
        posture: null,
        limb: null,
        sequenceLabel: null,
        measuredBy: null,
        method: null,
        setting: null,
        note: null,
      },
    ]);
  });

  it("hydrates a single row from legacy columns when json has no bpReadings", () => {
    const rows = hydrateBpReadingsFromPrescription({
      columns: {
        systolic: 130,
        diastolic: 85,
        posture: "sitting",
        limb: "left_arm",
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      systolic: 130,
      diastolic: 85,
      posture: "sitting",
      limb: "left_arm",
    });
  });

  it("serializes bpReadings to vitals_json when length > 1 or json-only fields present", () => {
    expect(serializeBpReadingsForVitalsJson([{ systolic: 120, diastolic: 80 }])).toBeUndefined();
    expect(
      serializeBpReadingsForVitalsJson([{ systolic: 120, diastolic: 80, note: "Cuff too tight" }]),
    ).toEqual([{ systolic: 120, diastolic: 80, note: "Cuff too tight" }]);
    expect(
      serializeBpReadingsForVitalsJson([
        { systolic: 138, diastolic: 88, limb: "left_arm" },
        { systolic: 132, diastolic: 84, limb: "right_arm" },
      ]),
    ).toHaveLength(2);
  });

  it("normalizeBpReadings clamps note length", () => {
    const longNote = "x".repeat(250);
    const rows = normalizeBpReadings([{ systolic: 120, diastolic: 80, note: longNote }]);
    expect(rows[0]?.note).toHaveLength(200);
  });

  it("resolvePrimaryBpForPayload prefers readings row over stale flat columns", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [
      { systolic: 140, diastolic: 90, posture: "standing", limb: "right_arm" },
    ];
    fields.vitalsBpSystolic = 120;
    fields.vitalsBpDiastolic = 80;
    expect(resolvePrimaryBpForPayload(fields)).toEqual({
      systolic: 140,
      diastolic: 90,
      posture: "standing",
      limb: "right_arm",
    });
  });

  it("resolvePrimaryBpForPayload falls back to flat columns when row 0 empty", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpPosture = "sitting";
    fields.vitalsBpLimb = "left_arm";
    expect(resolvePrimaryBpForPayload(fields)).toEqual({
      systolic: null,
      diastolic: null,
      posture: "sitting",
      limb: "left_arm",
    });
  });

  it("computeInterArmDelta flags large systolic difference", () => {
    const delta = computeInterArmDelta([
      { systolic: 140, diastolic: 90, limb: "left_arm" },
      { systolic: 125, diastolic: 82, limb: "right_arm" },
    ]);
    expect(delta?.delta).toBe(15);
    expect(delta?.flagged).toBe(true);
  });

  it("computeOrthostaticDrop flags supine to standing drop", () => {
    const drop = computeOrthostaticDrop([
      { systolic: 130, diastolic: 80, posture: "supine" },
      { systolic: 105, diastolic: 68, posture: "standing" },
    ]);
    expect(drop?.systolicDrop).toBe(25);
    expect(drop?.flagged).toBe(true);
  });

  it("computeAverageBp averages complete readings", () => {
    expect(
      computeAverageBp([
        { systolic: 120, diastolic: 80 },
        { systolic: 130, diastolic: 90 },
      ]),
    ).toEqual({ systolic: 125, diastolic: 85, count: 2 });
  });

  it("deriveExtraBpReadingsText only renders index >= 1 and includes notes", () => {
    const text = deriveExtraBpReadingsText([
      { systolic: 138, diastolic: 88, limb: "left_arm", posture: "sitting" },
      {
        systolic: 132,
        diastolic: 84,
        limb: "right_arm",
        posture: "sitting",
        note: "Repeat after rest",
      },
    ]);
    expect(text).toContain("132/84 mmHg");
    expect(text).toContain("Repeat after rest");
    expect(text).not.toContain("138/88");
  });

  it("derivePrimaryBpReadingSupplementText renders note for lone json reading", () => {
    const text = derivePrimaryBpReadingSupplementText([
      { systolic: 120, diastolic: 80, note: "Home cuff, seated" },
    ]);
    expect(text).toBe("BP: 120/80 mmHg — Home cuff, seated");
  });

  it("bpPresetBothArms seeds left and right arm rows", () => {
    expect(bpPresetBothArms()).toEqual([
      expect.objectContaining({ limb: "left_arm", posture: "sitting" }),
      expect.objectContaining({ limb: "right_arm", posture: "sitting" }),
    ]);
  });

  describe("mergeBpReadingsWithPreset", () => {
    it("replaces empty single reading with exactly the preset row count", () => {
      expect(mergeBpReadingsWithPreset([createEmptyBpReading()], bpPresetBothArms())).toHaveLength(
        2,
      );
      expect(
        mergeBpReadingsWithPreset([createEmptyBpReading()], bpPresetOrthostatic()),
      ).toHaveLength(3);
    });

    it("preserves systolic/diastolic/note by index and applies preset scaffolding", () => {
      const bothArms = mergeBpReadingsWithPreset(
        [{ systolic: 120, diastolic: 80, note: "After rest" }],
        bpPresetBothArms(),
      );
      expect(bothArms).toHaveLength(2);
      expect(bothArms[0]).toMatchObject({
        systolic: 120,
        diastolic: 80,
        note: "After rest",
        limb: "left_arm",
        posture: "sitting",
      });
      expect(bothArms[1]).toMatchObject({
        systolic: null,
        diastolic: null,
        limb: "right_arm",
        posture: "sitting",
      });

      const orthostatic = mergeBpReadingsWithPreset(
        [{ systolic: 118, diastolic: 76 }],
        bpPresetOrthostatic(),
      );
      expect(orthostatic).toHaveLength(3);
      expect(orthostatic[0]).toMatchObject({
        systolic: 118,
        diastolic: 76,
        posture: "supine",
        sequenceLabel: "Lying",
      });
      expect(orthostatic[1]).toMatchObject({
        posture: "sitting",
        sequenceLabel: "1 min",
        systolic: null,
      });
    });

    it("does not append preset rows onto existing readings", () => {
      expect(
        mergeBpReadingsWithPreset(
          [{ systolic: 120, diastolic: 80, posture: "standing" }],
          bpPresetBothArms(),
        ),
      ).toHaveLength(2);
    });
  });

  describe("bpPresetWouldDropReadings", () => {
    it("flags when extra rows beyond the preset carry data", () => {
      expect(
        bpPresetWouldDropReadings(
          [
            { systolic: 120, diastolic: 80 },
            { systolic: 118, diastolic: 78 },
            { systolic: 116, diastolic: 76 },
          ],
          bpPresetBothArms(),
        ),
      ).toBe(true);
    });

    it("does not flag when trailing rows are empty", () => {
      expect(
        bpPresetWouldDropReadings(
          [{ systolic: 120, diastolic: 80 }, createEmptyBpReading(), createEmptyBpReading()],
          bpPresetBothArms(),
        ),
      ).toBe(false);
    });
  });

  it("hydrateBpContextFromPrescription defaults to teleconsult baseline", () => {
    expect(hydrateBpContextFromPrescription(null)).toEqual(DEFAULT_BP_CONTEXT);
    expect(
      hydrateBpContextFromPrescription({
        bpContext: { setting: "clinic", method: "manual_auscultatory" },
      }),
    ).toEqual({
      measuredBy: "patient",
      method: "manual_auscultatory",
      setting: "clinic",
    });
  });

  it("serializeBpContextForVitalsJson omits default method and who/where", () => {
    expect(serializeBpContextForVitalsJson(DEFAULT_BP_CONTEXT)).toBeUndefined();
    expect(serializeBpContextForVitalsJson({ measuredBy: "nurse", setting: "clinic" })).toBeUndefined();
    expect(
      serializeBpContextForVitalsJson({ method: "manual_auscultatory" }),
    ).toEqual({ method: "manual_auscultatory" });
  });

  it("resolveEffectiveBpProvenance prefers row override over visit block", () => {
    const block = { measuredBy: "patient" as const, method: "auto_upper_arm" as const, setting: "home" as const };
    expect(
      resolveEffectiveBpProvenance(
        { systolic: 120, diastolic: 80, measuredBy: "nurse" },
        block,
      ).measuredBy,
    ).toBe("nurse");
  });

  it("serializeBpReadingsForVitalsJson strips row overrides matching block context", () => {
    const block = { measuredBy: "patient" as const, method: "auto_upper_arm" as const, setting: "home" as const };
    const serialized = serializeBpReadingsForVitalsJson(
      [
        { systolic: 138, diastolic: 88, measuredBy: "patient" },
        { systolic: 132, diastolic: 84, measuredBy: "nurse", setting: "clinic" },
      ],
      block,
    );
    expect(serialized?.[0]?.measuredBy).toBeUndefined();
    expect(serialized?.[1]).toMatchObject({ measuredBy: "nurse", setting: "clinic" });
  });

  it("normalizeBpContext drops invalid enum values", () => {
    expect(normalizeBpContext({ measuredBy: "invalid", setting: "clinic" })).toEqual({
      measuredBy: null,
      method: null,
      setting: "clinic",
    });
  });
});

describe("bp-readings payload byte-parity", () => {
  it("single reading does not emit bpReadings in vitalsJson", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [
      { systolic: 120, diastolic: 80, posture: "sitting", limb: "left_arm" },
    ];
    const payload = buildRxPayload(fields);
    expect(payload.vitalsBpSystolic).toBe(120);
    expect(payload.vitalsBpPosture).toBe("sitting");
    expect(payload.vitalsJson?.bpReadings).toBeUndefined();
    expect(payload.vitalsJson?.bpContext).toBeUndefined();
  });

  it("default BP context does not emit bpContext in vitalsJson", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [{ systolic: 120, diastolic: 80 }];
    expect(fields.vitalsBpContext).toEqual({ method: DEFAULT_BP_CONTEXT.method });
    expect(fields.vitalsMeasurementContext).toEqual({
      measuredBy: DEFAULT_BP_CONTEXT.measuredBy,
      setting: DEFAULT_BP_CONTEXT.setting,
    });
    const payload = buildRxPayload(fields);
    expect(payload.vitalsJson?.bpContext).toBeUndefined();
    expect(payload.vitalsJson?.measurementContext).toBeUndefined();
  });

  it("non-default BP context emits method in bpContext and who/where in measurementContext", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [{ systolic: 120, diastolic: 80 }];
    fields.vitalsMeasurementContext = { measuredBy: "nurse", setting: "clinic" };
    fields.vitalsBpContext = { method: "manual_auscultatory" };
    const payload = buildRxPayload(fields);
    expect(payload.vitalsJson?.measurementContext).toEqual({
      measuredBy: "nurse",
      setting: "clinic",
    });
    expect(payload.vitalsJson?.bpContext).toEqual({
      method: "manual_auscultatory",
    });
    expect(payload.vitalsJson?.bpReadings).toBeUndefined();
  });

  it("multiple readings emit bpReadings and mirror primary to columns", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [
      { systolic: 138, diastolic: 88, posture: "sitting", limb: "left_arm" },
      { systolic: 132, diastolic: 84, posture: "sitting", limb: "right_arm" },
    ];
    const payload = buildRxPayload(fields);
    expect(payload.vitalsBpSystolic).toBe(138);
    expect(payload.vitalsBpLimb).toBe("left_arm");
    expect(payload.vitalsJson?.bpReadings).toHaveLength(2);
  });

  it("single reading with note emits bpReadings in vitalsJson", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [{ systolic: 120, diastolic: 80, note: "Patient seated 5 min" }];
    const payload = buildRxPayload(fields);
    expect(payload.vitalsJson?.bpReadings).toEqual([
      { systolic: 120, diastolic: 80, note: "Patient seated 5 min" },
    ]);
  });

  it("deriveVitalsText includes primary reading note when stored in json", () => {
    const json = assembleVitalsJsonPayload(
      createEmptyJsonVitalFields(),
      [{ systolic: 120, diastolic: 80, note: "Home monitor" }],
    );
    expect(deriveVitalsText(json)).toContain("Home monitor");
  });

  it("deriveVitalsText stays empty for single-reading parity", () => {
    const json = assembleVitalsJsonPayload(createEmptyJsonVitalFields(), [
      { systolic: 120, diastolic: 80 },
    ]);
    expect(deriveVitalsText(json)).toBe("");
  });

  it("deriveVitalsText appends extra BP lines for multi-reading json", () => {
    const json = assembleVitalsJsonPayload(createEmptyJsonVitalFields(), [
      { systolic: 138, diastolic: 88, limb: "left_arm" },
      { systolic: 132, diastolic: 84, limb: "right_arm" },
    ]);
    expect(deriveVitalsText(json)).toContain("BP (Right arm): 132/84 mmHg");
  });
});
