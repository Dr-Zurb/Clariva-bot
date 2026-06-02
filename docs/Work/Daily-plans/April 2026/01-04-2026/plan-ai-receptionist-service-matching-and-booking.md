# Plan: AI receptionist — service matching, confidence routing, payments & doctor review

## 0. Locked product decisions (v1)

| Topic | Decision |
|-------|----------|
| **Mandatory catch-all row** | Required; **doctor-facing label:** **Other / not listed** (professional, signals catalog gap). **Stable `service_key`:** e.g. `other` (implementation choice; immutable in analytics). |
| **Slot strategy** | **No slot hold** until staff resolves low/ambiguous cases: **doctor confirms first** → **then** patient gets **slots + booking link / in-chat flow** (Option **B** only for v1). |
| **SLA** | **24 hours** default for staff to confirm or reassign; on timeout → cancel pending request, notify patient (no payment captured on this path). |
| **Payments (v1)** | **Capture only when high-confidence** booking commits (current happy path). **Low / ambiguous:** **no capture** until after staff confirmation and final `service_key` + price are known. **No incremental / top-up charges** and **no separate holding / deposit fee** in v1 — single payment for the **final** amount when the patient pays. |
| **Staff reject flow** | **No structured “reject reason” taxonomy** (e.g. not listing “redirect in-person” as a fixed menu). The **doctor configures** which **text / voice / video** modes exist per service in the catalog; the **bot evaluates** against that. Inbox actions: **Confirm** \| **Reassign to another service** \| **Cancel** this pending request (optional free-text note for internal use only — product TBD). |
| **Audit** | **Must-have:** store final `service_key`, actor, timestamp (and sufficient context for disputes) on every staff resolution. |

---

## 1. Vision

Build a **human-like receptionist**: the patient describes **symptoms / reason for visit** in natural language; the system **infers** the best **catalog service** (`service_key`) and **modality** using doctor-defined offerings. **Patients are not asked to pick a priced service** (assumption: price shopping and wrong self-selection). The **doctor** owns the service catalog quality; **staff** resolves **low-confidence** cases. A **mandatory** **Other / not listed** row ensures **no-match** always has a **safe, explicit** fallback price.

---

## 2. Product principles

| Principle | Implication |
|-----------|-------------|
| **No patient price pick** | Booking UX must not require choosing among rows primarily to get a **cheaper** slot. Service selection is **system- or staff-assigned**; optional override only with friction / disclosure (product decision). |
| **Catalog is source of truth** | Every bookable teleconsult path resolves to a **validated** `service_key` present in `service_offerings_json`. **Modality availability** comes from the catalog per service — not from a separate “reject because not tele” menu. |
| **Allowlist on server** | Matcher output must pass `findServiceOfferingByKey` / equivalent; never trust raw LLM `service_key` without validation. |
| **Explicit confidence** | Every automated match carries **`match_confidence`** (e.g. `high` \| `medium` \| `low`) and optional **`reason_codes`** for logs and inbox. |
| **Doctor trains operations, not weights** | “Training” = **descriptions, keywords, examples**, plus **review corrections** — not silent “more usage = smarter model” without governance. |

---

## 2b. Product & safety (deferred)

- **Age gates / paediatric booking** (minors booking alone, paed-specific services, guardian consent): **out of scope for this plan’s v1** — to be designed later. Until then, document any interim copy disclaimers if needed.
- **Emergency / triage** copy and channel limits remain as in §10 (open questions).

---

## 3. Service catalog contract (doctor-facing)

### 3.1 Mandatory **Other / not listed** service

- Every practice with teleconsult catalog must include **one** designated catch-all row.
- **Doctor UI label (agreed):** **Other / not listed** — easy to understand as “not my main named service; everything else routes here.”
- **`service_key`:** stable slug (e.g. `other`) — doctors edit **label/description/prices**, not the slug.
- **Purpose:** **No-match** (nothing specific fits), vague complaints, or **explicit fallback** when the matcher does not exceed confidence threshold for a specific row.
- **Pricing:** doctor sets **text / voice / video** and prices per modality like any other service.
- **Validation:** dashboard save blocked or warned until this row exists (schema + UI rule — implementation detail).

### 3.2 Rich descriptions (reduce ambiguity → reduce low-confidence volume)

Encourage (inline hints, checklist before publish):

- **Who this is for** (symptoms, duration, population).
- **Who should book a different service** (exclusions, redirect to another row via **catalog** clarity — not via a separate reject-reason product).
- **Keywords & synonyms** (stored fields, surfaced to matcher — not only free prose in `label`).

