# Plan — OPD status model: split one enum into three axes

## 11 Aug 2026 — Batch `opd-status-model` (osm-01..04) — **M, ~1.5 dev-days**

> **Status:** `Implemented` 2026-08-11 (code). Apply migration **192** on deploy before relying on `booking_origin`.  
> **Trigger:** Overflow appeared on 25 normally-booked evening slots during the 50-patient seed. Root cause is structural, not cosmetic — see § Why.  
> **Exec order:** [`Tasks/EXECUTION-ORDER-opd-status-model.md`](./Tasks/EXECUTION-ORDER-opd-status-model.md).

---

## Why this batch exists

`SlotStatus` is one flat enum resolving three unrelated questions by precedence:

```29:44:backend/src/services/opd/opd-slot-status.ts
export function deriveSlotStatus(input: DeriveSlotStatusInput): SlotStatus {
  if (input.appointmentStatus === 'cancelled') return 'cancelled';
  if (input.appointmentStatus === 'completed') return 'completed';
  if (input.consultationLive) return 'in_consultation';
  if (input.appointmentStatus === 'no_show') return 'missed';
  if (input.opdEventType === 'return_after_completed' || input.isAppendedAfterDay) {
    return 'overflow';
  }

  const graceMs = input.graceMinutes * 60_000;
  const startsIn = input.scheduledAtMs - input.nowMs;
```

Two defects fall out of this shape:

1. **`overflow` returns before the clock is computed.** An overflow row can never report Upcoming or Late — the timing information is destroyed in derivation, so no frontend change can recover it. This is the reported bug.
2. **Every new real-world case costs an enum member**, and each new member silently outranks something else. `grace` was added, then removed (2026-08-11) because it occupied a precedence slot the timing axis needed.

Separately, provenance is *inferred* rather than *stored*: `isAppendedAfterDay` / `computeAppendedAfterDayById` in `opd-slot-session-service.ts` compares `created_at` against the day's other slots, which cannot distinguish "doctor squeezed someone in after hours" from "patient booked at 17:00 for a 17:45 slot". The heuristic is wrong for a legitimate same-day booking.

---

## Decision lock (locked 2026-08-11)

| ID | Decision | Implication |
|----|----------|-------------|
| **OSM-D1** | A slot row carries **three independent fields**: `lifecycle` (exactly one), `timing` (always computed while non-terminal), `tags` (zero or more). | `SlotStatus` stops being the source of truth. |
| **OSM-D2** | **`overflow` becomes a tag, not a lifecycle value.** So do walk-in, return-visit, rebooked, early-invited, delayed. | A row can be Overflow *and* Late. Fixes the reported bug. |
| **OSM-D3** | **`running_late` and `grace` leave the enum entirely** — they are `timing.band`, not lifecycle. | `grace` is already unemitted; this deletes it rather than leaving a legacy member. |
| **OSM-D4** | **Provenance is stored at creation** as `appointments.booking_origin`, never inferred. `isAppendedAfterDay` + `computeAppendedAfterDayById` are deleted in osm-04. | Migration 192. |
| **OSM-D5** | **`incomplete` is a real lifecycle value, derived server-side** via existing `consultationSessionStarted` (`backend/src/utils/incomplete-consult.ts`, PKD-D2). | Replaces `localStorage` as the durable Incomplete signal. Survives tab close; visible to any surface. |
| **OSM-D6** | Client-side `consultSteppedAway` is **retained as a tag** (`doctor_away`), not a lifecycle override. | Keeps the 2026-08-11 leave-guard work; stops it fighting server truth. |
| **OSM-D7** | `slotStatus` stays on the wire for **one release** as a derived compatibility field. Filter chips and URL params keep working unchanged. | No bookmark breakage. Deleted in a follow-up once frontend reads the axes. |
| **OSM-D8** | **No new PHI columns, no RLS change.** `booking_origin` is an operational label. | Keeps migration 192 off the RLS review path. |
| **OSM-D9** | **Do not backfill** `booking_origin` from `isAppendedAfterDay`. Only known-good signal: `opd_event_type = 'return_after_completed'` → `'return_after_completed'`. Everything else stays `'booked'`. | Historical false-positive Overflow rows stop showing Overflow after ship. Intentional. |
| **OSM-D10** | Reuse `consultationSessionStarted` for osm-02, but **order lifecycle explicitly**: live → incomplete → scheduled. Never reuse `isIncompleteConsult` alone for the badge (it is true for live sessions; correct for 90d KPI, wrong for lifecycle). | Pin with a unit test. |
| **OSM-D11** | Incomplete-consult SQL segment stub (`patient-list-segment-sql.ts` → `AND TRUE`) is **out of scope**. Same concept, different layer; converge later. | Holds batch scope. |

