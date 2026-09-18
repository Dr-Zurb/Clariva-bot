# Task rxl-19: Stop visit-status from overriding the note lock

**Program / Phase:** rx-lifecycle · Phase 3-A
**Status:** Implemented 2026-09-09
**Change Type:** Update existing — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

`rxl-07` already starts an editable continuation when the newest note is closed (`noteClosed: false`). Three surfaces ignore that and re-lock from appointment `completed`:

1. Nested `<RxLockProvider>` in `PrescriptionForm` does not pass `noteClosed`, so Plan falls back to visit status.
2. `SubjectivePane` derives `disabled` from `canEditPrescriptionDraft(cockpitState)`.
3. `RxWorkspace` shows the read-only banner from visit status, not the note lock.

**Scope:** those three files + `useRxLock` inherit + tests. Do not change `canEditPrescriptionDraft`. Do not touch send/print/attest (`rxl-20`).
