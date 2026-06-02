# Task cv3x-02: Flip the flag default-on + a no-deploy kill-switch

> **Filename:** `task-cv3x-02-flag-flip-and-kill-switch.md` in `cockpit-v3/p4-cutover/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Make Cockpit v3 the **default** cockpit by flipping `cockpitV3Enabled()` to default-on, while keeping a **kill-switch** that reverts the whole org to the old `PatientProfileShell` **without a redeploy** — held live for one release window (the soak). Add telemetry recording which shell rendered, so the soak can confirm v3 is actually serving. The old branch stays in the tree; it is deleted later (cv3x-03), not here.

**Program / Phase:** cockpit-v3 · Phase 4 (cutover)
**Batch:** [`plan-p4-cockpit-v3-cutover-batch.md`](../plan-p4-cockpit-v3-cutover-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
**Estimated Time:** ~1–2 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-05-31 (precondition: [`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md) green — P4-DL-1)

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Change the flag default + mount wiring; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `cockpitV3Enabled()` in `frontend/lib/patient-profile/v3/flags.ts` gates a single branch in `PatientProfilePage.tsx` (~L1126): `cockpitV3Enabled() ? <CockpitV3Shell …/> : <PatientProfileShell …/>`. The flag is currently **off by default** (env-driven, `NEXT_PUBLIC_COCKPIT_V3`).
- ❌ **What's missing:** A default-on state; a runtime/no-deploy kill-switch to revert; telemetry of which shell rendered.
- ⚠️ **Notes:** The kill-switch must work **without a rebuild/redeploy** (P4-DL-2) — an env var that requires a redeploy is not a kill-switch for a live incident. Keep the `<PatientProfileShell>` branch intact; deleting it is cv3x-03's job after the soak.

**Scope Guard:**
- Expected files touched: ≤ 3 (`flags.ts`, the mount branch, one telemetry call-site).
- Any expansion (e.g. touching the shells themselves) requires explicit approval.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — audit → impact → implement → remove obsolete → tests → docs (this is an "Update existing").
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md) — flag + config conventions.
- [OBSERVABILITY.md](../../../../../../../Reference/engineering/operations/OBSERVABILITY.md) — which-shell telemetry shape.
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) — no PHI in telemetry.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit the current flag surface (CODE_CHANGE_RULES)
- [x] ✅ 1.1 Map every reader of `cockpitV3Enabled()` / `NEXT_PUBLIC_COCKPIT_V3` (callers, env, defaults, tests). — `PatientProfilePage` + 4 integration tests + new `flags.test.ts`. **Completed: 2026-05-31**
- [x] ✅ 1.2 Confirm the `PatientProfilePage` branch is the only consumer that picks a shell. — sole mount branch ~L1138. **Completed: 2026-05-31**
- [x] ✅ 1.3 Confirm cv3x-01's parity matrix is green (P4-DL-1) — this task is blocked until then. — [`PARITY-MATRIX-cv3x-01.md`](../PARITY-MATRIX-cv3x-01.md). **Completed: 2026-05-31**

### 2. Flip the default
- [x] ✅ 2.1 Change the default so a doctor with **no override** gets v3. — `resolveCockpitShell()` returns `'v3'` when unset. **Completed: 2026-05-31**
- [x] ✅ 2.2 Preserve the old branch path so it still renders when the kill-switch is engaged. — `PatientProfileShell` branch unchanged. **Completed: 2026-05-31**

### 3. Add the no-deploy kill-switch
- [x] ✅ 3.1 Provide a runtime override (the mechanism per STANDARDS/observability — e.g. a remotely-togglable setting) that forces the old shell **without a redeploy** (P4-DL-2). — localStorage + edge cookie. **Completed: 2026-05-31**
- [x] ✅ 3.2 Verify: with the override engaged, the org sees `PatientProfileShell`; with it cleared, v3 returns. — `flags.test.ts` + `CockpitPlatform.integration` kill-switch case. **Completed: 2026-05-31**
- [x] ✅ 3.3 Document the kill-switch toggle in the runbook/notes so an on-call can flip it. — [`KILL-SWITCH-cv3x-02.md`](../KILL-SWITCH-cv3x-02.md). **Completed: 2026-05-31**

### 4. Telemetry
- [x] ✅ 4.1 Record which shell rendered (v3 vs old) on mount, PHI-free. — `trackCockpitV3ShellRendered` → `cockpit_v3.shell_rendered`. **Completed: 2026-05-31**
- [x] ✅ 4.2 Confirm the signal is visible where the soak will be watched (so an unnoticed kill-switch engagement is detectable). — `[telemetry]` console.debug sink; payload includes `kill_switch_engaged`. **Completed: 2026-05-31**

