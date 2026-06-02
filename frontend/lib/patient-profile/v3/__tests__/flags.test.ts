/**
 * cv3x-02 — Cockpit v3 default-on + runtime kill-switch resolution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COCKPIT_V3_KILL_SWITCH_COOKIE,
  COCKPIT_V3_KILL_SWITCH_STORAGE_KEY,
  cockpitV3Enabled,
  isCockpitV3BuildTimeDisabled,
  isCockpitV3KillSwitchEngaged,
  resolveCockpitShell,
  setCockpitV3KillSwitchEngaged,
} from "../flags";

describe("cockpit v3 flags (cv3x-02)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    document.cookie = `${COCKPIT_V3_KILL_SWITCH_COOKIE}=; Max-Age=0; path=/`;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    document.cookie = `${COCKPIT_V3_KILL_SWITCH_COOKIE}=; Max-Age=0; path=/`;
  });

  it("defaults to v3 when no override is set", () => {
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_V3", undefined);
    expect(resolveCockpitShell()).toBe("v3");
    expect(cockpitV3Enabled()).toBe(true);
  });

  it("build-time NEXT_PUBLIC_COCKPIT_V3=0 forces legacy shell", () => {
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_V3", "0");
    expect(isCockpitV3BuildTimeDisabled()).toBe(true);
    expect(resolveCockpitShell()).toBe("legacy");
    expect(cockpitV3Enabled()).toBe(false);
  });

  it("runtime localStorage kill-switch forces legacy without env change", () => {
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_V3", undefined);
    setCockpitV3KillSwitchEngaged(true);
    expect(isCockpitV3KillSwitchEngaged()).toBe(true);
    expect(resolveCockpitShell()).toBe("legacy");
    expect(cockpitV3Enabled()).toBe(false);
  });

  it("clearing localStorage kill-switch restores v3", () => {
    setCockpitV3KillSwitchEngaged(true);
    expect(cockpitV3Enabled()).toBe(false);
    setCockpitV3KillSwitchEngaged(false);
    expect(cockpitV3Enabled()).toBe(true);
  });

  it("edge cookie kill-switch forces legacy (org-wide path)", () => {
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_V3", undefined);
    document.cookie = `${COCKPIT_V3_KILL_SWITCH_COOKIE}=1; path=/`;
    expect(isCockpitV3KillSwitchEngaged()).toBe(true);
    expect(cockpitV3Enabled()).toBe(false);
  });

  it("kill-switch takes precedence over default-on", () => {
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_V3", "1");
    setCockpitV3KillSwitchEngaged(true);
    expect(cockpitV3Enabled()).toBe(false);
  });

  it("exports the storage key constant used by on-call tooling", () => {
    expect(COCKPIT_V3_KILL_SWITCH_STORAGE_KEY).toBe(
      "clariva:cockpit-v3:kill-switch",
    );
  });
});
