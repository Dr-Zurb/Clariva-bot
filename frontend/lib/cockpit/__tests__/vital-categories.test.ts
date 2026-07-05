import { describe, expect, it } from "vitest";
import {
  categorizeBpPair,
  categorizeVital,
} from "@/lib/cockpit/vital-categories";

describe("vital-categories · BP (ACC/AHA 2017)", () => {
  it("classifies normal, elevated, stage 1, stage 2, and crisis", () => {
    expect(categorizeBpPair(118, 76)?.label).toBe("Normal blood pressure");
    expect(categorizeBpPair(125, 78)?.label).toBe("Elevated blood pressure");
    expect(categorizeBpPair(130, 80)?.label).toBe("Stage 1 hypertension");
    expect(categorizeBpPair(145, 92)?.label).toBe("Stage 2 hypertension");
    expect(categorizeBpPair(185, 115)?.label).toBe("Hypertensive crisis");
  });

  it("flags hypotension", () => {
    expect(categorizeBpPair(85, 55)?.label).toBe("Hypotension");
    expect(categorizeBpPair(85, 55)?.direction).toBe("low");
  });
});

describe("vital-categories · glucose (ADA)", () => {
  it("uses fasting thresholds when timing is fasting", () => {
    expect(
      categorizeVital("vitalsGlucoseMgDl", 95, { glucoseTiming: "fasting" })?.label,
    ).toBe("Normal fasting glucose");
    expect(
      categorizeVital("vitalsGlucoseMgDl", 110, { glucoseTiming: "fasting" })?.label,
    ).toBe("Impaired fasting glucose");
    expect(
      categorizeVital("vitalsGlucoseMgDl", 130, { glucoseTiming: "fasting" })?.label,
    ).toBe("Diabetes range (fasting)");
  });

  it("uses post-prandial thresholds for random timing", () => {
    expect(categorizeVital("vitalsGlucoseMgDl", 120, { glucoseTiming: "random" })?.label).toBe(
      "Normal glucose",
    );
    expect(categorizeVital("vitalsGlucoseMgDl", 160, { glucoseTiming: "random" })?.label).toBe(
      "Impaired glucose tolerance",
    );
    expect(categorizeVital("vitalsGlucoseMgDl", 210, { glucoseTiming: "random" })?.label).toBe(
      "Diabetes range",
    );
  });

  it("flags hypoglycemia levels", () => {
    expect(categorizeVital("vitalsGlucoseMgDl", 50, {})?.label).toBe("Severe hypoglycemia (Level 2)");
    expect(categorizeVital("vitalsGlucoseMgDl", 65, {})?.label).toBe("Hypoglycemia (Level 1)");
  });
});

describe("vital-categories · temperature", () => {
  it("classifies fever tiers", () => {
    expect(categorizeVital("vitalsTempC", 36.8)?.label).toBe("Normal temperature");
    expect(categorizeVital("vitalsTempC", 37.6)?.label).toBe("Low-grade fever");
    expect(categorizeVital("vitalsTempC", 38.5)?.label).toBe("Fever");
    expect(categorizeVital("vitalsTempC", 39.5)?.label).toBe("High fever");
    expect(categorizeVital("vitalsTempC", 41.5)?.label).toBe("Hyperpyrexia");
    expect(categorizeVital("vitalsTempC", 34)?.label).toBe("Hypothermia");
  });
});

describe("vital-categories · SpO₂", () => {
  it("classifies hypoxemia severity", () => {
    expect(categorizeVital("vitalsSpo2", 98)?.label).toBe("Normal oxygen saturation");
    expect(categorizeVital("vitalsSpo2", 93)?.label).toBe("Mild hypoxemia");
    expect(categorizeVital("vitalsSpo2", 88)?.label).toBe("Moderate hypoxemia");
    expect(categorizeVital("vitalsSpo2", 82)?.label).toBe("Severe hypoxemia");
  });
});

describe("vital-categories · GCS", () => {
  it("classifies impairment severity", () => {
    expect(categorizeVital("vitalsGcsTotal", 15)?.severity).toBe("normal");
    expect(categorizeVital("vitalsGcsTotal", 14)?.label).toBe("Mild impairment (GCS 13–14)");
    expect(categorizeVital("vitalsGcsTotal", 10)?.label).toBe("Moderate impairment (GCS 9–12)");
    expect(categorizeVital("vitalsGcsTotal", 7)?.label).toBe("Severe impairment (GCS ≤8)");
  });
});
