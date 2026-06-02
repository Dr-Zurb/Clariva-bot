# rcp-15 · Namespace `cancel` + `reschedule`

> **Phase 4, step 2** · follows the **[state-migration playbook](./EXECUTION-ORDER-p4-receptionist-state.md#state-migration-playbook-shared-recipe--every-rcp-1518-follows-this)**. The smallest, most self-contained clusters — does double duty as the **proof** that the seam + read/write mapping works end-to-end before tackling the big clusters.

| **Size** | S | **Model** | **Auto** | **Wave** | 4 | **Depends on** | rcp-14 | **Blocks** | rcp-19 |

---

## Fields in scope

| Cluster | Legacy flat keys | New nested |
|---|---|---|
| `cancel` | `cancelAppointmentId`, `pendingCancelAppointmentIds` | `state.cancel = { appointmentId?, pendingAppointmentIds? }` |
| `reschedule` | `rescheduleAppointmentId`, `pendingRescheduleAppointmentIds` | `state.reschedule = { appointmentId?, pendingAppointmentIds? }` |

These are touched almost entirely by the cancel/reschedule/status stage + predicate (`dm/stages/cancel-reschedule-status.ts`, `-predicate.ts`) and the cancel/reschedule flow steps. Disjoint from every other cluster — ideal first migration.

## What to do

Per the playbook:
- Fill `CancelState` / `RescheduleState` in `types/conversation.ts`; move the four fields under `state.cancel` / `state.reschedule`.
- Extend `readConversationState` to map the four legacy keys → nested (pass nested through); extend `writeConversationState` to flatten back to the four legacy keys (**on-disk unchanged**).
- Update accessors in the cancel/reschedule stage + predicate + the cancel/reschedule flow-step handlers (grep `cancelAppointmentId`, `rescheduleAppointmentId`, `pendingCancel`, `pendingReschedule`).
- Add `cancel` + `reschedule` legacy fixtures to the corpus; assert round-trip (flat-in → nested-in-memory → flat-out equals input).

## Acceptance gate

- [x] Four fields live under `state.cancel` / `state.reschedule`; no flat `cancelAppointmentId` etc. read outside the read/write mapping (grep-clean).
- [x] `readConversationState`/`writeConversationState` round-trip a legacy cancel/reschedule row to byte-identical on-disk output.
- [x] Cancel/reschedule golden fixtures + characterization byte-identical; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't touch any other cluster.
- ❌ Don't change cancel/reschedule routing, numbering ("1"/"2" mapping), or copy.
- ❌ Don't change on-disk format (writer still emits flat).

## Risks

- **Numeric-reply mapping.** `pendingCancelAppointmentIds` backs the "reply 1/2 to pick" mapping; an index/order change silently cancels the wrong appointment. Pin with a multi-appointment cancel fixture.
- **This task's real job is the pattern.** If the round-trip test or grep-clean is hard here (smallest cluster), the bigger clusters will be worse — surface any seam friction now and fix the seam (rcp-14) rather than working around it.
