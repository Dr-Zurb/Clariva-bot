import { beforeEach, describe, expect, it } from "vitest";
import {
  RX_ALSO_PRINT_STORAGE_KEY,
  readAlsoPrintPreference,
  writeAlsoPrintPreference,
} from "@/lib/cockpit/rx-also-print";

describe("rx-also-print preference", () => {
  beforeEach(() => {
    window.localStorage.removeItem(RX_ALSO_PRINT_STORAGE_KEY);
  });

  it("defaults to unchecked", () => {
    expect(readAlsoPrintPreference()).toBe(false);
  });

  it("remembers checked and unchecked", () => {
    writeAlsoPrintPreference(true);
    expect(readAlsoPrintPreference()).toBe(true);
    writeAlsoPrintPreference(false);
    expect(readAlsoPrintPreference()).toBe(false);
  });
});
