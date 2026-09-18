# pmt-03 — List UI: badges + filter

> **Model:** Auto  
> **Depends:** pmt-02  
> **Plan:** PMT-D4, D8

## Goal

Show multiple tags on the row; filter via View → Tags / badge click.

## Work

1. FE `PatientSummary.patient_tags: string[]` (+ keep optional `patient_tag` fallback).
2. Name cell: up to **2** badges + `+N`; click → `setTag(tag)` (`?tag=`).
3. `client-list-filter` / `patientListFiltersKey` — membership on `patient_tags`.
4. `knownTags` discovery from roster — flatten all tags.
5. Extend `patch-patient-tags-cache` for `string[]`.
6. Keep row height uniform (inline badges, truncate).

## Done when

- Multi-tag patient shows two badges (or +N).
- View → Tags lists distinct tags; filter matches membership.
- Untagged still works.
