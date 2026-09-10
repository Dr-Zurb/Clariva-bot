# Task lvc-12: Retire PreviousRxPopover

**Program / Phase:** last-visit-context · Phase 3
**Status:** Implemented 2026-09-10
**Change Type:** Update existing

LVC-Q4: retire, do not wire the dead copy button. `RxPane` mounts the chip without `onCopyMedicines`. Live cockpit already uses `hideHeader`, so the chip is not on the v3 shell — it still exists as a fetch (`listPrescriptionsByPatient`) on any non-`hideHeader` mount.

Plan entry stays `PreviousRxPlanTrigger` + side sheet. That is “browse all prior Rx”, not last-visit. Do not delete the side sheet here.

**Scope:** unmount + delete the popover. Tests. Lock LVC-Q4. Do not touch carry-forward, vitals, or `last-in-episode` (`lvc-13` / `lvc-14`).
