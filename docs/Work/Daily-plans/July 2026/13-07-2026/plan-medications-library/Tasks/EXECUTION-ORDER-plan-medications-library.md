# Plan medications library — execution order

> Sibling of [`README.md`](../README.md).

```
W1  med-lib-01  Remove starter packs + favorites
      │
      ▼
W2  med-lib-02  Chart-med capture/row parity (Rx fields)
      │
      ▼
W3  med-lib-03  Scoped medicines templates (Opus · migration 170)
```

| Step | Task | Size | Notes |
|---|---|---|---|
| W1 | med-lib-01 | S | FE-only; strip chrome + tests |
| W2 | med-lib-02 | M | Reuse chart chip helpers; keep `MedicineRowValue` |
| W3 | med-lib-03 | M | Migration — stop for Opus before SQL |

## Scope Guard

**DO NOT TOUCH**

- Allergy / DDI banners, densification active-row tracking, keyboard shortcuts
- `patient_medications` / PMH condition linking
- Dropping `doctor_drug_favorites` table (MED-D6 soft-retire only)
- Full-Rx `TemplatePicker` wholesale apply in `PrescriptionForm`
