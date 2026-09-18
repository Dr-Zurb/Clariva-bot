# Task rec-11: Doctor attestation service + first-consult gate

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 4 — **L, ~5h**

---

## Task overview

REC-D1 takes a choice away from the patient. REC-D4 is what stops that being a one-sided platform imposition: before their first consult, the doctor accepts a **versioned six-clause attestation** — audio is always recorded, they can never delete it, the patient has equal access, their replays are logged and notified, streaming only, and video needs consent every time.

This task ships the service, the endpoint, the acceptance surface and the gate over rec-07's table. The six clauses come **verbatim** from the charter §Attestation — they are not paraphrased, reordered or softened, and the policy version string is supplied by the owner (REC-D2), never invented here.

**The gate has to be server-side.** The onboarding checklist is guidance and explicitly skippable (ONB-D4, `getting-started/page.tsx:3`), and a disabled button in `ConsultationLauncher` is a UX affordance, not an authorization boundary. `startConsultationHandler` is where the block lives; the UI explains it.

**Estimated time:** ~5h
**Status:** coding landed 2026-08-23 — not Closed (REC-D2 draft version; rec-12 owns promotion)
**Hard deps:** **[`rec-07`](./task-rec-07-migration-doctor-recording-attestation.md) merged** — this task reads its table and imports its row type, and re-derives nothing about the schema. [`rec-10`](./task-rec-10-remove-downstream-consent-gates.md) merged, because both edit `consultation-controller.ts` and `utils/validation.ts` and this task must land on the post-deletion versions.
**Source:** REC-D4, REC-D2 (version string), REC2-D2 (append-only), charter §Attestation.

**Change Type:**
- [x] **New feature** — new service, endpoint and surface over an existing table
- [ ] **Update existing** — with the exception of the gate inserted into `startConsultationHandler` and the onboarding checklist entry

**Current State:**
- ✅ **What exists:**
  - rec-07's attestation table, its row type and its content-sanity test. RLS enabled, zero policies, service-role access only (REC2-D4).
  - The closest end-to-end precedent for a doctor-scoped gating capability: `services/doctor-verification-service.ts` + `types/doctor-verification.ts` + `frontend/app/dashboard/get-verified/page.tsx` (30 lines, a thin server wrapper).
  - **The server-side enforcement point:** `startConsultationHandler` (`controllers/consultation-controller.ts:136`) with `startConsultationBodySchema` (`utils/validation.ts:617`).
  - **The client affordance:** `ConsultationLauncher.tsx` — `canStartConsultation` (L270–272) and the per-modality `disabledReason` / `isDisabled` logic (L767–790) already render a reasoned disabled state with a tooltip. The gate reuses that shape rather than inventing a modal.
  - **The onboarding checklist:** `frontend/app/dashboard/getting-started/page.tsx` (27 lines) → `GettingStartedClient.tsx` → `buildGoLiveChecklist(onboarding.data, verificationStatus)` from `components/dashboard/onboarding/onboarding-steps`. Today five steps, verification being step 1.
- ❌ **What's missing:** the service, the read/write endpoints, the acceptance UI, the checklist entry and the gate.
- ⚠️ **Notes:** there is **no `doctors` table** — a doctor is the `auth.users` row. The checklist is skippable by design, which is exactly why the checklist is discovery and `startConsultationHandler` is enforcement. Do not weaken one to compensate for the other.

---

## Model & execution guidance

**Recommended model:** Sonnet.

