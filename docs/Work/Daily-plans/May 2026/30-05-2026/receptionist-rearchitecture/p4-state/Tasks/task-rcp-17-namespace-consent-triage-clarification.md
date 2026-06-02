# rcp-17 · Namespace `recordingConsent` + `triage` + `clarification`

> **Phase 4, step 4** · follows the **[state-migration playbook](./EXECUTION-ORDER-p4-receptionist-state.md#state-migration-playbook-shared-recipe--every-rcp-1518-follows-this)**. Three small, distinct clusters batched into one PR. **Two carry PHI** — this task is mostly about grouping them cleanly without changing their handling.

| **Size** | M | **Model** | **Auto** | **Wave** | 4 | **Depends on** | rcp-14 | **Blocks** | rcp-19 |

---

## Fields in scope

| Cluster | Legacy keys | PHI? |
|---|---|---|
| `recordingConsent` | `recordingConsentDecision`, `recordingConsentVersion`, `recordingConsentRePitched` | no |
| `triage` | `lastMedicalDeflectionAt`, `reasonFirstTriagePhase`, `postMedicalConsultFeeAckSent`, `activeFlow` | no |
| `clarification` | `originalReasonForVisit`, `pendingClarificationConcerns`, `complaintClarificationAttemptCount`, `complaintClarificationRequestedAt`, `complaintClarificationFallbackMatch` | **`originalReasonForVisit` + `pendingClarificationConcerns` yes** |

## What to do

Per the playbook, three sub-objects (`state.recordingConsent`, `state.triage`, `state.clarification`):
- **Retarget helpers:** `isRecentMedicalDeflectionWindow` (`:345`, reads `lastMedicalDeflectionAt`) → `state.triage`; `conversationLastPromptKindForStep` is step-based (no field move) but verify it still maps recording-consent steps. The recording-consent detour `applyRecordingConsentDetourIfNeeded` (in `dm/stages/booking-funnel.ts`) reads/writes the recordingConsent fields → retarget.
- **Accessors:** `idle-fee-triage` stage (triage), `booking-funnel` stage (recordingConsent + clarification), `service-match` stage (clarification fallback). Grep all 12 field names.
- **Non-DM:** `slot-selection-service` reads `recordingConsentDecision`/`recordingConsentVersion` to copy onto `appointments.recording_consent_*` at booking — update + targeted test (golden doesn't cover the booking write).
- **PHI grouping (DL-6):** carry the existing `// May contain PHI` annotations onto `ClarificationState.originalReasonForVisit` / `pendingClarificationConcerns`. No change to logging/redaction; the PHI-redaction tests (rcp-00) must still pass unchanged. Do **not** add new PHI keys.
- Extend read/write mapping for the three clusters; add `recording-consent`, `fee-triage-idle`, and `clarification` legacy fixtures to the corpus.

## Acceptance gate

- [x] 12 fields under the three namespaces; helpers + stages + `slot-selection-service` updated; grep-clean of flat keys.
- [x] **Recording-consent → appointment copy** verified by a targeted test (decision/version land on the created appointment).
- [x] PHI annotations preserved on `clarification`; rcp-00 redaction tests unchanged.
- [x] Three legacy fixtures round-trip; golden (`recording_consent_*`, `fee_*`, `complaint_clarification*`) + characterization byte-identical; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change the recording-consent re-pitch cap (1), the 48h deflection TTL (`MEDICAL_DEFLECTION_CONTEXT_TTL_MS`), the clarification attempt cap, or any copy.
- ❌ Don't "fix" PHI handling here — only relocate the fields; handling stays identical.
- ❌ Don't merge `triage` with `serviceMatch` (rcp-16) — they're distinct lifecycles.

## Risks

- **Recording-consent → appointment hand-off.** `recordingConsentDecision`/`Version` are stashed in metadata and copied onto the appointment row inside `processSlotSelectionAndPay` (the row doesn't exist during the IG ask). If the namespaced read misfires there, consent is silently lost or mis-versioned — a compliance issue. Mandatory targeted test.
- **`isRecentMedicalDeflectionWindow` call sites.** It's called from classify/generate weighting and routing predicates; the `Pick<>` signature change ripples. Update every caller to pass `state.triage` (or keep the helper taking full `state` and reading `state.triage?.lastMedicalDeflectionAt`).
- **PHI in fixtures.** The `clarification` legacy fixture will contain PHI-shaped strings — use synthetic data in the committed fixture, never a real patient row.
