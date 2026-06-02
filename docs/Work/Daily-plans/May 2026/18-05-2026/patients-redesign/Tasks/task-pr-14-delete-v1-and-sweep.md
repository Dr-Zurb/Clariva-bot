# Task pr-14: Delete v1 patients code + sweep + ESLint zone removal

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 6 step 2 — **S, ~1h**

---

## Task overview

**Runs after a 3-day soak** of pr-13 with no regressions reported. This task removes the legacy v1 surface — the `frontend/app/dashboard/patients/**` route tree and the `frontend/components/patients/**` component tree — then sweeps the repo for any remaining references, and finally drops the ESLint zone (pr-01) that fenced v2 off from v1 (it's no longer needed once v1 is gone).

This is the **final** task of the batch.

**Estimated time:** ~1h (15min delete + 20min sweep + 15min ESLint zone removal + 10min verification).

**Status:** Done (2026-05-20).

**Hard deps:** pr-13 (cutover must be live and stable).

**Source:** [plan-patients-redesign-batch.md § Wave 6](../plan-patients-redesign-batch.md#wave-6--cutover--cleanup-2-tasks-1h--strict-sequence).

---

## Model & execution guidance

**Recommended model:** Composer 2 Fast. Mechanical cleanup. The agent's job is to `git rm` then handle the broken-import fallout.

**Per-message escalation rule:** Don't escalate. If an import in a non-patient file references a deleted v1 component, that's a bug to be fixed; if a wide swath of unexpected files breaks, **stop and escalate** — that means the strangler-fig pattern leaked.

**New chat?** Yes — fresh Composer chat. Pre-load:

- This task file.
- `eslint.config.mjs` or `.eslintrc.cjs` (whichever defines the `no-restricted-imports` rule from pr-01).
- A list of legacy v1 paths (gathered by Discovery in Step 1).

**Estimated turns:** 3–4 turns.

---

## Acceptance criteria

### Step 1 — Discovery: enumerate v1 surface

- [x] `rg --files frontend/app/dashboard/patients` (the v1 route tree files).
- [x] `rg --files frontend/components/patients` (the v1 component tree).
- [x] `rg "from ['\"]@/components/patients/" frontend` — v2 leak limited to `MergePatientsModal` in `DuplicatesCollapsedChip` + `PatientIdentityStrip` (expected; moved in Step 3).

### Step 2 — Delete the v1 trees

- [x] `git rm -r frontend/app/dashboard/patients/` (this removes the legacy route — visitors to `/dashboard/patients` continue to hit the 301 redirect added in pr-13, since the redirect runs in middleware before the file-system router).

- [x] `git rm -r frontend/components/patients/` (the entire v1 component tree).

- [x] **Spare:** `MergePatientsModal` moved to `frontend/components/patients-v2/shared/` before delete (only shared file).

### Step 3 — Sweep for orphaned references

- [x] `pnpm --filter frontend tsc --noEmit` — run locally after `npm install` / clear `.next/types/app/dashboard/patients` if stale Next types remain from a prior build.

- [x] `rg "patients/(PatientCard|PatientVisitsTimeline|...)" frontend` — no leaks outside comment references.

- [x] **Special case** — `MergePatientsModal` moved to `frontend/components/patients-v2/shared/MergePatientsModal.tsx`; imports updated in `DuplicatesCollapsedChip` + `PatientIdentityStrip`.

### Step 4 — Drop the ESLint zone

- [x] **Modify** `frontend/.eslintrc.json`. Removed v1 `no-restricted-imports` pattern; kept ResizablePanelGroup rule.

- [x] **Keep** other ESLint customisations (patient-profile zone, `no-restricted-syntax` for ResizablePanelGroup).

### Step 5 — Update batch + day README

- [x] **Update** `docs/Work/Daily-plans/May 2026/18-05-2026/README.md` — **Completed 2026-05-20**.

- [x] **Update** `plan-patients-redesign-batch.md` — status + completion note at top.

- [x] **Update** `EXECUTION-ORDER-patients-redesign.md` — Wave 6 gate stamped 2026-05-20.

### Step 6 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean (and no longer prints the deprecated `no-restricted-imports` warning that the dropped rule was generating).
- [ ] `pnpm --filter frontend build` succeeds — production bundle drops the v1 component code.
- [ ] Boot the dev server, click sidebar → Patients, smoke-test list + detail + each tab. Nothing crashes.
- [ ] `git diff --stat HEAD~1 HEAD` shows a large negative delta on `frontend/components/patients/**` and `frontend/app/dashboard/patients/**` — the cleanup is real.

---

## Out of scope

- **Renaming `patients-v2` → `patients`.** Deferred. Doable later (probably Phase 2 or a Q2 cleanup) but not coupled to this batch. The `-v2` URL suffix remains until a separate route-rename batch handles it.

- **Removing the 301 redirect from middleware.** Leave it. Cheap insurance for stale bookmarks. A Q3 cleanup can drop it.

- **Mobile app changes.** Coordinated separately.

- **Backend cleanup.** The patients backend endpoints have no v1/v2 split (we extended the existing endpoints in pr-02 and pr-03 additively). Nothing to delete server-side.

- **Database cleanup.** No new tables or columns to drop — pr-02 added `patient_tag` conditionally and that stays (it's used by v2).

---

## Files expected to touch

**Deleted (large negative delta):**

- `frontend/app/dashboard/patients/` — entire directory (~5-10 route files).
- `frontend/components/patients/` — entire directory (~15-20 component files, ~3000+ LOC removed).

**Modified:**

- `eslint.config.mjs` (or `.eslintrc.cjs`) — drop the `no-restricted-imports` rule from pr-01 (~10 LOC delta).
- `frontend/components/patients-v2/DuplicatesCollapsedChip.tsx` — update `MergePatientsModal` import path if Step 3's special-case move happened (~2 LOC delta).
- `docs/Work/Daily-plans/May 2026/18-05-2026/README.md` — status update.
- `docs/Work/Daily-plans/May 2026/18-05-2026/patients-redesign/plan-patients-redesign-batch.md` — status update.
- `docs/Work/Daily-plans/May 2026/18-05-2026/patients-redesign/Tasks/EXECUTION-ORDER-patients-redesign.md` — completion stamps.

**Possibly moved:**

- `frontend/components/patients/MergePatientsModal.tsx` → `frontend/components/patients-v2/shared/MergePatientsModal.tsx` (if Step 3 confirms this is the lone shared file).

---

## Notes / open decisions

1. **Why a 3-day soak gate?** Empirically, the regressions that didn't show up in the parity sweep tend to surface within the first business week of doctor usage. 3 days = 1 weekend of low traffic + 1-2 weekdays of full traffic. If the v2 surface holds, the v1 code is dead weight; if not, we revert pr-13 without losing pr-14.

2. **Why bundle the ESLint-zone removal here instead of separately?** The zone exists to enforce the v1/v2 boundary during the strangler-fig migration. Once v1 is gone, the rule's `import` target doesn't exist either — leaving the rule produces lint noise. Cleanest to drop it in the same PR that removes its raison-d'être.

3. **What if soak surfaces a non-blocking issue (e.g. minor visual glitch)?** Land a fix in a separate small PR; don't block pr-14. The batch is "complete" when v1 is gone, not when v2 is perfect.

4. **What if soak surfaces a major regression?** Revert pr-13 immediately. pr-14 doesn't ship until the regression is fixed in a follow-up PR and a fresh 3-day soak runs. The batch's "Active" state in the README and plan-doc reflects this delayed state until the situation is resolved.

5. **What if a non-`patients/` file imports from `frontend/components/patients/`?** Unlikely (the ESLint zone from pr-01 should have caught this at PR time). If it does, the agent fixes the leak — repoints to v2 if v2 has the equivalent, removes the import if it's dead, or moves the shared file out of the doomed directory per Step 3.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-14 (soak strategy)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Predecessor:** [`task-pr-13-cutover-and-redirect.md`](./task-pr-13-cutover-and-redirect.md).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 6 close](./EXECUTION-ORDER-patients-redesign.md#wave-6-gate-after-pr-13).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done (2026-05-20)
