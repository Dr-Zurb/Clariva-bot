# Task ppr-13: Rename green-grade files to neutral homes

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 5 step 1 — **S, ~2h**

---

## Task overview

The green-grade files (`CockpitHeader`, `CockpitQueueRail`, `CockpitColumnHeader`, etc.) are 🟢 — their code is sound and they're imported by the new shell. But their **names** still reference "cockpit", which is the old shell's name. ppr-13 renames them to neutral / new-shell-aligned names (DL-12).

Pure renames. No behaviour change. No `<ConsultationCockpit>` references altered (that's ppr-14). v1 still uses these components during the kill-switch window — the renames happen with v1's importers updated in the same PR.

**Estimated time:** ~1h remaining (the file moves are already on disk; the import-path follow-through is what's left).

**Status:** In progress — partial. See [History / divergence](#history--divergence) below.

**Hard deps:** ppr-12 (v2 default).

**Source:** R5.4 + DL-12 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## History / divergence

> **Read this before starting work.** The task as originally drafted assumed a clean start. By the time we re-opened it, the bulk of the file moves had already happened in a prior session — but the importers were never updated, so the working tree is currently **TS-broken**. Audited 14 May 2026.

**Already executed (visible in `git status` as `RM`/`??`, **not yet committed**):**

| Move | State |
|---|---|
| `frontend/lib/consultation/cockpit-state.ts` → `frontend/lib/patient-profile/state.ts` | ✅ file moved (RM); test moved (`__tests__/state.test.ts`) |
| `frontend/components/consultation/cockpit/CockpitHeader.tsx` → `frontend/components/patient-profile/PatientProfileHeader.tsx` | ✅ file moved (RM) |
| `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` → `frontend/components/patient-profile/PatientProfileQueueRail.tsx` | ✅ file moved (RM) |
| `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` → `frontend/components/patient-profile/PaneHeader.tsx` | ⚠️ file present at new path (untracked); function name + props type only half-renamed inside |
| `frontend/components/consultation/cockpit/MobilePillBar.tsx` → `frontend/components/patient-profile/MobilePillBar.tsx` | ✅ file moved (RM) |

**Original task rows now skipped (the audit found them to be fictional/already-handled):**

- `frontend/hooks/useCockpitState.ts` → `usePatientProfileState.ts` — **dropped.** Neither file has ever been git-tracked. The state machine the row alluded to lives in `frontend/lib/patient-profile/state.ts` (the `cockpit-state.ts` move above), as a pure module. There is no React hook to rename.
- `frontend/lib/consultation/cockpit-presets.ts` → `built-in-presets-v1.ts` — **dropped.** `cockpit-presets.ts` was never created; the new built-in presets live at `frontend/lib/patient-profile/built-in-presets.ts` (currently untracked) and that's the right home.
- `frontend/hooks/useCockpitHotkeys.ts` / `useCockpitPresets.ts` — **unchanged.** Still v1-only as the task specified; they die in ppr-14.

**TS state at re-open:** `npx tsc --noEmit` (run from `frontend/`) reports **22 errors** — all but two are direct consequences of the unfinished rename (stale `@/lib/consultation/cockpit-state` paths, stale `./cockpit/CockpitHeader|CockpitQueueRail|MobilePillBar|CockpitColumnHeader` paths, half-renamed symbols inside `PaneHeader.tsx`, and three relative-sibling imports inside the moved files). The remaining 2 errors are pre-existing and out of scope (see Out of scope).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file (especially the divergence section above).
- Output of `npx tsc --noEmit -p tsconfig.json` from `frontend/` so the agent sees the live error list.
- The current contents of `frontend/components/patient-profile/PaneHeader.tsx` (half-renamed; needs symbol rename).

**Estimated turns:** 3–5 turns (one find-and-replace pass per import-path bucket, one symbol-rename pass on `PaneHeader.tsx`, one `tsc` verify).

---

## Acceptance criteria

### Step A — Already done (verify, don't redo)

The following are physically in the working tree as of audit. Confirm with `git status` before proceeding; if any are missing, stop and reconcile.

- [x] `frontend/lib/consultation/cockpit-state.ts` → `frontend/lib/patient-profile/state.ts`
- [x] `frontend/lib/consultation/__tests__/cockpit-state.test.ts` → `frontend/lib/patient-profile/__tests__/state.test.ts`
- [x] `frontend/components/consultation/cockpit/CockpitHeader.tsx` → `frontend/components/patient-profile/PatientProfileHeader.tsx`
- [x] `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` → `frontend/components/patient-profile/PatientProfileQueueRail.tsx`
- [x] `frontend/components/consultation/cockpit/MobilePillBar.tsx` → `frontend/components/patient-profile/MobilePillBar.tsx`
- [x] `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` → `frontend/components/patient-profile/PaneHeader.tsx` (file location only — symbol rename inside is incomplete; see Step C).

### Step B — Update import paths (the bulk of remaining work)

Apply these find-and-replace passes across `frontend/`. Each row is a global string replace — verify with `rg <old>` returning zero hits afterward.

| Old import string | New import string |
|---|---|
| `@/lib/consultation/cockpit-state` | `@/lib/patient-profile/state` |
| `@/components/consultation/cockpit/CockpitHeader` | `@/components/patient-profile/PatientProfileHeader` |
| `@/components/consultation/cockpit/CockpitQueueRail` | `@/components/patient-profile/PatientProfileQueueRail` |
| `@/components/consultation/cockpit/CockpitColumnHeader` | `@/components/patient-profile/PaneHeader` |
| `@/components/consultation/cockpit/MobilePillBar` | `@/components/patient-profile/MobilePillBar` |

In `frontend/components/consultation/ConsultationCockpit.tsx` (v1 shell), there are also `./cockpit/...` shorthand imports pointing at the moved files. Rewrite those as the absolute `@/components/patient-profile/...` paths above.

In `frontend/lib/patient-profile/__tests__/state.test.ts` the test currently imports `from "../cockpit-state"` (a left-over from before the file was moved). Change to `from "../state"`.

- [x] All five aliased imports above return zero `rg` hits in `frontend/`.
- [x] `ConsultationCockpit.tsx` uses absolute imports for the four moved components — no surviving `./cockpit/CockpitHeader|CockpitQueueRail|CockpitColumnHeader|MobilePillBar` shorthand.
- [x] `state.test.ts` imports from `../state`, not `../cockpit-state`.

### Step C — Fix relative-sibling imports inside the moved files

When a file moves but its sibling import paths don't, those `./Foo` references silently break. The audit caught three:

| File (new home) | Old sibling import | Correct rewrite |
|---|---|---|
| `frontend/components/patient-profile/PatientProfileHeader.tsx` (line ~98) | `./RunningBehindBadge` | `@/components/consultation/cockpit/RunningBehindBadge` |
| `frontend/components/patient-profile/PatientProfileHeader.tsx` (line ~99) | `./CockpitQueueRail` | `./PatientProfileQueueRail` |
| `frontend/components/patient-profile/MobilePillBar.tsx` (line ~31) | `./RxWorkspace` | `@/components/consultation/cockpit/RxWorkspace` |

- [x] Each of the three above is rewritten; `tsc` reports zero `Cannot find module './...'` errors against the patient-profile folder.

### Step D — Finish the symbol rename inside `PaneHeader.tsx`

The file moved but the function and prop-type identifiers didn't. As of audit:

- The interface is correctly named `PaneHeaderProps`.
- The default-export function is still named `CockpitColumnHeader` and its props parameter is still annotated `: CockpitColumnHeaderProps` (which is now an undefined name → TS2304).

Tasks:
- [x] Rename the function to `PaneHeader` (matches file name).
- [x] Annotate the props parameter as `: PaneHeaderProps`.
- [x] Keep the default export.
- [x] Confirm no other file imports the *named* `CockpitColumnHeader` symbol — all consumers should use the default export. (`rg "import \{ CockpitColumnHeader" frontend/` → zero results.)

### Step E — Decision: keep `consultation/cockpit/` as the home of the surviving green-grade components

- [x] **Decision:** keep the `consultation/cockpit/` folder for the medical-content components that stay (`ReadyCard`, `LobbyCard`, `EndedCard`, `TerminalCard`, `RxWorkspace`, `PreviousRxPopover`, `RxSectionNav`, `WrapUpDialog`, `SavePresetDialog`, `ManagePresetsDialog`, `CollapsedChartRail`, `CollapsedRxRail`, `RailCollapsedStub`, `RunningBehindBadge`, `NextPatientCountdown`, `EndOfDayCard`). These are **medical content**, not shell — they belong under `consultation/`. The new shell is under `patient-profile/`; the medical surfaces remain under `consultation/cockpit/`.
- [x] `CockpitColumnDragHandle.tsx` and `CockpitColumnDropZone.tsx` are tagged for **deletion in ppr-14** (the new shell has its own inline equivalents); leave them in place for now.
- [x] Optional follow-up batch (out of ppr-13 scope) can rename `consultation/cockpit/` to `consultation/surfaces/` or `consultation/cards/`.

### Step F — Verify

- [x] `npx tsc --noEmit -p tsconfig.json` from `frontend/` — every error introduced or unmasked by ppr-13 is gone. Only the two pre-existing out-of-scope errors remain (`ConsultationCockpit.tsx(1363)` + `PatientProfileHeader.tsx(852)`).
- [x] `npm run lint` — zero errors in all files touched by ppr-13. One pre-existing DL-2 violation in `lib/patient-profile/state.ts` + its test (imported `@/types/appointment` into the patient-profile lib zone when the file was moved in Step A; out of scope — the state machine must import appointment types by design).
- [ ] `npm test` (frontend) clean. Snapshots may need regeneration where renamed symbols appear in `toHaveAccessibleName` etc., but UI text is unchanged ("Patient chart", "Consultation", "Prescription"), so functional assertions should not move.

### Step G — Manual smoke

- [ ] After all renames, open `/dashboard/appointments/[id]` (v2 default per ppr-12). Page renders identically — same patient banner, same chart, same body, same Rx.
- [ ] Open `/dashboard/appointments/[id]?v1=1`. Still renders the v1 shell with all the renamed imports working.

---

## Out of scope

- **Deleting `ConsultationCockpit.tsx`.** ppr-14.
- **Removing the `?v1=1` branch.** ppr-14.
- **Renaming `consultation/cockpit/` folder.** Optional follow-up.
- **Reorganising the `panes/internal/` folder.** Stays as-is.
- **Pre-existing TS errors not caused by ppr-13:**
  - `ConsultationCockpit.tsx(1363,13)` — `middleCollapseSide` missing in `CockpitLayout`. Belongs to whoever owns `cockpit-layout.ts` (and it dies with v1 in ppr-14 anyway).
  - `PatientProfileHeader.tsx(852,37)` — `string[]` to `ColumnSlots` cast. Pre-existing in the moved file; surface to the batch owner if it isn't already tracked.

---

## Files expected to touch

**Already moved (count for context, don't redo):** ~6 files. See [Step A](#step-a--already-done-verify-dont-redo).

**Modified (import-path updates):** ~15 files concentrated in `frontend/components/consultation/ConsultationCockpit.tsx`, `frontend/components/ehr/AppointmentChartRail.tsx`, every file under `frontend/components/patient-profile/`, and the moved test file. The exact list comes from `npx tsc --noEmit` once you start.

**Symbol rename:** 1 file (`PaneHeader.tsx`).

**Tests:** identifier renames only.

---

## Notes / open decisions

1. **Why was the fictional `useCockpitState` row dropped?** The task as originally drafted assumed a `useCockpitState` hook would exist by the time of rename. In reality the state machine was implemented as a pure module (`cockpit-state.ts`, now `state.ts`), not a React hook, so there is no hook to rename. Dropping the row reflects the as-built code.
2. **Why was the `cockpit-presets.ts` row dropped?** Same reason — the v2 presets were authored from scratch as `built-in-presets.ts` under `frontend/lib/patient-profile/`, never as `cockpit-presets.ts`. The rename is a no-op.
3. **Why keep `useCockpitHotkeys` / `useCockpitPresets` as v1-only?** ppr-10 introduced `useShellHotkeys` and ppr-09 introduced `usePatientProfilePresets`. The v1 shell still uses the old hooks. Renaming the old hooks would only cause merge churn during the kill-switch window — they die in ppr-14.
4. **Why rename `CockpitColumnHeader` to `PaneHeader`?** "Column" carries a positional connotation that the new shell doesn't enforce (DL-5 — vertical splits in the future). "Pane" matches the `PaneDefinition` contract.
5. **Why keep the medical-surface components (`ReadyCard`, `LobbyCard`, etc.) under `consultation/cockpit/`?** These are intentionally medical — they render appointment-state-specific UI inside the body pane. Moving them to `patient-profile/` would break DL-2 (shell stays content-agnostic). The `cockpit` part of the path becomes a vestigial folder name; an optional follow-up batch can rename it.
6. **Why is the working tree TS-broken right now?** A prior session executed the `git mv` portion of Step A but didn't follow through with Steps B/C/D. Re-opening this task is what completes the rename atomically. Until Step F passes, the branch is not commit-ready.

---

## References

- **Affected files:** see Steps B/C/D above.
- **Source decision:** R5.4 + DL-12 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task:** [`task-ppr-14-delete-old-shell-and-cleanup.md`](./task-ppr-14-delete-old-shell-and-cleanup.md) — same chat OK.

---

**Owner:** TBD
**Created:** 2026-05-13
**Updated:** 2026-05-14 (rewritten on audit; Steps B–F executed same day)
**Status:** In progress — Steps A–F done; Step G (manual smoke) pending before commit
