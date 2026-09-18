# Execution order — p3 same-day revise

```
rxl-19 ──► rxl-20 ──► Phase A shippable (no migration)     [implemented 2026-09-09]
                    │
                    └──► rxl-21 (Opus, PHI) ──► rxl-22 ──► rxl-23 ──► rxl-24 ──► rxl-25
                                                                          │
              rxl-09 (Phase 2, open) ───────────────┐                     │
                                                    ▼                     ▼
                                       rxl-26 · rxl-27 · rxl-28 ──► rxl-29
```

Phase A does **not** wait on `rxl-10`.

| ID | Title | Model | Status |
|---|---|---|---|
| [`rxl-19`](./task-rxl-19-unlock-same-day-continuation.md) | Stop visit-status from overriding the note lock | Sonnet | Implemented |
| [`rxl-20`](./task-rxl-20-finish-only-attest.md) | Only Finish attests | Sonnet | Implemented |
| [`rxl-21`](./task-rxl-21-revision-columns-migration.md) | Revision columns | Grok 4.6 (override) | Implemented — `231` applied on dev |
| [`rxl-22`](./task-rxl-22-clone-on-reissue.md) | Clone on re-issue | Grok 4.6 (override) | Implemented |
| [`rxl-23`](./task-rxl-23-same-day-write-guard.md) | Same-day write guard | Grok 4.6 (override) | Implemented |
| [`rxl-24`](./task-rxl-24-load-todays-issued-note.md) | Load today's issued note | Grok 4.6 (override) | Implemented |
| [`rxl-25`](./task-rxl-25-revise-strip-and-reason.md) | Revise strip + reason presets | Grok 4.6 (override) | Implemented |
| [`rxl-26`](./task-rxl-26-slip-replaces-marker.md) | Slip footer replaces-line | Grok 4.6 (override) | Implemented |
| [`rxl-27`](./task-rxl-27-versioned-pdf-filename.md) | Versioned PDF filename | Grok 4.6 (override) | Implemented |
| [`rxl-28`](./task-rxl-28-history-versions.md) | History versions | Grok 4.6 (override) | Implemented |
| [`rxl-29`](./task-rxl-29-phase-3-gate.md) | Phase gate | Grok 4.6 (override) | Implemented — residuals recorded |

**Recon 2026-09-10 (in the batch plan):** timezone source found · clone inventory written · write guard has a *second* lock on `appointment.status = completed` · `incomplete` does not fire for in-clinic walk-ins.

`rxl-19`…`29` landed. Phase 3 is **implemented with residuals**, not Shipped. Next program work is `lvc` or Phase 2 leftovers (`rxl-08` / `rxl-10`).
