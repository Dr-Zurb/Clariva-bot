import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_DENSITY,
  PATIENTS_LIST_DENSITY_KEY,
  readDensityFromStorage,
} from "@/lib/patients-v2/list-preferences";

describe("readDensityFromStorage", () => {
  afterEach(() => {
    window.localStorage.removeItem(PATIENTS_LIST_DENSITY_KEY);
  });

  it("always returns compact (density toggle removed)", () => {
    expect(DEFAULT_LIST_DENSITY).toBe("compact");
    expect(readDensityFromStorage()).toBe("compact");
    window.localStorage.setItem(PATIENTS_LIST_DENSITY_KEY, "comfortable");
    expect(readDensityFromStorage()).toBe("compact");
  });
});
