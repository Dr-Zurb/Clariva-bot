# Task osm-04: Write paths + delete `isAppendedAfterDay` heuristic

## 11 Aug 2026 — Batch [opd-status-model](../plan-opd-status-model-batch.md) — Wave 4 — **S, ~2h**

---

## Task overview

Stamp `booking_origin` on every appointment-creation path, then delete the inferred Overflow heuristic and remaining legacy status literals.

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** osm-01, osm-02 (tags read `booking_origin`).

**Source:** plan OSM-D4, OSM-D9.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

**New chat?** **Yes.** Pre-load:

- This task + plan decision lock.
- `backend/src/services/appointment-service.ts` (create / book paths)
- Add-slot / overflow UI → API path (`AddSlotDialog`, doctor create appointment)
- `backend/src/services/opd-slot-session-service.ts` (`computeAppendedAfterDayById`)
- `backend/src/services/opd/opd-mode-conversion-service.ts` (surplus → return_after_completed)
- Grep results for `'grace'`, `'running_late'`, `isAppendedAfterDay`, `computeAppendedAfterDayById`

**Estimated turns:** 2–3.

---

## Acceptance criteria

### Write paths

Audit and set `booking_origin` explicitly on create / convert:

| Path | Value |
|---|---|
| Normal DM / `/book` / catalog booking | `'booked'` (default OK if insert omits column) |
| Add-slot dialog `mode: 'overflow'` / approve overflow | `'overflow'` |
| Walk-in creation (`patientId == null` or explicit walk-in) | `'walk_in'` |
| Post-consult return / `opd_event_type = 'return_after_completed'` | `'return_after_completed'` (keep `opd_event_type` in sync) |
| Reschedule → new appointment row | `'rebooked'` (if product creates a new row; if in-place update, leave origin unchanged) |
| Mode conversion surplus rows | `'return_after_completed'` (align with existing `opd_event_type` write) |

- [ ] Each path covered by unit test or existing create-path test extended with origin assertion.

### Delete heuristic

- [ ] Delete `computeAppendedAfterDayById` from `opd-slot-session-service.ts`.
- [ ] Remove `isAppendedAfterDay` from `DeriveSlotStatusInput` / any remaining derivation input.
- [ ] Remove / update tests that asserted appended-after-day Overflow.

### Literal cleanup

- [ ] Grep both workspaces for remaining `'grace'` and `'running_late'` literals; remove production uses (URL translation in osm-03 may keep a map — that's fine).
- [ ] Grep for `isAppendedAfterDay` / `computeAppendedAfterDayById` — zero hits.

### Close-out

- [ ] Append to `docs/Work/capture/inbox.md`:

  ```
  - [ ] 2026-08-11 — **osm follow-up — drop `slotStatus` compat field** after one release of osm-03. Un-defer: FE filter + rows read only `lifecycle`/`timing`/`tags`; no external clients on `slotStatus`. Source: opd-status-model OSM-D7.
  ```

- [ ] Batch acceptance gate in the plan: tick what this wave closes; leave FE visual smoke for human.

### Out of scope

- SQL incomplete-consult segment (OSM-D11).
- Dropping `opd_event_type` column.
- Dropping `slotStatus` from the API in this wave.

---

## Done when

- New overflow / walk-in / return rows stamp origin at write time.
- Heuristic functions gone; no silent Overflow from created_at ordering.
- Inbox follow-up filed for OSM-D7 cleanup.
- Backend tests green.
