# Cockpit v3 kill-switch runbook (cv3x-02 · P4-DL-2)

> **Purpose:** Revert the patient-profile cockpit to the legacy `PatientProfileShell` **without a redeploy** during the one-release soak window after the cv3x-02 flag flip.
> **Code:** `frontend/lib/patient-profile/v3/flags.ts` · **Telemetry:** `cockpit_v3.shell_rendered` (PHI-free).

---

## When to use

- v3 regression in production affecting prescribe / send / autosave / finish.
- Parity gap discovered post-flip that was not caught in cv3x-01.
- On-call needs an immediate org-wide or per-doctor rollback while investigating.

**Do not** start cv3x-03 (delete old shell) until the soak elapses clean with no kill-switch engagement (P4-DL-3).

---

## Option A — Org-wide (no redeploy, recommended for incidents)

Set an HTTP cookie at the **CDN / load balancer / edge** for the doctor app origin:

| Name | Value | Path |
|---|---|---|
| `clariva_cockpit_v3_kill_switch` | `1` | `/` |

Every browser that receives this cookie renders the **legacy** shell on the next navigation (full page load). No application rebuild required.

**Restore v3:** remove or expire the cookie (`Max-Age=0`).

---

## Option B — Per-browser (on-call / support / dev)

In the browser console on an affected doctor session:

```javascript
// Engage kill-switch → legacy shell on next navigation
localStorage.setItem('clariva:cockpit-v3:kill-switch', '1');
location.reload();

// Clear kill-switch → v3 returns (default-on)
localStorage.removeItem('clariva:cockpit-v3:kill-switch');
location.reload();
```

---

## Option C — Build-time off (requires redeploy — not the incident path)

Set `NEXT_PUBLIC_COCKPIT_V3=0` in the deployment environment and redeploy. Use only for **planned** rollbacks or staging; this is **not** the no-deploy kill-switch (P4-DL-2).

---

## Verify the rollback

1. Open any appointment detail page (`/dashboard/appointments/[id]`).
2. Confirm the **legacy** shell renders (customize mode affordances, old panel layout — not the v3 palette).
3. In DevTools console, filter `[telemetry]` for `cockpit_v3.shell_rendered` — expect `shell: "legacy"` and `kill_switch_engaged: true` (when using Option A or B).

---

## Default after cv3x-02

| Override | Shell |
|---|---|
| *(none)* | **v3** (default-on) |
| Kill-switch cookie or localStorage | legacy |
| `NEXT_PUBLIC_COCKPIT_V3=0` in build | legacy |

---

**Last updated:** 2026-05-31
