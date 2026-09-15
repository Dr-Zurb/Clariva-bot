import { describe, expect, it } from "vitest";

import {
  deskLabLoopProgress,
  formatDeskLabLoopBadge,
  formatDeskLabOrderLabels,
} from "@/lib/desk/lab-fulfillment";

describe("deskLabLoopProgress", () => {
  it("counts closed orders and completion", () => {
    expect(
      deskLabLoopProgress([
        { status: "uploaded" },
        { status: "pending" },
        { status: "not_done" },
      ])
    ).toEqual({ total: 3, closed: 2, complete: false });
    expect(
      deskLabLoopProgress([{ status: "uploaded" }, { status: "not_done" }])
    ).toEqual({ total: 2, closed: 2, complete: true });
  });
});

describe("formatDeskLabOrderLabels", () => {
  it("marks uploaded and not-done tests", () => {
    expect(
      formatDeskLabOrderLabels([
        { label: "CBC", status: "uploaded" },
        { label: "Urine", status: "pending" },
        { label: "KFT", status: "not_done" },
      ])
    ).toBe("CBC ✓ · Urine · KFT ✕");
  });
});

describe("formatDeskLabLoopBadge", () => {
  it("shows Done, a fraction, or days pending", () => {
    expect(
      formatDeskLabLoopBadge(
        [{ status: "uploaded" }, { status: "not_done" }],
        2,
        () => "2 days pending"
      )
    ).toBe("Done");
    expect(
      formatDeskLabLoopBadge(
        [{ status: "uploaded" }, { status: "pending" }],
        2,
        () => "2 days pending"
      )
    ).toBe("1/2");
    expect(
      formatDeskLabLoopBadge([{ status: "pending" }], 3, (days) => `${days} days pending`)
    ).toBe("3 days pending");
  });
});
