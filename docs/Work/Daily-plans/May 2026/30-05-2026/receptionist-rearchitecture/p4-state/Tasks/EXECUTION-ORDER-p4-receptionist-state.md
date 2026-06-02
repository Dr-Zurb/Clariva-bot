# Execution order — Phase 4: structured `ConversationState`

> Wave/lane matrix for **Phase 4** of [receptionist-rearchitecture](../plan-p4-receptionist-state-batch.md). Phases 0–3 are done. Phase 4 replaces the ~45-field flat `ConversationState` grab-bag (`backend/src/types/conversation.ts`) with **per-flow namespaced sub-states** behind a **compatibility reader**, migrated one cluster per PR. Same strangler discipline as Phases 2–3.

---

## Decision: namespaced sub-states + typed discriminant — **not** a big-bang discriminated union

The original sketch said "discriminated union (or per-flow nested sub-objects)." After looking at the live shape, **the pragmatic, cost-aware call is per-flow namespacing first**, with a typed lifecycle discriminant, and *optional* DU tightening at the end (rcp-19). Why:

- A strict top-level DU on `step` would force a rewrite of **every** state read + all ~18 write sites with union-narrowing, for fields that legitimately **span** flows (`catalogServiceKey` lives from match → quote → book). High churn, high risk, low marginal safety — exactly what the [efficiency guide](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) says to avoid.
- Namespacing (`state.cancel`, `state.serviceMatch`, `state.recordingConsent`, …) gets ~80% of the "illegal states are obvious" benefit, isolates the PHI-bearing fields, and is a **mechanical, test-pinned** move — Auto-friendly.
- DU invariants can then be layered on **per namespace** where cheap (rcp-19), not as a prerequisite.

**Target shape (illustrative):**

```ts
interface ConversationState {
  // lifecycle / routing (shared base)
  stage?: ConversationStage;            // typed discriminant (replaces loose `step: string`)
  lastIntent?: Intent;
  lastPromptKind?: ConversationLastPromptKind;
  collectedFields?: string[];
  updatedAt?: string;

  booking?: BookingState;               // reasonForVisit, extraNotes(PHI), age, slotToConfirm, bookingLink*…
  bookingForOther?: BookingForOtherState;// bookingForSomeoneElse, relation, bookingForPatientId, pending*Booking, pendingMatchPatientIds
  serviceMatch?: ServiceMatchState;     // catalog*, matcherProposed*, staffServiceReview*, finalized, confidence, reasonCodes, candidateLabels
  cancel?: CancelState;                 // cancelAppointmentId, pendingCancelAppointmentIds
  reschedule?: RescheduleState;         // rescheduleAppointmentId, pendingRescheduleAppointmentIds
  recordingConsent?: RecordingConsentState; // decision, version, rePitched, requestedAt
  triage?: TriageState;                 // lastMedicalDeflectionAt, reasonFirstTriagePhase, postMedicalConsultFeeAckSent, activeFlow
  clarification?: ClarificationState;   // originalReasonForVisit(PHI), pendingClarificationConcerns(PHI), attemptCount, requestedAt, fallbackMatch
}
```

---

## The migration safety mechanism (read this before any task)

Two invariants make this safe for in-flight conversations **and** the non-DM services that share `conversations.metadata`:

1. **On-disk stays legacy-flat until rcp-19.** `updateConversationState` (`conversation-service.ts:293`) replaces the *entire* `metadata` column, and non-DM readers (`abandoned-booking-reminder.ts:50`, `service-staff-review-service.ts:337`, slot-selection, booking-controller) still read it. So during rcp-14..18 the **in-memory** shape is namespaced, but the **serializer flattens back to the legacy on-disk shape**. Nothing on disk changes; partial deploys can't corrupt a row.
   - `readConversationState(metadata)` — accepts **both** legacy-flat and nested; returns the nested in-memory shape.
   - `writeConversationState(state)` — serializes nested → **legacy-flat** metadata (until rcp-19 flips it).
2. **The gate is a fixture, not a model.** A corpus of **real old-shape `metadata` JSON blobs** (one per flow, captured from the existing transcripts/DB shapes) that `readConversationState` must round-trip correctly. This makes the only silent-failure surface (mis-reading an in-flight row) loud and permanent — far cheaper and stronger than an Opus review.

