# Plan p1 — History link: form → reviewable evidence

## 31 Aug 2026 — Batch `history-link` / `p1-form-to-chart` (`hl-01..06`) — **L, ~20h · Opus on store + accept**

> **Status:** **DRAFTED — NOT PROMOTED.** This is the executable spec P1 asked for (fields, send, token, columns). Do not start `hl-01` until the product plan is `Committed` and HL-Q2 / HL-Q3 / HL-Q5 / HL-Q6 are ticked or explicitly skipped.
> **Product plan:** [`plan-history-link.md`](../../../../../Product%20plans/plan-history-link.md) (HL-DL-1…10)
> **Program:** [`../README.md`](../README.md) · Prefix `hl`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-history-link-form-to-chart.md`](./Tasks/EXECUTION-ORDER-p1-history-link-form-to-chart.md)
> **Not this sitting:** desk payments, desk UI button (Phase 2), previsit-ladder nudge, visit-narrative Phase 3.

---

## Why this phase

The appointment already exists. The chart tables already exist. The public token pattern already exists. What does not exist is a patient-writable path that is **not** a hole in doctor-only RLS.

This phase adds: a sidecar submission, a purpose-scoped HMAC, a public four-field form, one extra line on the booking-confirmation DM, and a per-item accept strip on the visit.

---

## Decision lock (inherits the product plan)

HL-DL-1…10 are locked. Do not re-litigate in a task file.

**Confirm before promote (recommended defaults in the product plan):**

| ID | Default | Owner |
|---|---|---|
| HL-Q2 | Own `HISTORY_FORM_TOKEN_SECRET` | ⟨fill⟩ |
| HL-Q3 | `cc` = first line / 120 chars; rest → `hopi` | ⟨fill⟩ |
| HL-Q5 | Doctor or staff may mint | ⟨fill⟩ |
| HL-Q6 | All booked modalities | ⟨fill⟩ |

---

## Scope Guard — DO NOT TOUCH

- `patient_allergies` / `patient_chronic_conditions` / `patient_medications` **schema** (accept INSERTs through existing services only).
- Consultation join token payload / verify, except a test that a join token is rejected by the history verifier.
- Recording attestation, `rec-*`, visit-narrative extract/apply.
- Desk payments, vitals forms, new bot intents, `/c/history` (chat replay).
- AI parse of the form (HL-DL-9).
- Collection-notice **wording** (HL-DL-10) — slot only.

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`hl-01`](./Tasks/task-hl-01-submission-table.md) | Sidecar table + types | L | **Opus** — new PHI table, RLS |
| [`hl-02`](./Tasks/task-hl-02-history-form-token.md) | HMAC mint / verify (`kind: 'history-form'`) | M | Sonnet |
| [`hl-03`](./Tasks/task-hl-03-public-form-and-submit.md) | Public `/h/:id` + POST | L | **Opus** — unauthenticated PHI write |
| [`hl-04`](./Tasks/task-hl-04-booking-dm-link.md) | Append link on booking-confirmation DM | S | Sonnet |
| [`hl-05`](./Tasks/task-hl-05-visit-accept-strip.md) | Review strip + per-item accept | L | **Opus** — writes chart tables |
| [`hl-06`](./Tasks/task-hl-06-phase-1-gate.md) | Suites + docs + gate | M | Sonnet |

---

## Acceptance gate

- [ ] Product-plan confirms (HL-Q2/3/5/6) recorded, or skipped in writing.
- [ ] Migration applies, re-applies as no-op, reverse in-file. RLS deny-all / service-role (or equivalent: no patient JWT policy that can INSERT).
- [ ] Token: valid kind works; join token and Rx-share token fail; expired → 410; cancelled appointment fails.
- [ ] Public form: four fields only. "None" allowed on the three lists. Why-today required.
- [ ] One POST per appointment (409 on the second). Chart tables untouched by POST.
- [ ] Accept writes the mapped table; "none" writes nothing; duplicate name does not double-insert.
- [ ] Booking-confirmation snapshot gains **one** link line. Byte-identical otherwise.
- [ ] No PHI in logs or in the URL.
- [ ] `/c/history` (chat) unchanged. Type-check + lint + new suites green.

---

## Risk (phase)

Covered by the product-plan register. Phase-specific: `hl-03` and `hl-05` must not share a write path — submit and accept are different services.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (drafted)
