# Doctor onboarding runbook

> **Purpose.** The literal steps to take one doctor from signature to first completed consult. Copy this file per doctor for the first five — you are writing the product's onboarding flow by doing it manually first.
>
> **Complements the in-product flow.** The dashboard already has `getting-started` and `settings/practice-setup`. This runbook is what *you* do around it, including the parts the product does not handle yet.
>
> **Related:** [`PILOT_AGREEMENT.md`](./PILOT_AGREEMENT.md) · [`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md) · [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md)

---

## Doctor

| Field | Value |
|---|---|
| Name | |
| Clinic / city | |
| Persona | Anjali / Raj / other |
| Signed on | |
| Plan | Founding ₹3,500 · 750 min |
| Target first consult | |

---

## Stage 0 — Before you contact them (yours, ~30 min)

- [ ] **Meta Advanced Access is live.** Without it only app-role and Instagram Tester accounts can connect. A real doctor will hit a wall at the integrations page. This is P0 in checklist §6 — verify before promising a date.
- [ ] **Twilio balance is positive.** A zero balance returns an `Authenticate` error (code 20003) and video rooms silently fail to create. You have hit this before. Check the cost board.
- [ ] **No demo data in the environment they will use.** The `backend/dev-sql/opd-demo-*` seeds and the plus5 scripts create fake patients. A real doctor seeing "Rahul Demo" in their patient list is the fastest way to lose them.
- [ ] **Previsit notify worker is sane.** It emails on a schedule. Resend's free tier is ~100/day — confirm you will not blow through it or spam the doctor's real patients during setup.
- [ ] Read their Instagram for ten minutes. Know their specialty, their tone, and their three most common DM questions before the call.

## Stage 1 — The onboarding call (60–90 min, screen share or in person)

Do this **with** them, not for them. You are watching for where they hesitate — that hesitation is your onboarding backlog.

- [ ] Create their account; confirm they can log in unaided on their own phone.
- [ ] **`settings/practice-setup/practice-info`** — clinic name, address, timings.
- [ ] **`settings/practice-setup/services-catalog`** — their real services and real fees. Do not let them accept defaults; wrong fees quoted to a patient destroys trust on day one.
- [ ] **`settings/practice-setup/availability`** — real consulting hours, including the days they do not work.
- [ ] **`settings/practice-setup/booking-rules`** — notice period, cancellation window, buffers.
- [ ] **`settings/practice-setup/opd-mode`** and **`patient-flow`** — match how their clinic actually runs, not how you think it should.
- [ ] **`settings/practice-setup/bot-messages`** — read the bot's opening line aloud to them. If they wince, edit it now. This is the single highest-value five minutes of the call.
- [ ] **`settings/integrations`** — connect Instagram, and Facebook if they use it. Skip if they answered **Not yet** on complete-profile (Instagram is optional; the step stays visible).
- [ ] **`dashboard/get-verified`** — walk their RMP registration through. P0 under telemedicine rules.
- [ ] Consent flow — show them what the patient sees and confirm they are comfortable being the one who obtains it (clause 5 of the pilot agreement).

## Stage 2 — The proof (same call, do not skip)

The doctor must see the loop close before you leave, or they will not believe it.

- [ ] DM their own Instagram from your phone as a fake patient. Let them watch the bot reply.
- [ ] Carry it through to a real booking on their real calendar.
- [ ] Run a video consult between your phone and their dashboard. Confirm they can hear you, see you, and find the flip-camera control on mobile.
- [ ] Write a throwaway prescription so they see the Rx flow and the safety strip.
- [ ] Delete the test patient in front of them.
- [ ] Ask them to say back, in their own words, what happens when a patient DMs at midnight. If they cannot, you have not onboarded them.

## Stage 3 — First 48 hours (watch closely)

- [ ] Message them the morning after. Not "any feedback?" — ask "how many DMs did it handle overnight?"
- [ ] Read every bot conversation yourself for the first two days. You are checking for tone misses, wrong fees, and anything that sounds like medical advice.
- [ ] Confirm the first real patient booking came through and the reminder fired.
- [ ] Watch Twilio and OpenAI spend for this doctor specifically — this is your first real cost-to-serve data point, and the pricing board is waiting on it.

## Stage 4 — Week 1 review (30 min call)

- [ ] Numbers first: DMs handled, bookings made, consults completed, anything the bot got wrong.
- [ ] Ask the only question that matters: **"If I switched this off tomorrow, what would you go back to doing?"** A vague answer means it is not embedded yet.
- [ ] Log every complaint verbatim. Do not paraphrase into feature requests — the raw words are the product signal.
- [ ] Fix the top irritant within the week and tell them you did. This is what converts a pilot into a reference.

## Stage 5 — Month 1 (the fork)

- [ ] Pull their real cost to serve and check it against the pricing board.
- [ ] Ask for the reference conversation promised in clause 7.
- [ ] Ask for one introduction to another doctor. Every founding doctor should produce at least one.
- [ ] Decide: convert to Standard, keep at founding rate, or end it cleanly and write down why.

---

## What to write down as you go

Fill this in during the pilot, not afterwards from memory.

| Question | Answer |
|---|---|
| Where did they hesitate during setup? | |
| Which setting did they get wrong on the first try? | |
| What did they call the product when describing it to someone else? | |
| Consults in month 1 | |
| Actual cost to serve | |
| Would they pay ₹7,500? | |

The first two rows become the in-product onboarding fixes. The third becomes your marketing copy — a doctor's own words will beat anything you write. The last three go back into the pricing board.

---

**Created:** 2026-08-16.
**Owner:** Founder.
**Status:** `Draft` — rewrite after doctor #1; this is a hypothesis about onboarding until it survives one real run.
