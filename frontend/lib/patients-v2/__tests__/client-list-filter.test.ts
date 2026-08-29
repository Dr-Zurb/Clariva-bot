import { describe, expect, it } from "vitest";
import {
  applyClientSegment,
  applyClientTagFilter,
  projectPatientsListClientSide,
  segmentNeedsServerFetch,
} from "@/lib/patients-v2/client-list-filter";
import type { PatientSummary, PatientsListPagedData } from "@/types/patient";

function row(partial: Partial<PatientSummary> & Pick<PatientSummary, "id" | "name">): PatientSummary {
  return {
    phone: "+910000000000",
    created_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("segmentNeedsServerFetch", () => {
  it("flags visit/incomplete/no-show segments as server-only", () => {
    expect(segmentNeedsServerFetch("no-show-prone")).toBe(true);
    expect(segmentNeedsServerFetch("incomplete-consult")).toBe(true);
    expect(segmentNeedsServerFetch("new-30d")).toBe(true);
    expect(segmentNeedsServerFetch("revisit-30d")).toBe(true);
    expect(segmentNeedsServerFetch("has-allergies")).toBe(false);
    expect(segmentNeedsServerFetch(undefined)).toBe(false);
  });
});

describe("applyClientSegment", () => {
  const now = Date.parse("2026-08-06T00:00:00.000Z");

  it("filters active-90d and has-allergies", () => {
    const patients = [
      row({
        id: "1",
        name: "A",
        last_appointment_date: "2026-07-01T00:00:00.000Z",
        has_allergies: true,
      }),
      row({
        id: "2",
        name: "B",
        last_appointment_date: "2025-01-01T00:00:00.000Z",
        has_allergies: false,
      }),
    ];
    expect(applyClientSegment(patients, "active-90d", now).map((p) => p.id)).toEqual(["1"]);
    expect(applyClientSegment(patients, "has-allergies", now).map((p) => p.id)).toEqual(["1"]);
  });
});

describe("projectPatientsListClientSide", () => {
  it("returns null when roster is incomplete", () => {
    const roster: PatientsListPagedData = {
      patients: [row({ id: "1", name: "A" })],
      total: 5,
      page: 1,
      pageSize: 1,
    };
    expect(projectPatientsListClientSide(roster, { segment: "untagged" })).toBeNull();
  });

  it("projects allergies segment instantly from roster", () => {
    const roster: PatientsListPagedData = {
      patients: [
        row({ id: "1", name: "A", has_allergies: true }),
        row({ id: "2", name: "B", has_allergies: false }),
      ],
      total: 2,
      page: 1,
      pageSize: 200,
    };
    const projected = projectPatientsListClientSide(roster, {
      segment: "has-allergies",
      page: 1,
      pageSize: 50,
    });
    expect(projected?.patients.map((p) => p.id)).toEqual(["1"]);
    expect(projected?.total).toBe(1);
  });

  it("projects tag filter as membership (multi-tag)", () => {
    const roster: PatientsListPagedData = {
      patients: [
        row({ id: "1", name: "A", patient_tags: ["VIP", "Follow-up"] }),
        row({ id: "2", name: "B", patient_tag: "vip" }),
        row({ id: "3", name: "C", patient_tags: ["Follow-up"] }),
        row({ id: "4", name: "D" }),
      ],
      total: 4,
      page: 1,
      pageSize: 200,
    };
    expect(applyClientTagFilter(roster.patients, "vip").map((p) => p.id)).toEqual([
      "1",
      "2",
    ]);
    const projected = projectPatientsListClientSide(roster, {
      tag: "Follow-up",
      page: 1,
      pageSize: 50,
    });
    expect(projected?.patients.map((p) => p.id)).toEqual(["1", "3"]);
  });
});