**Goal:** maximize **high-confidence** share; **low-confidence** often signals **thin catalog metadata**, correctable by the doctor.

---

## 4. Patient journey (target)

1. Patient messages **complaint / reason** (+ intake fields as today).
2. **Matcher** returns validated `service_key`, `modality` (if applicable), `match_confidence`, human-readable `matched_label` for copy.
3. **Branch**:
   - **High confidence** → proceed to **slot + payment** (single capture for final quoted amount) per §6.
   - **Medium / low** → **pending staff review**; **no slots / no booking link yet**; **no payment** (§6). After staff **confirm or reassign**, **then** surface slots + payment in chat / link.
4. **No specific match** above threshold → map to **Other / not listed** with explicit patient copy (tone: professional catch-all, not “cheap consult”).

Patient never sees a **menu of prices** as the primary way to declare visit type (align `/book` with pre-filled `catalogServiceKey` from conversation via `slot-page-info` — see technical backlog).

---

## 5. Low-confidence / ambiguous: human in the loop

### 5.1 Metaphor

Receptionist **does not reserve a slot** until the doctor/staff **resolves** the case; then the patient gets **real** availability and **one** payment step for the **final** amount.

### 5.2 Doctor / staff inbox (MVP capabilities) — **audit is mandatory**

- Queue: **Pending review** with patient name/summary, **reason for visit**, **AI proposal** (`service_key`, label, confidence), **alternatives** (top-2 from matcher if available).
- Actions: **Confirm as proposed** \| **Reassign to service B** \| **Cancel** pending request (optional internal note; **no** required structured reject-reason list — suitability is expressed by **catalog** definitions and modalities).
- **Audit (must-have):** persist final `service_key`, actor, timestamp, and enough context for support/disputes.

### 5.3 SLA

- **Agreed default: 24 hours** to confirm, reassign, or cancel. On timeout → cancel pending request, notify patient (**no** capture on this path in v1).

### 5.4 Slot strategy (v1)

| Option | v1 |
|--------|-----|
| **B. No slot until staff confirm** | **Selected.** No inventory held during review; patient expectation: “clinic will confirm, then you’ll choose a time and pay.” |
| A / C (hold / reserve) | **Not in v1** unless product revisits. |

---

## 6. Payments & economics (Razorpay / PSP)

### 6.1 Problem (context)

**Captured payment → full refund** often leaves **non-reversible platform fee** on the original transaction with many PSPs → avoid **capture** on paths that frequently end in timeout or cancel.

### 6.2 v1 tiered payment policy (**agreed**)

| Path | Capture? | Notes |
|------|-----------|--------|
| **High confidence** | **Yes** — when patient commits to a slot (single payment for **final** quoted amount for that `service_key` + modality). | Align with current happy path. |
| **Low / ambiguous → staff review** | **No** until staff has finalized service (and thus price). | Then **one** payment for the **final** amount — **no incremental top-ups**, **no holding/deposit fee** in v1. |
| **Staff changes service vs AI proposal** | **No partial charge / incremental charge in v1.** | Patient pays **once** against the **final** quote after resolution (new checkout if needed — still **one** full amount, not fee-on-fee). |

**Deferred (not v1):** auth-only holds, incremental charges after partial capture, separate booking deposits — revisit only if product requires.

### 6.3 Accountability framing

- **Ambiguous volume** correlates with **thin catalog metadata** — dashboard nudges toward **Other / not listed** copy + **detailed** specialty rows.
- Optional: clinic-facing metrics on **pending-review** volume and **timeout rate**.

---

## 7. Failure modes & responses

| # | Scenario | Direction |
|---|-----------|-----------|
| 1 | **Wrong match at high confidence** | **Review UI** + telemetry; doctor improves descriptions/keywords. Platform provides tools; terms reflect **catalog ownership**. |
| 2 | **Low confidence** | **Staff review**; **no** slot/payment until resolved (**§5–6**). |
| 3 | **No match** | Route to **Other / not listed** with clear copy. |
| 4 | **Invalid / hallucinated key** | **Reject** in backend; never persist; escalate to staff or re-run matcher. |
| 5 | **Payment session expired** before complete | Re-issue **single** payment for **final** amount after fresh quote. |
| 6 | **Staff cancels pending request** | Notify patient; **no** refund drama if **nothing was captured** on low-confidence path. If edge case had capture, follow PSP rules (should be rare in v1). |
| 7 | **Patient withdraws while pending** | Cancel request; nothing to refund if no capture. |

