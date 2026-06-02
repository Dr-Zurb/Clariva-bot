# Task video-D4: Patient rating + free-text feedback (existing service-reviews surface)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch D (T4 post-call) — **S item, ~4h**

---

## Task overview

Patient feedback signals quality. T4.30 reuses the existing `service-reviews` surface (post-appointment rating already shipped for non-consult interactions) and surfaces it as the post-call rating prompt for video consults.

Patients see a small "Rate your consult" prompt INSIDE the D1 post-call summary OR as a standalone modal that appears 2 seconds after summary mount.

**Decision §20** — skipping the rating is acceptable (matches voice T4.26 deferral doctrine — don't gate anything on rating).

**Cheapest item in Sub-batch D.** Mostly wiring.

**Estimated time:** ~4h.

**Status:** ⏸ **Deferred (2026-05-01)** — execution-time audit found the task's HARD dep does not exist in this codebase. See "Audit finding (2026-05-01)" below for the unblock checklist.

**Depends on:** existing service-reviews infrastructure (HARD — audit at execution time).

---

## Audit finding (2026-05-01)

The task assumed an existing patient-feedback `service-reviews` surface. The execution-time audit found the assumption is false:

1. **The codebase's `service-reviews` is the wrong surface.** `frontend/app/dashboard/service-reviews/page.tsx`, `frontend/components/service-reviews/ServiceReviewsInbox.tsx`, `backend/src/services/service-staff-review-service.ts`, and migrations `040_service_staff_review_requests.sql` / `041_service_staff_review_timeout_notify.sql` / `042_staff_review_sla_deadline_nullable.sql` / `047_staff_review_sla_breach.sql` belong to **ARM-07 — the back-office workflow where staff confirm / reassign AI-proposed catalog matches**. It has nothing to do with patient post-consult feedback.
2. **No patient-rating table exists.** Migrations `001` → `085` contain zero rating-shaped schema. There is no `consult_ratings`, no `appointment_ratings`, no `service_reviews` table for patient feedback.
3. **No `<PatientRatingPrompt>` / `<PostCallSummary>` component exists.** The task's named mount points (`CallPostCallSummary.tsx`, `frontend/components/reviews/PatientRatingPrompt.tsx`) do not exist. The post-call summary itself is being built by D.2 in this same execution order (`task-video-D1-post-call-summary.md`).
4. **No patient-facing appointment surface exists.** `/dashboard/appointments/:id` is doctor-only. Patients have no self-service way to revisit a past appointment, so the spec's "render at `appointments/:id` for patient view" mount point has no surface to live on.
5. **Voice T4.26 (the sibling task) was already deferred for the same wrong-assumption reason.** The voice batch's deferral note ("service-reviews already covers it") was incorrect; that doctrine is now corrected.

**Per decision §20** (rating is optional; no other task gates on it), this task is non-blocking. Deferring it is the correct call until the prerequisite infra exists.

**Unblock checklist:**

- [ ] D.2 (`task-video-D1-post-call-summary`) ships and creates a `<CallPostCallSummary>` mount point.
- [ ] Either (a) a patient-facing post-call surface exists (e.g. a `/c/post-call/[appointmentId]` link sent via SMS after the call ends), OR (b) the rating prompt is mounted inside the doctor-built summary and patients see it via the same in-call browser tab right after `<CallDisconnectSplash>`.
- [ ] Product decides single-shot link vs in-tab vs both (decision needed; not currently captured in §20).
- [ ] When unblocked, scope-up estimate is **L (~2 days)** — not the original S/~4h — because the audit shows it is greenfield: new table + RLS + service + endpoints + component + mount + tests.

**Promote back to active when:** D.2 ships AND product confirms the patient surface (in-tab vs SMS link).

---

**Source:** [T4 §T4.30](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md); [decision §20](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts).

---

## Acceptance criteria

### Audit existing service-reviews surface

- [ ] Locate existing `service-reviews` component / service / table in the codebase. Likely lives at `frontend/components/reviews/...` and `backend/src/services/service-reviews-service.ts` (audit at execution time).
- [ ] Verify the surface accepts a generic `serviceContext: { type: 'video-consult', sessionId: string, doctorId: string }` or extend it.

### Rating prompt component

- [ ] **New (or reuse) `<PatientRatingPrompt>`** component:
  - 1-5 star selector.
  - Optional free-text feedback field (placeholder: "Anything specific to share with Dr. Sharma?").
  - Submit + Skip buttons.
  - On submit → POST to existing service-reviews endpoint with the consult context.

### Mount points

- [ ] **D1 post-call summary** — mount `<PatientRatingPrompt>` inline below the CTAs OR as a small banner at the top.
- [ ] **`appointments/:id`** — for patient view; render if not yet rated.
- [ ] Once rated, hide the prompt (read flag from existing service-reviews row).

### Doctor-side visibility

- [ ] **Doctor never sees rating in-call** (anonymized; aggregated stats elsewhere if existing dashboard surfaces them).
- [ ] No new dashboard surface for video-specific ratings (out of scope; existing service-reviews dashboards apply).

### Manual smoke

- [ ] Patient ends call → summary mounts with rating prompt.
- [ ] Patient picks 4 stars + types feedback → Submit → confirmation toast.
- [ ] Refresh / re-visit summary → rating prompt no longer shows (already rated).
- [ ] Skip → rating not stored; prompt may re-appear on appointment detail page.
- [ ] Doctor opens the appointment → no rating UI surfaces in-doctor view (privacy boundary).

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No regression on existing service-reviews flows.

---

## Out of scope

- **Required rating** (cannot dismiss). Out of scope; rating is opt-in.
- **Public review surface** (Yelp-style). Out of scope; existing service-reviews handles its own visibility.
- **Auto-prompt on subsequent app open if not rated.** Out of scope; one-shot at summary mount.
- **Doctor reply to rating.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/CallPostCallSummary.tsx` — **edit** (~15 LOC: mount rating prompt for patient).
- `frontend/components/reviews/PatientRatingPrompt.tsx` — **reuse or new** (~80 LOC if new; otherwise wire only).

**Backend:** existing service-reviews endpoints (no new code expected; audit at execution time).

**Migrations / tests:** none in this task.

---

## Notes / open decisions

1. **Decision §20** — rating is optional; matches voice T4.26 deferral doctrine.
2. **Existing surface audit** — locate the service-reviews component / endpoint at execution time; confirm it accepts a generic `serviceContext`.
3. **Modality column** — if service-reviews stores `service_type`, extend with `'video-consult'` value (one-line type extension).
4. **Patient privacy** — doctors never see individual ratings in-call.
5. **Locale for prompt copy** — match existing service-reviews locale; en-GB consistent.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch D](../Plans/plan-video-consult-selected-features.md#sub-batch-d--post-call-3-days)
- **Source item:** [T4 §T4.30](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
- **Decision:** [§20 — rating optional](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts)
- **Sibling (voice):** voice T4.26 (deferred — service-reviews already covers it for now)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ⏸ Deferred (2026-05-01) — execution-time audit invalidated the "S/~4h, mostly wiring" framing; the assumed `service-reviews` infra is the wrong surface (it's ARM-07 back-office). Real scope is L/~2 days greenfield. Non-blocking (decision §20). Promote back to active once D.2 ships AND product confirms patient-side mount surface.
