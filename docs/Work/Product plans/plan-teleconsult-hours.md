# Plan — Teleconsult hours

> Clinic doctors will carve dedicated teleconsult blocks once the feature exists. The price sheet does not change. Availability, booking, desk, and the billing source of truth do.
>
> **Status:** `Drafted` 2026-09-12. **Not promoted.** Do not open a Daily-plans folder until this plan is `Selected`.
>
> **Effort:** escalate — new availability column (migration) + change to how a consult becomes billable (Q20). Per `.cursor/rules/00-agent-contract.mdc` this is a STOP-and-flag item. Do not implement from this file on Auto.
>
> **Depends on:** pricing lock in [`PRICING_MODEL_DECISIONS.md`](../../Reference/business/PRICING_MODEL_DECISIONS.md) (2026-09-12 — teleconsult rate is channel-independent; Q20 / Q23 / Q24) and clinic path in [`plan-clinic-path.md`](./plan-clinic-path.md).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## Why this plan exists now

Indian clinic doctors do not usually keep a separate teleconsult list. They will, if the product lets them — some hours of a day, some days of a week — and they will fill those hours from the patients they already have. Instagram is not required.

That is not a pricing problem. Same ₹999, same 20 included, same ₹49, same cap, whether `social_enquiries` is `yes` or `not_yet`. It is a product problem: today's `availability` rows have no modality, the public booking page cannot refuse an in-clinic slot during a teleconsult block, the desk cannot tell staff who is coming in versus who is on a call, and the ledger will silently drop a video session whose appointment is still labelled `in_clinic` (open Q20).

---

## North star

A clinic doctor can publish teleconsult hours. Patients can only book a teleconsult in those hours. Desk staff see the modality on the queue. Every completed teleconsult meters — including one whose appointment row still says in-clinic — at the published sheet. A doctor who never adds a teleconsult block is unchanged.

---

## Decision lock (LOCKED 2026-09-12, in chat)

| ID | Decision | Implication |
|----|----------|-------------|
| **TCH-DL-1** | **One sheet.** A clinic doctor with no social pays ₹999 / 20 included / ₹49 / ₹12,499. The meter prices the teleconsult, not its origin. | No clinic-only rate. No "Not yet" discount. Cheaper-clinic-rate is Ruled out in the pricing doc. |
| **TCH-DL-2** | **Availability becomes modality-aware.** Each block is `in_clinic`, `teleconsult`, or `both`. Existing rows backfill as `both` so every current schedule behaves exactly as it does today. | Same pattern as `social_enquiries` in migration 232. No new scheduling subsystem. |
| **TCH-DL-3** | **Q20 is a precondition, not a follow-up.** Billable modality is derived from whether a consultation session existed, not from `consultation_type`. Required before the first clinic doctor enables teleconsult hours. | `usage-ledger-service.ts` already maps `in_clinic` / `in_person` → `in_person`. A labelled in-clinic video session would never meter. Escalate. |
| **TCH-DL-4** | **Disclose the meter when they add the first teleconsult block.** Copy leaning: "Your plan includes 20 teleconsults a month. ₹49 each after that, only when the consult happens." They cannot publish those hours without seeing it. | `/clinics` does not reprint ₹49. Open Q24 if a different moment is better. |
| **TCH-DL-5** | **This program is escalate.** Migration + change to the billing source of truth for every account. | Do not execute on Auto. Read `COMPLIANCE.md` and `MIGRATIONS_AND_CHANGE.md` first. Implementation is Opus-class. |
| **TCH-DL-6** | **Marketing copy stays "teleconsult or in-clinic — order, not a decision."** The booking UI may present a choice once hours exist. Do not rewrite `BRAND.md` or `/` for this. | Brand line is a marketing rule. Slot selection is a product rule. |

---

## What already exists (inspected 2026-09-12)

- `availability` (`001`): `day_of_week`, `start_time`, `end_time`, `is_available`. No modality. Type: `Availability` in `backend/src/types/database.ts`.
- Slot selection and public booking treat every open block as bookable. No channel filter.
- Desk portal (`/desk`, `/desk/today`) has no visit-modality chip.
- `billable_consults` + `usage-ledger-service.ts` normalise `in_clinic` / `in_person` to `in_person`.
- `social_enquiries` (`232`) is `yes` / `not_yet`. It does not change the price sheet and must not start doing so.
- `/clinics` is a records pitch. No rupees in the hero. `/pricing` still holds the sheet.

---

## Phase table (not promoted)

| Phase | What | Gate | Status |
|---|---|---|---|
| 1 — billable from session | Q20: a completed video/voice/text session meters even if the appointment is labelled in-clinic | A dummy in-clinic-labelled video visit appears on the ledger; a true in-person visit does not | Drafted — escalate |
| 2 — modality on availability | Column + backfill `both` + slot selection refuses the wrong channel | An existing doctor's public page is unchanged; a teleconsult-only Wednesday offers only teleconsult slots | Drafted — escalate |
| 3 — settings + disclosure | Doctor can add a teleconsult block; first add shows the meter sentence (TCH-DL-4) | A test doctor cannot save the first teleconsult block without seeing ₹49 | Drafted |
| 4 — desk + booking page | Queue shows modality; booking page does not offer walk-in during teleconsult hours | Desk staff can tell a teleconsult patient from a walk-in without opening the chart | Drafted |

Phase 1 can ship without 2–4. Phases 2–4 without Phase 1 leak revenue. Do not invert that order.

When this plan is `Selected`, promote to a dated batch under `docs/Work/Daily-plans/` on the start date, prefix `tch`, and keep later phases as sibling `pN-` folders in that same program folder ([`PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md)).

---

## Explicitly out of scope

- A second price sheet or clinic-only teleconsult rate
- Rewriting `/`, `/clinics`, or `/pricing`
- Changing `social_enquiries` into a billing flag
- A new calendar or scheduling product
- Inventing the column name, CHECK list, or API shape in this file — that belongs in the Phase 2 task after an Opus pass
- Real patient data in verification

---

## Docs to sync when a phase ships

- [`PRICING_MODEL_DECISIONS.md`](../../Reference/business/PRICING_MODEL_DECISIONS.md) — close Q20 / Q24 when the matching phase lands; Q23 waits on a live clinic doctor
- [`DB_SCHEMA.md`](../../Reference/engineering/architecture/DB_SCHEMA.md) — when the availability column exists
- [`CONTRACTS.md`](../../Reference/engineering/architecture/CONTRACTS.md) — when slot selection or settings APIs change
- Do not touch `BRAND.md` for TCH-DL-6

---

**Created:** 2026-09-12.
**Owner:** Founder (commercial + product).
**Prefix:** `tch` — continuous across phases.
