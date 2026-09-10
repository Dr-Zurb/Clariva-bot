# Patients tag popover UX (batch spec)

> **Status:** Implemented 2026-08-07.  
> **One-line intent:** Make bulk Tag… one clear flow: draft → pending list → Add/Remove/Clear; no `+` staging button; vertical lists not chip rows.  
> **Trigger:** Founder 2026-08-07 — Enter/Add should work; chips confusing.

## Decision lock

| ID | Decision |
|---|---|
| **PTT-D1** | Remove staging `+` control. |
| **PTT-D2** | **Add** / **Remove** call `flushDraft()` into pending before `op`. |
| **PTT-D3** | Pending = vertical list with ×; known tags = vertical checklist. |
| **PTT-D4** | Enter = flush draft into pending only (does not apply to patients). |
| **PTT-D5** | FE-only (`BulkActionsBar`); no API/migration. |

## Acceptance

- [x] Type + Enter adds to pending list (no `+`).
- [x] Type + Add (without Enter) still applies that tag.
- [x] Pending and known tags render as vertical lists.
- [x] Remove / Clear all unchanged in meaning.
