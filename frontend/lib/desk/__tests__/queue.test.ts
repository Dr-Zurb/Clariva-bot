import { describe, expect, it } from "vitest";
import {
  countDeskQueue,
  DESK_QUEUE_HEADER,
  deskOpdNumber,
  deskOriginLabel,
  deskQueueBucket,
  deskStatusLabel,
  findDeskSameDayVisit,
  formatDeskAgeSex,
  formatDeskOpdNumber,
  isDeskSameDayLockVisit,
  isOpenDeskAppointment,
  matchesDeskQueueSearch,
} from "@/lib/desk/queue";

describe("isOpenDeskAppointment", () => {
  it("drops cancelled rows", () => {
    expect(isOpenDeskAppointment({ status: "cancelled" })).toBe(false);
    expect(isOpenDeskAppointment({ status: "confirmed" })).toBe(true);
  });
});

describe("deskQueueBucket", () => {
  it("treats completed as seen even if they arrived", () => {
    expect(
      deskQueueBucket({ status: "completed", patient_checked_in_at: "2026-08-23T03:00:00Z" })
    ).toBe("seen");
  });

  it("treats a checked-in open visit as arrived", () => {
    expect(
      deskQueueBucket({ status: "confirmed", patient_checked_in_at: "2026-08-23T03:00:00Z" })
    ).toBe("arrived");
  });

  it("treats everyone else as waiting", () => {
    expect(deskQueueBucket({ status: "confirmed", patient_checked_in_at: null })).toBe(
      "waiting"
    );
  });
});

describe("formatDeskAgeSex", () => {
  it("prints age/sex like the OPD column", () => {
    expect(formatDeskAgeSex(31, "female")).toBe("31/F");
    expect(formatDeskAgeSex(0, "male")).toBe("<1/M");
    expect(formatDeskAgeSex(null, "male")).toBe("—/M");
    expect(formatDeskAgeSex(null, null)).toBe("—");
  });
});

describe("deskOriginLabel", () => {
  it("names walk-in and booked", () => {
    expect(deskOriginLabel("walk_in")).toBe("Walk-in");
    expect(deskOriginLabel("booked")).toBe("Booked");
    expect(deskOriginLabel(null)).toBe("—");
  });
});

describe("deskStatusLabel", () => {
  it("prefers no-show over arrived", () => {
    expect(
      deskStatusLabel({ status: "no_show", patient_checked_in_at: null })
    ).toBe("No-show");
  });
});

describe("matchesDeskQueueSearch", () => {
  const row = {
    patient_name: "Arjun Malhotra",
    patient_phone: "8567285686",
    opd_token_number: 12,
    patient_mrn: "P-00133",
    patient_guardian_name: "Ram Prakash",
  };

  it("matches name, phone digits, token, MRN, and relative", () => {
    expect(matchesDeskQueueSearch(row, "arjun")).toBe(true);
    expect(matchesDeskQueueSearch(row, "85672")).toBe(true);
    expect(matchesDeskQueueSearch(row, "12")).toBe(true);
    expect(matchesDeskQueueSearch(row, "#12")).toBe(true);
    expect(matchesDeskQueueSearch(row, "p-00133")).toBe(true);
    expect(matchesDeskQueueSearch(row, "ram")).toBe(true);
    expect(matchesDeskQueueSearch(row, "Ria")).toBe(false);
  });
});

describe("DESK_QUEUE_HEADER", () => {
  it("reads left to right as #, time, mrn, patient, age/sex, relative, phone, origin, status", () => {
    expect(DESK_QUEUE_HEADER.map((col) => col.key)).toEqual([
      "bar",
      "token",
      "time",
      "mrn",
      "patient",
      "ageSex",
      "relative",
      "phone",
      "origin",
      "status",
    ]);
  });
});

describe("deskOpdNumber", () => {
  const early = {
    id: "a",
    appointment_date: "2026-08-23T00:14:00Z",
    created_at: "2026-08-23T00:14:00Z",
    opd_token_number: null as number | null,
  };
  const later = {
    id: "b",
    appointment_date: "2026-08-23T09:23:00Z",
    created_at: "2026-08-23T09:23:00Z",
    opd_token_number: null as number | null,
  };

  it("uses the OPD queue token when present", () => {
    expect(deskOpdNumber({ ...later, opd_token_number: 7 }, [early, later])).toBe(7);
    expect(formatDeskOpdNumber(7)).toBe("#07");
  });

  it("uses slot-day position when there is no token", () => {
    expect(deskOpdNumber(early, [later, early])).toBe(1);
    expect(deskOpdNumber(later, [later, early])).toBe(2);
  });
});

describe("findDeskSameDayVisit", () => {
  it("finds pending, confirmed, and completed for that patient", () => {
    expect(isDeskSameDayLockVisit({ status: "cancelled" })).toBe(false);
    expect(isDeskSameDayLockVisit({ status: "no_show" })).toBe(false);
    const rows = [
      { id: "a", patient_id: "p1", status: "cancelled" as const },
      { id: "b", patient_id: "p1", status: "confirmed" as const },
      { id: "c", patient_id: "p2", status: "completed" as const },
    ];
    expect(findDeskSameDayVisit(rows, "p1")?.id).toBe("b");
    expect(findDeskSameDayVisit(rows, "p2")?.id).toBe("c");
    expect(findDeskSameDayVisit(rows, "p3")).toBeNull();
  });
});

describe("countDeskQueue", () => {
  it("tallies buckets", () => {
    expect(
      countDeskQueue([
        { status: "confirmed", patient_checked_in_at: null },
        { status: "confirmed", patient_checked_in_at: "2026-08-23T03:00:00Z" },
        { status: "completed", patient_checked_in_at: "2026-08-23T03:10:00Z" },
      ])
    ).toEqual({ all: 3, waiting: 1, arrived: 1, seen: 1 });
  });
});
