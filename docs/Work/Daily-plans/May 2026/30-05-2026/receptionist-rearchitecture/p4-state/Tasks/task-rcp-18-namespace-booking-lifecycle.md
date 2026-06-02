# rcp-18 · Namespace `booking` + `bookingForOther` + typed lifecycle discriminant

> **Phase 4, step 5** · follows the **[state-migration playbook](./EXECUTION-ORDER-p4-receptionist-state.md#state-migration-playbook-shared-recipe--every-rcp-1518-follows-this)**. The booking/collection cluster plus the third-party-booking cluster, and the introduction of a **typed `stage`** to replace the loose `step: string`. Keep the discriminant tightening *light* here (type alias + accessor); rcp-19 enforces the closed union.

| **Size** | L | **Model** | **Auto** | **Wave** | 4 | **Depends on** | rcp-14 | **Blocks** | rcp-19 |

---

## Fields in scope

| Cluster | Legacy keys | PHI? |
|---|---|---|
| `booking` | `reasonForVisit`, `extraNotes`, `age`, `consultationType`, `slotToConfirm`, `slotSelectionDate`, `bookingLinkSentAt`, `bookingReminderSent`, `lastBookingPatientId`, `consent_requested_at` | **`reasonForVisit` + `extraNotes` yes** |
| `bookingForOther` | `bookingForSomeoneElse`, `relation`, `bookingForPatientId`, `pendingSelfBooking`, `pendingOtherBooking`, `pendingMatchPatientIds` | no |

> `consultationType` (channel pick) → `booking`; `consultationModality` (quoting) stayed in `serviceMatch` (rcp-16). Keep them split.

## What to do

Per the playbook for the two namespaces, plus the discriminant:
- **`booking` / `bookingForOther`** sub-objects; update the booking-entry, booking-funnel, idle-fee-triage stages + the book-for-someone-else / patient-match handlers (grep all field names). Carry `// May contain PHI` onto `booking.reasonForVisit` / `booking.extraNotes`.
- **Non-DM:** `slot-selection-service` (`slotToConfirm`, `bookingForPatientId`, `lastBookingPatientId`) and `booking-controller` write/read these — update + targeted tests.
- **Typed lifecycle discriminant (light):** introduce `type ConversationStage` (closed union of the real `PatientCollectionStep` values + `'responded'`) and a `stageOf(state): ConversationStage | undefined` / `setStage(state, stage)` accessor. Route stage reads/writes through it, but **keep `step?: ConversationStage | string`** (escape hatch intact) so legacy rows and the deprecated `confirming_slot`/`selecting_slot` values still work. **Do not remove the `| string` yet** — that's rcp-19.
- Extend read/write mapping for both clusters; add `mid-collection`, `confirm-details`, `book-for-other`, `slot-selection` legacy fixtures.

## Acceptance gate

- [x] Both clusters namespaced; stages + non-DM services updated; grep-clean of flat keys.
- [x] `ConversationStage` + `stageOf`/`setStage` introduced and used; `step` still accepts legacy strings (no regression on old rows / deprecated values).
- [x] **Booking write paths** (slot selection, booking-controller) covered by targeted tests.
- [x] Legacy fixtures round-trip; full DM golden + characterization byte-identical; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't remove the `step: | string` escape hatch or drop legacy/deprecated step values (rcp-19 handles convergence).
- ❌ Don't change collection ordering, slot formatting, the abandoned-booking reminder timing, or any booking copy.
- ❌ Don't merge `bookingForOther` into `booking` — multi-patient/self-vs-other is a distinct sub-lifecycle.

## Risks

- **`step` is read everywhere.** It's the most-referenced state field (every predicate + stage). Introducing the accessor without breaking the `| string` fallback is the crux — prefer `stageOf` reading the existing `step` over a hard retype. A premature closed union here breaks legacy rows mid-flight.
- **Booking write paths off the golden path.** `slot-selection-service` / `booking-controller` create the appointment from this state and aren't in the DM corpus. Their targeted tests are mandatory.
- **`slotToConfirm` shape.** It's a nested object (`{start, end, dateStr}`) already — ensure the namespacing doesn't double-nest or reorder keys (on-disk byte-identical via the flat serializer).
- **PHI fixtures.** `booking` fixtures contain `reasonForVisit`/`extraNotes` — synthetic data only.
