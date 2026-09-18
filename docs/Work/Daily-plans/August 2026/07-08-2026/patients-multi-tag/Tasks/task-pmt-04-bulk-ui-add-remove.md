# pmt-04 — Bulk UI: Add / Remove / Clear all

> **Model:** Auto  
> **Depends:** pmt-03  
> **Plan:** PMT-D5, D8

## Goal

Bulk Tag… supports multi-tag ops without waiting on full list remount.

## Work

1. `BulkActionsBar` — chip/multi input from `knownTags`; actions:
   - **Add** (default)
   - **Remove** (selected tags)
   - **Clear all**
2. `bulkTagPatients` client → new body shape; keep legacy shim if needed.
3. Optimistic: patch `patient_tags` immediately; `onTagFailed` → invalidate `queryKeys.patients.all`.
4. Short helper copy in popover (add vs replace).

## Done when

- Select 2 patients already tagged VIP → Add Follow-up → both tags on both rows without full-page reload lag.
- Remove / Clear all work; errors reopen popover after invalidate.
