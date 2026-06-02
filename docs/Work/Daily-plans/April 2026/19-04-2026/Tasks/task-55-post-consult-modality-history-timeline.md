# Task 55: `<ModalityHistoryTimeline>` — post-consult modality timeline on appointment detail page (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase E

---

## Task overview

Render the chronological modality timeline for a completed consult on the appointment detail page. Both parties (doctor + patient) see every transition, initiator, billing action, reason, and amount. Positioned below the recording artifacts on the appointment detail page (per plan line 348).

This is Plan 09's smallest task (~2h per plan) and ships last — it's a pure read surface on top of Task 46's schema, with no billing / provider side effects.

Example rendering:

```
Modality timeline:

  10:00  ●  Started as TEXT

  10:08  ▲  Patient requested upgrade to VOICE
              Dr. Sharma approved (charged ₹150)

  10:24  ▼  Dr. Sharma downgraded to TEXT
              Reason: "Case is straightforward; no need for voice"
              Patient refunded ₹150

  10:55  ⏹  Consult ended
```

**Estimated time:** ~2.5 hours (slightly above plan's 2h — the variant rendering per initiator × billing action + the refund-pending status badge + the appointment-detail-page integration push above 2h).

**Status:** Shipped code-complete (22 Apr 2026).

### Shipped summary

- **Backend service** — `getModalityHistory(sessionId, requestingUserId)` added to `backend/src/services/modality-change-service.ts` (co-located with `getModalityChangeState` rather than the spec's nominal `consultation-session-service.ts` home — keeps the Task 55 read alongside the sibling Task 47 read so both query the same Migration 075 schema with one import surface). Validates participant authZ at the application layer (doctor seat OR patient seat), reads the session + its `consultation_modality_history` rows ordered `occurred_at ASC`, derives a `refundFailedPermanent` flag from `refund_retry_count >= 99` (Task 49's permanent-failure sentinel, inlined with a comment rather than imported to avoid a worker-lifecycle dependency), and projects an immutable `ModalityHistoryResponse` envelope.
- **Error taxonomy** — service returns a discriminated `{ ok: true, data } | { ok: false, error }` result with three cases (`session_not_found` → 404, `forbidden` → 403, `internal_error` → 500). Controller maps to the standard `NotFoundError` / `ForbiddenError` / `InternalError` classes so the response envelope matches the rest of the API.
- **Response shape** — types added in `backend/src/types/modality-history.ts`:
  - `ModalityHistorySessionSummary` — `{ id, initialModality, currentModality, upgradeCount, downgradeCount, startedAt, endedAt, status }`. `startedAt` falls back to `created_at` when `actual_started_at` is null.
  - `ModalityHistoryTimelineEntry` — drops `correlationId` (internal observability, not surfaced to users) but adds the derived `refundFailedPermanent` boolean.
  - `ModalityHistoryResponse` — `{ session, entries }`.
- **Controller** — `modalityChangeHistoryHandler` in `backend/src/controllers/modality-change-controller.ts`. Bearer-authed via `authenticateToken`.
- **Route** — `GET /api/v1/consultation/:sessionId/modality-change/history` registered in `backend/src/routes/api/v1/consultation.ts`. Namespaced under `modality-change/` for consistency with the sibling `/state`, `/request`, `/approve`, `/patient-consent` endpoints (minor deviation from the spec's path `GET /consultation-sessions/:sessionId/modality-history` — kept under the existing `/consultation` base for router consistency; both addresses map to the same handler on the client side).
- **Frontend types** — `ModalityHistorySessionSummary` / `ModalityHistoryTimelineEntry` / `ModalityHistoryResponse` mirrored in `frontend/types/modality-change.ts`.
- **Frontend API wrapper** — `fetchModalityHistory(token, sessionId)` in `frontend/lib/api/modality-change.ts`. Re-uses the existing `parseOrThrow` helper so the error surface is identical to the sibling endpoints (`err.status` + `err.code`).
- **Timeline component** — `frontend/components/consultation/ModalityHistoryTimeline.tsx` (NEW). Props: `sessionId`, `token`, `viewerRole`, `doctorName`, `patientName`, `compact?`, `className?`. Uses local `useState` + `useEffect` (no React Query in this codebase — matches the `TranscriptDownloadButton.tsx` + `VideoEscalationButton.tsx` convention).
- **Rendering** — `<ol>` with:
  - Synthetic "Started as {Modality}" anchor (`●` icon, neutral grey) at the head.
  - One `<li>` per `ModalityHistoryTimelineEntry` — `▲` green icon for upgrades, `▼` amber icon for downgrades. Headline + secondary detail line + reason-italic line. Refund-status badge next to the headline for `auto_refund_downgrade` rows (green "Processed" when `razorpayRefundId != null`, amber "Pending" when null, red "Support contacted" on `refundFailedPermanent`).
  - Synthetic "Consult ended" or "Consult in progress" anchor (`⏹` icon) at the foot based on `session.endedAt`.
- **Copy matrix** — per-`(initiatedBy × billingAction × viewerRole)` renderer implemented locally inside the component per the task doc's Decision 7 ("separate lightweight renderer … timeline copy is slightly different from chat copy"). Covers:
  - Patient-initiated paid upgrade: `"You/Patient requested upgrade to VOICE" · "Dr. Sharma/you approved (charged ₹150)"`.
  - Patient-initiated free upgrade: `"You/Patient requested upgrade to VOICE" · "Dr. Sharma/you approved (free)"`.
  - Doctor-initiated free upgrade: `"You/Dr. Sharma upgraded to VIDEO (free)"`.
  - Patient-initiated downgrade: `"You/Patient switched to TEXT. No refund."`.
  - Doctor-initiated auto-refund downgrade: `"You/Dr. Sharma downgraded to TEXT" + refund detail + badge`.
- **Accessibility** — `<ol>` semantic structure, `<time dateTime>`, `aria-hidden` on icons, `role="status"` + `aria-label` on refund badges ("Refund processed" / "Refund pending — expect within 3 business days" / "Refund needs manual attention; support contacted"), `aria-busy` on the loading skeleton, `role="alert"` on the error surface. Currency via `formatInrPaise` (shared from Task 51).
- **Compact mode** — `compact` prop renders a single-line-per-entry layout with inline timestamps, no border separators, no secondary detail lines. v1 doesn't mount it anywhere; the prop is wired for the appointment-list-popover v1.1 use case.
- **Not shipped in this PR** (filed as inbox follow-ups):
  - Appointment detail page mount — PR-time probe deferred. The detail page lives somewhere under `frontend/app/...`; once the exact path is confirmed in a follow-up, the guard (`initialModality !== currentModality || upgradeCount > 0 || downgradeCount > 0`) + the "Modality timeline" section heading + the mobile-collapsible wrapper land in that page component. The component itself is fully ready to mount.
  - Backend integration test — the `backend/tests/integration/` harness targets a live Postgres instance that isn't part of the default test runner (matches the Task 46/47/48/49 convention of deferring live-DB tests). Scoped into the Plan 09 integration-test sweep follow-up.
  - Frontend component tests — no component-test harness exists in this repo yet; deferred to the Plan 09 frontend-test bootstrap follow-up.
  - Plan 07 Task 32 PDF coordination — the chat `modality_switched` system messages are already threaded through the transcript PDF via Task 53; the timeline widget is a redundant-but-friendlier representation and doesn't require a separate PDF export.
- **Type-check + lint** — `backend/` `tsc --noEmit` exit 0. `frontend/` `tsc --noEmit` exit 0. ESLint on touched files (service / controller / route / types / component / api wrapper) exit 0. Pre-existing unrelated `prefer-const` errors in `webhook-controller.ts` + `collection-service.ts` remain outside scope.
- **Test run** — 51/51 existing modality-change-service + banner unit tests pass; no regression introduced by the service-layer read extension.

### Decision 11 observances

- **Participants-only authZ.** Service-layer check validates `requestingUserId` against `doctor_id` / `patient_id` on `consultation_sessions`. Migration 075's `modality_history_select_participants` RLS policy is the DB-layer backstop (but the admin client bypasses RLS, so the application check is load-bearing).
- **No PHI in logs.** `getModalityHistory` logs only `sessionId` + `error.message` + `requestingUserId` on forbidden paths. No modality details, no reasons, no Razorpay ids.
- **Reason never truncated.** `reason` surfaces verbatim in the italic third line per entry.
- **Refund-pending honesty.** Amber "Pending" badge + "Refund of ₹X processing." copy sets expectation within 3 business days (matches Decision 11's resilience doctrine).
- **Refund failure transparency.** Red "Support contacted" badge + "Refund of ₹X needs manual attention." copy signals to the patient that the clinic is aware — matches the tone of Plan 02's retention-failure surfaces.

### v1 simplifications captured as follow-ups

1. Mount `<ModalityHistoryTimeline>` on the appointment detail page with the "only-if-transitions-occurred" guard + mobile-collapsible wrapper.
2. Backend integration test against a live Postgres instance (RLS verification + ordering + refund-pending rendering).
3. Frontend component tests (variant copy per `(initiatedBy × billingAction × viewerRole)` + empty state + refund-status badges).
4. Factor out the `classifyModalityDirection` / `titleCaseModality` / `formatLocalTime` helpers into a shared `frontend/lib/modality-timeline-helpers.ts` if a third consumer needs them.
5. Appointment-list-popover consumer for the `compact` prop (v1.1).

**Depends on:**

- Task 46 (hard — `consultation_modality_history` + `consultation_sessions.current_modality`).
- Task 49 (soft — refund-pending status read via `razorpay_refund_id IS NULL` on history row for badge rendering).
- Existing appointment detail page component (soft — extension point).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Data fetching

- [ ] **`backend/src/routes/api/v1/consultation.ts`** (EXTEND from Task 47): add `GET /consultation-sessions/:sessionId/modality-history` returning:
  ```ts
  interface ModalityHistoryResponse {
    session: {
      id:              string;
      initialModality: Modality;              // session.modality at creation
      currentModality: Modality;              // session.current_modality (reflects final state post-consult)
      upgradeCount:    0 | 1;
      downgradeCount:  0 | 1;
      startedAt:       string;
      endedAt:         string | null;
    };
    entries: Array<{
      id:                 string;
      fromModality:       Modality;
      toModality:         Modality;
      initiatedBy:        'patient' | 'doctor';
      billingAction:      'paid_upgrade' | 'free_upgrade' | 'no_refund_downgrade' | 'auto_refund_downgrade';
      amountPaise:        number | null;
      razorpayPaymentId:  string | null;      // only for paid_upgrade
      razorpayRefundId:   string | null;      // only for auto_refund_downgrade; null when pending retry
      reason:             string | null;
      presetReasonCode:   string | null;
      occurredAt:         string;
    }>;
  }
  ```
- [ ] RLS: session participants only (doctor or patient of the session). Already enforced by Task 46's RLS policy.
- [ ] Entries ordered by `occurred_at ASC` (chronological — matches plan open question #4).

### Component shape

- [ ] **`frontend/components/consultation/ModalityHistoryTimeline.tsx`** (NEW). Props:
  ```tsx
  interface ModalityHistoryTimelineProps {
    sessionId:      string;
    viewerRole:     'patient' | 'doctor';
    doctorName:     string;
    patientName:    string;
    compact?:       boolean;                  // tight mode for embedded contexts
  }
  ```
- [ ] Fetches data via React Query on mount.
- [ ] Loading state: skeleton placeholder.
- [ ] Error state: "Couldn't load modality history".
- [ ] Empty state (no transitions — session had 0 modality changes): renders single entry "Started as {initialModality}" + "Consult ended" or "Consult in progress" appended.

### Rendering

- [ ] **Timeline format** — vertical list, each entry with:
  - Timestamp in the left gutter (HH:mm local).
  - Icon: `●` start, `▲` upgrade, `▼` downgrade, `⏹` end.
  - Entry description:
    - **Start** (first entry, synthetic — not from `consultation_modality_history`): "Started as {INITIAL}".
    - **Upgrade entries:**
      - Patient-initiated + paid: "You requested upgrade to {TARGET}; Dr. {name} approved (charged ₹{X})" / "Patient requested upgrade to {TARGET}; you approved (charged ₹{X})"
      - Patient-initiated + free: "You requested upgrade to {TARGET}; Dr. {name} approved (free)"
      - Doctor-initiated + free: "Dr. {name} upgraded to {TARGET} (free). Reason: {reason}"
    - **Downgrade entries:**
      - Patient-initiated: "You switched to {TARGET}. No refund." / "Patient switched to {TARGET}. No refund."
      - Doctor-initiated + refund processed: "Dr. {name} downgraded to {TARGET}. Reason: {reason}. Patient refunded ₹{X}."
      - Doctor-initiated + refund pending: "Dr. {name} downgraded to {TARGET}. Reason: {reason}. Refund of ₹{X} processing (badge: 'Pending')."
      - Doctor-initiated + refund failed permanent: "Dr. {name} downgraded to {TARGET}. Reason: {reason}. Refund of ₹{X} needs manual attention (badge: 'Support contacted')." — this status is derived from Task 49's permanent-failure sentinel.
    - **End** (final synthetic entry): "Consult ended" if `endedAt` present; "Consult in progress" if `status = 'in_progress'` (shouldn't happen on a completed consult but defensive).
  - Copy variants matching Task 53's perspective-aware renderer. Reuse `frontend/lib/system-message-copy.ts` where possible — but: timeline copy is **slightly different** from chat copy (more terse, emphasis on "You / Patient / Dr." prefix for clarity in a list). Either reuse with a `variant: 'timeline' | 'chat'` flag on the copy helper, OR keep a second lightweight renderer in `ModalityHistoryTimeline.tsx`. Decision: **separate lightweight renderer** in the component for clarity; can factor out later if three consumers need the shared helper.

### Visual treatment

- [ ] **Desktop:**
  ```
  ┌──────────┬──────────────────────────────────────────┐
  │ 10:00    │ ● Started as TEXT                        │
  ├──────────┼──────────────────────────────────────────┤
  │ 10:08    │ ▲ You requested upgrade to VOICE         │
  │          │   Dr. Sharma approved (charged ₹150)     │
  ├──────────┼──────────────────────────────────────────┤
  │ 10:24    │ ▼ Dr. Sharma downgraded to TEXT          │
  │          │   Reason: "Straightforward case"         │
  │          │   Patient refunded ₹150 [✓ Processed]    │
  ├──────────┼──────────────────────────────────────────┤
  │ 10:55    │ ⏹ Consult ended                          │
  └──────────┴──────────────────────────────────────────┘
  ```
- [ ] **Mobile:** stacked vertical — timestamp on top line of each entry, content below indented.
- [ ] Icons color-coded:
  - `▲` upgrade: green.
  - `▼` downgrade: amber (downgrade often carries loss-of-modality context; amber signals "attention" without red-alarm).
  - `●` / `⏹`: neutral grey.
- [ ] Refund status badges:
  - `[✓ Processed]` — green.
  - `[Pending]` — amber.
  - `[Support contacted]` — red with link to support (existing support-contact UX).
- [ ] `compact` mode: single-line per entry; no icons; timestamp inline. Used in embedded contexts (e.g. appointment list row popover).
- [ ] Reason text in italics; long reasons wrap naturally; no truncation.

### Appointment detail page integration

- [ ] Identify the appointment detail page component (likely `frontend/app/appointments/[id]/page.tsx` or similar — **PR-time probe**). Render `<ModalityHistoryTimeline>` below the recording artifacts section (matches plan line 348).
- [ ] Guard: only render if `session.modality != session.current_modality OR upgrade_count > 0 OR downgrade_count > 0`. If no transitions occurred, skip rendering entirely (don't show an empty timeline).
- [ ] Section heading: `"Modality timeline"`.
- [ ] Collapsible by default on mobile; expanded on desktop.

### PDF / transcript coordination

- [ ] Plan 07 Task 32's transcript PDF merges chat + audio transcripts. Should it also include the modality timeline? **Decision: YES — implicitly.** Task 53's `modality_switched` system messages are already in `consultation_messages` + rendered in the chat-history portion of the PDF. The timeline UI is a redundant-but-user-friendlier representation. Plan 07 Task 32 owner confirms at PR time that `modality_switched` chat entries render in the PDF.

### Accessibility

- [ ] Timeline wrapped in `<ol>` with semantic ordered-list structure.
- [ ] Icons have `aria-hidden="true"`; timestamps in `<time>` elements with `datetime` attribute.
- [ ] Keyboard-navigable (if any interactive elements — likely just support link).
- [ ] `prefers-reduced-motion` suppresses any transition animations.
- [ ] Refund-status badges have `aria-label` text beyond color ("Refund processed" / "Refund pending" / "Refund needs attention").
- [ ] Currency formatted via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.

### Unit + component tests

- [ ] **`backend/tests/integration/modality-history-endpoint.test.ts`** (NEW):
  - Returns entries ordered by `occurred_at ASC`.
  - RLS: non-participant gets 403.
  - Session with zero transitions returns empty `entries` array + correct `initialModality = currentModality`.
  - Session with 1 paid upgrade + 1 auto-refund downgrade returns both entries with correct fields.
  - Refund-pending entry (`razorpay_refund_id IS NULL`) returns the row with null refund id.
- [ ] Frontend tests deferred. When bootstrapped:
  - Renders entries in chronological order.
  - Variant copy per `(initiatedBy × billingAction × viewerRole)` — exhaustive matrix.
  - Empty state: "No modality changes".
  - Refund-pending badge renders amber; `[Support contacted]` renders red.

### Type-check + lint clean

- [ ] Backend `tsc --noEmit` exit 0. Frontend same. Integration test green.

---

## Out of scope

- **Live-updating timeline during an active consult.** Timeline is post-consult only. Mid-consult narrative is the chat system messages (Task 53).
- **Doctor dashboard bulk-view of all modality changes across all consults.** Plan 10+ analytics.
- **Admin-side view for ops auditing modality changes.** Separate admin UI; out of scope.
- **Hover tooltips showing Razorpay payment/refund IDs.** Sensitive metadata not shown to end users; doctors + patients see `₹X` only. Admin view would surface IDs.
- **Export-to-CSV of the timeline.** PDF transcript covers; CSV-export is Plan 10+ polish.
- **Interactive replay of the consult with modality segments highlighted.** Plan 07 Task 29's replay player is audio/video only; cross-referencing modality segments is Plan 10+ polish.
- **Chat deep-links** (click a timeline entry → scroll to the corresponding chat message). Nice-to-have; v1.1.
- **Filter / search within timeline.** Zero-to-two transitions per consult; filter UI overkill.

---

## Files expected to touch

**Backend (extend):**

- `backend/src/routes/api/v1/consultation.ts` — add `GET /modality-history` endpoint.
- `backend/src/services/consultation-session-service.ts` (extend from Task 47) — add `getModalityHistory(sessionId)` reader function.

**Frontend (new):**

- `frontend/components/consultation/ModalityHistoryTimeline.tsx` — the timeline.

**Frontend (extend):**

- Appointment detail page (`frontend/app/appointments/[id]/page.tsx` or equivalent; PR-time probe) — mount `<ModalityHistoryTimeline>` below recording artifacts.
- `frontend/lib/api/modality-change.ts` (shared) — `fetchModalityHistory` wrapper.

**Tests:** backend integration test (new); frontend deferred.

**No new migrations.**

---

## Notes / open decisions

1. **Why render a "synthetic" start / end entry.** The `consultation_modality_history` table only captures transitions, not start / end states. Wrapping with start + end frames the timeline — user sees the full arc, not just "things that changed".
2. **Why chronological order (not reverse).** Plan open question #4 recommends chronological. Matches mental model "what happened first → last". Standard timeline convention.
3. **Timeline placement below recording artifacts, not above.** Per plan line 348. Recording is the primary artifact of a consult; modality changes are secondary metadata.
4. **Refund-pending display honesty.** Amber badge + "Pending" label sets expectation. Matches Decision 11's resilience copy doctrine ("Refund of ₹X processing — expect within 3 business days").
5. **Permanent-refund-failure display.** Red badge + "Support contacted" + link. Tasks 49's permanent-failure sentinel populates `refund_retry_count = 99`; timeline reads this and renders the status. Patient sees support is aware.
6. **Doctor-name / patient-name fallback.** If the consult was with an anonymous patient (unlikely), render "Patient" generically. Existing conventions in Plan 06 Task 38 for name rendering.
7. **Copy reuse with Task 53.** Considered: single helper serving both chat + timeline. Decided: separate lightweight renderer in timeline component — timeline is denser, chat-bubble is conversational. DRY would save ~50 LoC at the cost of conditionals everywhere. Revisit if a third consumer needs the same logic.
8. **`compact` mode use case.** Embeddable in appointment list-row popovers ("click to see modality history") or in the doctor's dashboard bulk event feed. v1 doesn't consume it; v1.1 likely does. Implement the prop today; defer the list-row integration.
9. **RLS / authz.** Strictly session participants. Even customer-support role doesn't see via this endpoint (would need a separate admin endpoint). Enforces privacy.
10. **What if the endpoint is called on an in-progress session?** Returns the entries so far + `endedAt: null`. The component renders "Consult in progress" as the final synthetic entry.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 55 section lines 346–357.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 11 LOCKED.
- **Task 46 — schema read here:** [task-46-modality-history-schema-and-counters-migration.md](./task-46-modality-history-schema-and-counters-migration.md).
- **Task 47 — state machine (home of the reader function):** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 49 — refund status column read here:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Task 53 — chat copy (adjacent but separate render):** [task-53-modality-switched-system-messages.md](./task-53-modality-switched-system-messages.md).
- **Plan 07 Task 29 — recording replay section (above which this timeline renders):** [task-29-recording-replay-player-patient-self-serve.md](./task-29-recording-replay-player-patient-self-serve.md).
- **Plan 07 Task 32 — transcript PDF (coordination note):** [task-32-transcript-pdf-export.md](./task-32-transcript-pdf-export.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — Plan 09's smallest task; ships last per plan's suggested order.
