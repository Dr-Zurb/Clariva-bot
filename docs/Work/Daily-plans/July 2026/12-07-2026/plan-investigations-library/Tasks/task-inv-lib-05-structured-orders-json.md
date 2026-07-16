# Task inv-lib-05: Structured orders JSON (W4 · Opus · migration 167)

> **Program:** [`../README.md`](../README.md) · Decision: **INV-D8**

## Scope (W4 — additive migration + parity)

Add a structured `investigations_orders_json` column that mirrors the `diagnoses_json`
wave (migration 161). Structured orders are **derived at the save boundary** from the
chip labels; the flat `investigations_orders` TEXT stays authoritative for every
reader (PDF / SMS / public API), so patient-facing output is byte-identical.

- Element shape: `{ id, label, kind: 'panel' | 'analyte' | 'imaging' | 'custom' }`.
- Catalog-backed chips → catalog `kind` + stable id; unmatched chips → `custom:<norm>`.
- Empty array = legacy free-text passthrough.

## Out of scope

- Promoting structured JSON to the interactive source of truth (future wave).
- Reading `investigations_orders_json` back into the form (v1 hydrates from the flat string).
- Any change to PDF / SMS / public-API rendering.

## Acceptance

- [x] Migration `167_prescriptions_investigations_orders_json.sql` — additive JSONB
      column, array CHECK, RLS inherited (026), no backfill, documented rollback.
- [x] Tolerant `investigationsOrdersJsonSchema` (drop malformed, unknown `kind` → `custom`,
      dedupe by `kind:id`, cap 40) wired into create + update bodies.
- [x] `prescription-service` persists the column on create + update.
- [x] `deriveInvestigationOrdersJson` + `buildRxPayload` send structured orders alongside
      the authoritative flat string (INV-D8); labels join back byte-identical.
- [x] Reader parity verified (PDF / SMS / section-order tests green).
- [x] Migration + validation + FE derivation tests added.
