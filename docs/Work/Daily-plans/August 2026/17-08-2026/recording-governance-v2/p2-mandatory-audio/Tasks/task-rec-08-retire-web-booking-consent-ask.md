# Task rec-08: Retire the web booking consent ask → disclosure

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 2 · Lane α — **M, ~3h**

---

## Task overview

The public `/book` page shows a pre-checked "Allow this consult to be recorded" checkbox and opens a soft re-pitch modal on the first uncheck. Unchecking it writes `recording_consent_decision = false` — and changes nothing about whether audio is captured. REC-D1 removes the ask: delete the checkbox, delete the modal, delete the write, and put a plain disclosure in their place.

Per [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) this is a **removal**, not a hide. Both components come off disk.

**Estimated time:** ~3h
**Status:** ⏳ **PENDING**
**Hard deps:** none. Independent of rec-07 and rec-09 for the whole wave.
**Source:** REC-D1, REC-D2 (copy gate + "copy sourced from a single constant per surface", batch-plan blocker header).

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — removes existing code and behaviour; follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:**
  - `frontend/components/booking/RecordingConsentCheckbox.tsx` — pre-checked controlled checkbox, exports `RECORDING_CONSENT_VERSION_DISPLAY = "v1.0"` and an inline `RECORDING_CONSENT_SUMMARY` string.
  - `frontend/components/booking/RecordingConsentRePitchModal.tsx` — the soft re-pitch dialog, with `RECORDING_CONSENT_BODY_V1` hand-copied from the backend constant.
  - `frontend/app/book/page.tsx` — imports both (L9, L22–25), holds `recordingConsent` / `hasRePitched` / `rePitchOpen` state (L116 and nearby), calls `postRecordingConsent` after slot selection (L318–330), lists `recordingConsent` in the save callback's dependency array (L372), defines four handlers (L375–397), renders the checkbox section for `mode === "book"` only (L631–645), and mounts the modal at L676–681.
  - `frontend/lib/api.ts` — `postRecordingConsent` (L1466–1508).
