# Cockpit v3 — Phase 4: cutover (parity matrix · flag flip + kill-switch · delete the old shell) — 31 May 2026 batch plan

> **Phase 4 of the Cockpit v3 program — cutover. The last phase.** Phases 0–3 built the editor-group shell, Cursor-style drag-and-drop, anchored safety chrome, persistence reuse, and a mobile flat fallback — **all behind the `NEXT_PUBLIC_COCKPIT_V3` flag**, with the live cockpit untouched. Phase 4 retires the old interaction model: **prove parity** across every safety-critical path, **flip the flag default-on** with a one-release kill-switch, then — after a prod soak — **delete the old shell, customize mode, the 5-zone overlay, the template pre-fill, and the flag itself**, and rewrite `COCKPIT.md` to describe v3 as the live cockpit. This is the phase where v3 stops being "the thing behind the flag" and becomes "the cockpit."
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — **R-CUTOVER** in §R-item details / §Sequencing Phase 4 (v3-DL-9: retire the old model cleanly once at parity). Forces the answers to **V3-Q1** (seed) and the flag-flip that earlier phases deferred — see "What this phase does NOT decide" below.
>
> **Prefix note:** tasks are `cv3x-*` (`cv3` = cockpit v3, `x` = cutover / e**x**it the old shell). Phase 0 = `cv3s` (scaffold), Phase 1 = `cv3c` (core shell), Phase 2 = `cv3d` (dnd), Phase 3 = `cv3p` (platform). Each phase restarts its sub-prefix at `01` — this program's established pattern (per [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) §3, a phase "may use its own sub-prefix when the work is genuinely distinct").
>
> **Builds on Phases 0–3 ([p0-scaffold](../p0-scaffold/), [p1-shell](../p1-shell/), [p2-dnd](../p2-dnd/), [p3-platform](../p3-platform/)).** Phase 0 created the flag + parallel mount (`cockpitV3Enabled()` in `frontend/lib/patient-profile/v3/flags.ts`, branched in `PatientProfilePage.tsx`); Phases 1–3 brought v3 to feature parity. Phase 4 only flips and removes — it adds **no new shell behavior**.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Two Opus tasks (the batch cap): **cv3x-01** (parity matrix = the program's close-gate; consult-critical verification) and **cv3x-03** (deleting the live old shell = a multi-file removal of consult-critical code — both hard-rules per the guide). cv3x-02 (flag flip) is Sonnet; cv3x-04 (docs) is Composer.
>
> **Task-file note:** every `task-cv3x-*` file follows the current [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) — **no code or pseudo-code in tasks** ([planning/execution boundary](../../../../../process/TASK_MANAGEMENT_GUIDE.md)); the "how" lives in [`RECIPES.md`](../../../../../../Reference/engineering/development/RECIPES.md) / [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) and the code.
>
> **Exec order + wave plan:** [`Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md).

---

## What Phase 4 does (one sentence)

> **Prove that v3 is byte-for-byte safe against the old shell across every consult-critical path, flip `cockpitV3Enabled()` to default-on with a no-deploy kill-switch held for one release, then — after the soak passes clean — delete the old `Shell.tsx`, customize mode, the 5-zone `PaneDropOverlay`, the template pre-fill, and the flag, and rewrite `COCKPIT.md` so v3 is the documented live cockpit.**

After Phase 4: a doctor opening any consult sees the v3 editor-group cockpit by default; if anything goes wrong in the soak week, one runtime switch reverts the whole org to the old shell with no deploy; once the week passes, the old shell and all of customize mode are gone from the tree (`rg "PatientProfileShell"` / `rg "PaneDropOverlay"` / `rg "customize-mode-context"` return zero), and `COCKPIT.md` reads as if v3 was always the cockpit.

---

## What's already in place (so the scope stays bounded)

Phase 4 is flip-and-remove, not build. The cutover surface is small and known:

- **The flag + parallel mount exist (Phase 0).** `cockpitV3Enabled()` (`frontend/lib/patient-profile/v3/flags.ts`) gates a single branch in `PatientProfilePage.tsx` (~L1126): `cockpitV3Enabled() ? <CockpitV3Shell …/> : <PatientProfileShell …/>`. The flip is *changing that boolean's default*; the delete is *removing the false branch + the flag*.
- **v3 is at feature parity (Phases 1–3).** Editor groups, palette, always-on tabs, Cursor DnD, anchored chrome (footer sends, strip unhideable), persistence with pane-freedom-era migration, mobile flat. cv3x-01 *proves* this against the matrix; it does not add to it.
- **The old shell is a known, enumerable deletion set.** `frontend/components/patient-profile/Shell.tsx` (`PatientProfileShell` + `PatientProfileShellHandle`), `PaneDropOverlay.tsx` (5-zone overlay), `CustomizeBar.tsx`, `customize-mode-context.tsx`, the `CustomizeBar.test.tsx` suite, and the fixed template pre-fill path. cv3x-03 removes exactly this set, audited per CODE_CHANGE_RULES.
- **`COCKPIT.md` exists and still describes the old model.** `docs/Reference/product/cockpit/COCKPIT.md` documents customize mode + the dock chrome of the old shell. cv3x-04 rewrites it to v3.
- **The kept model / engine / foundation are NOT in the deletion set.** `PaneTreeNode`, `layout-tree*.ts`, `useShellLayout`, the panes registry, `foundation.ts`, migration 112 — all stay (v3 runs on them). Deleting these is explicitly forbidden (P4-DL-4).

Net new surface across the whole phase: **a one-release kill-switch (cv3x-02), a parity-matrix verification doc/suite (cv3x-01), deletions (cv3x-03), and `COCKPIT.md` + close-out docs (cv3x-04).** Zero new shell features, zero schema, zero migrations, zero backend.

---

## Decision lock

The product plan's **v3-DL-1..10**, plus **P0-DL**, **P1-DL**, **P2-DL**, and **P3-DL** carry forward unchanged. Especially binding here: **v3-DL-9 (retire the old model cleanly once at parity)**, **v3-DL-1 (kept model/engine — never deleted)**, **P0-DL-1 (flag-off = byte-identical)**.

These six are **Phase-4-specific**, frozen for this batch:

**P4-DL-1: Parity gates the flip — not the calendar.** `cockpitV3Enabled()` does not default to `true` until the cv3x-01 parity matrix is green across every safety-critical path (open patient × all consult types · prescribe + send · autosave · finish / no-show / review states · the three mount surfaces of cockpit-v2 DL-3 · keyboard nav). A red or unverified cell blocks Wave 2. Verification is the gate.

**P4-DL-2: The flip is reversible without a deploy, for one release.** cv3x-02 ships v3 default-on **and** a kill-switch that reverts the whole org to the old shell via a runtime/env override (no rebuild, no redeploy). The kill-switch is held live for one release window (the soak). This is the rollback insurance that makes flipping safe.

**P4-DL-3: Delete only after the soak passes clean.** The old shell + customize mode + 5-zone overlay + pre-fill + the flag are removed **only** in cv3x-03, **only after** the kill-switch window elapses with zero rollbacks. Deletion sits behind an explicit wall-clock pause (`[ release window ]`) — it is never in the same wave as the flip.

**P4-DL-4: Deletion is audited, not guessed (CODE_CHANGE_RULES).** Before removing any file, cv3x-03 audits every consumer of `PatientProfileShell` / `PaneDropOverlay` / `CustomizeBar` / `customize-mode-context` / the pre-fill — confirming the v3 branch is the *only* live path. `rg` for each removed symbol must return zero. No kept-model / engine / `foundation.ts` / migration file is touched (v3-DL-1).

**P4-DL-5: `COCKPIT.md` flips to v3 as the live model.** cv3x-04 rewrites the canonical cockpit doc to describe editor groups + palette + always-on tabs + Cursor DnD + anchored chrome as the live cockpit, and **removes** the customize-mode narrative. The doc cutover ships with (or immediately after) the code deletion, never lagging it (AI_AGENT_RULES doc-drift guard).

**P4-DL-6: No new behavior in the cutover.** Phase 4 adds zero shell features. It is verify → flip → delete → document. Any "while we're here" improvement (the deferred seed UI, per-consult-type persistence, preset CRUD UI, the `InvestigationsAutoMerge` container-query question) is **out-of-scope** and rolled to a fresh post-v3 batch — it must not ride the cutover.

---

## What this phase does NOT decide (deferred, explicitly off the critical path)

The cutover flips and deletes; it does **not** resolve the v3 product backlog. These stay deferred and do **not** block the flag-flip:

| Deferred item | State at cutover | Lands |
|---|---|---|
| **V3-Q1 — type-aware default seed** | Reset still → blank (P3-DL-5). The flip ships with blank-seed; the seed is a fast-follow. | Post-v3 batch |
| Per-(doctor × consult-type) persistence | Per-doctor only (P3-DL-4). | Rides V3-Q1's seed |
| Preset save/manage **UI** in the palette | Preset *data* valid + loadable (P3-DL-7); no picker UI. | Post-v3 batch |
| `InvestigationsAutoMerge` narrow-merge in the flat-pane model | Captured (Phase 3 inbox). | Assess post-cutover |

Locking these as *out* is what keeps Phase 4 to "verify, flip, delete, document" instead of sprawling into a v3.1.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the program is closed.

### Parity matrix (cv3x-01 · the close-gate)

- [ ] **Open patient** renders correctly in v3 across **every consult type** (the matrix enumerates them) — no missing pane, no console error, no layout collapse.
- [ ] **Prescribe + send**: build an Rx in v3, "Send Rx & finish" completes the same send pipeline as the old shell (same network calls, same success state) — verified after a drag-reshape too (P3 chrome holds).
- [ ] **Autosave**: edits persist on the same debounce/keys as the old shell; no double-save, no lost edit on remount.
- [ ] **Lifecycle states**: finish / no-show / review states behave identically (terminal UI, `body`-during-`live` guard) in v3.
- [ ] **Three mount surfaces** (cockpit-v2 DL-3): v3 renders correctly on each surface the shell mounts on.
- [ ] **Keyboard nav**: the consult keyboard map works in v3 (help host, focus order, send hotkey).
- [ ] No regression in the send / autosave / finish **E2E** suites with v3 active.
- [ ] The matrix is recorded (doc or test) so the flip decision (P4-DL-1) is auditable — every cell explicitly green.

### Flag flip + kill-switch (cv3x-02)

- [ ] `cockpitV3Enabled()` defaults to **on** — a fresh doctor with no override sees the v3 cockpit.
- [ ] A **kill-switch** (runtime/env override) reverts to the old `PatientProfileShell` **without a redeploy** (P4-DL-2); flipping it back restores v3.
- [ ] Telemetry records which shell rendered (so the soak can confirm v3 is actually serving and the kill-switch wasn't silently engaged).
- [ ] Flag-off / kill-switch-on path is still byte-identical to today (P0-DL-1 holds until cv3x-03 deletes it).

### Delete the old (cv3x-03 · after the soak)

- [ ] `Shell.tsx` (`PatientProfileShell`), `PaneDropOverlay.tsx`, `CustomizeBar.tsx`, `customize-mode-context.tsx`, `CustomizeBar.test.tsx`, the template pre-fill path, and the flag (`flags.ts` + the `PatientProfilePage` branch) are **removed**; `CockpitV3Shell` mounts unconditionally.
- [ ] `rg "PatientProfileShell"`, `rg "PaneDropOverlay"`, `rg "customize-mode-context"`, `rg "CustomizeBar"`, `rg "cockpitV3Enabled"` over `frontend/` each return **zero** (excluding deleted files / git history).
- [ ] Every consumer was audited before removal (CODE_CHANGE_RULES); no kept-model / engine / `foundation.ts` / migration file changed (P4-DL-4 / v3-DL-1).
- [ ] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings only); the v3 + surviving suites green.

### Docs + program close-out (cv3x-04)

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` rewritten — v3 is the live model; customize-mode narrative removed (P4-DL-5).
- [ ] `Product plans/plan-cockpit-v3.md` marked **Shipped**; R-CUTOVER ticked; the program is closed.
- [ ] `docs/Work/capture/inbox.md` gains a close-out line (program shipped; deferred fast-follows listed) and the program README marks Phase 4 done.

---

## Phase plan position

This is **Phase 4 of 4 (Cutover) — the final phase.** The ladder (from [`plan-cockpit-v3.md` §Sequencing](../../../../../Product%20plans/plan-cockpit-v3.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE) | ✅ Shipped (cv3c-01..04) |
| Phase 2 | Interaction: Cursor-style always-on drag/drop (R-DND3) | ✅ Shipped (cv3d-01..04) |
| Phase 3 | Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3) | ✅ Shipped (cv3p-01..04) |
| **Phase 4** | **Cutover: parity matrix, flag flip + kill-switch, delete old (R-CUTOVER)** | ▶ This batch (cv3x-01..04) |

After this batch closes, the Cockpit v3 program is **Shipped** and folds into the canonical `COCKPIT.md`.

---

## Out-of-scope (rolled forward to a fresh post-v3 batch)

| Out-of-scope item | Why not here |
|---|---|
| Type-aware default seed (V3-Q1) | A feature, not a cutover step (P4-DL-6); reset → blank ships with the flip |
| Per-(doctor × consult-type) persistence | Fast-follow that rides the seed |
| Preset save/manage UI in the v3 palette | Preset data is valid + loadable; the UI port is a separate batch |
| `InvestigationsAutoMerge` narrow-merge container query in v3's flat-pane model | Assess after cutover; not a parity-blocker |
| Any new shell behavior, restyle, or pane addition | Phase 4 is verify/flip/delete/document only (P4-DL-6) |

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 | Composer 2 | Opus 4.7 | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3x-01 (parity matrix) | 0/1 | 0/1 | 1/1 | ~3–4h |
| Wave 2 | cv3x-02 (flag flip + kill-switch) | 1/1 | 0/1 | 0/1 | ~1–2h |
| ⏸ soak | *(release window — wall-clock pause, no agent)* | — | — | — | ~1 release (~1 week) |
| Wave 3 | cv3x-03 (delete) → cv3x-04 (docs) | 0/2 | 1/2 | 1/2 | ~4–5h |
| **Total** | **4** | **1** | **1** | **2** | **~8–11h agent-time + ~1-week soak** |

Two Opus tasks = the batch cap ([`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) §8): **cv3x-01** (the parity close-gate over consult-critical paths — "one careful review beats four mediocre ones") and **cv3x-03** (a multi-file deletion of the live old shell — the guide's "cross-cutting refactor / 5+ files" + "removing consult-critical code" hard-rule). They sit in different waves (≤1 Opus/wave). cv3x-02's flag flip is a small, well-bounded config change (Sonnet); cv3x-04 is docs (Composer).

---

## Sequencing notes (the why behind the waves)

- **Every wave is single-lane (Shape A).** Cutover work is inherently sequential and high-blast-radius — there is no honest second lane. Verify, then flip, then (after soak) delete + document. Per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §7, structural/destructive work biases hard toward sequential.
- **Wave 1 → Wave 2 is a kind-of-work cut (QA → flip).** cv3x-01 is pure verification (build nothing); cv3x-02 changes a default. Different reviewer mindset, different failure mode.
- **Wave 2 → Wave 3 has a mandatory wall-clock pause** (`[ release window ~1 week ]`, the §0.5 "Cut 4" + the `ppr` Wave 5 precedent): you cannot delete the rollback path until the soak proves the flip is safe. This is the most important boundary in the batch.
- **Wave 3 is a single sequential lane: delete (cv3x-03) → document (cv3x-04).** The docs describe the post-deletion world, so they follow the deletion. cv3x-03 is the bottleneck — removing the live old shell is the riskiest diff in the whole program.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — R-CUTOVER, v3-DL-9, v3-DL-1, P0-DL-1, V3-Q1.
- [Phase 3 — p3-platform](../p3-platform/) — anchored chrome / persistence / mobile that cv3x-01 proves at parity.
- [Phase 0 — p0-scaffold](../p0-scaffold/) — the flag + parallel mount cv3x-02 flips and cv3x-03 deletes.
- [`frontend/lib/patient-profile/v3/flags.ts`](../../../../../../../frontend/lib/patient-profile/v3/flags.ts) — `cockpitV3Enabled()`, the flip + kill-switch point (cv3x-02).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the `cockpitV3Enabled() ? <CockpitV3Shell> : <PatientProfileShell>` branch (~L1126).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../../frontend/components/patient-profile/Shell.tsx) — `PatientProfileShell`, the old shell to delete (cv3x-03).
- [`frontend/components/patient-profile/PaneDropOverlay.tsx`](../../../../../../../frontend/components/patient-profile/PaneDropOverlay.tsx) · [`CustomizeBar.tsx`](../../../../../../../frontend/components/patient-profile/CustomizeBar.tsx) · [`customize-mode-context.tsx`](../../../../../../../frontend/components/patient-profile/customize-mode-context.tsx) — the customize-mode deletion set.
- [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../../Reference/product/cockpit/COCKPIT.md) — the canonical doc cv3x-04 rewrites to v3.
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](./Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 4 of the v3 program — the final phase).  
**Closes:** when all four cv3x tasks' gates + the cross-cutting gate above pass, and the program is marked Shipped.  
**Next phase:** none — this closes Cockpit v3. Deferred fast-follows (V3-Q1 seed, per-consult-type persistence, preset CRUD UI) promote as a fresh post-v3 batch when prioritised.