The hard parts are already decided elsewhere: rec-07 locked the schema and the RLS posture, REC2-D2 locked append-only-per-version, the charter fixed the clause text, and the owner supplies the version string. What remains is a service + endpoint + UI over a locked table, following the `doctor-verification` precedent, plus one guard inserted into an existing handler. Well-bounded wiring against fixed contracts.

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — **REC-D4 and §Attestation in full.** The six clauses are the contract; copy them exactly.
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — the **REC-D2 blocker header** (gate item 3 is the policy version string) and REC2-D2.
- [`rec-07`](./task-rec-07-migration-doctor-recording-attestation.md) **as merged** — read its Notes for the derived migration number, and its migration file for the exact column names. Consume; do not re-derive.
- `backend/src/services/doctor-verification-service.ts` — the structural precedent for a doctor-scoped service.
- `backend/src/types/doctor-verification.ts` — **the whole file (84 lines)**, the type + doc-comment style rec-07 mirrored.
- `backend/src/controllers/consultation-controller.ts` — **L120–200** (`startConsultationHandler` end to end), and note it is post-rec-10, so `getRecordingConsentForSessionHandler` is already gone.
- `backend/src/utils/validation.ts` — **L610–625** (`startConsultationBodySchema`) and one nearby schema for house style.
- `frontend/components/consultation/ConsultationLauncher.tsx` — **L240–275** and **L750–800**. The existing disabled-with-reason pattern is what the gate should look like.
- `frontend/components/dashboard/onboarding/GettingStartedClient.tsx` and `components/dashboard/onboarding/onboarding-steps` — `buildGoLiveChecklist`'s step shape.
- `frontend/app/dashboard/get-verified/page.tsx` — the thin-server-page precedent for the acceptance route.
- [`STANDARDS.md`](../../../../../../../Reference/engineering/development/STANDARDS.md), [`FRONTEND_STANDARDS.md`](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md), [`CONTRACTS.md`](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

**Estimated turns:** 6–8.

---

## ✅ Task breakdown (hierarchical)

### 1. The policy version (do this first — it blocks everything)

- [ ] 1.1 Obtain the **owner-approved policy version string**. REC-D2 gate item 3. **Do not invent one, do not reuse `v1.0` from the retired patient consent constant, do not derive one from a date or a git hash**
- [ ] 1.2 If the owner has not supplied it, seed a clearly-marked draft in the single constant and record the blocker in Notes and in rec-12's gate. Code may land behind it; it must not ship
- [ ] 1.3 Define the active version in **one** constant that both the service and the UI read. Two sources of truth for this value is how a doctor ends up attesting to a version the gate does not check

### 2. The clauses

- [ ] 2.1 Transcribe the six clauses **verbatim** from the charter §Attestation into one constant. No paraphrase, no reordering, no added preamble, no softening
- [ ] 2.2 Charter guidance: clause 4 (replays are logged and the patient is notified) does the heavy lifting for trust — lead with it in presentation, without changing the stored order
- [ ] 2.3 Add a test that pins the clause text and count. If a future edit drifts the wording, that test is the only thing standing between us and doctors attesting to something the charter never said
- [ ] 2.4 The clauses are **not configurable and not individually checkable.** One acceptance covers all six; per-clause opt-out contradicts REC-D4

### 3. Service

- [ ] 3.1 New service module mirroring `doctor-verification-service.ts` in structure and doc-comment style
- [ ] 3.2 A read: does an accepted row exist for this doctor at the currently-active version? Returns the acceptance state and, when accepted, the timestamp and version
- [ ] 3.3 A write: record acceptance for (doctor, active version). **Append-only (REC2-D2)** — re-accepting the same version is idempotent and must never rewrite `accepted_at` or `policy_version`. No `ON CONFLICT … DO UPDATE`
- [ ] 3.4 Accepting an older version does not satisfy the gate; the gate asks only about the active version. A doctor who accepted v1.0 keeps that row forever and accepts v1.1 as a **new** row
- [ ] 3.5 The service writes the version from the constant, never from client input — otherwise a doctor can self-attest to a version that does not exist
- [ ] 3.6 Typed `AppError` subclasses only, never a raw `Error`. No Express types imported. No `process.env` — config via `config/env.ts`
- [ ] 3.7 Tests: not-accepted; accepted-at-active; accepted-at-older-only (must not satisfy); double-accept writes one row

### 4. Endpoint

- [ ] 4.1 A read endpoint returning acceptance state plus the active version and the clauses, and a write endpoint recording acceptance. Authenticated doctor only; the doctor id comes from the token, **never** from the body or a path param
- [ ] 4.2 Mount on the existing doctor-facing router alongside its neighbours; match the surrounding auth middleware and rate limiting
- [ ] 4.3 Controller **orchestrates only** — validate, call service, respond via `successResponse`. **No DB access in the controller**
- [ ] 4.4 `asyncHandler` wraps every handler. **No try/catch in controllers** — the global middleware maps errors
- [ ] 4.5 All external input validated with **Zod** in the controller before the service is called, schema in `utils/validation.ts` beside its siblings
- [ ] 4.6 Tests: unauthenticated is rejected; a doctor cannot accept on behalf of another doctor

### 5. The gate — server-side first

- [ ] 5.1 Insert the check into `startConsultationHandler`. Without an accepted row at the active version, the consult **does not start**, and the error is a typed `AppError` distinguishable from other failures so the client can render the right message
- [ ] 5.2 Verify the gate fires for **every** modality that routes through this handler — the mandate is audio, and audio is on for voice and video alike
- [ ] 5.3 Decide and record whether the gate applies to every consult or only until first acceptance. **Recommendation: check on every start.** It is the same single indexed read, it costs nothing, and it makes a version bump self-enforcing rather than needing a backfill. Justify in Notes if you choose otherwise
- [ ] 5.4 Confirm the gate does not fire for patient-side session joins — a patient must never be blocked by a doctor's outstanding attestation
- [ ] 5.5 Tests: no row → blocked; row at active version → starts; row at older version only → blocked

### 6. Acceptance surface + onboarding

- [ ] 6.1 A dashboard route rendering the six clauses and a single accept action, following the thin-server-page shape of `get-verified/page.tsx`
- [ ] 6.2 Present clauses as plain, readable text. No accordion hiding a clause, no pre-scrolled-past small print, no per-clause checkbox
- [ ] 6.3 The accept action is explicit and deliberate — never auto-accept on page view, and never bundle acceptance into another form's submit
- [ ] 6.4 After acceptance, show the accepted version and timestamp so the doctor can see their own record
- [ ] 6.5 Add the attestation to `buildGoLiveChecklist` as a step, with its completion driven by the read endpoint. This is **discovery** — the checklist stays skippable (ONB-D4) and the server gate is what actually blocks
- [ ] 6.6 In `ConsultationLauncher`, extend the existing `disabledReason` logic so an unattested doctor sees a reasoned disabled launcher that **deep-links to the acceptance route**. Do not add a blocking modal; match the pattern already at L767–790
- [ ] 6.7 A doctor who hits the server gate anyway (stale tab, direct API call) gets an actionable message, not a bare 500

### 7. Verification

- [ ] 7.1 `npm run type-check` and `npm run lint` green in `backend/` and `frontend/`
- [ ] 7.2 Test suites green in both workspaces
- [ ] 7.3 End-to-end by hand: fresh doctor → launcher disabled with reason → accept → consult starts. Re-accept is a no-op with one row
- [ ] 7.4 Confirm exactly **zero** new files in `backend/migrations/`

---

## 📁 Files to create/update

```
backend/src/services/<doctor-recording-attestation>-service.ts   NEW
backend/src/controllers/…                                        UPDATE or NEW (read + accept handlers)
backend/src/routes/api/v1/…                                      UPDATE (mount both)
backend/src/utils/validation.ts                                  UPDATE (accept-body schema)
backend/src/constants/<recording-attestation>.ts                 NEW (version + six clauses)
backend/src/controllers/consultation-controller.ts               UPDATE (the gate, in startConsultationHandler)
frontend/app/dashboard/<attestation-route>/page.tsx              NEW
frontend/components/… (acceptance surface + hook)                NEW
frontend/components/dashboard/onboarding/onboarding-steps        UPDATE (checklist step)
frontend/components/consultation/ConsultationLauncher.tsx        UPDATE (disabledReason + deep link)
frontend/lib/api.ts                                              UPDATE (two wrappers)
backend/tests/… + frontend tests                                 NEW
```

**Existing code status:**
- ✅ rec-07's migration, row type and test — EXIST. **Consume, do not modify.**
- ⚠️ `consultation-controller.ts`, `validation.ts`, `ConsultationLauncher.tsx`, `onboarding-steps`, `frontend/lib/api.ts` — EXIST, need additive updates
- ❌ Everything else above — MISSING (this task)

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **The clauses are verbatim (charter §Attestation).** Six, in order, unedited. If the charter's wording seems wrong, that is a charter conversation, not an in-flight edit.
- **The version string is owner-approved (REC-D2).** An agent-authored version is the one failure this phase's blocker section exists to prevent.
- **Append-only per (doctor, version) (REC2-D2).** An attestation is a legal artifact. Overwriting a doctor's v1.0 acceptance destroys the evidence that they accepted v1.0 while running consults under v1.0 — the same property REC-D3 preserves on the patient side.
- **Server-side enforcement is the gate; the UI is the explanation.** The checklist is skippable by design and a disabled button is not authorization. Both surfaces are required, and neither substitutes for the other.
- **Not skippable, not configurable, no per-clause opt-out** (REC-D4).
- **No migration.** rec-07 owns the phase's only one (REC2-D1). If this task believes it needs a column, **STOP and surface** — that is a signal rec-07 was mis-specced, not something to patch in-flight.
- **No RLS policy.** rec-07 deliberately left the table policy-free with service-role access (REC2-D4). This service runs service-role. An `auth.uid()`-keyed policy is a **STOP-and-surface**.
- **No PHI anywhere near this feature** ([`COMPLIANCE.md`](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)). It holds no patient data. Log the doctor id and the version at most; never log an acceptance beside a patient, appointment or session identifier.
- **Never block the patient.** A doctor's missing attestation must not surface to a patient or prevent a patient joining.
- Controllers orchestrate only; services own business rules; no Express types in services ([`STANDARDS.md`](../../../../../../../Reference/engineering/development/STANDARDS.md), [`ARCHITECTURE.md`](../../../../../../../Reference/engineering/architecture/ARCHITECTURE.md)).

**DO NOT include code, pseudo-code, schemas or function signatures in this task file.**

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **Yes** — reads and inserts into rec-07's attestation table.
  - [ ] **RLS verified?** **Yes** — RLS enabled with zero policies, service-role access only, per rec-07. **Unchanged by this task.**
- [ ] **Any PHI in logs?** Must be **No.** Doctor id and policy version at most; never beside a patient or session identifier.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Yes, inherited** — rec-07's `ON DELETE CASCADE` means acceptance rows disappear with the doctor's account, matching `183_doctor_verification.sql`. This task adds no new retention behaviour.

---

## ✅ Acceptance criteria

### 1. The gate holds

- [ ] A doctor with no attestation row for the active version **cannot start a consult.** The block is enforced in `startConsultationHandler`, not only in the UI.
- [ ] A doctor whose only row is at an **older** version is blocked.
- [ ] Accepting unblocks immediately, with no redeploy, cache flush or re-login.
- [ ] The gate applies to every modality routed through the handler.
- [ ] A **patient** is never blocked by a doctor's missing attestation.
- [ ] Bypassing the UI and calling the endpoint directly is still blocked.

### 2. The clauses and the version

- [ ] All six clauses render **verbatim** from the charter §Attestation, in order, with none omitted, merged or paraphrased.
- [ ] A test pins the clause text and count.
- [ ] The active version comes from a single constant read by both service and UI.
- [ ] The version is **owner-approved**, or clearly marked draft with the blocker recorded in Notes and rec-12.
- [ ] The stored version is server-side; a client cannot influence what version it attested to.

### 3. Append-only

- [ ] Accepting twice at the same version leaves **exactly one** row with its original `accepted_at`.
- [ ] A row for an older version is never mutated or deleted when a new version is accepted.
- [ ] No update path exists that can rewrite `accepted_at` or `policy_version`.

### 4. The surfaces

- [ ] The acceptance route renders the clauses as plain text with a single explicit accept action — no per-clause checkbox, no auto-accept on view.
- [ ] After acceptance the doctor can see their accepted version and timestamp.
- [ ] The go-live checklist shows the attestation, driven by the read endpoint, and remains skippable.
- [ ] `ConsultationLauncher` shows a reasoned disabled state deep-linking to the acceptance route, using the existing `disabledReason` pattern.
- [ ] A doctor who trips the server gate gets an actionable message, not a bare 500.

### 5. Boundaries and verification

- [ ] **Zero** new files in `backend/migrations/`.
- [ ] No RLS policy added; no `auth.uid()` expression anywhere.
- [ ] rec-07's migration, type and test are unmodified.
- [ ] No consent code, column or route is touched (rec-08/09/10 already removed them).
- [ ] Both workspaces green on typecheck, lint and tests.

### Out of scope

- The migration, table, row type and content-sanity test — **rec-07**.
- Consent removal on any surface — **rec-08 / rec-09 / rec-10**, all merged.
- The patient-facing disclosure copy — rec-08 (web) and rec-09 (DM).
- Counsel sign-off and the copy promotion gate — **rec-12**.
- Backfilling or implying acceptance for existing doctors. There is deliberately no backfill: an implied acceptance defeats REC-D4. Every doctor accepts explicitly, including existing ones, on their next consult start.
- Doctor verification, licensing, or any other onboarding step's logic.
- Video consent (**p4**, survives), pause (**p3**), artifact registry (**p1**), doctor timeline (**p5**).
- Emailing or notifying doctors about a version bump. Worth capturing to [`inbox.md`](../../../../../../capture/inbox.md); not built here.

---

## Scope Guard

- **Expected files touched: ~11 source + tests** — roughly 5 new backend, 4 new/updated frontend, and 2 surgical edits to existing files (`consultation-controller.ts`, `ConsultationLauncher.tsx`).
- **DO NOT TOUCH:**
  - `backend/migrations/` — nothing. Not rec-07's file, not `053`, not `049`.
  - `services/doctor-verification-service.ts` and the verification flow — **read as precedent, do not modify.** The attestation is a separate gate with a separate table; folding it into verification couples two unrelated release timelines.
  - `startConsultationHandler` beyond inserting the gate. Do not refactor it, re-order its existing validation, or change its response shape.
  - `ConsultationLauncher.tsx` beyond the `disabledReason` extension and the deep link. It is ~1170 lines and not this task's to tidy.
  - Any consent file. They are gone; do not resurrect a reference to one.
  - `recording-pause-service.ts` (p3), `recording-escalation-service.ts` / `VideoConsentModal.tsx` (p4), `recording_artifact_index` (p1).
  - Twilio recording rules, room create, `twilio-recording-rules.ts`. The attestation gates *starting a consult*, not the recording rules.
- **Cross-layer blast radius:** DB read + service + controller + route + shared validation + two frontend surfaces + one guard inside an existing handler — **six layers**, which is why the file list is enumerated and pre-approved rather than discovered (`.cursor/rules/00-agent-contract.mdc`). The two riskiest touches are the guard in `startConsultationHandler` (it can break consult start for **every** doctor if the read fails open the wrong way — decide explicitly whether a read error blocks or allows, and record it in Notes) and `ConsultationLauncher.tsx` (large, shared, easy to regress). Anything outside the enumeration is a **stop**.
- **Hard stops:** a migration; an RLS policy or `auth.uid()` expression; an agent-authored policy version string; a per-clause opt-out; a backfill that implies acceptance.

---

## Done when

A doctor with no attestation row for the owner-approved active version cannot start a consult — enforced server-side in `startConsultationHandler`, explained by a reasoned disabled launcher that deep-links to an acceptance route rendering the charter's six clauses verbatim, and surfaced as a step on the go-live checklist. Accepting writes exactly one append-only row per (doctor, version), unblocks immediately, and is idempotent on re-accept; an older-version row does not satisfy the gate; a patient is never blocked by it. The clause text and count are pinned by a test, the active version lives in a single constant, and no migration, RLS policy or `auth.uid()` expression was added. Both workspaces are green on typecheck, lint and tests.

---

## 📝 Notes

- **Owner-approved policy version string:** **blocker.** Owner has not supplied it. Seeded `DRAFT-REC-D2-UNAPPROVED` in `backend/src/constants/recording-attestation.ts` (one constant; UI reads clauses + version from the API). Must not ship; rec-12 owns replacement.
- **rec-07's derived migration number:** **210** (`209_patients_archived_at.sql` was live head). Charter budgeted 196.
- **Gate frequency decision from step 5.3:** **Every voice and video start.** Same indexed read; a version bump is self-enforcing without a backfill. Text consult start is **not** gated — the mandate is audio. Patient join is not gated.
- **Read-failure posture from the Scope Guard:** **Fail closed.** `getDoctorRecordingAttestationStatus` throws `InternalError` on lookup failure; `assertDoctorRecordingAttestation` does not catch it, so consult start is blocked. A fail-open read would let an unattested doctor start if the table were briefly unreachable.
- Deliberately no backfill: existing doctors accept on their next consult start. An implied acceptance would defeat REC-D4.
- Checklist step `recording_attestation` is skippable (ONB-D4). `isGoLiveComplete` does **not** require attestation. Server gate is the authorization boundary.

---

## 🔗 Related tasks

- [`task-rec-07-migration-doctor-recording-attestation.md`](./task-rec-07-migration-doctor-recording-attestation.md) — hard dep; owns the table, the row type and the RLS posture
- [`task-rec-10-remove-downstream-consent-gates.md`](./task-rec-10-remove-downstream-consent-gates.md) — hard dep; shares `consultation-controller.ts` and `validation.ts`
- [`task-rec-12-close-gate-and-legal-signoff.md`](./task-rec-12-close-gate-and-legal-signoff.md) — owns the REC-D2 sign-off, including the version string
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md) · [Execution order](./EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md)

---

**Last Updated:** 2026-08-23
**Pattern:** doctor-scoped versioned gate — service + endpoint + skippable checklist surface + non-skippable server guard
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7
