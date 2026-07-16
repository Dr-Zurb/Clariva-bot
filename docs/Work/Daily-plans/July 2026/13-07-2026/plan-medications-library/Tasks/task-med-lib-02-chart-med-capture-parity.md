# med-lib-02 — Chart-med capture/row parity (Rx fields)

**Wave:** W2 · **Size:** M · **Migration:** No

## Goal

Align Plan medicine entry with PMH chart-med UX (MED-D3 / MED-D4): richer capture (deterministic parse + optional AI) while keeping `RxMedicine` / duration / route / instructions.

## Done when

- [x] Capture bar supports AI refine / vernacular parse like `ChartMedicationCaptureBar` (mapped to `RxMedicine`, not chart payload)
- [x] Row editor keeps Plan fields (duration, route, instructions); no PMH-only fields
- [x] Tests cover AI-gated capture path (fail-soft)

## Scope Guard

Do not persist to `patient_medications`. Do not add condition linking.
