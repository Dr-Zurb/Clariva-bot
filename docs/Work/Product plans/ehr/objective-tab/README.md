# EHR — Objective tab (sub-area plan)

> Sits on top of the [EHR tier roadmap](../README.md). Objective sibling of [`../subjective-tab/`](../subjective-tab/).

The Cockpit-v3 **Objective** tab today is v1 rough: a 7-field numeric vitals grid plus three
free-text areas (general exam, systemic exam, patient-brought results), with general +
systemic packed into one `examination_findings` column via a `--- SYSTEMIC ---` delimiter.
This program turns it into **structured system-wise exam cards + Vitals 2.0**, ports the
subjective layout engines (reorder / collapse / visibility / custom sections / templates),
and keeps `examination_findings` a **derived mirror** so the PDF / SMS / snapshot are untouched.

## Files

| File | Purpose |
|---|---|
| [plan-objective-tab.md](./plan-objective-tab.md) | The product plan: why, scope, `OBJ-D1..D7` decision lock (C3 hybrid), data model, P1–P6 phase table, promotion path. |

## Status

`Drafted` 2026-06-18. **Phase 1 committed** the same day → [`Daily-plans/June 2026/18-06-2026/objective-tab/p1-structured-exam/`](../../../Daily-plans/June%202026/18-06-2026/objective-tab/p1-structured-exam/). P2–P6 are drafted in the plan and promote one at a time.

## Read-order

```
../README.md (EHR roadmap) ──→ plan-objective-tab.md ──→ Daily-plans/.../objective-tab/ (phased tasks)
```

## See also

- **Ideation / catalog** (full exam, vitals, specialty-pack detail): [`../../../capture/features/objective-tab/`](../../../capture/features/objective-tab/).
- **Subjective sibling** (the engines this ports): [`../subjective-tab/`](../subjective-tab/).
