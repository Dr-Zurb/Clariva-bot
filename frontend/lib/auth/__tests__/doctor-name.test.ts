import { describe, expect, it } from "vitest";
import {
  formatDoctorDisplayName,
  stripDoctorPrefix,
} from "@/lib/auth/doctor-name";

describe("stripDoctorPrefix", () => {
  it("strips Dr. / Dr / dr variants", () => {
    expect(stripDoctorPrefix("Dr. Ada Sharma")).toBe("Ada Sharma");
    expect(stripDoctorPrefix("Dr Ada")).toBe("Ada");
    expect(stripDoctorPrefix("dr. Ada")).toBe("Ada");
  });

  it("leaves bare names alone", () => {
    expect(stripDoctorPrefix("Ada Sharma")).toBe("Ada Sharma");
  });
});

describe("formatDoctorDisplayName", () => {
  it("prefixes bare names", () => {
    expect(formatDoctorDisplayName("Ada Sharma")).toBe("Dr. Ada Sharma");
  });

  it("is idempotent for already-prefixed names", () => {
    expect(formatDoctorDisplayName("Dr. Ada")).toBe("Dr. Ada");
    expect(formatDoctorDisplayName("dr Ada")).toBe("Dr. Ada");
  });

  it("returns empty for blank", () => {
    expect(formatDoctorDisplayName("   ")).toBe("");
    expect(formatDoctorDisplayName("Dr.")).toBe("");
  });
});