---

## 8. Strengthening the AI receptionist (beyond prompts)

1. **Structured matcher output** — JSON schema: `candidates[]`, `confidence`, `needs_staff_review`, **never** free-text key without validation.
2. **Retrieval over catalog** — embed or keyword-retrieve **doctor fields** + patient message; LLM **chooses among candidates** (reduces invention).
3. **Review loop** — weekly digest or inline “**improve catalog**” from correction patterns.
4. **Metrics** — `high_confidence_rate`, `staff_override_rate`, `timeout_rate`, `avg_time_to_confirm`.

---

## 9. Technical backlog (high level — Clariva codebase)

> **Executable task files:** [tasks/README.md](./tasks/README.md) (**e-task-arm-01** … **e-task-arm-11**). The bullets below stay as architecture anchors (`conversation` state, `slot-page-info`, `applyPublicBookingSelectionsToState`, `slot-selection-service`, Instagram worker).

- [ ] **Schema / dashboard**: mandatory **Other / not listed** row (`service_key` e.g. `other`); optional **`matcher_hint`** fields per offering (description, keywords, exclusions) if not already present.
- [x] **Matcher service**: `backend/src/services/service-catalog-matcher.ts` (Stage A: single non–catch-all row, label/key overlap, ARM-02 `matcher_hints`; Stage B: JSON LLM **allowlist-only**; validate via `resolveCatalogOfferingByKey`). Instagram: `enrichStateWithServiceCatalogMatch` on **confirm → consent** in `instagram-dm-webhook-handler.ts`; persists with **`applyMatcherProposalToConversationState`** (ARM-03). Operator tuning: richer **keywords / include_when / exclude_when** (ARM-02) raises deterministic share before LLM.
- [ ] **`GET slot-page-info`**: return **`suggestedCatalogServiceKey`** / **`matchConfidence`** from conversation for `/book` pre-fill **after** high-confidence or post-review flows only as appropriate. **DM (ARM-05):** while `pendingStaffServiceReview && !serviceSelectionFinalized`, patient stays on step `awaiting_staff_service_confirmation` — no slot link until staff resolution (ARM-06/07) clears the gate.
- [ ] **Frontend `/book`**: pre-select service from API; hide or secondary **change** with disclosure (product).
- [ ] **Request / appointment states**: `pending_staff_confirmation`, `confirmed`, `cancelled_timeout`, etc.; **cron for 24h SLA**.
- [ ] **Doctor dashboard**: review queue + confirm / reassign / cancel + **mandatory audit** payload.
- [ ] **Payment**: **single capture** for final amount; **pay-after-confirm** for staff-resolved path — **no** v1 incremental/holding fees.
- [ ] **Remove or narrow** `legacy_fee` fallback for multi-service catalog doctors when key unknown (safety — aligns with earlier product discussion on wrong-price risk).

---

## 10. Open questions

- **Regulatory / clinical:** disclaimers for triage vs emergency; tele-only limitations.
- **Age / paeds / guardian consent:** **deferred** (§2b) — explicit future milestone.
- **Single-doctor vs multi-location** inheritance of catalog hints.
- **Patient override** after pre-fill: if allowed, max changes and re-quote behavior.
- **Razorpay:** confirm exact behavior for **single** capture after **pay-after-confirm** delay (no auth-hold in v1 simplifies this).

---

## 11. Alternatives considered

- **Always patient pick on /book** — rejected for **price bias**.
- **Always pay first for ambiguous** — rejected for v1 due to **fee + refund** economics.
- **Structured “reject reasons”** (in-person only, etc.) — **rejected for v1**; doctor encodes what is bookable via **catalog + modalities**; staff **cancel** without a rigid reason taxonomy.
- **Fine-tune model on production chats** — defer; **metadata + review** first.

---

## 12. Success criteria (v1)

- ≥ X% of bookings are **high-confidence** without staff (target set after baseline).
- **Zero** successful bookings with **unvalidated** `service_key`.
- **Pending-review** path: **no capture** until staff resolution; **24h** timeout **idempotent**; **no** slot consumption until confirm (**Option B**).
- **Other / not listed** row present for every teleconsult catalog practice.
- Doctor-facing **copy** drives **detailed** non–catch-all services to reduce queue load.
- **Audit** present on every staff resolution.
