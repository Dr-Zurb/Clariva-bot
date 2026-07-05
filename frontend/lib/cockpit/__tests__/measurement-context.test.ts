import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEASUREMENT_CONTEXT,
  IN_CLINIC_MEASUREMENT_CONTEXT,
  PROVENANCE_OVERRIDE_VITAL_KEYS,
  hydrateMeasurementContextFromPrescription,
  hydrateVitalProvenanceFromPrescription,
  isProvenanceOverrideVital,
  measurementContextEquals,
  resolveDefaultMeasurementContext,
  serializeMeasurementContextForVitalsJson,
  serializeVitalProvenanceForVitalsJson,
} from "@/lib/cockpit/measurement-context";

describe("measurement-context", () => {
  it("resolveDefaultMeasurementContext uses in-clinic baseline for in_clinic visits", () => {
    expect(resolveDefaultMeasurementContext("in_clinic")).toEqual(
      IN_CLINIC_MEASUREMENT_CONTEXT,
    );
    expect(resolveDefaultMeasurementContext("video")).toEqual(DEFAULT_MEASUREMENT_CONTEXT);
    expect(resolveDefaultMeasurementContext(null)).toEqual(DEFAULT_MEASUREMENT_CONTEXT);
  });

  it("hydrates in-clinic defaults when nothing stored and visit is in_clinic", () => {
    expect(hydrateMeasurementContextFromPrescription(null, "in_clinic")).toEqual(
      IN_CLINIC_MEASUREMENT_CONTEXT,
    );
  });
  it("hydrates from measurementContext with legacy bpContext fallback", () => {
    expect(
      hydrateMeasurementContextFromPrescription({
        measurementContext: { measuredBy: "nurse", setting: "clinic" },
      }),
    ).toEqual({ measuredBy: "nurse", setting: "clinic" });

    expect(
      hydrateMeasurementContextFromPrescription({
        bpContext: { measuredBy: "physician", setting: "clinic" },
      }),
    ).toEqual({ measuredBy: "physician", setting: "clinic" });
  });

  it("uses teleconsult defaults when nothing stored", () => {
    expect(hydrateMeasurementContextFromPrescription(null)).toEqual(
      DEFAULT_MEASUREMENT_CONTEXT,
    );
  });

  it("serializeMeasurementContextForVitalsJson omits teleconsult default", () => {
    expect(serializeMeasurementContextForVitalsJson(DEFAULT_MEASUREMENT_CONTEXT)).toBeUndefined();
    expect(
      serializeMeasurementContextForVitalsJson(IN_CLINIC_MEASUREMENT_CONTEXT),
    ).toEqual(IN_CLINIC_MEASUREMENT_CONTEXT);
    expect(
      serializeMeasurementContextForVitalsJson({ measuredBy: "physician", setting: "clinic" }),
    ).toEqual({ measuredBy: "physician", setting: "clinic" });
  });

  it("measurementContextEquals is order-insensitive on fields", () => {
    expect(
      measurementContextEquals(
        { measuredBy: "patient", setting: "home" },
        { measuredBy: "patient", setting: "home" },
      ),
    ).toBe(true);
  });

  it("hydrates and serializes per-vital provenance overrides", () => {
    const visit = { measuredBy: "patient" as const, setting: "home" as const };
    expect(
      hydrateVitalProvenanceFromPrescription({
        vitalProvenance: { vitalsWtKg: { measuredBy: "nurse", setting: "clinic" } },
      }),
    ).toEqual({ vitalsWtKg: { measuredBy: "nurse", setting: "clinic" } });

    expect(serializeVitalProvenanceForVitalsJson(visit, {})).toBeUndefined();
    expect(
      serializeVitalProvenanceForVitalsJson(visit, {
        vitalsWtKg: { measuredBy: "nurse", setting: "clinic" },
      }),
    ).toEqual({ vitalsWtKg: { measuredBy: "nurse", setting: "clinic" } });
    expect(
      serializeVitalProvenanceForVitalsJson(visit, {
        vitalsWtKg: { measuredBy: "patient", setting: "home" },
      }),
    ).toBeUndefined();
    expect(
      serializeVitalProvenanceForVitalsJson(visit, {
        vitalsRr: { measuredBy: "nurse", setting: "clinic" },
      }),
    ).toEqual({ vitalsRr: { measuredBy: "nurse", setting: "clinic" } });
  });

  it("lists provenance override keys for all numeric vitals except BP and pain score", () => {
    expect(PROVENANCE_OVERRIDE_VITAL_KEYS).toContain("vitalsHr");
    expect(PROVENANCE_OVERRIDE_VITAL_KEYS).toContain("vitalsRr");
    expect(PROVENANCE_OVERRIDE_VITAL_KEYS).toContain("vitalsHtCm");
    expect(PROVENANCE_OVERRIDE_VITAL_KEYS).not.toContain("vitalsBpSystolic");
    expect(isProvenanceOverrideVital("vitalsHr")).toBe(true);
    expect(isProvenanceOverrideVital("vitalsBpSystolic")).toBe(false);
  });

  it("hydrates and serializes custom-vital provenance overrides", () => {
    const visit = { measuredBy: "patient" as const, setting: "home" as const };
    const customId = "custom_abc123";

    expect(
      hydrateVitalProvenanceFromPrescription({
        vitalProvenance: { [customId]: { measuredBy: "nurse", setting: "clinic" } },
      }),
    ).toEqual({ [customId]: { measuredBy: "nurse", setting: "clinic" } });

    expect(
      serializeVitalProvenanceForVitalsJson(visit, {
        [customId]: { measuredBy: "nurse", setting: "clinic" },
      }),
    ).toEqual({ [customId]: { measuredBy: "nurse", setting: "clinic" } });
  });
});
