# Task osm-02: Backend — three-axis derivation

## 11 Aug 2026 — Batch [opd-status-model](../plan-opd-status-model-batch.md) — Wave 2 — **M, ~4h**

---

## Task overview

Replace single-enum `deriveSlotStatus` with three pure functions (`deriveLifecycle`, `deriveTiming`, `deriveTags`) and keep `slotStatus` as a one-release compat shim (OSM-D7).

**Estimated time:** ~4h.

**Status:** Pending.

**Hard deps:** osm-01 merged / migration applied in the env under test.

**Source:** plan OSM-D1–D3, D5, D7, D10.

---

## Model & execution guidance

**Recommended model:** Opus or Auto after osm-01 lands.

**New chat?** **Yes.** Pre-load:

- This task + plan decision lock.
- `backend/src/services/opd/opd-slot-status.ts`
- `backend/src/services/opd-slot-session-service.ts`
- `backend/src/types/opd-slot-session.ts`
- `backend/src/utils/incomplete-consult.ts` (`consultationSessionStarted`)
- `backend/tests/unit/services/opd-slot-status.test.ts`
- `backend/tests/unit/services/opd-slot-session-service.test.ts`

**Estimated turns:** 3–4 (impl + tests).

---

## Acceptance criteria

### Types

- [ ] In `backend/src/types/opd-slot-session.ts`, add:

  - `VisitLifecycle` = `'scheduled' | 'in_consult' | 'incomplete' | 'completed' | 'cancelled' | 'no_show'`
  - `SlotTiming` = `{ minutesToStart: number; band: 'early' | 'due' | 'late' }`
  - `SlotTag` = `'overflow' | 'walk_in' | 'return_visit' | 'rebooked' | 'early_invited' | 'delayed' | 'doctor_away'`

- [ ] Widen `SlotSessionRow` with `lifecycle`, `timing: SlotTiming | null`, `tags: SlotTag[]`.

- [ ] Keep `slotStatus` with a `@deprecated` note pointing at OSM-D7.

- [ ] `SlotSessionCounts`: add `incomplete`. Document that overflow rows now count in their real lifecycle bucket (count shape change).

### Derivation

- [ ] Replace / split `deriveSlotStatus` in `opd-slot-status.ts` into:

  - `deriveLifecycle(input)`
  - `deriveTiming(input)` — returns `null` when lifecycle is terminal (`completed` | `cancelled` | `no_show`)
  - `deriveTags(input)`

- [ ] **No precedence between axes** — that is the point of the batch.

- [ ] Lifecycle order (OSM-D10):

  1. `cancelled` / `completed` / `no_show` from appointment status
  2. `in_consult` when session `status === 'live'`
  3. `incomplete` when `consultationSessionStarted(session)` and appointment not completed/cancelled/no_show
  4. else `scheduled`

- [ ] **Import** `consultationSessionStarted` from `incomplete-consult.ts`. Do **not** call `isIncompleteConsult` for the badge (it is true for live sessions).

- [ ] Thread session fields into the slot-session query / mapper: at minimum the inputs `consultationSessionStarted` needs (`status`, `actual_started_at`, `doctor_joined_at`, `patient_joined_at`). Confirm column names against existing session select in `opd-slot-session-service.ts` before widening (cs-03 errata: no unverified PostgREST embeds).

- [ ] Tags from `booking_origin` (192) + existing row fields:

  | Signal | Tag |
  |---|---|
  | `booking_origin === 'overflow'` | `overflow` |
  | `booking_origin === 'walk_in'` | `walk_in` |
  | `booking_origin === 'return_after_completed'` **or** `opdEventType === 'return_after_completed'` | `return_visit` (+ `overflow` if product still treats return as overflow capacity — prefer mapping return → `return_visit` only; overflow tag only for `booking_origin === 'overflow'`) |
  | `booking_origin === 'rebooked'` | `rebooked` |
  | early invite pending/accepted | `early_invited` |
  | `delayMinutes > 0` | `delayed` |

  Note: `doctor_away` is **client-only** in osm-03; do not invent a server column here.

- [ ] Add `toLegacySlotStatus(lifecycle, timing, tags)` implementing the plan mapping table. Wire into payload so `slotStatus` keeps current consumer values (overflow tag → legacy `'overflow'` for one release even when timing would have been late — document the shim trade-off: legacy consumers still lose late-on-overflow; new axes do not).

### Counts

- [ ] `bumpCounts` keys off `lifecycle` (and keep legacy `slotStatus` counts in sync via shim for one release, or recompute legacy counts from `toLegacySlotStatus` — pick one and test).

### Tests

- [ ] Rewrite `opd-slot-status.test.ts` per axis.

- [ ] **Pin regression:** overflow-tagged row past start → `lifecycle: 'scheduled'`, `timing.band: 'late'`, `tags` includes `'overflow'`. Impossible to satisfy under old `deriveSlotStatus`.

- [ ] **Pin OSM-D10:** live session → `in_consult`, never `incomplete`.

- [ ] Update `opd-slot-session-service.test.ts` for new fields / counts.

### Out of scope

- Deleting `computeAppendedAfterDayById` (osm-04 — still may feed legacy overflow tag until then; prefer reading `booking_origin` only once 192 is live, and stop calling the heuristic in the mapper if osm-04 is same PR — otherwise leave heuristic wired only into tags for one wave).
- Frontend.
- Write-path stamping.

---

## Done when

- Slot session payload includes `lifecycle` / `timing` / `tags` + deprecated `slotStatus`.
- Unit tests green; overflow+late coexistence asserted.
- Incomplete uses PKD predicate without conflating live.
