/**
 * Cockpit v3 rollout gate (Phase 0 cv3s-01 → Phase 4 cv3x-02 flip + kill-switch).
 *
 * **Default-on (cv3x-02 / P4-DL-1):** a doctor with no override sees v3.
 *
 * **Kill-switch (P4-DL-2):** runtime overrides revert to `PatientProfileShell`
 * without a redeploy:
 *   - `localStorage` key `clariva:cockpit-v3:kill-switch` = `"1"` (on-call / dev)
 *   - Cookie `clariva_cockpit_v3_kill_switch=1` (set at CDN/proxy for org-wide)
 *
 * **Build-time off:** `NEXT_PUBLIC_COCKPIT_V3=0` forces the legacy shell in that
 * build (requires redeploy — not the incident kill-switch; use runtime overrides).
 *
 * Legacy opt-out: `NEXT_PUBLIC_COCKPIT_V3=0` or runtime kill-switch engaged.
 */

export type CockpitShellVariant = "v3" | "legacy";

/** Per-browser runtime kill-switch (on-call console / support script). */
export const COCKPIT_V3_KILL_SWITCH_STORAGE_KEY = "clariva:cockpit-v3:kill-switch";

/**
 * Org-wide runtime kill-switch when set at the edge (no app redeploy).
 * Documented in `docs/Work/.../p4-cutover/KILL-SWITCH-cv3x-02.md`.
 */
export const COCKPIT_V3_KILL_SWITCH_COOKIE = "clariva_cockpit_v3_kill_switch";

/** True when `NEXT_PUBLIC_COCKPIT_V3=0` (build-time legacy path). */
export function isCockpitV3BuildTimeDisabled(): boolean {
  return process.env.NEXT_PUBLIC_COCKPIT_V3 === "0";
}

/** Runtime kill-switch engaged (localStorage or edge cookie). */
export function isCockpitV3KillSwitchEngaged(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (
      window.localStorage.getItem(COCKPIT_V3_KILL_SWITCH_STORAGE_KEY) === "1"
    ) {
      return true;
    }
  } catch {
    /* private browsing / quota — treat as not engaged */
  }

  if (typeof document === "undefined") return false;

  return document.cookie.split(";").some((part) => {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) return false;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    return name === COCKPIT_V3_KILL_SWITCH_COOKIE && value === "1";
  });
}

/** Which shell variant mounts on the patient profile page. */
export function resolveCockpitShell(): CockpitShellVariant {
  if (isCockpitV3BuildTimeDisabled() || isCockpitV3KillSwitchEngaged()) {
    return "legacy";
  }
  return "v3";
}

/** True when the v3 shell should mount (inverse of legacy). */
export function cockpitV3Enabled(): boolean {
  return resolveCockpitShell() === "v3";
}

/** Set or clear the per-browser runtime kill-switch (tests + on-call tooling). */
export function setCockpitV3KillSwitchEngaged(engaged: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (engaged) {
      window.localStorage.setItem(COCKPIT_V3_KILL_SWITCH_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(COCKPIT_V3_KILL_SWITCH_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
