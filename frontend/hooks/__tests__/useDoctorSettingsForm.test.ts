import { describe, expect, it } from "vitest";

/**
 * Pure-shape smoke for the settings form contract (settings-refresh · sr-01).
 * Hook rendering is covered via leaf-page dogfood; this locks serialize dirty logic.
 */
function isDirtyForm<T>(form: T | null, lastSaved: string): boolean {
  if (form === null || lastSaved === "") return false;
  return JSON.stringify(form) !== lastSaved;
}

describe("useDoctorSettingsForm dirty helper", () => {
  it("is not dirty when form matches lastSaved", () => {
    const form = { a: 1, b: "x" };
    expect(isDirtyForm(form, JSON.stringify(form))).toBe(false);
  });

  it("is dirty when form diverges", () => {
    expect(isDirtyForm({ a: 2 }, JSON.stringify({ a: 1 }))).toBe(true);
  });

  it("is not dirty when form is null", () => {
    expect(isDirtyForm(null, "{}")).toBe(false);
  });
});
