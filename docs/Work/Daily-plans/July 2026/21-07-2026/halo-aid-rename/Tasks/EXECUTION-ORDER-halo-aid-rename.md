# Halo Aid rename — execution order

> Sibling of [`../plan-halo-aid-rename-batch.md`](../plan-halo-aid-rename-batch.md). Decision lock: `HAR-D1`…`D5`.
>
> **Frontend + backend string/asset rename.** No migration, no RLS, no PHI schema change, no theme change → Sonnet/Composer. Already flagged as a 5+ file cross-cutting change; executed on Opus.

## Wave plan

```
Wave 1:  har-01  FE brand assets + metadata (favicon, brand SVGs, layout, manifest, Header)   [Sonnet]
Wave 2:  har-02  FE legal + patient/doctor copy                                                [Sonnet]
Wave 3:  har-03  FE internal strings + docs                                                    [Composer]
Wave 4:  har-04  BE patient-facing copy (SMS, PDFs, email, bot fallbacks)                      [Sonnet]
Wave 5:  har-05  BE internal strings + docs + close gate (rg sweep + lint/typecheck slice)     [Composer]
```

Waves are independent per file group; ordered for a clean `rg Clariva` sweep at the end.

## Task files

- [`task-har-01-frontend-brand-and-metadata.md`](./task-har-01-frontend-brand-and-metadata.md)
- [`task-har-02-frontend-legal-and-copy.md`](./task-har-02-frontend-legal-and-copy.md)
- [`task-har-03-frontend-internal-and-docs.md`](./task-har-03-frontend-internal-and-docs.md)
- [`task-har-04-backend-patient-facing.md`](./task-har-04-backend-patient-facing.md)
- [`task-har-05-backend-internal-and-close-gate.md`](./task-har-05-backend-internal-and-close-gate.md)

---

**Created:** 2026-07-21. **Status:** ✅ Complete (2026-07-21) — all waves shipped; `Clariva` sweep clean (excl. migration 022).
