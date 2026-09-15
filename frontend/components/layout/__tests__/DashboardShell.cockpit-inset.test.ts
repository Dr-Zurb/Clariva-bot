import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Appointment-detail used to sit inside `inset-4` / `overflow-x-hidden`,
 * which clipped the page's negative-margin bleed and left a blank strip
 * beside the nav rail.
 */
describe("DashboardShell cockpit inset (source contract)", () => {
  const shell = readFileSync(join(__dirname, "../DashboardShell.tsx"), "utf8");
  const page = readFileSync(
    join(__dirname, "../../patient-profile/PatientProfilePage.tsx"),
    "utf8",
  );

  it("drops main padding and inset on cockpit routes", () => {
    expect(shell).toContain('isCockpit ? "p-0" : "p-4 md:p-6"');
    expect(shell).toContain('isCockpit');
    expect(shell).toContain('"inset-0 overflow-hidden"');
  });

  it("does not cancel padding with a negative-margin bleed on the page", () => {
    expect(page).not.toContain("-m-4 md:-m-6");
    expect(page).toContain(
      "flex h-full min-h-0 flex-col overflow-hidden",
    );
  });
});
