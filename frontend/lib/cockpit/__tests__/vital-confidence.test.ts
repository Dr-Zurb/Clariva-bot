import { describe, expect, it } from "vitest";
import {
  CLINICIAN_ONLY_VITAL_KEYS,
  isClinicianOnlyVital,
  isLowConfidenceClinicianOnlyVital,
  isLowConfidenceVitalReading,
  resolveContextLowConfidence,
  resolveVitalLowConfidence,
} from "@/lib/cockpit/vital-confidence";

describe("vital-confidence", () => {
  it("flags patient palpation HR source", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "patient",
        contextKey: "vitalsHrSource",
        deviceValue: "palpation",
      }),
    ).toBe("self_palpation");
  });

  it("does not flag oximeter HR source for patient", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "patient",
        contextKey: "vitalsHrSource",
        deviceValue: "oximeter",
      }),
    ).toBeNull();
  });

  it("flags blank HR source for patient default", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "patient",
        contextKey: "vitalsHrSource",
        deviceValue: null,
      }),
    ).toBe("source_unknown");
  });

  it("flags blank SpO2 device for patient default", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "patient",
        contextKey: "vitalsSpo2Device",
        deviceValue: "",
      }),
    ).toBe("source_unknown");
  });

  it("does not flag blank source when measured by clinic staff", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "nurse",
        contextKey: "vitalsHrSource",
        deviceValue: null,
      }),
    ).toBeNull();
  });

  it("does not flag palpation when measured by clinic staff", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "nurse",
        contextKey: "vitalsHrSource",
        deviceValue: "palpation",
      }),
    ).toBeNull();
  });

  it("flags consumer wearables for patient HR source", () => {
    expect(
      resolveContextLowConfidence({
        measuredBy: "patient",
        contextKey: "vitalsHrSource",
        deviceValue: "wearable",
      }),
    ).toBe("consumer_device");
  });

  it("flags patient-measured respiratory rate as clinician-only", () => {
    expect(
      isLowConfidenceClinicianOnlyVital({
        measuredBy: "patient",
        vitalKey: "vitalsRr",
      }),
    ).toBe(true);
  });

  it("does not flag clinic-measured respiratory rate", () => {
    expect(
      isLowConfidenceClinicianOnlyVital({
        measuredBy: "nurse",
        vitalKey: "vitalsRr",
      }),
    ).toBe(false);
  });

  it("lists obvious clinician-only vitals", () => {
    expect(CLINICIAN_ONLY_VITAL_KEYS).toContain("vitalsRr");
    expect(CLINICIAN_ONLY_VITAL_KEYS).toContain("vitalsGcsTotal");
    expect(isClinicianOnlyVital("vitalsHr")).toBe(false);
  });

  it("keeps deprecated helper aligned with resolveContextLowConfidence", () => {
    expect(
      isLowConfidenceVitalReading({
        measuredBy: "patient",
        contextKey: "vitalsSpo2Device",
        deviceValue: "smartwatch",
      }),
    ).toBe(true);
  });

  it("resolveVitalLowConfidence prefers clinician-only over device context", () => {
    expect(
      resolveVitalLowConfidence({
        measuredBy: "patient",
        vitalKey: "vitalsRr",
      }),
    ).toBe("clinician_only");
  });

  it("resolveVitalLowConfidence flags blank HR source for patient", () => {
    expect(
      resolveVitalLowConfidence({
        measuredBy: "patient",
        vitalKey: "vitalsHr",
        deviceContextKey: "vitalsHrSource",
        deviceValue: null,
      }),
    ).toBe("source_unknown");
  });
});