rcp-19 is the only task that changes on-disk data (flip writer to nested + backfill/upgrade-on-write + drop the flat-read fallback after a rollout window).

---

## Model policy (cost-aware — per the efficiency guide)

**No per-task Opus close-gates.** Execute on **Auto**; use **Composer** for the scaffold/doc-sync; escalate a *single message* to Opus only if a task stalls. The fixture corpus + golden + characterization suites are the gate. Optional: one Opus diff-skim on **rcp-19** only (it touches persisted data) — or just rely on the backfill/load test.

| Wave | Task | Title | Size | Model | Depends on |
|---|---|---|---|---|---|
| 4 | [rcp-14](./task-rcp-14-state-access-seam.md) | State access seam + compat reader + target types + old-shape fixtures | M | **Composer/Auto** | Phase 3 |
| 4 | [rcp-15](./task-rcp-15-namespace-cancel-reschedule.md) | Namespace `cancel` + `reschedule` (smallest; proves the pattern) | S | **Auto** | rcp-14 |
| 4 | [rcp-16](./task-rcp-16-namespace-service-match.md) | Namespace `serviceMatch` (ARM-03); retarget existing pure helpers | L | **Auto** | rcp-14 |
| 4 | [rcp-17](./task-rcp-17-namespace-consent-triage-clarification.md) | Namespace `recordingConsent` + `triage` + `clarification` (PHI grouping) | M | **Auto** | rcp-14 |
| 4 | [rcp-18](./task-rcp-18-namespace-booking-lifecycle.md) | Namespace `booking` + `bookingForOther` + typed `stage` discriminant | L | **Auto** | rcp-14 |
| 4 | [rcp-19](./task-rcp-19-converge-discriminated-union.md) | Flip on-disk shape + backfill; retire flat-read fallback; DU invariants (closer) | M | **Auto** (optional 1 Opus diff-skim) | rcp-15..18 |

**Order:** rcp-14 first (everything depends on the seam). rcp-15..18 are independent of each other (each owns a disjoint field cluster) — do them in any order; rcp-15 first is recommended as the smallest proof. rcp-19 is last.

---

## State-migration playbook (shared recipe — every rcp-15..18 follows this)

1. **Move fields into the namespace** in the target types; keep them optional.
2. **Extend `readConversationState`** to map the legacy-flat fields of *this cluster* → the nested sub-object (and pass through already-nested). **Extend `writeConversationState`** to flatten this sub-object back to the legacy keys (on-disk unchanged).
3. **Update every accessor of this cluster** — DM stages/predicates **and** the non-DM services that touch it (e.g. `service-staff-review-service` for `serviceMatch`; `slot-selection-service`/`booking-controller` for `booking`/`recordingConsent`). Grep the flat field names to find them all.
4. **Retarget centralized helpers** where they exist (`applyMatcherProposalToConversationState`, `applyFinalCatalogServiceSelection`, `applyStaffReviewGateCancellationToConversationState`, `conversationLastPromptKindForStep`) — these encapsulate most mutations, so churn is low.
5. **Add cluster fixtures** to the old-shape corpus; assert round-trip.
6. **Gate:** `dm-routing-golden` + `webhook-worker-characterization` byte-identical; plus the fixture round-trip; plus targeted tests for any **non-DM** writer touched (golden/characterization don't cover those). `npx tsc --noEmit` clean.

> **PHI note (DL-6):** `extraNotes`, `reasonForVisit`, `originalReasonForVisit`, `pendingClarificationConcerns` may hold PHI. Namespacing only **moves** them — no change to handling, logging, or redaction. Keep the existing `// May contain PHI` annotations on the new sub-objects; do not add new PHI keys.

---

## Definition of done for Phase 4

- `ConversationState` is namespaced; `step: string` replaced by a typed `stage` discriminant (legacy values mapped, not dropped).
- All reads go through `readConversationState`; all writes through `writeConversationState`; no raw `metadata as ConversationState` casts remain (grep-clean).
- On-disk metadata migrated to nested (rcp-19) with a verified backfill/upgrade path; flat-read fallback removed only after the rollout window.
- Old-shape fixture corpus round-trips; golden + characterization unchanged across the phase; non-DM writers covered by targeted tests.
