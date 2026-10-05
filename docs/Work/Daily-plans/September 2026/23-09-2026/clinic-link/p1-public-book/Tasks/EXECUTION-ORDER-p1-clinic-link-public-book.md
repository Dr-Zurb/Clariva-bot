# Execution order — p1 public book

> Sibling document of [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md). The plan covers what and why. This doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) was archived 2026-09-23. The user decides model switches. The picks below are the exec-order shorthand only. One Opus task in the batch: `clk-03`.

```
Wave 1 (Slug — ~4h, single lane sequential):
  Lane α  ──── clk-01 (M, Sonnet)

Wave 2 (Public read — ~4h, single lane sequential):
  Lane α  ──── clk-02 (M, Sonnet)

Wave 3 (Checkout — ~9h, single lane sequential):
  Lane α  ──── clk-03 (L, Opus) ──> clk-04 (M, Sonnet)

Wave 4 (Page and SMS — ~4h wall, 2 parallel lanes — fully independent):
  Lane α  ──── clk-05 (M, Sonnet)                          [frontend]
  Lane β  ──── clk-06 (S, Sonnet)                          [backend]

Wave 5 (Bot link and gate — ~5h, single lane sequential):
  Lane α  ──── clk-07 (S, Sonnet) ──> clk-08 (M, Sonnet)
```

**Wall-clock:** ~26h (Wave 4 runs the page and the SMS together).
**Agent-time:** ~28h.

**Bottleneck:** Wave 3. Single-lane sequential because the optional DM attach edits the same checkout the unauthenticated create just introduced.

### Wave 1 — Slug

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | clk-01 | M | Sonnet | `240_doctor_settings_share_address_on_instagram.sql`, Practice info settings | Read `MIGRATIONS_AND_CHANGE.md` first. Existing `doctor_settings` RLS covers the row. |

### Wave 2 — Public read

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | clk-02 | M | Sonnet | `getSlotPageInfoHandler`, `getDaySlotsHandler`, `CONTRACTS.md` booking section | Waits on clk-01. No patient fields in the payload. |

### Wave 3 — Checkout

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | clk-03 | L | Opus | `processSlotSelectionAndPay`, `createPatientForBooking`, `evaluatePublicBookingPaymentGate`, `COMPLIANCE.md` | Do not reuse `createPatientForBooking` unchanged. |
| 1 | clk-04 | M | Sonnet | clk-03 checkout, `verifyBookingToken` | Invalid `?c=` still books, unattached. |

### Wave 4 — Page and SMS

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0α | clk-05 | M | Sonnet | `frontend/app/book/page.tsx`, `public-booking-intake.ts` | Waits on clk-04 so `?c=` is a real query. Does not read clk-06. |
| 0β | clk-06 | S | Sonnet | `twilio-sms-service.ts`, desk booking confirmation | Waits on clk-03. Does not read the page or clk-04. |

Lane test: after Wave 3, the page and the SMS touch disjoint files. Neither consumes the other. They meet at the Wave 4 gate.

### Wave 5 — Bot link and gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | clk-07 | S | Sonnet | `buildBookingPageUrl`, `booking-link-copy.ts` | Starts only after clk-05 is green, so the bot does not send a dead URL. |
| 1 | clk-08 | M | Sonnet | Phase 1 gate in the batch plan | Convergence of the whole phase. Not inside Wave 4. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| clk-01 | M | Sonnet | Additive column on a table that already has RLS. |
| clk-02 | M | Sonnet | Read path. Same slot data, new auth (the slug). |
| clk-03 | L | Opus | Unauthenticated create of a patient and an appointment, plus payment. |
| clk-04 | M | Sonnet | Optional attach on the checkout clk-03 landed. |
| clk-05 | M | Sonnet | Page reuses `/book`. |
| clk-06 | S | Sonnet | One SMS through the existing Twilio send. |
| clk-07 | S | Sonnet | URL builder and copy. |
| clk-08 | M | Sonnet | Gate and docs. The PHI review already happened on clk-03. |

## Acceptance gates

### Wave 1

- [ ] A practice has a unique slug and can copy `/d/:slug` from Practice info.
- [ ] Editing the slug rejects a slug another practice already has.
- [ ] All Wave 1 tests for this task are green.

### Wave 2

- [ ] A slug returns practice name, mode, and that day's slots. No patient fields.
- [ ] An unknown slug does not fall through to another doctor.
- [ ] Token routes still require a token.
- [ ] All Wave 1 gates still green.

### Wave 3

- [ ] A checkout with no conversation creates the patient (`age`, `gender`, null `date_of_birth`) and an appointment (`conversation_id` null, `booking_origin` booked).
- [ ] An unverified doctor cannot book. Staff-review state is not required.
- [ ] A valid `?c=` for that doctor sets `conversation_id` and still sends the DM confirmation.
- [ ] A bad `?c=` books unattached and leaks nothing.
- [ ] `/book?token=` still books.
- [ ] All Wave 2 gates still green.

### Wave 4

- [ ] `/d/:slug` books in the browser: name, age, sex, phone, reason, consent, slot or queue.
- [ ] Success is the existing success page, not Instagram.
- [ ] A bio booking sends one SMS with practice and when, and no reason.
- [ ] All Wave 3 gates still green.

### Wave 5

- [ ] The bot sends `/d/:slug?c=` when the slug exists, and the old `/book?token=` URL when it does not.
- [ ] Reschedule links are unchanged.
- [ ] The batch acceptance gate is checked off in the batch plan.
- [ ] All Wave 4 gates still green.

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 | clk-01 | 1 | 0 | ~4h |
| 2 | clk-02 | 1 | 0 | ~4h |
| 3 | clk-03, clk-04 | 1 | 1 | ~9h |
| 4 | clk-05, clk-06 | 2 | 0 | ~4h |
| 5 | clk-07, clk-08 | 1 | 0 | ~5h |

## References

- [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
- [`plan-clinic-link.md`](../../../../../../Product%20plans/plan-clinic-link.md)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)

**Created:** 2026-09-23.