- ❌ **What's missing:** any disclosure copy. The patient currently learns about recording only through a consent framing.
- ⚠️ **Notes:** the checkbox renders **only** when `mode === "book"` — reschedules never showed it. The `postRecordingConsent` call is already fail-open (a thrown error is logged and the payment flow continues), so removing it cannot regress the booking path. `RECORDING_CONSENT_VERSION_DISPLAY` is imported into `page.tsx` from the checkbox module and dies with it.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. Well-bounded frontend removal plus one new static copy block; no new primitive, no state machine.

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D1 (why the ask goes), **REC-D2 (why the copy is gated)**, §Attestation clause 3 and 4 (the 90-day access + replay-notification promises the disclosure should lead with).
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — the **REC-D2 blocker header** (it is the source of the single-copy-constant rule) and REC2-D9.
- [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) — the audit / map-impact / remove-obsolete checklist.
- `frontend/app/book/page.tsx` — the whole file (~700 lines). The consent touch points are L9, L22–25, L116, L318–330, L372, L375–397, L631–645, L676–681.
- `frontend/components/booking/RecordingConsentCheckbox.tsx` — whole file (~115 lines), for the copy you are replacing and the `RECORDING_CONSENT_VERSION_DISPLAY` export.
- `frontend/components/booking/RecordingConsentRePitchModal.tsx` — whole file (~115 lines).
- `frontend/lib/api.ts` — `postRecordingConsent` L1466–1508. **Do not touch `getRecordingConsentForSession` at L1510–1530** — that is rec-10's, in a later wave.
- [`FRONTEND_STANDARDS.md`](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md) and [`DEFINITION_OF_DONE_FRONTEND.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md).

**Estimated turns:** 3–4.

---

## ✅ Task breakdown (hierarchical)

### 1. Audit (CODE_CHANGE_RULES step 1 — do this before editing)

- [ ] 1.1 Grep the frontend for every reference: `RecordingConsentCheckbox`, `RecordingConsentRePitchModal`, `RECORDING_CONSENT_VERSION_DISPLAY`, `postRecordingConsent`, `recordingConsent`, `hasRePitched`, `rePitchOpen`
- [ ] 1.2 Confirm the two components have exactly one importer each (`app/book/page.tsx`) and no test or story references them
- [ ] 1.3 Confirm `postRecordingConsent` has exactly one caller
- [ ] 1.4 Write the impact list into this file's Notes before making the first edit

### 2. Disclosure copy (the replacement)

- [ ] 2.1 Introduce the disclosure text as a **single named constant in one place** (REC-D2 blocker header). One string, one module. No duplication across components, no inline JSX prose
- [ ] 2.2 Mark the constant clearly as **owner-supplied, pending REC-D2 counsel sign-off**. If the owner has not yet supplied final wording, seed it from the charter's REC-D1 framing and label it a draft in a comment that names REC-D2 and rec-12
- [ ] 2.3 Content requirements for the copy (the copy itself is the owner's; these are the constraints it must satisfy):
  - [ ] 2.3.1 States that every consult is audio-recorded as part of the medical record
  - [ ] 2.3.2 Does **not** imply a choice, an opt-out, a toggle, or a "by continuing you agree" consent framing. It is a disclosure, not a consent (this is the whole point of REC-D1)
  - [ ] 2.3.3 Leads with the patient's benefit — same access the doctor has, self-serve for 90 days (charter clause 3), and the doctor's replays are logged and notified to them (clause 4). The charter names clause 4 as the trust-earning line; surface it
  - [ ] 2.3.4 Says nothing about video. Video consent is per-instance and survives untouched (REC2-D9); mentioning it here would confuse two different regimes
  - [ ] 2.3.5 Does not restate the retired 90-day *download* affordance. The old checkbox copy said "review or download"; streaming-only is charter clause 5. Do not carry the download promise forward
- [ ] 2.4 Render it where the checkbox was, for `mode === "book"` only — matching the existing conditional. Reschedules keep their current UI; the original booking's disclosure stands
- [ ] 2.5 Presentation: informational, not an alert. No red, no warning iconography, no dismiss control. It must not read as something the patient is being asked to act on

### 3. Remove the ask

- [ ] 3.1 Delete `frontend/components/booking/RecordingConsentCheckbox.tsx` from disk
- [ ] 3.2 Delete `frontend/components/booking/RecordingConsentRePitchModal.tsx` from disk
- [ ] 3.3 In `app/book/page.tsx`, remove — not comment out — every one of:
  - [ ] 3.3.1 Both component imports and the `RECORDING_CONSENT_VERSION_DISPLAY` import
  - [ ] 3.3.2 The `postRecordingConsent` import
  - [ ] 3.3.3 The `recordingConsent`, `hasRePitched` and `rePitchOpen` state
  - [ ] 3.3.4 The `postRecordingConsent` call block and its surrounding `try`/`catch` and comment
  - [ ] 3.3.5 `recordingConsent` from the save callback's dependency array
  - [ ] 3.3.6 All four handlers: consent change, first decline, keep-recording-on, continue-without
  - [ ] 3.3.7 The checkbox `<section>` and the modal mount
- [ ] 3.4 Remove `postRecordingConsent` from `frontend/lib/api.ts`, including its doc comment
- [ ] 3.5 Verify no `appointmentId`-only code path is left dangling — the `appointmentId` destructured from the slot-selection response was used **only** to feed the consent write. If it now has no consumer, remove it from the destructure too (CODE_CHANGE_RULES: no unused values)
- [ ] 3.6 Grep again: zero results for every symbol from step 1.1

### 4. Verification

- [ ] 4.1 `npm run type-check` green in `frontend/`
- [ ] 4.2 `npm run lint` green in `frontend/` — expect unused-import/variable errors to be the signal that a removal was missed
- [ ] 4.3 Frontend tests green; no test referenced the deleted components, but re-run to be sure
- [ ] 4.4 Manual smoke, once: open `/book` in `book` mode → disclosure visible, no checkbox, no modal, slot selection and the payment redirect behave exactly as before
- [ ] 4.5 Manual smoke, once: open `/book` in `reschedule` mode → unchanged from today

---

## 📁 Files to create/update

```
frontend/components/booking/RecordingConsentCheckbox.tsx        DELETE
frontend/components/booking/RecordingConsentRePitchModal.tsx    DELETE
frontend/app/book/page.tsx                                      UPDATE (remove ask, add disclosure)
frontend/lib/api.ts                                             UPDATE (remove postRecordingConsent only)
<one module holding the disclosure constant>                     NEW or UPDATE
```

**Existing code status:**
- ⚠️ `frontend/app/book/page.tsx` — EXISTS; eight distinct consent touch points to remove, one disclosure block to add
- ⚠️ `frontend/lib/api.ts` — EXISTS; remove `postRecordingConsent` **only**
- ✅ `frontend/components/booking/RecordingConsentCheckbox.tsx` — EXISTS; delete
- ✅ `frontend/components/booking/RecordingConsentRePitchModal.tsx` — EXISTS; delete

**When updating existing code:** (MANDATORY)
- [ ] Audit current implementation (files, callers, config) — [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map desired change to concrete changes (what to add, change, remove)
- [ ] Remove obsolete code (dead state, dead handlers, dead API wrapper, dead imports)
- [ ] Update tests and docs where behaviour changed

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **Disclosure, not consent.** No checkbox, no toggle, no "I agree", no acknowledge button, no dismiss. If the patient can interact with it, it is a consent surface and REC-D1 is not satisfied.
- **One copy constant (REC-D2 blocker header).** The current implementation hand-copied the consent body from the backend into the modal, which is exactly how consent text drifts across surfaces. Do not repeat that: one constant, one home, imported once.
- **The wording is not yours to finalise (REC-D2).** Ship the plumbing; label the draft; let rec-12's gate promote it. Do not remove the draft marker because the copy "looks fine".
- **No new network call.** The disclosure is static. Do not add an endpoint to fetch policy text.
- **No behaviour change to booking.** Slot selection, catalog pick, payment redirect, queue-token flow and reschedule mode must be byte-for-byte equivalent in behaviour. The only diff a patient can perceive is the consent UI becoming a disclosure.
- **Delete, do not park.** No commented-out JSX, no `// legacy consent` blocks, no feature flag holding the checkbox in reserve ([`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) "Avoid Leaving Dead Code").
- Follow [`FRONTEND_STANDARDS.md`](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md) for component and copy placement; keep the existing Tailwind idiom on the page rather than introducing a new card style.
- No PHI or consent decision in any `console` call ([`COMPLIANCE.md`](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)).

**DO NOT include code or pseudo-code when planning this task.** The line references above are navigation aids, not a diff.

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **No** new reads/writes — this task *removes* a write path. No schema change.
  - RLS verified: N/A (no data access added).
- [ ] **Any PHI in logs?** Must be **No.** The removed `console.warn("[book] failed to record consent")` goes with the call; do not add a replacement log that pairs a consent state with an appointment id.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.** Existing `recording_consent_*` values are untouched (REC-D3); this task simply stops adding new ones from the web surface.

---

## ✅ Acceptance criteria

### 1. The ask is gone

- [ ] `rg "RecordingConsentCheckbox|RecordingConsentRePitchModal|RECORDING_CONSENT_VERSION_DISPLAY" frontend/` returns **zero** results.
- [ ] Both component files are absent from disk (not emptied, not renamed).
- [ ] `rg "postRecordingConsent" frontend/` returns **zero** results.
- [ ] `rg "hasRePitched|rePitchOpen" frontend/` returns **zero** results.
- [ ] No commented-out consent JSX or handler remains in `app/book/page.tsx`.

### 2. The disclosure is there

- [ ] `/book` in `book` mode renders the disclosure in the position the checkbox occupied.
- [ ] The disclosure has **no interactive control** — nothing to check, toggle, dismiss or acknowledge.
- [ ] The copy lives in exactly one constant, in one module, imported once.
- [ ] The constant carries a comment naming **REC-D2** and stating the wording is owner-approved and pending counsel sign-off.
- [ ] The copy does not promise a download, does not mention video, and does not use consent language ("agree", "allow", "consent to", "by continuing").
- [ ] `/book` in `reschedule` mode is visually and behaviourally unchanged.

### 3. Booking still works

- [ ] Slot selection → payment redirect works unchanged.
- [ ] Queue-mode "Join queue" → token success state works unchanged.
- [ ] Reschedule works unchanged.
- [ ] No unused variable, import or destructured field remains (lint proves this).

### 4. Verification

- [ ] `frontend` typecheck green.
- [ ] `frontend` lint green.
- [ ] `frontend` tests green.

### Out of scope

- `getRecordingConsentForSession` and the `SessionStartBanner` that consumes it — **rec-10**, and it is in a later wave. Touching `frontend/lib/api.ts` beyond removing `postRecordingConsent` will collide.
- The Instagram DM consent ask, its copy builders and the conversation-state namespace — **rec-09**, running in the parallel lane right now. **Do not open any `backend/` file.**
- The backend `POST /:id/recording-consent` route, its Zod schema and `captureBookingConsent` — **rec-10**. Leave the endpoint live and unreferenced for one wave; a 404-on-call is not possible because the only caller is being removed here.
- The doctor attestation surface — **rec-11**.
- Any change to Twilio recording behaviour.
- Restyling the booking page.

---

## Scope Guard

- **Expected files touched: 4–5** — 2 deletions, `app/book/page.tsx`, `frontend/lib/api.ts`, and (at most) one module for the disclosure constant.
- **DO NOT TOUCH:**
  - **Any file under `backend/`.** rec-09 is running in the parallel lane and owns the backend consent removal for this wave. A backend edit here breaks the lane independence the exec-order depends on.
  - `frontend/lib/api.ts` beyond `postRecordingConsent` — specifically leave `getRecordingConsentForSession` and `RecordingConsentForSessionData` alone (rec-10).
  - `frontend/components/consultation/SessionStartBanner.tsx`, `VideoRoom.tsx`, `LiveConsultPanel.tsx` (rec-10).
  - `frontend/components/consultation/VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx` — **video consent survives** (REC2-D9, p4).
  - The slot grid, catalog picker, payment redirect and queue-token flow on the booking page.
- **Cross-layer note:** this task is **frontend-only by design.** The phase as a whole is cross-layer, and this task's slice of it is enumerated above; that enumeration is the surfacing `.cursor/rules/00-agent-contract.mdc` requires. If a change here appears to need a backend edit, **STOP and surface** rather than reaching across — it almost certainly belongs to rec-09 or rec-10.
- **Hard stops:** any migration; any backend file; any change to video consent.

---

## Done when

Both consent components are deleted from disk, `app/book/page.tsx` has no consent state, handlers, imports, render or write path left, `postRecordingConsent` is gone from `frontend/lib/api.ts`, and a non-interactive disclosure — sourced from one owner-supplied constant marked pending REC-D2 — renders in the checkbox's old position for fresh bookings. Reschedule mode, slot selection, payment redirect and queue-token flow are unchanged. Frontend typecheck, lint and tests are green, and `rg` returns zero results for every retired symbol.

---

## 📝 Notes

- **Impact list from step 1.4:** _(fill in during execution)_
- The old modal's dismiss-equals-decline mapping was a deliberate dark-pattern avoidance choice. It has no successor because there is no longer a decision to dismiss — worth recording here so a future reader does not read the deletion as a regression.

---

## 🔗 Related tasks

- [`task-rec-09-retire-dm-consent-funnel-stage.md`](./task-rec-09-retire-dm-consent-funnel-stage.md) — the parallel lane; same reversal on the Instagram channel
- [`task-rec-10-remove-downstream-consent-gates.md`](./task-rec-10-remove-downstream-consent-gates.md) — removes the route this page used to call
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md)

---

**Last Updated:** 2026-08-17
**Pattern:** consent-surface removal → static disclosure, single copy constant
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/PHASED-PLANS-GUIDE.md` §7
