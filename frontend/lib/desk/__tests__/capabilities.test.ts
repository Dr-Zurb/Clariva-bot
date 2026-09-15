import { describe, expect, it } from "vitest";

import {
  STAFF_JOB_LABELS,
  deskHomeHref,
  deskPrepActionLabel,
  deskPrepSaveLabel,
  deskPrepSlots,
  deskNavTodayLabel,
  deskShowsCheckInNav,
  deskShowsLabsPending,
  hasAnyDeskPrepCapability,
  hasDeskCapability,
  isDeskLabsOnly,
  isDeskPrepOnly,
  normalizeDeskCapabilities,
} from "@/lib/desk/capabilities";

describe("hasDeskCapability", () => {
  it("treats a missing list as full access (doctor / loading)", () => {
    expect(hasDeskCapability(undefined, "front_desk")).toBe(true);
  });

  it("hides a step the login does not have", () => {
    expect(hasDeskCapability(["previsit"], "front_desk")).toBe(false);
    expect(hasDeskCapability(["vitals"], "history")).toBe(false);
  });

  it("treats leftover billing as registration", () => {
    expect(hasDeskCapability(["billing"], "front_desk")).toBe(true);
  });

  it("folds leftover previsit into the four prep seats", () => {
    expect(hasDeskCapability(["previsit"], "vitals")).toBe(true);
    expect(hasDeskCapability(["previsit"], "papers")).toBe(true);
  });
});

describe("normalizeDeskCapabilities", () => {
  it("defaults to every seat", () => {
    expect(normalizeDeskCapabilities()).toEqual([
      "front_desk",
      "vitals",
      "history",
      "internal_labs",
      "papers",
    ]);
  });
});

describe("hasAnyDeskPrepCapability", () => {
  it("is true when any prep seat is held", () => {
    expect(hasAnyDeskPrepCapability(["internal_labs"])).toBe(true);
    expect(hasAnyDeskPrepCapability(["front_desk"])).toBe(false);
  });
});

describe("deskPrepSlots", () => {
  it("filters held seats without reordering", () => {
    expect(deskPrepSlots(["papers", "vitals"])).toEqual(["vitals", "papers"]);
    expect(deskPrepSlots(["internal_labs", "history", "vitals"])).toEqual([
      "vitals",
      "history",
      "internal_labs",
    ]);
  });
});

describe("deskPrepSaveLabel", () => {
  it("uses Done for the only or last slot", () => {
    expect(deskPrepSaveLabel(["vitals"], "vitals")).toBe("Done");
    expect(deskPrepSaveLabel(["vitals", "history"], "history")).toBe("Done");
  });

  it("uses Save and next before the last slot", () => {
    expect(deskPrepSaveLabel(["vitals", "history"], "vitals")).toBe(
      "Save and next",
    );
  });
});

describe("desk landing", () => {
  it("sends prep-only logins to Today and hides Check-in", () => {
    expect(isDeskPrepOnly(["vitals"])).toBe(true);
    expect(deskHomeHref(["history", "papers"])).toBe("/desk/today");
    expect(deskShowsCheckInNav(["internal_labs"])).toBe(false);
  });

  it("keeps Check-in as home for front_desk and mixed", () => {
    expect(deskHomeHref(["front_desk"])).toBe("/desk");
    expect(deskHomeHref(["front_desk", "vitals"])).toBe("/desk");
    expect(deskShowsCheckInNav(["front_desk"])).toBe(true);
    expect(deskShowsCheckInNav(["front_desk", "papers"])).toBe(true);
    expect(isDeskPrepOnly(["front_desk", "vitals"])).toBe(false);
  });
});

describe("deskPrepActionLabel", () => {
  it("names the single held job", () => {
    expect(deskPrepActionLabel(["internal_labs"])).toBe("Internal labs");
  });

  it("says Prep when more than one job is held", () => {
    expect(deskPrepActionLabel(["vitals", "history"])).toBe("Prep");
  });
});

describe("isDeskLabsOnly", () => {
  it("is only the internal_labs seat", () => {
    expect(isDeskLabsOnly(["internal_labs"])).toBe(true);
    expect(isDeskLabsOnly(["internal_labs", "papers"])).toBe(false);
    expect(isDeskLabsOnly(["front_desk"])).toBe(false);
    expect(isDeskLabsOnly(undefined)).toBe(false);
  });

  it("labels the rail Labs for that login", () => {
    expect(deskNavTodayLabel(["internal_labs"])).toBe("Labs");
    expect(deskNavTodayLabel(["front_desk"])).toBe("Today");
  });
});

describe("deskShowsLabsPending", () => {
  it("hides the chip without internal_labs", () => {
    expect(deskShowsLabsPending(["front_desk"])).toBe(false);
    expect(deskShowsLabsPending(["vitals", "papers"])).toBe(false);
  });

  it("shows the chip with internal_labs", () => {
    expect(deskShowsLabsPending(["internal_labs"])).toBe(true);
    expect(deskShowsLabsPending(["front_desk", "internal_labs"])).toBe(true);
  });
});

describe("STAFF_JOB_LABELS", () => {
  it("names the papers seat Patient files", () => {
    expect(STAFF_JOB_LABELS.papers).toBe("Patient files");
  });

  it("names the history seat Health record", () => {
    expect(STAFF_JOB_LABELS.history).toBe("Health record");
  });
});