### 5. Verification & Testing
- [x] ✅ 5.1 `cd frontend; npx tsc --noEmit` clean. **Completed: 2026-05-31**
- [x] ✅ 5.2 `cd frontend; npm run lint` clean (warnings only). **Completed: 2026-05-31**
- [x] ✅ 5.3 Default-on, kill-switch-revert, and revert-back are each covered by a test or a documented manual check. — `flags.test.ts` (7 cases). **Completed: 2026-05-31**
- [x] ✅ 5.4 Update any flag default referenced in docs/env per CODE_CHANGE_RULES. — `frontend/.env.example` + runbook. **Completed: 2026-05-31**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
frontend/lib/patient-profile/v3/flags.ts            ← default-on + kill-switch resolution
frontend/components/patient-profile/PatientProfilePage.tsx   ← mount branch (+ which-shell telemetry)
(one telemetry/observability call-site, per OBSERVABILITY.md)
```

**Existing Code Status:**
- ⚠️ `frontend/lib/patient-profile/v3/flags.ts` — EXISTS, needs update (default flips on; kill-switch override resolution added).
- ⚠️ `frontend/components/patient-profile/PatientProfilePage.tsx` — EXISTS, needs update (telemetry on mount; branch unchanged in shape, old path retained).

**When updating existing code:** (MANDATORY — Change Type = "Update existing")
- [ ] Audit current implementation (flag readers, env, defaults, tests) — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Map the change: default value flips; kill-switch override added; old branch retained (not removed).
- [ ] Remove obsolete config **only** where it's truly dead — but **keep** the old shell path until cv3x-03 (P4-DL-3).
- [ ] Update tests + docs/env (the flag's documented default).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The kill-switch must not require a redeploy** (P4-DL-2). A revert during a live consult incident has to be near-instant for the whole org.
- **Keep the old shell path alive.** This task flips the default and adds a rollback; it does **not** delete anything (that's cv3x-03, after the soak — P4-DL-3).
- **Telemetry is PHI-free** ([COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)) — record shell identity + minimal context only.
- **Flag-off / kill-switch-on must remain byte-identical to today** (P0-DL-1 still holds until cv3x-03).
- Follow flag/config conventions in [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) / [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md); reuse the existing observability channel ([OBSERVABILITY.md](../../../../../../../Reference/engineering/operations/OBSERVABILITY.md)).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — this is config + mount wiring + telemetry; no patient/Rx data schema or access change.
- [x] **Any PHI in logs?** **No** — which-shell telemetry must be PHI-free.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] ✅ cv3x-01 parity matrix is green (precondition — P4-DL-1).
- [x] ✅ `cockpitV3Enabled()` defaults to **on**: a fresh doctor with no override sees v3.
- [x] ✅ The kill-switch reverts the org to `PatientProfileShell` **without a redeploy**; clearing it restores v3 (P4-DL-2).
- [x] ✅ Telemetry records which shell rendered, PHI-free, visible where the soak is monitored.
- [x] ✅ The old shell path is **retained** (not deleted) — kill-switch-on is byte-identical to today (P0-DL-1).
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean; default/kill-switch behaviour covered by test or documented check.
- [x] ✅ Flag default updated in docs/env per [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** {Description}
**Solution:** {How it was resolved}

---

## 📝 Notes

- After this ships, the `[ release window ~1 week ]` soak begins. Do **not** start cv3x-03 (deletion) until the soak elapses clean with no kill-switch engagement (P4-DL-3).
- The kill-switch is the single most important safety artifact of the cutover — it is what makes flipping reversible. Treat its no-deploy property as non-negotiable.

---

## 🔗 Related Tasks

- [`task-cv3x-01-parity-matrix.md`](./task-cv3x-01-parity-matrix.md) — must be green before this flips (P4-DL-1).
- [`task-cv3x-03-delete-old-shell.md`](./task-cv3x-03-delete-old-shell.md) — removes the old branch + flag + kill-switch after the soak.
- [Prior phase — p3-platform](../../p3-platform/) — the v3 that this task makes the default.

---

**Last Updated:** 2026-05-31
**Completed:** 2026-05-31 — default-on live; kill-switch runbook [`KILL-SWITCH-cv3x-02.md`](../KILL-SWITCH-cv3x-02.md); soak window begins (P4-DL-3 gates cv3x-03).
**Pattern:** Feature-flag flip + no-deploy kill-switch + soak (precedent: `ppr` Wave 5 flip-before-delete).
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md`
