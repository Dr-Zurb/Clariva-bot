import { describe, expect, it } from "vitest";
import {
  deskVitalsFromReading,
  parseDeskVitalsFields,
  EMPTY_DESK_VITALS,
} from "@/lib/desk/vitals";

describe("parseDeskVitalsFields", () => {
  it("requires at least one vital", () => {
    expect(parseDeskVitalsFields(EMPTY_DESK_VITALS)).toEqual({
      ok: false,
      error: "Enter at least one vital",
    });
  });

  it("requires both BP numbers", () => {
    expect(
      parseDeskVitalsFields({ ...EMPTY_DESK_VITALS, bpSystolic: "120" })
    ).toEqual({ ok: false, error: "Blood pressure needs both numbers" });
  });

  it("builds a payload from filled fields", () => {
    expect(
      parseDeskVitalsFields({
        ...EMPTY_DESK_VITALS,
        bpSystolic: "120",
        bpDiastolic: "80",
        heartRate: "72",
      })
    ).toEqual({
      ok: true,
      payload: { bpSystolic: 120, bpDiastolic: 80, heartRate: 72 },
    });
  });
});

describe("deskVitalsFromReading", () => {
  it("stringifies present readings and blanks the rest", () => {
    expect(
      deskVitalsFromReading({
        bp_systolic: 118,
        bp_diastolic: 76,
        heart_rate: 70,
        temperature_c: null,
        spo2: null,
        weight_kg: null,
        height_cm: null,
      })
    ).toMatchObject({
      bpSystolic: "118",
      bpDiastolic: "76",
      heartRate: "70",
      temperatureC: "",
    });
  });
});
