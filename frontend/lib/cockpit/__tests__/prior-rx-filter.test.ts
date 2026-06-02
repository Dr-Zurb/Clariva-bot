import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  canEnableChip,
  filterPriorRxList,
  type PriorRxFilterContext,
} from "@/lib/cockpit/prior-rx-filter";

function makeRx(
  overrides: Partial<PrescriptionWithRelations> & Pick<PrescriptionWithRelations, "id">,
): PrescriptionWithRelations {
  return {
    appointment_id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    type: "structured",
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    prescription_medicines: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<PriorRxFilterContext> = {}): PriorRxFilterContext {
  return {
    chip: "all",
    search: "",
    currentDx: "",
    activeConditions: [],
    ...overrides,
  };
}

describe("filterPriorRxList", () => {
  const now = new Date("2026-05-24T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("chip: all", () => {
    it("returns every prescription when chip is all", () => {
      const rxes = [
        makeRx({ id: "rx-1" }),
        makeRx({ id: "rx-2", created_at: "2020-01-01T00:00:00.000Z" }),
      ];
      expect(filterPriorRxList(rxes, ctx({ chip: "all" }))).toEqual(rxes);
    });
  });

  describe("chip: last-30-days", () => {
    it("keeps prescriptions created within the last 30 days", () => {
      const recent = makeRx({
        id: "recent",
        created_at: "2026-05-10T10:00:00.000Z",
      });
      const old = makeRx({
        id: "old",
        created_at: "2026-03-01T10:00:00.000Z",
      });
      const result = filterPriorRxList(
        [recent, old],
        ctx({ chip: "last-30-days" }),
      );
      expect(result.map((r) => r.id)).toEqual(["recent"]);
    });

    it("excludes prescriptions with invalid created_at", () => {
      const invalid = makeRx({ id: "bad", created_at: "not-a-date" });
      expect(
        filterPriorRxList([invalid], ctx({ chip: "last-30-days" })),
      ).toEqual([]);
    });
  });

  describe("chip: same-diagnosis", () => {
    it("matches when provisional_diagnosis contains currentDx (case-insensitive)", () => {
      const match = makeRx({
        id: "match",
        provisional_diagnosis: "Type 2 Diabetes Mellitus",
      });
      const noMatch = makeRx({
        id: "no-match",
        provisional_diagnosis: "Hypertension",
      });
      const result = filterPriorRxList(
        [match, noMatch],
        ctx({ chip: "same-diagnosis", currentDx: "diabetes" }),
      );
      expect(result.map((r) => r.id)).toEqual(["match"]);
    });

    it("returns empty when currentDx is blank", () => {
      const rx = makeRx({
        id: "rx-1",
        provisional_diagnosis: "Diabetes",
      });
      expect(
        filterPriorRxList([rx], ctx({ chip: "same-diagnosis", currentDx: "  " })),
      ).toEqual([]);
    });
  });

  describe("chip: active-condition", () => {
    it("matches when diagnosis includes any active condition", () => {
      const match = makeRx({
        id: "match",
        provisional_diagnosis: "Essential Hypertension, stage 2",
      });
      const noMatch = makeRx({
        id: "no-match",
        provisional_diagnosis: "Acute bronchitis",
      });
      const result = filterPriorRxList(
        [match, noMatch],
        ctx({
          chip: "active-condition",
          activeConditions: ["Hypertension", "Asthma"],
        }),
      );
      expect(result.map((r) => r.id)).toEqual(["match"]);
    });

    it("returns empty when activeConditions is empty", () => {
      const rx = makeRx({
        id: "rx-1",
        provisional_diagnosis: "Hypertension",
      });
      expect(
        filterPriorRxList([rx], ctx({ chip: "active-condition", activeConditions: [] })),
      ).toEqual([]);
    });
  });

  describe("search", () => {
    it("filters by medicine name substring (case-insensitive)", () => {
      const withMed = makeRx({
        id: "with",
        prescription_medicines: [
          {
            id: "m-1",
            prescription_id: "with",
            medicine_name: "Paracetamol 500mg",
            dosage: null,
            route: null,
            frequency: null,
            duration: null,
            instructions: null,
            sort_order: 0,
            created_at: "2026-05-01T10:00:00.000Z",
            drug_master_id: null,
            frequency_code: null,
            duration_value: null,
            duration_unit: null,
            route_code: null,
          },
        ],
      });
      const without = makeRx({ id: "without", prescription_medicines: [] });
      const result = filterPriorRxList(
        [withMed, without],
        ctx({ search: "para" }),
      );
      expect(result.map((r) => r.id)).toEqual(["with"]);
    });

    it("ignores blank search", () => {
      const rx = makeRx({ id: "rx-1", prescription_medicines: [] });
      expect(filterPriorRxList([rx], ctx({ search: "   " }))).toEqual([rx]);
    });
  });

  describe("chip AND search composition", () => {
    it("applies both chip and search filters", () => {
      const matchBoth = makeRx({
        id: "both",
        created_at: "2026-05-20T10:00:00.000Z",
        prescription_medicines: [
          {
            id: "m-1",
            prescription_id: "both",
            medicine_name: "Metformin",
            dosage: null,
            route: null,
            frequency: null,
            duration: null,
            instructions: null,
            sort_order: 0,
            created_at: "2026-05-20T10:00:00.000Z",
            drug_master_id: null,
            frequency_code: null,
            duration_value: null,
            duration_unit: null,
            route_code: null,
          },
        ],
      });
      const recentWrongMed = makeRx({
        id: "recent-wrong-med",
        created_at: "2026-05-20T10:00:00.000Z",
        prescription_medicines: [
          {
            id: "m-2",
            prescription_id: "recent-wrong-med",
            medicine_name: "Aspirin",
            dosage: null,
            route: null,
            frequency: null,
            duration: null,
            instructions: null,
            sort_order: 0,
            created_at: "2026-05-20T10:00:00.000Z",
            drug_master_id: null,
            frequency_code: null,
            duration_value: null,
            duration_unit: null,
            route_code: null,
          },
        ],
      });
      const oldWithMed = makeRx({
        id: "old-with-med",
        created_at: "2026-01-01T10:00:00.000Z",
        prescription_medicines: [
          {
            id: "m-3",
            prescription_id: "old-with-med",
            medicine_name: "Metformin",
            dosage: null,
            route: null,
            frequency: null,
            duration: null,
            instructions: null,
            sort_order: 0,
            created_at: "2026-01-01T10:00:00.000Z",
            drug_master_id: null,
            frequency_code: null,
            duration_value: null,
            duration_unit: null,
            route_code: null,
          },
        ],
      });

      const result = filterPriorRxList(
        [matchBoth, recentWrongMed, oldWithMed],
        ctx({ chip: "last-30-days", search: "metformin" }),
      );
      expect(result.map((r) => r.id)).toEqual(["both"]);
    });
  });
});

describe("canEnableChip", () => {
  it("always enables all and last-30-days", () => {
    expect(canEnableChip("all", { currentDx: "", activeConditions: [] })).toBe(true);
    expect(canEnableChip("last-30-days", { currentDx: "", activeConditions: [] })).toBe(
      true,
    );
  });

  it("enables same-diagnosis only when currentDx is non-empty", () => {
    expect(
      canEnableChip("same-diagnosis", { currentDx: "", activeConditions: [] }),
    ).toBe(false);
    expect(
      canEnableChip("same-diagnosis", { currentDx: "  ", activeConditions: [] }),
    ).toBe(false);
    expect(
      canEnableChip("same-diagnosis", {
        currentDx: "Diabetes",
        activeConditions: [],
      }),
    ).toBe(true);
  });

  it("enables active-condition only when activeConditions is non-empty", () => {
    expect(
      canEnableChip("active-condition", { currentDx: "", activeConditions: [] }),
    ).toBe(false);
    expect(
      canEnableChip("active-condition", {
        currentDx: "",
        activeConditions: ["Hypertension"],
      }),
    ).toBe(true);
  });
});
