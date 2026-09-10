# pmt-02 — Bulk ops + list tag filter

> **Model:** Opus (touches service + validation heavily).  
> **Depends:** pmt-01  
> **Plan:** PMT-D3, D4, D5, D8

## Goal

Server supports multi-tag writes and membership filter.

## Work

1. `validateBulkTagPatientsBody` — accept:
   ```ts
   { ids, op: 'add'|'remove'|'set'|'clear', tags?: string[] }
   // legacy: { ids, tag: string|null } → set/clear
   ```
   Normalize: trim, drop empties, case-insensitive dedupe, max 8, each ≤64.
2. `bulkTagPatientsForDoctor` — implement add/remove/set/clear on `patient_tags`; stop writing only `patient_tag` once dual-write decided (prefer write array + mirror first tag into `patient_tag` until pmt-05).
3. `listPatientsForDoctorFiltered` — `filters.tag` = case-insensitive membership in `patient_tags`.
4. `untagged` segment — empty array (and legacy empty string if still present).
5. Tests: validation + service membership + bulk ops.

## Done when

- Add VIP then Follow-up → both present.
- Remove VIP → Follow-up remains.
- Clear → `[]`; `?tag=VIP` / untagged behave per PMT-D4.
- Legacy `{ tag: null }` still clears.
