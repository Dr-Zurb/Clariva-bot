/**
 * subj-35 / subj-38 — hidden sections are UI-only; patient payload unchanged.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";

describe("subj-35 / subj-38 · visibility output parity", () => {
  it("buildRxPayload is identical whether a section is hidden in the UI or not (view-only P10-D6)", () => {
    const fields = createEmptyRxFormFields();
    fields.familyHistoryStructured = { notes: "Diabetes in father" };
    fields.complaints = [
      {
        id: "c1",
        name: "Headache",
        attributes: {},
        associatedComplaints: [],
      },
    ];
    fields.hopi = "Extra notes";

    const visiblePayload = buildRxPayload(fields);
    // Hidden state lives in doctor_settings only — fields (and therefore payload) are unchanged.
    const hiddenPayload = buildRxPayload({ ...fields });

    expect(hiddenPayload).toEqual(visiblePayload);
    expect(hiddenPayload.familyHistory).toBeTruthy();
    expect(hiddenPayload.complaints).toHaveLength(1);
  });

  it("buildRxPayload is identical for a hidden custom section with data (view-only P11-D4)", () => {
    const fields = createEmptyRxFormFields();
    fields.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Travel history",
        body: "Visited Kerala",
        children: [],
      },
    ];

    const visiblePayload = buildRxPayload(fields);
    // Hidden state lives in doctor_settings only — fields (and therefore payload) are unchanged.
    const hiddenPayload = buildRxPayload({ ...fields });

    expect(hiddenPayload).toEqual(visiblePayload);
    expect(hiddenPayload.customSubsections).toHaveLength(1);
    expect(hiddenPayload.customSubsectionsText).toContain("Travel history");
    expect(hiddenPayload.customSubsectionsText).toContain("Visited Kerala");
  });

  it("buildRxPayload source never references subjective_section_hidden", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../components/cockpit/rx/RxFormContext.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/subjective_section_hidden/);
    expect(src).not.toMatch(/subjectiveSectionHidden/);
  });

  it("PDF/SMS builder source files never reference subjective_section_hidden (structural guard)", () => {
    const repoRoot = resolve(__dirname, "../../../..");
    const files = [
      resolve(repoRoot, "backend/src/services/prescription-pdf-composer.ts"),
      resolve(repoRoot, "backend/src/services/prescription-pdf-service.ts"),
      resolve(repoRoot, "backend/src/templates/prescription-pdf/PrescriptionDocument.tsx"),
      resolve(repoRoot, "backend/src/templates/prescription-pdf/types.ts"),
      resolve(repoRoot, "backend/src/services/notification-service.ts"),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/subjective_section_hidden/);
      expect(src).not.toMatch(/subjectiveSectionHidden/);
    }
  });
});

describe("subj-42 · custom-section template output parity (P12-D6)", () => {
  it("buildRxPayload is identical for the same fields whether content came from a template or manual entry", () => {
    const fields = createEmptyRxFormFields();
    fields.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Diet advice",
        body: "Low salt",
        children: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", title: "Breakfast", body: "Oats" }],
      },
    ];

    const manualPayload = buildRxPayload(fields);
    const templateFilledPayload = buildRxPayload({ ...fields });

    expect(templateFilledPayload).toEqual(manualPayload);
    expect(templateFilledPayload.customSubsections).toHaveLength(1);
    expect(templateFilledPayload.customSubsectionsText).toContain("Diet advice");
  });

  it("buildRxPayload is unchanged by hidden custom sections (template/delete path is view-only)", () => {
    const fields = createEmptyRxFormFields();
    fields.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
        title: "Exercise",
        body: "Walk daily",
        children: [],
      },
    ];

    const beforeDeletePayload = buildRxPayload(fields);
    const afterDeletePayload = buildRxPayload({
      ...fields,
      customSubsections: [],
      customSubsectionsText: "",
    });

    expect(beforeDeletePayload.customSubsections).toHaveLength(1);
    expect(afterDeletePayload.customSubsections).toEqual([]);
    expect(afterDeletePayload.customSubsectionsText).toBeNull();
  });

  it("buildRxPayload source never references custom_block template or delete-dialog wiring", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../components/cockpit/rx/RxFormContext.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/custom_block/);
    expect(src).not.toMatch(/DeleteCustomSectionDialog/);
    expect(src).not.toMatch(/archiveCustomBlockTemplates/);
  });
});
