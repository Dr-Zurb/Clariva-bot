# poa-03 — Search parity with OPD

> **Model:** Auto  
> **Depends:** poa-02 (lives inside sticky band)  
> **Plan:** POA-D8

## Goal

Patients search matches OPD affordances: clear control, stable width, optional `/` focus.

## Work

1. Study `OpdQueueSearchBox.tsx` — clear-X, width, hotkey.
2. Update `PatientsToolbar` search:
   - Clear button when `q` non-empty
   - Width closer to OPD (`md:w-72` or shared class)
   - Optional: document-level `/` focuses search when not typing in an input (same guards as OPD)
3. Keep 200ms debounce + URL sync via `setQ`.
4. Accessibility: clear button has aria-label; search keeps `aria-label`.

## Out of scope

Chip logic, table chrome.

## Done when

- Clear-X empties search and resets list filter.
- Width feels aligned with OPD search in the sticky band.
- `/` focus works if implemented (or explicitly deferred with a one-line note in the task checkbox).
