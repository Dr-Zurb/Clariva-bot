# cv2-08 — Phase 1 verification report

**Date:** 2026-05-18  
**Owner:** Engineering (agent execution, cv2-08)  
**Phase 1 scope:** R-SHELL (recursive panes), R-RX-FORM (Strangler Fig refactor), R-FUTURE-PROOFING (contracts + Cmd+K placeholder).

## Tasks delivered

| ID | Title | Status | Notes |
|---|---|---|---|
| cv2-01 | Recursive `PaneDefinition.children` + Shell.tsx | done | Per batch integration prior to this close-out. |
| cv2-02 | Layout-tree state + persistence v3→v4 | done | |
| cv2-03 | Telemed-video template + `/v2-tree` smoke | done — scaffolds removed in cv2-08 | `TELEMED_VIDEO_TEMPLATE` retained in `frontend/lib/patient-profile/templates.tsx` for Phase 2. |
| cv2-04 | SOAP fields migration (103) + investigations rename | done | PHI columns; CHECK constraints per plan. |
| cv2-05 | RxFormContext extraction + autosave wiring | done | |
| cv2-06 | Section component extraction (4 sections) | done | |
| cv2-07 | SOAP fields UI wire + persistence round-trip | done | |
| cv2-08 | Mount surface verification + scaffold removal | done | This document; `/dev/shell-tree-smoke` + `/dashboard/appointments/[id]/v2-tree` deleted. |
| cv2-09 | R-FUTURE-PROOFING contracts + Cmd+K placeholder | done | Assumed merged per task hard-deps. |

## Mount surfaces verified

**Import inventory (2026-05-17):** `rg` for `from "...PrescriptionForm"` in `frontend` yields **two** live call sites:

| Surface | Path | Role |
|---|---|---|
| Cockpit Rx column (desktop) | `frontend/components/patient-profile/panes/RxPane.tsx` → `RxWorkspace` | Canonical appointment shell Rx pane. |
| Cockpit Rx (mobile pill) | `frontend/components/patient-profile/MobilePillBar.tsx` → `RxWorkspace` | Mobile / condensed strip that embeds the same `RxWorkspace`. |

`frontend/components/consultation/cockpit/RxWorkspace.tsx` is the **only** importer of `@/components/consultation/PrescriptionForm`.

**Divergence from DL-18 text in older docs:** `AppointmentConsultationActions.tsx` still imports `./PrescriptionForm`, but **nothing imports `AppointmentConsultationActions`** after the patient-profile shell became the canonical appointment route (`frontend/app/dashboard/appointments/[id]/page.tsx` → `PatientProfilePage`). Post-call wrap-up uses `EndedCard` → `CallPostCallSummary` (no prescription form). Treat the two `RxWorkspace` mounts above as the production prescription surfaces to regression-test.

E2E smoke (flows A–D) was **not** executed in this agent pass (no authenticated browser session). Run the checklist in `task-cv2-08-mount-surface-verification.md` § Step 2 on staging before release sign-off.

| Surface | Path | Empty appt | Autosave + reload | Full send | Cmd+K |
|---|---|---|---|---|---|
| Rx pane (desktop) | `RxPane` → `RxWorkspace` | pending QA | pending QA | pending QA | pending QA (`PatientProfilePage` mounts `CommandBar`) |
| Rx (mobile pill) | `MobilePillBar` → `RxWorkspace` | pending QA | pending QA | pending QA | same global handler as parent page when mounted under `PatientProfilePage` |

## Discovered / unexpected mount surfaces

- **Orphan:** `frontend/components/consultation/AppointmentConsultationActions.tsx` — still embeds `<PrescriptionForm>` but has **no** repo importers; safe to delete or rewire in a future cleanup batch (not done in cv2-08 per scope).

## Known behaviour preserved

- Primary cockpit CTA wording **"Send Rx & finish ▸"** via `SendRxFinishButton` (DL-9).
- `vitals_text` + free-text `follow_up` remain in the form model (DL-22 transition window).
- Autosave debounce remains owned by `RxFormProvider` / prior cv2-05 wiring (~1500 ms).
- Medicines list behaviour unchanged at the `PrescriptionForm` level.

## Known new behaviour

- Structured vitals grid, differential diagnosis chips, structured follow-up picker, advice / referral / test results fields per cv2-07.
- `prescriptions.investigations` → `investigations_orders` with legacy view per migration notes.
- Cmd+K placeholder (`CommandBar`) when mounted on `PatientProfilePage`.

## `PrescriptionForm.tsx` vs plan “thin shim”

The batch plan described a ≤20 LOC re-export shim; **current** `frontend/components/consultation/PrescriptionForm.tsx` remains the full orchestration shell (~1.4k LOC) and renders `PrescriptionFormCompositionRoot` for SOAP sections. Phase 3 may still split the default export into a thin bridge per DL-26.

## Bundle / perf delta

| Metric | Pre-batch | Post-batch | Delta |
|---|---|---|---|
| Appointment-detail route First Load JS (`next build`) | — | **488 kB** (`/dashboard/appointments/[id]`) | Capture pre-merge baseline from `main` if a % delta is required; not compared in this pass. |
| TTI (cold) | — | — | Not measured. |

## Known issues / Phase 2 follow-ups

- [ ] Patient-facing PDF may not yet render all new SOAP fields (R-RX-PDF / Phase 2).
- [ ] Doctor-facing summary cards may omit new fields (Phase 2).
- [ ] Legacy `vitals_text` + free-text `follow_up` remain alongside structured fields (Phase 3 removal after soak).
- [ ] `PrescriptionForm.tsx` still hosts orchestration + composition root; thin re-export deferred (Phase 3).
- [ ] `/v2-tree` removed; production telemed template mount lands with cockpit-shell-rebuild (Phase 2).
- [ ] Delete or repoint dead `AppointmentConsultationActions` when Product confirms no deep links.

## Automated checks (this PR)

- `frontend`: `npx tsc --noEmit` clean; `npm run lint` exits 0 (existing hook dependency **warnings** in `ConsultationLauncher`, `PrescriptionForm`, `Shell`); `npm run build` succeeded (2026-05-18).
- `backend`: `npm run type-check`, `npm test -- tests/unit/utils/prescriptions.test.ts` — run before merge.

## Sign-off

Phase 1 is **structurally complete** (scaffolds removed, template module reserved, surfaces documented). **Shippable for production** only after human QA completes Step 2 flows A–D on both Rx mounts.
