# Plan p1 — Instagram launch-critical (batch)

> **Status:** 📋 Scaffolded (2026-07-25). Execution **GATED**.  
> **Program:** [`../README.md`](../README.md) · Prefix `ilr` · Tasks `ilr-01`…`ilr-05`  
> **One-line intent:** Close the compliance + silent-failure gaps that would block Meta App Review or ship a broken booking funnel on day one.

---

## Why this phase

Audit (2026-07-25) found:

1. Meta data-deletion callback **acks but never deletes** (`data-deletion.ts` TODO).
2. Consent persist failure **still sends the booking link** (`booking-funnel.ts` ~652–655).
3. Token health is **lazy-only** — no refresh, no proactive sweep, no email/dashboard alert when reconnect is needed.
4. Meta App Review / Advanced Access is required to onboard real doctors — longest external lead time.

---

## Decision lock (confirm before Wave 1)

| ID | Decision | Implication |
|----|----------|-------------|
| **ILR1-D1** | Data deletion is **real**, not cosmetic — queue a job that anonymizes/deletes IG-scoped patient data for the Meta `user_id`. | Mapping Meta user_id → doctor vs patient must be designed in `ilr-02` (confirm OQ-1). |
| **ILR1-D2** | On consent persist failure: **do not** send slot link; keep patient in a recoverable step with clear copy. | Fix only the failure branch; do not redesign consent UX. |
| **ILR1-D3** | Token strategy v1 = **proactive health sweep + reconnect nudge** (email + dashboard). Full Graph refresh if Meta allows for Page tokens; else force reconnect. | No silent 60-day death. |
| **ILR1-D4** | App Review is **ops-parallel** (`ilr-01`) — start day one; does not block coding `ilr-02`…`04`. | |
| **ILR1-D5** | Fix `process.env` direct read in `data-deletion.ts` → `config/env.ts`. | Agent-contract hard rule. |

---

## Open questions (answer before / during Wave 1)

| ID | Question | Default if unanswered |
|----|----------|------------------------|
| **OQ-1** | Meta data-deletion `user_id` maps to **doctor** (app remover) vs **patient** (IG user)? Or both paths? | Support **doctor disconnect path** first (delete/anonymize that doctor's IG-linked connect row + document patient IG data retention); expand patient mapping if Meta sends end-user IDs. |
| **OQ-2** | Token nudge channel: dashboard event only, or + email? | **Both** (dashboard event + email to doctor). |
| **OQ-3** | Expiry warn window (days before `expires_at`)? | **7 days** (matches existing `TOKEN_EXPIRY_WARN_MS`). |

---

## Scope guard

- **DO NOT** start WhatsApp work.
- **DO NOT** redesign the booking funnel in p1 — only the consent-failure branch.
- PHI deletion / consent / cron that touches doctor-owned rows → **Opus**.
- No new patient-facing product surfaces in this phase.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ilr-01` | Meta App Review + business verification (ops checklist) | S | Founder / Composer |
| `ilr-02` | Real Meta data-deletion callback + worker | M | **Opus** |
| `ilr-03` | Consent-persist failure must not send booking link | S | **Opus** |
| `ilr-04` | Token lifecycle: health sweep + reconnect alerts | M | **Opus** |
| `ilr-05` | Close gate p1 | S | Sonnet / Composer |

---

## Acceptance gate

- [ ] Meta App Review checklist started; status tracked in `ilr-01`.
- [ ] Data-deletion callback queues a real job; confirmation_code tracks progress; `process.env` fixed.
- [ ] Consent persist failure → no slot link; patient stays recoverable; tests green.
- [ ] Health sweep cron runs; reconnectRecommended → dashboard + email; tests green.
- [ ] Verification gate (tsc / lint / tests) green for the slice.

---

**Created:** 2026-07-25.
