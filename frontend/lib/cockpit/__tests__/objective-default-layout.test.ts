/**
 * obj-14 (OBJ-D6) — pure modality/specialty default-layout resolver + the
 * override-wins layering helper. Deterministic, view-only, never all-hidden.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeSpecialty,
  resolveDefaultLayout,
  resolveEffectiveLayout,
  type DefaultLayout,
} from "@/lib/cockpit/objective-default-layout";
import {
  DEFAULT_OBJECTIVE_SECTION_ORDER,
  toCustomBlockSectionId,
} from "@/lib/cockpit/objective-section-order";

describe("normalizeSpecialty", () => {
  it("buckets common §E2 labels", () => {
    expect(normalizeSpecialty("Cardiology")).toBe("cardiology");
    expect(normalizeSpecialty("Interventional Cardiology")).toBe("cardiology");
    expect(normalizeSpecialty("Pulmonology")).toBe("pulmonology");
    expect(normalizeSpecialty("Tuberculosis and Respiratory Medicine")).toBe("pulmonology");
    expect(normalizeSpecialty("Obstetrics and Gynaecology")).toBe("obstetrics");
    expect(normalizeSpecialty("Gynecologic Oncology")).toBe("gynaecology");
    expect(normalizeSpecialty("Pediatrics")).toBe("paediatrics");
    expect(normalizeSpecialty("Orthopedics")).toBe("orthopaedics");
    expect(normalizeSpecialty("Dermatology")).toBe("dermatology");
    expect(normalizeSpecialty("Otolaryngology (ENT)")).toBe("ent");
    expect(normalizeSpecialty("Ophthalmology")).toBe("ophthalmology");
    expect(normalizeSpecialty("Psychiatry")).toBe("psychiatry");
    expect(normalizeSpecialty("Neurology")).toBe("neurology");
    expect(normalizeSpecialty("General Physician")).toBe("gp");
  });

  it("does not mis-bucket lookalikes and unknowns", () => {
    expect(normalizeSpecialty("Orthodontics")).toBe("unknown");
    expect(normalizeSpecialty("Radiology")).toBe("unknown");
    expect(normalizeSpecialty("")).toBe("unknown");
    expect(normalizeSpecialty(null)).toBe("unknown");
    expect(normalizeSpecialty(undefined)).toBe("unknown");
  });
});

describe("resolveDefaultLayout · modality maps (§G / rpt-01)", () => {
  it("in_clinic → full registry exam, nothing hidden", () => {
    expect(resolveDefaultLayout({ modality: "in_clinic" })).toEqual({
      defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
      defaultHidden: [],
    });
  });

  it("video → observed exam + Reports (media inside); nothing hidden by default", () => {
    expect(resolveDefaultLayout({ modality: "video" })).toEqual({
      defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
      defaultHidden: [],
    });
    expect(resolveDefaultLayout({ modality: "video" }).defaultHidden).not.toContain(
      "test_results",
    );
  });

  it("voice/text (async) → Reports lead; structured exam hidden", () => {
    const voice = resolveDefaultLayout({ modality: "voice" });
    expect(voice.defaultOrder[0]).toBe("test_results");
    expect(voice.defaultHidden).toEqual(["exam"]);
    expect(resolveDefaultLayout({ modality: "text" })).toEqual(voice);
    expect(voice.defaultHidden).not.toContain("vitals");
    expect(voice.defaultHidden).not.toContain("test_results");
  });

  it("unknown / absent modality → registry default (never blank)", () => {
    const fallback = { defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER], defaultHidden: [] };
    expect(resolveDefaultLayout({ modality: null })).toEqual(fallback);
    expect(resolveDefaultLayout({})).toEqual(fallback);
    expect(
      resolveDefaultLayout({ modality: "carrier-pigeon" as unknown as "video" }),
    ).toEqual(fallback);
  });
});

describe("resolveDefaultLayout · specialty emphasis (§E2, section-level)", () => {
  it("derm brings the exam section to the front (in_clinic)", () => {
    expect(resolveDefaultLayout({ modality: "in_clinic", specialty: "Dermatology" }).defaultOrder).toEqual([
      "exam",
      "vitals",
      "notes",
      "test_results",
    ]);
  });

  it("cardiology emphasises vitals + exam front, leaving hidden untouched", () => {
    const layout = resolveDefaultLayout({ modality: "voice", specialty: "Cardiology" });
    expect(layout.defaultOrder.slice(0, 2)).toEqual(["vitals", "exam"]);
    expect(layout.defaultHidden).toEqual(["exam"]);
  });

  it("unknown / gp specialty leaves the modality order unchanged", () => {
    expect(resolveDefaultLayout({ modality: "in_clinic", specialty: "Radiology" }).defaultOrder).toEqual(
      [...DEFAULT_OBJECTIVE_SECTION_ORDER],
    );
    expect(resolveDefaultLayout({ modality: "in_clinic", specialty: "General Physician" }).defaultOrder).toEqual(
      [...DEFAULT_OBJECTIVE_SECTION_ORDER],
    );
  });

  it("accepts a pre-bucketed emphasis value directly", () => {
    expect(resolveDefaultLayout({ modality: "in_clinic", specialty: "dermatology" }).defaultOrder[0]).toBe(
      "exam",
    );
  });
});

describe("resolveEffectiveLayout · override-wins layering (P3-D5)", () => {
  const seed: DefaultLayout = {
    defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
    defaultHidden: ["exam"],
  };

  it("falls back to the seed order/hidden when the doctor has no override", () => {
    expect(resolveEffectiveLayout({ seed, storedOrder: [], storedHidden: [] })).toEqual({
      baseOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
      hidden: ["exam"],
    });
  });

  it("doctor stored order wins as the base order", () => {
    const { baseOrder } = resolveEffectiveLayout({
      seed,
      storedOrder: ["exam", "vitals", "test_results"],
      storedHidden: [],
    });
    expect(baseOrder).toEqual(["exam", "vitals", "test_results"]);
  });

  it("stored hidden wins wholesale over the seed hidden (not a union)", () => {
    const { hidden } = resolveEffectiveLayout({
      seed,
      storedOrder: [],
      storedHidden: ["test_results"],
    });
    expect(hidden).toEqual(["test_results"]);
  });

  it("drops custom_block ids from the stored hidden set (P10-D4)", () => {
    const { hidden } = resolveEffectiveLayout({
      seed,
      storedOrder: [],
      storedHidden: [toCustomBlockSectionId("11111111-1111-4111-8111-111111111111"), "vitals"],
    });
    expect(hidden).toEqual(["vitals"]);
    expect(hidden.some((id) => id.startsWith("custom_block:"))).toBe(false);
  });
});
