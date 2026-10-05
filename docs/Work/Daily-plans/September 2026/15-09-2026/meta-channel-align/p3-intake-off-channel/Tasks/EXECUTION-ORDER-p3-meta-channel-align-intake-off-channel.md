# Execution order — p3 intake off-channel

```
mca-12 ──► mca-13 ──► mca-14 ──► mca-15 ──► mca-11
              ▲
           (mca-10 umbrella)
```

`mca-12` is shipped (generic outbound DMs). `mca-10` is the link-first program; it runs as four Auto sittings. Do not start a later sitting until the earlier one is verified. Emergency copy stays in-thread (MCA-DL-5). No new migration.

| Sitting | Task | What must be true before the next one |
|---|---|---|
| 1 | `mca-13` | Checkout accepts owned-page details and can finish when the patient row has no name/phone yet |
| 2 | `mca-14` | `/book` collects those details and consent |
| 3 | `mca-15` | New booking DMs hand the link; no in-thread intake |
| 4 | `mca-11` | Dummy-patient walk matches the Phase 3 gate |

**Created:** 2026-09-15. **Sittings written:** 2026-09-16.
