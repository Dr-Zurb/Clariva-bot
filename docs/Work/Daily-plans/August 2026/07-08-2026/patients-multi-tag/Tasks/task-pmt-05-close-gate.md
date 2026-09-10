# pmt-05 — Close gate

> **Model:** Auto  
> **Depends:** pmt-02, pmt-03, pmt-04  
> **Plan:** acceptance gate in batch plan

## Goal

Prove the batch; stop dual-write cruft.

## Work

1. `mergePatients` — union tags (cap 8).
2. Stop writing `patient_tag` (read fallback OK until drop migration).
3. CSV export includes `patient_tags` joined by `;` if export still ships.
4. Unit tests: client filter membership; validation; bulk ops.
5. Manual: apply / filter / clear / saved view with `?tag=`.
6. Do **not** drop `patient_tag` column here — park follow-up inbox item for drop migration.

## Done when

Batch acceptance checklist in `plan-patients-multi-tag-batch.md` is fully checked.