---

## Target shape

```ts
// Axis 1 — exactly one. This is the badge.
type VisitLifecycle =
  | 'scheduled'    // no consultation session has ever started
  | 'in_consult'   // consultation_sessions.status = 'live'
  | 'incomplete'   // session started, not live, appointment not completed  (OSM-D5)
  | 'completed'
  | 'cancelled'
  | 'no_show';

// Axis 2 — always present while lifecycle is scheduled|in_consult|incomplete.
// null for completed|cancelled|no_show.
interface SlotTiming {
  minutesToStart: number;                  // negative once past start
  band: 'early' | 'due' | 'late';          // 'due' = within graceMinutes of start
}

// Axis 3 — zero or more.
type SlotTag =
  | 'overflow' | 'walk_in' | 'return_visit'
  | 'rebooked' | 'early_invited' | 'delayed' | 'doctor_away';
```

### Old → new mapping (compat shim + tests)

| Old `SlotStatus` | New |
|---|---|
| `upcoming` | `scheduled` + band `early`\|`due` |
| `grace` | `scheduled` + band `due` (already unemitted) |
| `running_late` | `scheduled` + band `late` |
| `in_consultation` | `in_consult` |
| `completed` | `completed` |
| `missed` | `no_show` |
| `cancelled` | `cancelled` |
| `overflow` | *any lifecycle* + tag `overflow` |
| — | `incomplete` (new; no old equivalent) |

---

## Waves

| Wave | Task | Model | Scope |
|---|---|---|---|
| 1 | [`osm-01`](./Tasks/task-osm-01-migration-booking-origin.md) | **Opus** | Migration 192 `booking_origin` + content-sanity test. |
| 2 | [`osm-02`](./Tasks/task-osm-02-backend-three-axis.md) | Opus / Auto after 01 | Types + `deriveLifecycle` / `deriveTiming` / `deriveTags` + legacy shim + counts. |
| 3 | [`osm-03`](./Tasks/task-osm-03-frontend-badge-timing-chips.md) | Auto | Badge / wait cell / tags; filter URL compat; steppedAway → `doctor_away`. |
| 4 | [`osm-04`](./Tasks/task-osm-04-write-paths-delete-heuristic.md) | Auto | Write `booking_origin` on create paths; delete heuristic; close-out inbox. |

---

## Scope guard — DO NOT TOUCH

- Queue-mode token ordering and ETA logic. Queue rows may get the same three axes later; no behaviour change in this batch.
- `opd_queue_entries.status` (migration 028 enum). Different concern, different table.
- Cockpit state machine (`deriveCockpitState`) and the leave guard shipped 2026-08-11 (only consume `doctor_away` tag).
- Any RLS policy. If a step appears to require one, stop and surface it.
- Incomplete-consult SQL segment push-down (OSM-D11).
- Structured wrap-up dialog / diagnosis fields (separate plan).

---

## Acceptance gate (batch)

- [ ] An overflow-tagged row past its start time reports **Scheduled · Late · [Overflow]** — both facts visible at once (impossible today).
- [ ] A live session never reports `incomplete` (OSM-D10).
- [ ] Stepped-away leave-guard still shows Incomplete / doctor-away chip without overriding a live lifecycle when the doctor returns.
- [ ] Historical false-positive Overflow from `isAppendedAfterDay` no longer appears after ship (OSM-D9).
- [ ] `slotStatus` still populates for one release (OSM-D7); bookmarks / old filter URLs work.
- [ ] Manual pass on the 50-patient seed day: evening slots read **Scheduled / due in N**, not Overflow.
- [ ] Verification gate: typecheck + lint + tests in both workspaces per `DEFINITION_OF_DONE.md`.
- [ ] No PHI in logs; no RLS shape change (OSM-D8).
