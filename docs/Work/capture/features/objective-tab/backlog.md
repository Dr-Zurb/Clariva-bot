# Objective tab — backlog (deferred / future / debt)

> Parking lot for the objective-tab program. Promote to a Daily-plan when scheduled.  
> **Status:** Rough / incomplete v1 — structured vitals grid + 3 free-text areas only.  
> **Deep dive:** [`exam-catalog.md`](exam-catalog.md)

## Decisions — RESOLVED 2026-06-18 (see product plan `OBJ-D1..D7`)

- [x] **Structured exam schema fork** → **C3 hybrid** (OBJ-D3): typed JSONB `examination_json` for 5 core systems + derived `examination_findings` mirror (OBJ-D1/D2); long tail via templates + custom sections.
- [x] **Modality-aware defaults** → **deferred to P3** (OBJ-D6): rides the ported visibility/hidden-set engine; P1 ships all 5 cards visible.
- [x] **Legacy vitals sunset** → **parked** (OBJ-D7): `vitalsText` + free-text exam kept as the escape hatch; removal is a separate decision.
- [x] **Product plan location** → **new** [`docs/Work/Product plans/ehr/objective-tab/`](../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md).

## Suggested phasing (promote to Daily-plans when ready)

| Phase | Focus | Notes |
|-------|--------|--------|
| **P1** | Structured system-wise exam cards + derived-text contract | Headline rewrite; PDF byte-stable |
| **P2** | Vitals 2.0 | RR, pain, glucose, units, range flags, BSA/percentiles |
| **P3** | Reuse subjective layout engines | Reorder, collapse, visibility, custom objective sections |
| **P4** | Exam templates + specialty packs | Scoped templates (mirror subj P6/P12) |
| **P5** | Point-of-care results + media | In-clinic tests, wound/ECG/report attachments |
| **P6** | Trends | Vital sparklines, BMI/growth charts |

## Future features

- [ ] **Structured physical examination** — system cards (CVS, Resp, Abd, CNS, MSK, ENT, Skin…); Normal/Abnormal toggle; “mark whole exam normal”; chip palettes. → [`exam-catalog.md`](exam-catalog.md) §A
- [ ] **Vitals 2.0** — RR, pain score, GCS, BSL, BP posture, peds HC/MUAC; °C/°F kg/lb cm/in; out-of-range flags; BSA, MAP, growth percentiles. → §B
- [ ] **Layout engines (reuse)** — section order, collapse, hidden set, custom sections — same `doctor_settings` pattern as subjective P8–P12. → §D
- [ ] **Exam templates + specialty packs** — “Normal cardiac exam”, gynae P/V/P/S/P/A, ortho ROM, derm lesion, ophthal, ENT. → §E
- [ ] **Point-of-care / bedside results** — structured rows for dipstick, glucometer, rapid tests vs patient-brought reports. → §F
- [ ] **Media attachments** — exam photos, wounds, ECG, report scans (telemed-native; ties to cockpit history-pane photo strip follow-up). → §G
- [ ] **Quick entry** — chip normals, carry-forward last visit exam, free-text parse of dictated exam notes. → §H
- [ ] **Modality-aware objective** — observed-on-video vs home-measured vs uploaded vs in-person exam sections.

## Debt / hardening (current v1)

- [ ] **Exam is delimiter-hacked text** — `general` + `systemic` packed into one `examination_findings` column via `--- SYSTEMIC ---` (`lib/cockpit/exam-findings.ts`); no structured findings, no templates.
- [ ] **No section chrome** — flat `space-y-3` layout; no collapsible blocks, reorder, or section manager (subjective has all of this).
- [ ] **No templates / presets** — unlike subjective scoped templates.
- [ ] **No carry-forward** — subjective has `CarryForwardButton`; objective has nothing.
- [ ] **BMI trend chart** — parked in capture inbox `[cpv follow-up]`; generalize to vital sparklines in P6.
- [ ] **Legacy vitals** — deprecated `vitalsText` still in form state + collapsed UI; migration 103 structured columns exist but coverage is basic 7-field grid only.

## Promoted / done

_Move lines here when promoted to Daily-plans or closed._

- [x] **Promoted to product plan + Phase 1 (2026-06-18)** — [`plan-objective-tab.md`](../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) (full P1–P6 + `OBJ-D1..D7`) and [`Daily-plans/June 2026/18-06-2026/objective-tab/p1-structured-exam/`](../../../Daily-plans/June%202026/18-06-2026/objective-tab/p1-structured-exam/) (`obj-01..04`). P2–P6 promote from here when scheduled.
- [x] **cv2-07 partial ship** — `VitalsGrid` (BP, HR, temp, SpO₂, weight, height, BMI badge) + General/Systemic exam textareas + test results textarea (`ObjectiveSection.tsx`).
