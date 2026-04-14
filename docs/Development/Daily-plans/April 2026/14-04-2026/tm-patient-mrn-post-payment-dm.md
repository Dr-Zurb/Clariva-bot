# tm-patient-mrn-post-payment-dm — Patient ID (P-xxxxx) after payment

**Daily plan:** [docs/Development/Daily-plans/April 2026/14-04-2026/README.md](../../Development/Daily-plans/April%202026/14-04-2026/README.md)  
**Template:** [TASK_TEMPLATE.md](../TASK_TEMPLATE.md)

---

## Objective

Show the **human-readable Patient ID** (`P-xxxxx` / MRN-style) **only after successful payment**, not bundled with the pre-payment booking link DM. Aligns product expectation: ID is a post-commitment artifact, not part of the unpaid booking funnel.

---

## Product decision (choose path before coding)

| Option | Description | Risk / effort |
|--------|-------------|----------------|
| **A (preferred)** | **Messaging only:** Stop including MRN hint in pre-payment DMs; send ID in a **follow-up** message on payment success (same channel or email if policy allows). DB can still assign MRN on patient insert. | Lower: copy + one new send path |
| **B (later / optional)** | **Schema / timing:** Defer MRN assignment until after payment (larger change: migrations, consent/patient row lifecycle). | Higher: data model + all callers |

**Default scope for this task:** **Option A** unless product explicitly approves Option B.

---

## Preconditions

- [ ] Confirm payment-success signal: Instagram DM webhook vs booking app callback vs payment provider webhook (single source of truth for “paid”).
- [ ] Confirm whether post-payment ID may go **DM only**, **email only**, or **both** (see COMPLIANCE for consent).

---

## Current state (audit before change)

- **MRN default on insert:** `backend/migrations/018_patients_medical_record_number.sql` (and related patient creation paths).
- **Booking link copy:** `backend/src/utils/booking-link-copy.ts` — `formatBookingLinkDm(slotLink, mrnHint, …)` and any `formatPatientIdHint` usage.
- **Webhook / flow:** `backend/src/workers/instagram-dm-webhook-handler.ts` — branches that pass `mrnHint`, `buildBookingPageUrl`, `createPatientForBooking`, `persistPatientAfterConsent`.
- **Consent persistence:** `backend/src/services/consent-service.ts` — `persistPatientAfterConsent` (patient row updates after consent).

**Current behavior to change:** Any user-visible **pre-payment** string that reveals `P-xxxxx` before payment completes.

---

## Scope

### In scope

- Remove or gate **MRN/patient ID** from pre-payment booking DMs and related templates.
- Add **one clear post-payment** user-visible message containing `P-xxxxx` (or equivalent formatted ID), wired to the real payment-success event.
- Tests: unit/integration for copy helpers and for “no ID before pay / ID after pay” behavior.
- Docs: short note in RECIPES or booking flow doc if behavior changes operator expectations.

### Out of scope (unless Option B approved)

- New migrations that defer MRN column assignment.
- Broad refactors of `instagram-dm-webhook-handler.ts` beyond what this feature requires.

**Scope guard:** Prefer ≤5 primary files touched; expansion needs explicit approval.

---

## Task breakdown

### 1. Audit & contract

- [ ] 1.1 Map every caller of `formatBookingLinkDm` / `formatPatientIdHint` / booking URL builders that can run **before** payment.
- [ ] 1.2 Document the **payment-success** hook(s) (file + function) that should trigger the post-payment ID message.

### 2. Option A — messaging

- [ ] 2.1 Change pre-payment copy so **no patient ID** appears (pass `undefined` / omit hint where applicable).
- [ ] 2.2 Implement post-payment send: load patient by stable key (conversation / booking / payment intent), format ID with existing helpers, send DM (or enqueue) once.
- [ ] 2.3 Ensure idempotency: payment webhooks may retry; do not spam duplicate “your ID is P-…” messages.

### 3. Verification & testing

- [ ] 3.1 `npm run type-check` (or project equivalent).
- [ ] 3.2 Tests for copy helpers + at least one integration path for post-payment ID send (mock payment success).
- [ ] 3.3 Manual QA: book → pay → receive ID; book without pay → no ID in DM.

### 4. Documentation

- [ ] 4.1 Update booking / DM RECIPES or README snippet if operators rely on old copy.

---

## Design constraints

- **COMPLIANCE:** No PHI in logs; patient ID in logs is still sensitive — avoid raw MRN in log lines ([COMPLIANCE.md](../../Reference/COMPLIANCE.md)).
- **CONTRACTS:** If a frontend or webhook consumer expects ID in an old field, version or coordinate the change ([CONTRACTS.md](../../Reference/CONTRACTS.md)).
- **CODE_CHANGE_RULES:** Follow [CODE_CHANGE_RULES.md](../CODE_CHANGE_RULES.md) when changing existing DM/payment paths.

---

## Global safety gate

- [ ] **Data touched?** (Y / N) — If Yes → RLS verified for any new queries.
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API** (Instagram send, payment provider): consent and retry behavior understood.
- [ ] **Retention / deletion:** N/A unless new tables (not expected for Option A).

---

## Acceptance criteria

- [ ] Pre-payment DMs / booking messages do **not** show `P-xxxxx` (or raw MRN).
- [ ] After successful payment, user receives **one** clear message with their patient ID (unless product specifies email-only).
- [ ] Tests and type-check pass; docs updated if behavior changed for operators.

---

## Related

- Booking flow reference: [APPOINTMENT_BOOKING_FLOW_V2.md](../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- Deferred (separate): interim “please wait” DM — `docs/Development/deferred/`

---

**Status:** ⏳ Pending  
**Last updated:** 2026-04-14
