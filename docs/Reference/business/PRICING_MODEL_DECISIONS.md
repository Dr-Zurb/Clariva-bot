# Pricing model — decision log (working)

> The **structure** is locked. The **numbers** are not. When a number settles, copy it into
> [`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md).
>
> The point of this doc is the **Ruled out** section — options we killed and why, so we don't re-litigate them in three months.

**Owner:** Founder (commercial). **Started:** 2026-08-18.

---

## Locked — structure

1. **Flat fee per consult. Never a percentage of the consultation fee**, in any form, including hybrids.
2. **We are never in the patient's money flow.** When a doctor connects a gateway, the patient pays the
   doctor directly into the doctor's own account. We generate the link and read status via OAuth; we are
   never merchant of record. A connected gateway is **optional** — payments setup never blocks onboarding
   (see "Two payment modes" below).
3. **The doctor pays us on a separate monthly GST invoice**, via UPI AutoPay mandate, from their business
   account — like rent or staff salary. Nothing is ever deducted from a patient's payment.
4. **One rate across text, voice, and video.** No per-consult price that changes with a clinical
   decision (chat vs video). The in-clinic exception is locked #10 — a cost axis, not a clinical one.
5. **Billed on the completed teleconsult**, never on the booking. Cancellations, no-shows, and
   in-clinic visits are free.
6. **Invoice wording is technology, not commission** — "Platform subscription and usage — N
   teleconsultations, {month}". Never "commission" or "share of consultation revenue".
7. **The standard bill is capped.** One published monthly maximum per practice, identical for every
   account — derived from the UPI AutoPay ceiling and the cost of the human alternative, never
   negotiated per doctor (derivation in "The plan" below). Growth must never feel dangerous.
8. **Above fair use, custom plans come from a formula, not a negotiation.** Same shape — base + included
   volume + overage + its own cap — rate from the published ladder, billed on e-NACH.
9. **The base is per doctor. Desk and front-office logins are free.** An extra clinician pays another
   ₹999 and gets their own 20 included teleconsults. Capability (who practises) prices on the base;
   usage (teleconsults) prices on the meter. Charging for a receptionist seat would discourage the
   behaviour that makes us hard to remove.
10. **In-clinic visits never meter.** The ₹49 meter counts completed teleconsults only (text, voice,
    video — one rate, locked #4). The base covers the clinic.

### The two-factor test behind #1 and #2

Two independent things make a charge look like fee splitting. Both must be clear:

- **Are we in the money flow?** A deduction from the patient's payment divides the professional fee —
  even a *flat* deduction. Strong signal.
- **Is the price derived from the professional fee?** A price calculated from what the doctor earned looks
  like a share of professional income even when invoiced separately. Weaker signal, still real.

Flat fee + separate invoice clears both. Neither element does the job alone. This is why "don't be an
aggregator" and "don't take a percentage" are the same decision wearing two hats.

---

## The plan — FINAL (selling begins with this)

> Structure locked 2026-08-20 after surviving attack from both directions — "the cap limits our earnings"
> (19 Aug) and "why have a cap at all" (20 Aug). **Levels moved 2026-08-21** — the ₹99 meter was
> regressive at the exact volume the cap promised to protect (see Ruled out). The **levels** remain a
> hypothesis: validate in the first five conversations, then copy into
> [`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md).
>
> Published volume tiers, the uncapped flat meter, the ₹99 meter, and the ₹25 "simple division"
> meter were considered and killed — entries in **Ruled out** below.

**₹999 per doctor per month covers the clinic — every in-clinic visit, unlimited — plus that
doctor's first 20 teleconsults. ₹49 per completed teleconsult after. The bill can never exceed
₹12,499/month per practice.** Monthly, no lock-in. GST extra. All channels included. Cap binds at
**~255 teleconsults**.

The sentence you say:

> ₹999 a month covers your clinic — every in-clinic visit, unlimited — plus your first 20
> teleconsults. ₹49 per teleconsult after that. Your bill can never cross ₹12,499.

Never billed, at any volume:

- **In-clinic visits** — the clinic is what the base is for, however busy the OPD gets.
- **No-shows and cancellations** — a teleconsult bills only when it actually happened.
- **Everything Halo Aid handles alone** — timings, fees, directions, booking links.
- **Documentation** — prescriptions, notes, records. We never charge a doctor for practising safely.
- **Reconnects** — one teleconsult, not two (idempotent flag; common on Indian mobile networks).
- **Follow-up messaging inside an already-billed visit** — answering a patient you already saw
  does not create a new meter event (open Q21 for the window).

A *new* async consult — clinical advice to someone this doctor has not billed for — bills at ₹49
when the **doctor** sends a clinical reply. One rate for text, voice, and video (locked #4). Extra
doctors pay another base (locked #9). Desk and front-office logins are free.

### Worked examples — the pricing page IS this table

Teleconsult counts only. In-clinic volume does not appear.

| The doctor's month | Bill (ex-GST) | Effective ₹/teleconsult | % of ₹700-fee revenue |
|---|---|---|---|
| Any in-clinic volume, 0 teleconsults | ₹999 | — | — |
| 20 teleconsults | ₹999 | ₹50.0 | 7.1% |
| 60 teleconsults | ₹2,959 | ₹49.3 | 7.0% |
| 100 teleconsults | ₹4,919 | ₹49.2 | 7.0% |
| 130 teleconsults | ₹6,389 | ₹49.1 | 7.0% |
| 200 teleconsults | ₹9,819 | ₹49.1 | 7.0% |
| 255 → 500 teleconsults | **₹12,499, flat** | ₹49 → ₹25 | falling |
| 600 in-clinic + 100 teleconsults | ₹4,919 | — | clinic is in the base |

That constant ~7% column is the property the 21 Aug rewrite was for: **about ₹49 a patient whoever
you are, cheaper once you're big** — flat-then-falling, no hump. Tiers as illustration, meter as
mechanism — tier-style scannability with no bucket edges, no breakage, no forced forecasting.

### Quote GST-inclusive numbers to doctors

Medical services are GST-exempt, so **a doctor cannot claim input credit on our 18%** — unlike a normal
B2B buyer, they eat it. The numbers they actually experience: **₹1,179 base · ₹58 per consult ·
₹14,749 absolute maximum**. Use these in conversation; invoices stay standard (ex-GST + GST line).

### Why the cap is ₹12,499 — two independent derivations

1. **The payment rail.** ₹12,499 + 18% GST = ₹14,749, just under the ₹15,000 UPI AutoPay auto-debit
   ceiling. Above it every debit needs re-authentication → missed notification → failed debit →
   **involuntary churn**, one of the quietest killers in subscription businesses.
2. **The make-vs-buy line.** A receptionist is ₹12,000–20,000/month. Price above that and a high-volume
   doctor rationally hires the human stack instead (receptionist + VA + cheap EMR ≈ ₹25–30k replaces us).
   The cap is **the price of keeping the customer once they're big enough to replace us** — not
   generosity.

Two unrelated constraints landing on the same number is what a real number looks like.

The cap's sales job matters more than its billing job. It is the pre-emptive answer to the first
objection every usage-priced product triggers — *"what if my bill explodes?"* — at the signing moment.
**The cap is a promise to the 50-consult doctor, not a price for the 500-consult doctor.** Uncapped is
simpler to say; capped is simpler to sign. It also means no doctor ever has a reason to ration bookings:
growth is safe by construction, which is the mission in invoice form.

The 20 Aug sheet broke that promise in the middle of the market: at ₹99 the cap bound at 131 consults,
so the "ceiling you'll never touch" was an ordinary monthly bill. The 21 Aug meter restores the
promise — see "Why the meter is ₹49" below.

### Why the meter is ₹49 — two independent derivations

The cap is pinned (UPI ceiling). The base stays ₹999 (market entry band; covers fixed cost at ~15
doctors). With those two locked, **the meter rate *is* the cap-hit point**:

| Rate | Cap binds at |
|---|---|
| ₹99 (superseded) | 131 consults |
| ₹79 | 160 |
| ₹69 | 182 |
| **₹49** | **~255** |
| ₹39 | 310 |
| ₹29 | 412 |

Two unrelated tests land on ₹49:

1. **The cap-hit should land where the receptionist story is literally true.** Nobody hires a
   receptionist for 6 patients a day, so ₹12,499 at 131 consults feels like rent. At ~250/month
   (10/day sustained), receptionist-replacement is simply true. Rate that lands there: ₹49.
2. **The marginal rate should pass the constant-fairness test at typical fees.** ICP charges
   ₹700–1,000. ₹49 is 7.0% of ₹700 and 4.9% of ₹1,000 — on the ≤4–5% fairness line already used
   for custom quotes. ₹99 was double it.

A small refinement rides along: include **20** consults in the base (20 × 49 = ₹980 ≈ ₹999), so the
framing is clean — *the base is your first 20 consults*.

**What it costs us.** A 100-consult doctor pays ₹4,919 instead of ₹9,414. A modeled founding cohort
(6 small @ 40, 3 growing @ 120, 1 established @ 400) is ~₹42k/month vs ~₹68k — about **−38%**. That
is the price of the feel, paid in real rupees. Pre-Gate-1 marginal margin thins to (49 − 36.46)/49 =
**26%** (was 48% when we still believed today's cost was ₹25.70); after the 31 Aug stack it is 87%.
Gate 1 is non-negotiable. The steelman for keeping ₹99 — each converted consult is worth ₹700–1,000, so ₹99 is
obviously worth it *consult-by-consult* — is true and loses on feel. Bills are experienced as a
monthly total against the mental "software" category, which this market has set at ₹1–4k flat
(Practo Ray ₹999, Lybrate ₹799–1,499, Cliniify ₹999–2,500, Medisray ₹999). ₹9,414 breaks that
category by 3–9×. Competitors build entire campaigns against per-booking meters
([Medisray](https://medisray.com/pricing/), [Cufront on Practo Ray](https://www.cufront.com/blog/practo-ray-pricing-india-worth-it-2026)).
The one pure per-appointment player found, Doxxy, charges ₹10/consult for a bare scheduler+EMR —
the honest answer: "₹10 tools put a row in a calendar; this answers 400 DMs at 2am, runs the video
visit, and writes the record."

This sheet fits the ₹700–1,000+ creator ICP. At a ₹500 fee (budget GP), even ₹49 is 9.8% — out of
scope, and that's fine.

### Fair use and the custom formula (500+)

The cap covers up to **500 consults/month**. Nothing shuts off past that — consult #501 books normally.
When a doctor sustains **300+ for two consecutive months, we reach out first** and quote from the ladder:

| Committed volume | Effective ₹/consult | Example quote |
|---|---|---|
| 500 (the cap point) | ₹25 | — standard plan |
| 750 | ~₹22 | ₹16,999 incl. 750, ₹22 after |
| 1,000 | ~₹20 | **₹19,999 incl. 1,000, ₹19 after, capped ₹24,999** |
| 1,500+ | **₹18 floor** | below this, gross margin dips under 60% at the Aug-19 ₹7.16 planning cost |

Same shape as the standard plan (base + included + overage + cap), billed on **e-NACH** — UPI AutoPay
can't carry it. Sanity checks before any quote: **≤4% of the doctor's estimated consult revenue ·
≥60% gross margin · below their staffing alternative** (a practice this size needs 2+ staff, ₹25–40k).

A formula, not a negotiation: every doctor gets the same answer at the same volume. The 1,000-consult
check: revenue ₹19,999 − cost ~₹7,630 → **62% margin, 2.0% of their revenue** at a ₹1,000 fee.

**The ₹49 meter does not move this ladder.** Custom rates were never derived from the meter — they
are pinned by the cap (₹12,499 ÷ 500 = ₹25, the entry point) and the cost floor (₹18 was 60%
margin at the Aug-19 ₹7.16 planning number; at the 31 Aug after-cut ₹6.55 the same rule would
allow ~₹16, so ₹18 has more cushion). Halving the ladder "for consistency" would put quotes at
₹9–12 against a real cost and break the ≥60% rule. The 20–255 zone had a fairness hump; the custom zone never did
(already 2–3% of doctor revenue).

What the meter *did* change is the story the two pieces tell together. Under ₹99 the effective
rate rose to ₹95 at 131, fell to ₹25 at 500, then continued down the ladder — a hump. Under ₹49
the whole curve is monotonic: ~₹49 flat through 255, falling to ₹25 at 500, then ₹22.7 / ₹20 /
₹18 on custom. One sentence at any size: *"the more you do, the less each consult costs —
forever."* The 750-consult quote (₹16,999 vs staying capped at ₹12,499) is now a "+₹4,500 for
committed volume, a higher cap, and e-NACH" upsell — 3.2% of their revenue at a ₹700 fee — not a
rescue from a painful meter. The marginal-₹0 stretch also shrank, 369 consults (131→500) to 245
(255→500). Not gone — a pinned cap can't erase it — but smaller.

Two watch-items. **Pre-Gate-1, custom plans are underwater** — ladder rates of ₹18–25 against
today's ₹36.46 cost. Do not quote one until the cost-cut stack ships. And the **300+ outreach trigger**
now lands ~45 consults after the doctor first hits the cap (~255), which can read as "I just
reached the ceiling and you're already selling a bigger plan." Keep 300 and frame it as a
heads-up about the 500 fair-use line, or nudge the trigger to sustained ~400 so they get a few
capped months first. Pick the framing before the first such call (open Q17).

### Founding ten

Base waived for 3 months — the doctor pays only ₹49 per completed teleconsult, cap applies.
In-clinic stays included. Price locked for 12 months. **In exchange for a case study and two warm
intros — never for nothing.** After ten doctors the offer is gone and never returns.

### The pitch, in order

One product, two openers. The price sheet is the same.

**Creator (ICP #1):**

1. **The category:** "Turn your audience into your practice."
2. **The price:** "₹999 a month covers the clinic and your first 20 teleconsults. ₹49 after that.
   Patient doesn't show — you pay nothing."
3. **The promise:** "Whatever happens — 200 teleconsults, 500 teleconsults — your bill can never
   cross ₹12,499."
4. **The proof:** "If it recovers one patient in twenty that you'd have lost in your DMs, it's paid
   for itself."

**Clinic (ICP #2):**

1. **Anchor on the human:** "A receptionist costs ₹15,000 a month and sleeps at night. This doesn't."
2. **The price:** "₹999 a month covers every in-clinic visit. Teleconsults meter at ₹49 after the
   first 20. Desk logins are free." Same sheet whether they came from Instagram or not.
3. **The promise:** same cap sentence.
4. **The proof:** the receptionist arithmetic in [`ICP_AND_FIRST_CUSTOMER.md`](./ICP_AND_FIRST_CUSTOMER.md).

The public `/clinics` page no longer prints this sheet in the hero — it is a records pitch.
The sentence above is still the one you say on a call. The in-product disclosure lands when
they add teleconsult hours (Q24).

Never lead with the cap number — it's the safety line, not the headline. Never anchor on EMR prices
(cost-centre products; see Ruled out). What to watch in the first five conversations: **where they
flinch — base, meter, or cap**. If the flinch is at the meter's *existence* rather than its level, the
fallback is more included volume in a higher base — never the uncapped meter or tiers (both already
in Ruled out). Plus actual consult durations and DM → booked → completed conversion.

### Why the base fee includes consults instead of sitting on top

A ₹999 platform fee *plus* ₹49 per teleconsult reads as being charged twice. The same money framed as
"₹999 covers the clinic and your first 20 teleconsults" reads as a plan. Nobody thinks a phone plan
is double-dipping.

The base is load-bearing regardless of framing: fixed monthly costs are ₹12,000–20,000, so ~15 doctors
on the base alone covers the month. Pure per-consult pricing leaves low-volume doctors costing more in
support time than they pay.

### Why one rate and not chat ₹49 / video ₹99

A modality-based price puts a price tag on a **clinical decision**. A doctor picking chat to save ₹50 is
choosing modality for a commercial reason — indefensible in a product sold on medico-legal safety. One
meter also means no disputes about which bucket a consult fell into.

Cost does differ by modality, but **far less than when this was first argued**. On today's stack it is
chat ≈ ₹17 (AI + WhatsApp + Razorpay) against video ≈ ₹36. After the 31 Aug picks a text consult is
≈ ₹2.50 and a 6-minute video consult ≈ ₹6.55 — the gap that once made modality pricing tempting has
mostly closed on its own.

The closed gap also dissolved the DM-only plan question (open Q15): one plan, one rate, all
teleconsult modalities — there is no longer a cost reason for a cheaper text-only variant.

### Why in-clinic is included and text is not free (locked 2026-09-12)

An in-clinic visit costs us almost nothing to run (no room, recording, composition, STT, or DM-engine
tokens on that visit). A clinic doing 20 patients a day would hit the ₹12,499 cap around day 13 if
those visits metered — the meter would be theatre, and the arithmetic would scare them off the
signature. The base covers the clinic; the meter covers the thing with real marginal cost.

Free text vs metered video is the *other* direction and stays ruled out. Today's stack: chat ≈ ₹17,
video ≈ ₹36. After Gate 1: text ≈ ₹2.50, video ≈ ₹6.55. Restructuring the sheet around a ₹4 gap
the roadmap is deleting would also put a price on a clinical decision (locked #4) — a doctor
picking chat to save ₹49 is choosing modality for a commercial reason. Messaging *inside* an
already-billed visit is the generosity that stays (never-billed list).

A second product (EHR-only SKU against EkaCare / Practo Ray) is also ruled out. Same codebase,
second onboarding path — Instagram is not required to go live. One brand, two pitches.

**Implementation integrity.** If in-clinic is free and teleconsult is metered, declared
`consultation_type` cannot be the source of truth — a video session labelled in-clinic would never
bill. Derive billable modality from whether a consultation session existed (open Q20). The ledger
already records `in_person` via `doctor_wrapup` in `appointment-service.ts`; the rollup must count
only teleconsult rows into `billableCount`. **Q20 is now a precondition of the first clinic doctor
who enables teleconsult hours**, not only of the first mixed-modality invoice — a clinic doctor's
default label is in-clinic, so a video session in a teleconsult block would otherwise never meter.
See [`plan-teleconsult-hours.md`](../../Work/Product%20plans/plan-teleconsult-hours.md).

### Why the teleconsult rate does not change for a clinic with no social (locked 2026-09-12)

The meter prices the **teleconsult**, not the channel the patient arrived on. A doctor who said
"Not yet" on Instagram pays the same ₹999 / 20 included / ₹49 / ₹12,499 as a creator. A cheaper
clinic-only teleconsult rate would be a second sheet (ruled out as the EHR SKU). A more expensive
one would charge more for the identical clinical event.

Cost, if anything, runs the other way. Today's ₹36.46 per 6-minute consult is roughly ₹15 of AI
that scales with DMs, not consults, sitting on ~₹21 of room, recording, composition, and STT. A
doctor with no Instagram generates none of that DM-engine load, so their consult is cheaper to
serve — the base absorbs less un-metered AI. Treat ~₹21 as a direction, not a measured number
(open Q1 / Q23). Do not cut the rate on that guess.

What *does* change is volume. A creator's teleconsult count is an output of DM conversion. A
clinic doctor who blocks dedicated teleconsult hours turns volume into a **scheduling decision**
— they will fill those blocks from an existing patient list. Three hours a day at ~6 minutes is
~30/day, ~650/month on 22 working days: past the cap (~255) and past the 500 fair-use line.
On today's stack that doctor costs ~₹24,000 against ₹12,499 of revenue. After Gate 1 (₹6.55)
it is fine. This is the scenario that makes Gate 1 urgent and the custom formula a real
conversation (open Q23).

The 20 included consults are a genuine teleconsult trial for clinic doctors. Clinic ARPU is
₹999 until they commit hours, then it steps up. Disclose the meter at the moment they add the
first teleconsult block — `/clinics` no longer prints ₹49 (open Q24).

---

## Ruled out

### 5% (or any %) of the consultation fee

- **We would have to audit our customer's revenue.** To charge a percentage we must know what the patient
  paid. Not being in the money flow, we either read the doctor's Razorpay transactions or trust the fee
  they configured — and a doctor can set ₹500 in Halo Aid while charging ₹2,500 through their own link.
  A flat fee means we count consults in our own DB (`tryMarkVerified` already does this). A percentage
  means implying monthly that the doctor may be understating their income. **This is the decisive reason.**
- **It is a claim of credit we cannot make.** A percentage says "we sourced this patient." Practo can say
  that — their marketplace produced the patient. We can't: the doctor's own audience produced them.
  The first doctor to think about it says *"Practo takes 30% because they found me the patient; you found
  me nobody, this is my own Instagram."* That argument is lost on fairness, not law.
- **Legally exposed, and the customer carries it.** See the legal basis note below. Penalty falls on
  *the doctor's* licence, not ours — a fatal contradiction for a product sold on compliance.
- **Decoupled from cost.** Our cost is driven by *minutes*, not by the doctor's fee.
- **Pays less at real fee levels.** Crossover where 5% = ₹99 flat is a **₹1,980** consult fee. Field
  observation is ₹1,000 becoming the norm, ₹2,000–2,500 for dermatology. So flat pays *more* for the
  typical doctor and less only at the premium top end.

| Consult fee | 5% pays us | Flat ₹99 pays us |
|---|---|---|
| ₹1,000 (stated norm) | ₹50 | **₹99** |
| ₹1,500 | ₹75 | **₹99** |
| ₹2,000 | ₹100 | ₹99 — even |
| ₹2,500 (top-end derm) | **₹125** | ₹99 |

**Capture premium value in the price *level*, not the price *shape*.** If conversion is worth more than
the published meter, raise the meter on a future cohort. Same money, no argument to win. The ₹99
column above is the 20 Aug illustration; the decisive reasons (audit, claim of credit, legal) do
not depend on the level. The 21 Aug meter is ₹49.

### Hybrid: flat ₹50 up to a fee threshold, then 5% above

Rejected. It inherits *every* problem of the percentage — we still need to know the consult fee just to
know which side of the threshold we're on, so the revenue-audit problem applies in full. It also puts the
legal exposure precisely on the premium (₹2,500 dermatology) accounts we can least afford to lose, and
it's two rules to explain instead of one while we have zero customers.

Charging the percentage via the UPI mandate instead of deducting from the patient's payment *does* solve
the RBI aggregator problem — but not the audit problem, which is the one that matters.

### Collecting the patient's fee and paying the doctor out later

- **Requires an RBI Payment Aggregator licence.** Master Direction on Regulation of Payment
  Aggregators, 2025: ₹15 crore net worth at application, ₹25 crore within three years, escrow with a
  scheduled bank, PCI-DSS, 4–6 month approval. Not reachable while bootstrapped.
- Holding funds for fortnightly/monthly payout *is* the regulated activity (pooling patient funds).
- Re-opens the fee-splitting problem — deducting our fee from the patient's payment is a division of the
  fee regardless of whether our cut is flat.
- **Breaks the flat fee.** Razorpay charges 2% + 18% GST **including on UPI**. On a ₹3,000 consult that
  is ₹70.80 of MDR against a ₹99 fee. A percentage cost against flat revenue makes premium doctors the
  biggest losses.

**Instead:** two separate money flows. When the doctor connects a gateway, the patient pays the doctor
directly into the doctor's own account (we generate the link and read status via OAuth, never as
merchant of record). Connecting a gateway is optional — see "Two payment modes". The doctor pays us
monthly on a GST invoice either way. This also keeps us out of being the guarantor of the service,
consistent with the "tool, not the doctor" P0 disclaimer.

### Charging at booking rather than at the consult

- Doctors will not pay for no-shows. "You only pay when the patient actually shows up" removes the
  objection before it is raised.
- **Characterisation risk — weaker than first assessed.** The "RMP shall not use online forums or agents
  for procuring patients" clause is in the **2023** regulations, which are in abeyance (see below), so it
  is not currently operative. Still worth avoiding: the 2023 regs are suspended, not repealed, and
  *per consult conducted* is unambiguously a software usage fee at no extra cost to us.
- The value argument ("they got that patient because of us") is real — capture it in the **price level**,
  not the billing trigger.

### Benchmarking price against EMR software (EkaCare ~₹8,000/yr)

Those prices are venture-subsidised loss leaders monetised elsewhere (Practo Ray → marketplace fees;
EkaCare → health-stack/enterprise). An EMR is a **cost-centre** purchase; ours is a **revenue and risk**
purchase. Anchor against a receptionist salary (₹12,000–20,000/mo), per
[`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md) line 13.

### Published volume tiers (Starter ₹999 / Growth ₹4,999 / Practice ₹11,999)

The 2026-08-19 leaning; replaced by one-rate-plus-cap on 2026-08-20.

- **The degressive rates (₹99/69/49) weren't cost-derived.** Account overhead justifies ~₹31 of
  per-consult spread at those volumes; the published spread was ₹50. The rest was convention.
- **The feature gates were mostly filler.** Analytics, booking page, API — withholding cheap things to
  manufacture tier differences. Channel-gating WhatsApp was self-harm in an India product. Seats and
  support are the genuine differentiators — they now live on the base, not the meter.
- **Every rung invites negotiation** for the next rung's rate. A cap invites none.
- **Bucket edges are cliffs.** Consult #101 on a 100-consult bucket must be blocked (unthinkable in a
  healthcare product), auto-upgraded (bill shock), or metered (the meter returns with extra steps).
  Healthcare buckets always degenerate into meters — better to publish the meter honestly.
- **Breakage taxes the median customer.** A 60-consult doctor forced into a 100-consult bucket pays ~65%
  more than metered, for nothing — monetising the customer's forecasting errors. A creator's volume is
  algorithm-dependent and unforecastable by nature; buckets force a monthly forecasting decision the
  meter simply removes.

The legitimate descendant of tiers: **optional prepaid volume plans after month 3**, doctor-initiated,
once their own volume is known — a modest discount for commitment (predictable revenue), never a forced
forecast. "Grow on the meter, settle into a plan."

### Uncapped flat meter ("simple math — more patients, more pay, forever")

Tempting on three separate occasions; killed each time for the same reasons:

- **At scale it becomes the percentage we already ruled out.** ₹99 flat at a ₹1,000 fee is 9.9% of
  revenue at every volume, forever. Defending ₹74,250/month to a 750-consult doctor requires *"you earn
  because of us"* — the exact claim-of-credit argument conceded as lost in the 5% entry above. The
  patients come from the doctor's content, face, and reputation; the software processes each one for ~₹7.
- **It prices above the make-vs-buy line precisely where the doctor can afford the alternative.**
  ₹74k/month vs a ₹25–30k human stack. ~93% gross margin on the biggest account is rent, not a price —
  sophisticated accounts detect it and leave. Adverse selection at the top: the doctors most worth
  keeping have the most reason to go.
- **Open-ended worst cases block signatures.** Every doctor privately models their worst month before
  signing an uncapped meter. The cap does that math for them once, in the pitch.
- **Anti-mission.** A curve that extracts more the better the product works punishes the exact outcome
  the product exists to create.

**The both-directions test:** the cap was attacked as too generous ("limits our earnings", 19 Aug) and as
unnecessary ("limits their payments", 20 Aug) and survived both. A design that fails both opposite
critiques is usually right. Stop re-litigating it.

### ₹99 meter (the 20 Aug sheet)

The first published-level hypothesis: ₹999 incl. 15, ₹99 after, cap ₹12,499. Structure was right;
the *level* made the cap bind at 131 consults — an ordinary month for a growing doctor, not a
ceiling. Effective ₹/consult *rose* through the entire growth phase and peaked at the cap
(₹95.3 at 131, 13.6% of a ₹700 fee), then fell for the already-big. Locked #7 says growth must
never feel dangerous; the doctor paying the highest rate was the exact person that promise was
written for. Time-to-max made it visceral: at 10 consults/day the bill maxed on day 13; at 30/day,
day 4. "I used it a week and it's already maxed" was literally true.

The founder flinching at that sheet counts as the first customer conversation. Market corroboration
the same day: solo-doctor India software clusters at ₹1–4k/month *flat*, and per-booking pricing is
the attack line competitors lead with. Replaced 2026-08-21 by ₹999 incl. 20 / ₹49 / same cap.
Raising the level on *future* cohorts remains allowed (Q9) — winning back a doctor who left feeling
gouged is not.

### ₹25 meter ("simple division" — ₹12,499 ÷ 500)

Attacked 2026-08-21, the evening the ₹49 sheet landed. The itch: if the cap is ₹12,499 and fair use
is 500, why not just charge ₹25 a consult and let the line land on the cap at *exactly* 500 — no
dead zone, no "free till 500", one number. Strongest construction: **₹999 including 40, ₹25 after**.
Custom still starts after ₹12,499.

What it genuinely buys: maximum simplicity; a perfectly monotonic curve into the custom ladder
(₹25 → ₹22 → ₹20 → ₹18); the feel problem annihilated (a 130-consult doctor pays ₹3,249); closest
possible approach to the Doxxy ₹10 anchor; 3.6% of a ₹700 fee at every volume.

Why it still dies:

- **Underwater on day one.** Today's cost is ₹36.46. At ₹25 you lose ₹11.46 on *every* consult until
  Gate 1 — not just the high-volume tail. The ₹49 sheet earns 26% today; this sheet cannot be sold
  before the cost-cut stack lands. Launch becomes hostage to unshipped vendors.
- **Zero cushion even after Gate 1.** After-cut cost ₹6.55 is 74% margin at ₹25; the planning number
  ₹8 is 68%, with little spare, on unmeasured AI cost (Q1) and no unconverted-DM burn. ₹49 absorbs a
  cost surprise; ₹25 does not.
- **Revenue halves again.** Ten-doctor mix: ₹99 sheet ≈ ₹68k → ₹49 sheet ≈ ₹42k → ₹25 sheet ≈
  **₹25k**. Covering fixed costs plus a ₹50k founder draw needs ~19 mixed doctors at ₹49 vs ~36 at
  ₹25. At zero customers that gap is existential.
- **₹25 is the price of a 500-consult commitment, not the walk-in price.** Giving it away at the
  door deletes the reason the custom ladder exists — there is nothing left to graduate *to*. Volume
  discounts fund a company only if low volume pays more than high volume.
- **Adjustment is one-way, against the "we'll adjust with real data" logic.** Dropping a price later
  is applause. Raising one is a churn event. From ₹49 you can move either direction after the first
  five conversations. From ₹25 you can only ever go up.

The 255→500 marginal-zero stretch is not "free consults" — it is the glide from ₹49 down to ₹25.
Every extra consult in that zone is pure upside for the doctor. That is the month the cap keeps its
promise. Removing the zone by pricing at the floor pays ~50% of mid-zone revenue for aesthetics.

**₹25 stays what it already is: the rate you sell in exchange for a 500-consult commitment.** Not
the rate you give away at the door.

### Free text / metered video (or any teleconsult-modality split)

Attacked 2026-09-12 as "genuine pricing" — video costs more to record and store, so charge video
and give text away. Dies on three independent grounds:

1. **The expensive line is the DM engine, not recording.** Today's ₹36.46 is ₹15 AI (scales with
   DMs, not consults) against ₹4.58 room + ₹4.58 recording + ₹5.73 composition. Text is ≈ ₹17
   today, not ₹0. After Gate 1 the text/video gap is ≈ ₹4.
2. **It reopens locked #4 in the unsafe direction.** A doctor picking chat to save ₹49 is choosing
   modality for a commercial reason. If a case goes wrong, that price tag is discoverable.
3. **The generosity already exists.** Messaging inside an already-billed visit is free. A *new*
   async consult bills like any other teleconsult.

Capture video's extra cost in the **level** on a future cohort (Q9), not in a second meter.

### A separate EHR SKU for physical clinics

Attacked 2026-09-12 as a second product to fight EkaCare / Practo Ray. Dies because those prices
are venture-subsidised loss leaders (already Ruled out under EMR benchmarking), because it inverts
the thesis (EMR = cost-centre; we sell a revenue-centre), and because it volunteers onto the
incumbents' turf. The prize — a paying clinic before Meta unblocks Instagram — is a **second
onboarding path**, not a second product. Instagram is not required to go live. Same brand, two
pitches (see "The pitch, in order").

### A cheaper teleconsult rate for doctors not on social

Attacked 2026-09-12 as "clinic path, no DM engine, so charge less." Dies because the meter
prices the consult, not its origin — a second number is a second sheet (the EHR SKU again).
Their consults are cheaper to serve (no DM-engine tokens), which is an argument against
raising the rate, not for cutting it. Same ₹999 / 20 / ₹49 / ₹12,499. See the lock above.

### Metering in-clinic visits

A clinic at 20 patients/day hits the ₹12,499 cap around day 13. The revenue difference between
metering those visits and including them in the base is close to zero, and the scary arithmetic
(₹49 × 800) is the attack line competitors already use against per-booking meters. Locked #10.

---

## Legal basis — get this citation right

**The NMC Professional Conduct Regulations 2023 are NOT in force.** They were
[held in abeyance by gazette notification on 23 August 2023](https://medicaldialogues.in/health-news/nmc/breaking-news-nmc-puts-its-controversial-registered-medical-practitioner-professional-conduct-regulations-2023-put-on-hold-116314),
three weeks after coming into force, after the row over mandatory generic prescribing. An RTI reply dated
January 2026 confirms they remain in abeyance. Do not cite them as operative.

**In force:** Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations, 2002,
clause 6.4 "Rebates and Commission":

> A physician shall not directly or indirectly, participate in or be a party to act of division,
> transference, assignment, subordination, rebating, splitting or refunding of any fee for medical,
> surgical or other treatment.

Same broad standalone sentence, same referral extension in 6.4.2, same salary carve-out. **The
fee-splitting conclusion is unchanged.**

What did *not* survive into the operative regime: the "online forums or agents for procuring patients"
clause and the social-media clauses about apps charging for higher ratings or soliciting patients. Those
were 2023-only.

### Clause 6.1 — the constraint on anything we sell *later*

Separate from fee splitting, and operative today. IMC 2002 **clause 6.1**: a physician shall not, directly
or indirectly, solicit patients or advertise themselves.

This does not touch the current product, and that is not luck — it follows from what we sell. Educational
content is
[explicitly permitted](https://ichelonconsulting.com/insights/nmc-ethics-code-2026-marketing-rules-doctors),
and so is "available for online consultations — book at [link]". We convert the doctor's own inbound and
say nothing about outcomes. Safe by construction.

It bites the moment we monetise **growth** services (phase 3, see
[`PRODUCT_PHASES.md`](./PRODUCT_PHASES.md)). Standard creator-growth tooling ships features that are
prohibited for Indian doctors: testimonial and review collection, before-and-after galleries without
consent documentation, superlative claims, and buying followers or algorithm placement. A review widget is
unremarkable SaaS and a licence risk here.

**Pricing consequence:** growth services must be priced and worded as *doctor* development — education,
craft, compliance — never as patient acquisition. The moment an invoice or a pricing page implies we
procure patients, we hand a doctor the exposure this whole structure was built to avoid.

---

## "How is Practo legal then?" — the answer to give a doctor

Practo charges, per their own [Prime terms](https://help.practo.com/practo-ray/calendar/practo-prime-terms-and-conditions/):

> higher of 20% of the online consultation fees and INR 50 inclusive of taxes will be levied as the
> technology fees… Consultation fees will be collected from patients via online payment mode and will be
> transferred to the bank account specified after deducting the above-mentioned technology fees.

They [raised it to 30% in August 2022](https://help.practo.com/practo-consult/prime-online-price-revision/).
So: 20–30%, collected from the patient, remitted net. Exactly the model we ruled out.

Why it stands:

- **The regulator has no jurisdiction over Practo.** NMC and state medical councils regulate *doctors*.
  If the arrangement is unethical, the doctor faces suspension; the platform faces nothing. That
  asymmetry is the whole reason the model exists.
- **It has been challenged, not blessed.** The IMA's secretary general has publicly called portal cuts
  and doctor listing fees illegal. It is unenforced, not approved.
- **Enforcement is near-zero.** State medical councils rarely act on ethics violations.
- **Language.** They write "technology fees" and "platform development fee" — never "commission".

**The difference that matters:** Practo's marketplace *produces* the patient, so a percentage is a true
claim of credit. Our patients come from the doctor's own audience. Same structure, different claim.

Also note Practo's own floor — "**higher of 20% and ₹50**". Even they don't trust pure percentage pricing,
for the cost-decoupling reason above.

---

## Billing trigger — reuse the pipeline, but `verified` ≠ `billable`

`tryMarkVerified` in `backend/src/services/consultation-verification-service.ts` implements a
**"who left first"** rule rather than a flat duration threshold:

1. Patient no-show → verified ⚠️ **must NOT bill — see the defect below**
2. **Patient left first → verified, no duration check at all**
3. Doctor left first → requires overlap ≥ `MIN_VERIFIED_CONSULTATION_SECONDS` (60)
4. Fallback (left-at timestamps missing) → raw duration ≥ 60s

This already handles the short-consult case: a 30–40 second follow-up where the patient hangs up passes
via branch 2 with no duration gate. The 60s only guards the ambiguous case (doctor left immediately after
the patient joined) — which is what the March 2026 task note says it was for.

> ⚠️ **The no-show defect (found 2026-08-20).** Branch 1 marks a patient who never joined as `verified` +
> `completed` (service lines 507–511). That was *correct* for the old payout model — the doctor showed
> up, the doctor gets paid. Reused raw as the billing meter, it **bills the meter for a ghost**, contradicting
> locked #5 and the flagship pitch line ("patient doesn't show — you pay nothing") on the very first
> invoice that contains one. The meter needs its own definition:
> **billable = verified AND `patient_joined_at` IS NOT NULL** (async equivalent: the doctor sent a
> clinical reply). Gate 2 below.

**The real gap: OPD token mode.** In high-volume follow-ups the *doctor* ends the call ("reports normal,
continue, next"). That lands in branch 3 and a 35-second consult fails it — no billing event and the
appointment never flips to `completed`.

Fix: distinguish an **explicit doctor-initiated end** (a deliberate act in our UI) from a participant
simply disconnecting (possibly network). Verify on explicit end regardless of duration; keep the 60s floor
only for the disconnect case. Note `env.ts` floors `MIN_VERIFIED_CONSULTATION_SECONDS` at 60 via
`Math.max(60, …)`, so lowering the number is not the lever.

Other rules:

- Not on booking / payment / slot time — cancellations and no-shows are free, and that is a selling point.
- **Not on record creation.** Billing on the consult note or prescription would tax the exact behaviour
  the product exists to produce. Documentation stays free and encouraged. Fine as *one of several*
  positive signals; never as the sole trigger.
- **No patient-side confirmation as a billing gate.** Survey response rates are low and it makes revenue
  depend on someone with no stake. Keep patient feedback for quality, not metering.
- **Async equivalent:** a *new* teleconsult bills when the *doctor* sends a clinical reply.
  Bot-only administrative messages (timings, location, fees, booking link) are free forever.
  A clinical reply *inside an already-billed visit* is free (never-billed list; open Q21).
- **Every completed teleconsult bills at ₹49, including follow-ups the doctor gives away free**
  (Q4, resolved 2026-08-22; restated 2026-09-12 as teleconsult-only). Our meter counts
  teleconsults our software delivered; it does not read the doctor's fee schedule. In-clinic
  follow-ups are included in the base. See "Follow-ups bill at full rate" below.
- Reconnects are one consult, not two — idempotent flag on the appointment. Common on Indian mobile networks.
- Errored/failed sessions → `void`, flagged for review. Under-bill rather than look dishonest.

### Follow-ups bill at full rate

> Resolved 2026-08-22, settling Q4; restated 2026-09-12 as teleconsult-only. **Every completed
> teleconsult bills ₹49, whatever the doctor charged the patient — including ₹0.** In-clinic
> follow-ups are included in the base (locked #10).

What the product already lets a doctor configure is much richer than "free or paid". `followUpPolicyV1Schema`
in `backend/src/utils/service-catalog-schema.ts` accepts five discount types (`none`, `percent`, `flat_off`,
`fixed_price`, `free`), up to **100** follow-ups, an eligibility window up to **3,650 days**, per-visit-ordinal
tiers — and all of it settable **per modality**, so free text follow-ups can sit beside ₹300 video ones.
Consumption is tracked per episode in `care_episodes` against a locked `price_snapshot_json`.

Three reasons we do not mirror any of that:

1. **It would make our revenue a function of their pricing configuration** — the same coupling percentage
   pricing was ruled out for, and the same fee-splitting adjacency. Computing our bill would require reading
   their fee schedule. ₹49 flat requires knowing nothing about what they charge (locked #5).
2. **The schema permits an unbounded hole.** `free` + `max_followups: 100` + a 3,650-day window is a valid
   configuration. Exempting free follow-ups means ₹0 revenue against a real ~₹36.46 cost per consult, and a
   generous paediatrician gets there without trying.
3. **It is one sentence.** "₹49 per completed teleconsult, every teleconsult" survives a WhatsApp
   explanation. "₹49 unless it is an eligible follow-up inside your configured window under your
   configured tier" does not, and every ambiguity becomes an invoice dispute.

**The concession was already made twice, at both ends.** Assuming a third of consults are follow-ups:

| Total consults | Charge all | If follow-ups were exempt | Difference |
|---|---|---|---|
| 25 | ₹1,244 | ₹999 | ₹245 |
| 60 | ₹2,959 | ₹1,979 | ₹980 |
| 150 | ₹7,369 | ₹4,919 | ₹2,450 |
| 300 | ₹12,499 (capped) | ₹9,819 | ₹2,680 |
| 400 | ₹12,499 (capped) | ₹12,499 (capped) | ₹0 |

The exemption is worth nothing below ~20 consults (the included block absorbs it) and nothing above ~275
(both paths hit the cap). It only exists in a middle band and peaks around ₹2,500/month. The 20 included
consults and the ₹12,499 cap already do this work at both ends; a third concession in the middle buys
goodwill twice-bought.

**What is genuinely different — and does need a rule:** a follow-up visit next week is a distinct consult
with distinct cost, but a patient reconnecting after a dropped call, or a doctor opening a fresh slot to
finish an interrupted consult, is *one encounter*. Billing that twice is indefensible. Reconnects on the
same appointment are handled structurally; a new appointment created to finish an interrupted one needs a
deterministic same-encounter rule (P1.6 in the phase plan).

**Reversibility:** the ledger still carries a `free_followup` status and a `free_followup_of` reference,
dormant at launch. If founding doctors push back hard, the concession becomes a status update, not a backfill.

---

## Cancellations and refunds — the non-aggregator refund rail

> Decided 2026-08-21, settling open Q7. The confusion this section kills: treating "not the aggregator"
> as "can't automate refunds". Those are different axes. **Custody** is whose account holds money in
> transit; **control** is who can initiate actions via API. Zero custody with full control is exactly
> what Razorpay's API allows: we initiate the refund, the doctor's own account pays it.

The rail extends locked #2: the patient paid into **the doctor's own Razorpay account**, so a refund is
a Razorpay API call **on that account** — the same OAuth connection that creates the link and reads the
webhook, with one more scope (confirming that scope is open Q8, the single blocker). Money moves
patient ↔ doctor in both directions. We are never in it.

### Structure — locked

1. **Refunds move only on the patient↔doctor rail.** The doctor's account refunds the patient. We
   initiate via API on their connected account; we never advance, hold, or guarantee the money.
2. **Amounts come from a rules table, never from AI.** Same principle as the emergency ratchet:
   deterministic floor, AI assist. The AI may classify the free-text reason, draft the localized reply,
   and flag ambiguous cases ("doctor told me to cancel") for the doctor — it never picks an amount.
   "Cancelled 30h before the slot, policy says 100%" survives a dispute; "the model read your message
   and decided 50%" does not — and it re-creates the AI-judgment liability just engineered out of the
   clinical side, with money.
3. **A 100% floor is non-negotiable and automatic**: doctor cancels, emergency flag (thread or intake
   form), or platform failure (double payment, slot gone). Goes in
   [`PILOT_AGREEMENT.md`](./PILOT_AGREEMENT.md) — accepting the floor is part of onboarding.
4. **Reschedule-first.** Before the bot confirms any cancellation it offers to move the appointment —
   a reschedule moves zero money and costs nobody anything. The DM reschedule path already exists;
   this is one line of copy in the cancel-confirm prompt.
5. **The doctor's policy is shown on the booking page before payment.** Consumer-protection hygiene
   and the best dispute killer.

### The policy table — defaults are the hypothesis

| Case | Refund | Notes |
|---|---|---|
| Doctor cancels, any time | **100%, automatic** | Floor |
| Emergency flag | **100%, automatic** | Floor; doctor alerted, pairs with the escalation design |
| Platform/tech failure | **100%, automatic** | Floor |
| Patient cancels ≥24h out | 100% | Doctor's real loss is ~₹16 of MDR |
| Patient cancels inside 24h | Configurable per doctor | **Launch default: still 100%** — add 50%/0% windows only when a real doctor shows real abuse |
| Patient no-show | No refund | Doctor's time was reserved; one-tap goodwill override in the dashboard. Never billed by us either (locked #5) |

Launch everything at 100%: pilot volumes are small, and a doctor haggling over a ₹350 partial refund in
Instagram DMs is a brand disaster that dwarfs the money.

### The economics — verified 2026-08-21

- **Normal refunds are free.** No Razorpay processing fee, 5–10 business days, full or partial, via API
  or dashboard ([docs](https://razorpay.com/docs/payments/refunds/normal/)).
- **The original ~2% + GST capture fee is never returned** — by any Indian gateway. On a ₹700 consult
  the doctor is out ≈ ₹16–17 on a full refund. That is the entire cost of a cancellation.
- **Instant refunds** (minutes instead of days) are a paid add-on at ₹8–15 per refund. Later, if ever.
- **Our own meter fee needs no refund machinery.** The meter bills on the completed consult (locked #5); a
  cancelled-and-refunded booking never becomes billable, so there is nothing to reverse on our invoice.
  Caveat: this inherits the no-show defect — Gate 2 must land first.

### Ruled out — refund domain

- **Patient-facing cancellation charges at launch.** Charging ₹50 to recover the doctor's ₹16 MDR loss
  buys angry DMs, dispute handling, and consumer-protection exposure over trivial money. The doctor
  absorbs it as cost of doing business, as with card fees at the clinic. The abuse lever, when needed,
  is the late-cancel window — never a fee on everyone.
- **AI-decided refund amounts.** Killed in structure #2; recorded here so it isn't re-proposed the next
  time "the AI can read the reason and decide" sounds convenient.
- **A credit/voucher step between reschedule and refund** (Q7's early leaning). Extra machinery whose
  effect is holding the patient's money hostage at the exact moment they are unhappy. Revisit only if
  refund volume becomes a real doctor complaint.

### What exists vs what to build

Already in the codebase (updated 2026-08-22):

- The DM cancel flow end-to-end — intent → list → pick → `confirm_cancel` — still **status only**;
  no money moves (`workers/dm/stages/cancel-reschedule-status.ts`).
- Per-doctor Razorpay keys + webhook secret + bookings-only vs prepaid (migrations 203 / 204).
- `refund` on the gateway adapter, called from `refundAppointment` (OPD overrun only, not DMs).
- `resolveRefundPolicy` — the table as a pure function. **No executor on cancel.**
- Booking-page cancel/refund disclosure (copy only).
- Modality-downgrade refund retry (`modality-refund-retry-worker.ts`).

**Parked — do not treat as next** (founder 2026-08-22): UPI AutoPay (P3) and DM auto-refund (P2.6).
They are opposite money directions. Write-up:
[`NOTE-autopay-vs-autorefund.md`](../../Work/Product%20plans/billing/NOTE-autopay-vs-autorefund.md).

Still missing if that note is reopened: refund amount + ETA in the cancel DM; dashboard goodwill
one-tap; month-close debit.

---

## Two payment modes — gateway is optional

> Decided 2026-08-21. The confusion this section kills: treating "we generate the doctor's payment link"
> as "every doctor must open a Razorpay account before they can use HaloAid." Most Indian doctors will
> say *"here's my GPay scanner, do what you gotta do with it."* That doctor is the majority, not the
> exception. Productize them. Do not lecture them.

Locked #2 is about **custody**, not about forcing a merchant account. The scanner doctor and the
prepaid doctor are both compliant with it. The refund rail above applies only to the prepaid mode —
there is nothing to refund when we never touched the payment.

### Structure — locked

1. **Payments setup never blocks onboarding.** Every doctor starts converting DMs on day one. Connecting
   a gateway is an upgrade, triggered by the doctor's own no-show math, never a wall at signup.
2. **Two official modes.** Bookings-only (no gateway) and prepaid bookings (connected gateway). Both
   are first-class. Scanner is not a degraded fallback we apologise for.
3. **Our meter does not care which mode.** The meter bills on the verified consult (locked #5), not on
   the patient's payment. A scanner-mode doctor is a full-paying customer.
4. **Never verify a payment screenshot.** Fake UPI screenshots are a scam industry in India. A static
   QR has no webhook and no API — the bot cannot confirm a slot on payment, bind an amount to a
   booking, or refund. "Send a screenshot" is worse than nothing: it re-introduces the labour the
   product exists to delete.

### The two modes

| | Bookings-only | Prepaid bookings |
|---|---|---|
| Setup | Nothing. Doctor keeps their GPay / PhonePe / cash rail. | Doctor connects their own Razorpay (or later Cashfree / PayU) account. |
| What the bot does | Catches the DM, screens emergencies, collects intake, books the slot, sends confirmations and reminders. | Everything on the left, plus the patient pays at booking, the webhook confirms the slot, and the refund rail works. |
| What it cannot do | Know that money moved. Auto-confirm on payment. Refund. | — |
| Doctor's payment cost | ₹0 MDR on personal UPI. | ~2.36% incl. GST (~₹16.50 on a ₹700 consult). |
| Our invoice | Same meter. | Same meter. |

### The upgrade pitch — after they have felt the no-shows

Be honest about the economics, because a smart doctor will do this math: a personal UPI QR is free; a
payment link costs ~₹16.50 per consult. The counter is no-shows. An unpaid teleconsult booking is a
hope; a prepaid one is a commitment. One avoided no-show at ₹700 funds the gateway fees on roughly
**40 consults**. Real unpaid-booking no-show rates are far worse than 1-in-40.

That pitch works **after** a week of scanner-mode no-shows, as an in-product nudge ("6 no-shows this
week — prepaid bookings eliminate most of these"), never as an onboarding wall.

Two secondary reasons to connect, said gently, never as a stick:

- **The account is theirs.** We hold no stake. They can use that merchant account for the rest of
  their practice (website, clinic, anything). Contrast Practo, where the rail belongs to the platform.
  Gateway freedom is already an architecture fact — `payment-gateway.interface.ts` sits next to a
  PayPal adapter; Cashfree / PayU are add-ons when a doctor demands one, not a rewrite.
- **ITR hygiene.** A dermatologist running ₹5 lakh a month through a personal GPay QR mixes
  professional revenue into a P2P rail with no settlement report. A merchant account separates that
  cleanly. "You'll want this anyway," not a compliance lecture.

We are not their Razorpay sponsor. Until a Partner-Program onboarding flow exists (open Q16), the
founding-ten version is: do the signup *with* them on the onboarding call. Free (no setup, no AMC),
doctors qualify as professional services, fifteen shared-screen minutes beats a support article.

### Ruled out — payment-mode domain

- **Forcing Razorpay before first booking.** Loses the majority doctor at the door for a feature they
  will ask for themselves after week one.
- **"Upload your QR / send a screenshot" as a third mode.** No webhook, no bindable amount, no
  refund, and a fraud surface. If the doctor wants prepaid semantics they connect a gateway. If they
  don't, they stay on bookings-only. There is no honest middle.
- **Discounting our meter for scanner-mode doctors.** The work we do (DM conversion, scheduling,
  reminders, EHR) is the same. The gateway is their rail, not ours.

### What exists vs what to build

Already in the codebase: `processSlotSelectionAndPay` in `slot-selection-service.ts` returns
`paymentUrl: null` and still creates the appointment when `amountMinor` is zero or unset. Bookings
without a payment link already work — that is the bookings-only seam.

Missing — fold into the payments session (see Code conflict):

1. Treat "no gateway connected" as bookings-only even when a fee is configured (today a configured
   fee will still hit `createPaymentLink` on the platform-level key).
2. In-product no-show nudge toward connecting a gateway.
3. Per-doctor connect flow (same item as refund-rail #1). Partner-program pre-fill is Q16, not launch.

---

## Cost inputs

Interactive board (open beside chat):
**[Cost-cut stack](/Users/abhisheksahil/.cursor/projects/Users-abhisheksahil-Desktop-Clariva-Bot/canvases/cost-cut-stack.canvas.tsx)**.
Vendor glance board stays on [`COST_TRACKER.md`](./COST_TRACKER.md).

**Working planning number: ₹8 per consult** (rounded up from ₹6.55 after the picks, until Gate 3
measures AI). FX locked at **₹95.5 / USD** (August 2026 average; earlier figures in this doc used
~₹87.5 and understated every dollar line by ~9%).

> ⚠️ **None of the vendor switches have shipped.** Until they do, the real number is **₹36.46**
> on a 6-minute consult, not ₹8 and not the superseded ₹25.70. Every pre-Gate-1 margin figure
> must use ₹36.46.

### Today's stack — ₹36.46 (6 min, 2 participants, 50/50 English/Hindi)

Researched 2026-08-31 against current vendor rate cards. Two omissions in the earlier ₹25.70
figure, both in the same direction:

1. **Recording and composition were never counted.** `consultation-session-service.ts` calls
   `startAudioOnlyRecording` on every session; compositions are registered on every consult.
   Twilio bills those as separate meters. Composition alone ($0.01/composed min) is bigger
   than the room.
2. **The rupee moved.** ₹95.5 vs the ~₹87.5 used in August.

| Line | Rate | 6-min consult | Confidence |
|---|---|---|---|
| Twilio room | $0.004 / participant / min | ₹4.58 | Firm — [Twilio Video pricing](https://www.twilio.com/en-us/video/pricing) |
| Twilio participant recording | $0.004 / participant / min | ₹4.58 | Firm — same page; code always records audio |
| Twilio composition | $0.01 / composed min | ₹5.73 | Firm — we compose; confirm on the Twilio invoice (Q3) |
| Transcription, blended | Whisper $0.006/min · Nova-2 $0.0043/min | ₹2.95 | Firm rates; mix is a guess |
| AI / LLM (`gpt-5.2` on the DM engine) | $1.75 / $14 per 1M | ₹15.00 | **Weakest — Gate 3.** Scales with DM volume, not consults |
| Storage, amortised | Twilio $0.00167/GB/**day** | ₹2.00 | Approx — compounds monthly per recording |
| WhatsApp utility templates ×4 | ₹0.115 each | ₹0.46 | Firm — Meta India 2026 card |
| Razorpay 2.36% on our ₹49 | | ₹1.16 | Firm |
| **Total** | | **₹36.46** | |

At ₹49 the marginal margin is **26%**. The ₹12,499 cap equals cost at **343 consults** — inside
the 400–800 range an established virtual practice does. The bootstrapping rule (every customer
gross-margin-positive from month one) fails on the best customers.

`gpt-5.2` is **deprecated**. OpenAI lists the GPT-5 line shutting down **11 Dec 2026**.
`DEFAULT_OPENAI_MODEL` in `backend/src/config/openai.ts` is `gpt-5.6-luna` (switched 2026-09-01).
Render / production `OPENAI_MODEL` must match or the old default still wins.

**Progress (2026-09-04).** Steps 1–3 are in. Gate 3 queried. Luna is the reply default.
Explicit cache wrote on the first live turn (`cachedTokens: 0`); hit proof and DM
latency are parked.

Step 4 is **parked, not live.** No WhatsApp product. Replay OTP remains Twilio SMS.

Step 5 code is in: English STT routes to Groq (`groq_whisper`). Key + 227 applied;
live row proof deferred.

Step 6 code is in: Hindi / Hinglish routes to Deepgram Nova-3 (`deepgram_nova_3`).
Migration 228 applied. Enqueue still defaults `en-IN`.

Steps 7–9: **not implemented in Auto.** Compose is the Twilio hook
`haloaid-consult-audio` (`HKbe336c…`). Disabling it stops the meter and bricks
new replay/transcription until LiveKit Track Egress + R2 exist. Runbook:
`docs/Reference/engineering/operations/setup/stop-composition-hook-runbook.md`.

### The picks — after-cut ₹6.55

| Surface | Today | Pick | After, 6 min | Why this, not the alternative |
|---|---|---|---|---|
| Video | Twilio Group rooms | **LiveKit Cloud** (Build free / Ship $50) | ₹0.57 room + ₹0.62 bandwidth | 8× cheaper than Twilio. Self-host ruled out (on-call for an SFU). AWS Chime ~₹4.50/15 min — worse. Use **Track Egress** ($0.001/min), never RoomComposite ($0.02/min video) |
| Recording compose | Twilio Composition | **Compose on demand** | ~₹0.6 (10% replay rate) | ₹5.73 to merge every consult, most of which nobody replays. Raw tracks are Matroska and unreadable by both the browser and Groq, so this needs a local `ffmpeg-static` transcode for STT plus `compositions.create` at play time. No migration — `artifact_kind` is free-text and `composition_sid` is unconstrained `TEXT` |
| English STT | OpenAI Whisper $0.36/hr | **Groq Whisper Large v3 Turbo $0.04/hr** | ₹0.38 | Same model family, 89% cheaper. Free tier 28,800 audio-sec/day. Needs a `consultation_transcripts.provider` CHECK migration |
| Hindi / Hinglish STT | Deepgram Nova-2 | **Deepgram Nova-3 Multilingual** | ₹2.98 | Nova-3 added real-time EN↔HI code-switching; Nova-2 handled mixed audio poorly. Quality buy (+₹0.52). Sarvam Saaras ~₹7.50 — too expensive |
| DM / reply model | `gpt-5.2` | **`gpt-5.6-luna` + explicit prompt cache** | ₹0.90 | Luna $0.20 / $1.20 per 1M after the 30 Jul cut. Sol ($4 / $20) would *double* the bill. Cache writes on 5.6+ cost 1.25× — set an explicit breakpoint on the stable prefix |
| Clinical parsers | `gpt-4o-mini` | **Keep** | (already in the ₹0.90) | Complaint / medicine / diagnosis / investigation / intent already on mini |
| Recording store | Twilio media | **Cloudflare R2** | ₹0.30 | Twilio storage is *daily* ($0.61/GB/yr). R2 $0.015/GB/mo, **$0 egress**. Replay is egress |
| OTP | Twilio SMS ₹0.48–0.72 | **WhatsApp auth template via Meta Cloud API** | ₹0.115 / OTP | **Parked — no WhatsApp product yet.** Code exists; live path is still Twilio SMS. MSG91 is the SMS fallback later. Do **not** route WhatsApp through Twilio ($0.005 handling fee erases the save) |

**Do not switch:** Twilio SMS for anything except OTP once WhatsApp auth is live; Deepgram for
Hindi; patient-facing DM replies off a flagship-class model (LAT-D1 — Luna is the cheap
flagship-family tier, not mini); cyber liability + tech E&O; Supabase Pro.

### After-cut, 6-min consult

| Line | Today | After | Cut |
|---|---|---|---|
| Video transport | ₹4.58 | ₹0.57 | ₹4.01 |
| Recording | ₹4.58 | ₹1.15 | ₹3.43 |
| Composition | ₹5.73 | ₹0.00 | ₹5.73 |
| Bandwidth | — | ₹0.33 | — |
| Transcription (blended) | ₹2.95 | ₹1.68 | ₹1.27 |
| AI / LLM | ₹15.00 | ₹0.90 | ₹14.10 |
| Storage | ₹2.00 | ₹0.30 | ₹1.70 |
| WhatsApp templates | ₹0.46 | ₹0.46 | ₹0.00 |
| Razorpay 2.36% | ₹1.16 | ₹1.16 | ₹0.00 |
| **Total** | **₹36.46** | **₹6.55** | **₹29.91 (82%)** |

LiveKit Build + Groq free tiers knock another ~₹0.95 off the first ~400 consults/month (~₹5.60).

| | Today | After |
|---|---|---|
| Marginal margin at ₹49 | **26%** | **87%** |
| Consults where ₹12,499 cap = cost | **343** | **1,908** |
| Cost at 500 consults/mo | ₹18,230 | ₹3,275 |

### Order — cheapest risk first

| # | Switch | Size | Risk | Cut / consult |
|---|---|---|---|---|
| 1 | `audit_logs` AI query (Gate 3) | 1 hr | None | **Done 1 Sep** — tells you if #2 is worth ₹14 or ₹4 |
| 2 | `gpt-5.2` → `gpt-5.6-luna` | S | Low–Med | **Done 1 Sep** — ₹13.5; forced by 11 Dec shutdown |
| 3 | Explicit prompt caching | S | Low | **Shipped 1 Sep** — write proven; hit deferred; ₹0.6 |
| 4 | OTP → WhatsApp auth template | S | Low | **Parked 4 Sep** — no WABA / no WA channel; still Twilio SMS; ₹0.6 / OTP when live |
| 5 | English → Groq Turbo | M | Low | **Shipped 4 Sep** — apply 227 + `GROQ_API_KEY`; ₹3.1 |
| 6 | Nova-2 → Nova-3 Multilingual | S | Low | **Shipped 4 Sep** — apply 228; −₹0.5 quality |
| 7 | Stop composing | M | **High** | **Rollout 12 Sep** — ₹5.7; both flags on locally; hook still on |
| 8 | Twilio Video → LiveKit | L | **High** | **Blocked, not queued** — ₹8.0; see the BAA note below |
| 9 | Storage → R2 | M | Med | **Unblocked from 8** — ₹1.7; needs a Cloudflare DPA |

Items 1–4 are roughly half the saving, in small changes.

**Correction 4 Sep — 7, 8 and 9 are not one program.** The doc bundled them because they all sit
on recording-governance v2, but the dependency graph is different from the numbering:

- **Composition is the transcode, not a convenience.** Twilio raw Recordings are Matroska
  (`.mka` audio / `.mkv` video). Neither a browser nor Groq accepts that container, and Deepgram
  does not document it. So stopping the compose meter requires owning a transcode, which is
  `ffmpeg-static` — an npm dependency with a prebuilt binary, not a Render infra change. Step 7
  then becomes: register raw `RT…` tracks, transcode locally for STT, and compose **on demand**
  only when someone actually presses play.
- **Step 9 never needed LiveKit.** Once a local transcode exists you can push the output to R2 and
  delete Twilio's copy without touching video transport. The real gate is that R2 becomes a PHI
  processor, so it needs a Cloudflare DPA first.
- **Step 8 does not pay for itself yet.** LiveKit's Ship tier ($50/mo) carries no BAA; the
  compliance tier is Scale at $500/mo ≈ ₹47,750/mo. The whole after-cut saving is ₹14,955/mo at
  500 consults and ₹29,910/mo at 1,000, so Scale does not break even until roughly 1,600
  consults/month. With G1 `PARKED` there is no clinic volume to justify it.

### Moving the wrong way

- **WhatsApp service messages bill from 1 Oct 2026.** Free-form replies inside the 24-hour
  window, and in-window utility templates, become ₹0.115 each with no volume discount. The
  72-hour Click-to-WhatsApp entry-point window stays free — how a conversation *starts* becomes
  a cost decision.
- **LiveKit HIPAA / SOC 2 Type II is Scale ($500/mo).** Ship ($50) does not carry a BAA.
  Twilio has the same gap today (Security / Enterprise). Check against the DPDP posture
  before committing (open Q18).

### Superseded: ₹39 (15 min, no recording meters) and ₹25.70 (6 min, still no recording meters)

Kept so we don't re-cost from scratch.

| Line | Cost | Why it died |
|---|---|---|
| Original 15-min stack | ≈ ₹39 | Duration was 15 min; FX ~₹87.5; recording + composition omitted |
| Duration-only correction | **₹25.70** | Right duration, still omitted two Twilio meters and used the old FX |

Fixed monthly: **₹12,000–20,000** (Supabase Pro, hosting, compute, **cyber liability + tech E&O
insurance ₹4,000–10,000**, **CA/GST/ROC ₹1,500–3,000**). Plus ~₹1–1.75 lakh one-time (incorporation,
lawyer-drafted ToS/Privacy/DPA, trademark).

---

## Volume and duration — real-world benchmarks

Researched 2026-08-19, because every margin figure in this doc previously assumed **15-minute consults**
and **25 working days**. Both were wrong, and both in the same direction.

### Duration: ~6 minutes, not 15

[Kerala's eSanjeevani analysis](https://arogyakeralam.gov.in/esanjeevani-analysis/), 222,130
consultations, average consult minutes by OPD:

| Specialty | Min | | Specialty | Min |
|---|---|---|---|---|
| Neonatology | 4 | | General Medicine | 7 |
| Pediatrics | 4 | | Ayurveda | 8 |
| Dermatology | 5 | | Pulmonary | 9 |
| Dental | 5 | | Psychiatry | 10 |
| General OPD | 5 | | PMR | 10 |
| Gynaecology | 6 | | Palliative | 11 |
| Cardiology | 6 | | | |

Corroboration: a diabetes teleconsult programme reports
[calls of 5–10 minutes](https://pmc.ncbi.nlm.nih.gov/articles/PMC11840818/). Patient-reported surveys say
10–20 minutes — patients overestimate, so use the measured figures.

**Do not use the eSanjeevani national average of 1 min 15 sec.** Over 93% of that volume is the
provider-assisted AB-HWC model, where a Community Health Officer takes the history and does the
documentation and the doctor arrives only for the decision
([study](https://doi.org/10.1093/oodh/oqaf025)). It measures doctor decision time, not consult length.
Our doctor is direct-to-patient with no facilitator.

**Variance warning:** AIIMS Rajkot found dermatology with a
[standard deviation of 27 minutes](https://journals.lww.com/jfmpc/fulltext/2024/13090/utilization_of_telemedicine_services_of_institute.45.aspx).
Derm and cosmetic dominate doctor-creator Instagram, so plan for a long tail even though the median is ~5.

### Volume: the binding constraint is the doctor's hours, not DM supply

That sentence is true for a **creator** — teleconsult volume is an output of DM conversion. A
clinic doctor who publishes dedicated teleconsult hours turns volume into a scheduling
decision (open Q23). The table below still holds as a capacity ceiling; do not treat it as
"clinic doctors will not reach it."

At 6–8 minutes a consult:

| Daily teleconsult window | At 6 min | At 8 min |
|---|---|---|
| 3 hours | 30 consults | 22 |
| 4 hours | 40 | 30 |

**Use 18–22 working days, not 25.** A doctor running a 6-hour clinic plus content plus 3–4 hours of
teleconsults is on a 10-hour day. That puts the realistic monthly ceiling at **500–800 consults**. The
750-consult doctor is real, but sits at the top of the range rather than the middle of it.

On the shape of the market:

| Source | Figure | Implication |
|---|---|---|
| [Platform doctor earnings](https://www.coveryou.in/blog/online-consultation-jobs-for-doctors-explained/) — *secondary source, directional only* | ₹60k–1.2L/mo full-time | ~300 consults/mo at ₹300–400 — the common shape |
| Same | ₹6–15L/mo, established independent virtual practice | 600–1,500 consults at ₹1,000 — the custom band is real |
| [Apollo 24/7](https://the-ken.com/story/can-apollo-hospitals-fix-its-digital-cash-burn-with-rs-299-from-10m-users/) | ~15,000 consults/day, entire platform | Even a funded national player is not large per doctor |
| [eSanjeevani facility survey](https://nhsrcindia.org/sites/default/files/2025-09/Telemedicine%20Final%20Report%202025.pdf) | 59.1% of facilities do <5/day | The long tail is very long |

### Where the segments land on the plan

| Segment | Teleconsults/month | Zone | Monthly bill (ex-GST) |
|---|---|---|---|
| Solo clinic, in-clinic only | 0 | Base | ₹999 (any OPD volume) |
| Small creator converting DMs | 20–60 | Meter | ₹999–₹2,959 |
| Growing | 60–200 | Meter, reaching the cap ~255 | ₹2,959–₹9,819 |
| Established virtual practice | 400–800 | Cap → custom formula from 500 | ₹12,499 → ~₹17–20k custom |
| 3-doctor clinic + light teleconsult | 0–60 | Base × 3 | ₹2,997 + meter after 60 included |

Two things the research changed: margins are *better* than modelled, because cost per consult was
overstated. And the custom band is not an edge case — it is where a successful doctor creator
**necessarily** lands, since 500–800 consults is 3–5× past the ₹15,000 mandate ceiling.

### The DM-to-consult conversion rate is the real unknown

The assumption that a 100k-follower doctor converting 30–50 consults a day is easy rests on a conversion
rate **nobody has published**. Most DMs are not booking intent. As a proxy for how messy real telemedicine
intake is, AIIMS Rajkot found **38.2% of teleconsult calls were wrongly addressed** — wrong specialty,
wrong purpose — with dermatology and OBG worst affected.

At 500 health-intent DMs a month, 5% conversion is 25 consults and 20% is 100. That spread decides where
on the meter a doctor lands, and therefore our ARPU. **Instrument DM → booked → completed in the first
pilot.** It is the single most valuable number we don't have (open question 12).

*(That 38.2% is also the clearest product argument we have for clinical intake — worth a post, not just a
row in a table.)*

---

## Preconditions — four gates before the first paid invoice

| # | Gate | Why it blocks |
|---|---|---|
| 1 | **Ship the cost-cut stack** (LiveKit + Groq + Luna + stop composing) | On today's stack (₹36.46/consult) the cap breaks even at **343 consults** — inside the researched 400–800 range for an established practice. Marginal margin is **26%** until the stack lands (87% after). The bootstrapping rule (every customer gross-margin-positive from month one, per `PRICING_AND_UNIT_ECONOMICS.md`) fails exactly on the best customers. Non-negotiable before the first paid invoice. Items 1–4 of the order table are half the saving and do not need the video rewrite. |
| 2 | **Billable ≠ verified fix** | No-show exclusion + the token-mode explicit-end signal (open Q10), in `consultation-verification-service.ts`. Without it the first invoice can contain a billed ghost. |
| 3 | **AI cost query** | `audit_logs` where `action = 'ai_classification'` — decides whether the ₹5 fixed component is real (open Q1). |
| 4 | **Mandate + paper** | UPI AutoPay setup, GST invoice wording, [`PILOT_AGREEMENT.md`](./PILOT_AGREEMENT.md), and the standing lawyer sign-off on the fee-splitting reading before any pricing page goes public. An in-clinic-only first invoice has almost no session COGS (~₹2), so Gate 1 is not the blocker for that segment — Gate 4 still is. |

---

## Open questions

| # | Question | What would settle it |
|---|---|---|
| 1 | Is AI cost really ₹15 today / ₹0.90 after Luna? | Query `audit_logs` where `action = 'ai_classification'` — `logAIClassification` already writes model + tokens from 7 services. **→ Gate 3.** Also measure cost per *unconverted DM*: an account with 1,000 DMs and 20 bookings carries real un-metered AI cost the base must absorb. |
| 2 | Average consult duration | **Partly answered externally** — Indian benchmarks put it at ~6 min, not 15 (see Volume and duration). Still measure our own: derm variance is wide (SD 27 min) and derm is our core segment. |
| 3 | Do we compose recordings? | **Yes, in code** — `registerFinalisedComposition` on every voice/video consult. Confirm the meter is firing on the Twilio invoice. The pick is to stop; that is a design decision against shipped governance, not a config flip. |
| 4 | ~~Free follow-ups~~ | **Resolved 2026-08-22 — full ₹49 on every completed consult, whatever the doctor charged.** We do not mirror `followup_policy`; doing so would make our revenue a function of their fee config, and `free` + 100 follow-ups + a 3,650-day window is a valid setting. The 20 included consults and the cap already absorb the fairness concern at both ends. See "Follow-ups bill at full rate". |
| 5 | ~~Founding-doctor concession~~ | **Resolved 2026-08-20** — Founding ten: base waived 3 months, meter + cap apply, price locked 12 months, traded for a case study + two warm intros. Never for nothing. |
| 6 | Non-payment behaviour | Leaning: existing appointments keep working, new bookings pause, doctor notified. Must be in [`PILOT_AGREEMENT.md`](./PILOT_AGREEMENT.md) before anyone signs. |
| 7 | ~~Refund policy config~~ | **Resolved 2026-08-21** — structure locked in "Cancellations and refunds": rules table + 100% floor + reschedule-first + booking-page disclosure; launch defaults 100% everywhere. The credit step was dropped (see its Ruled out). Late-cancel windows stay per-doctor config, built when a real doctor needs one. |
| 8 | Does Razorpay OAuth scope include refunds? | Confirm with Razorpay before building — now **the single blocker** for the automated rail ("Cancellations and refunds"). Fallback: deep-link the doctor to their own refund screen. |
| 9 | Is ₹49 too cheap for the premium end? | **Inverted 2026-08-21.** At ₹99 the worry was "too cheap for a ₹2,500 dermatologist" (4%). At ₹49 it is 2.0% of ₹2,500 and 7.0% of the ₹700 ICP fee. If the first five conversations show *no* flinch at the meter, raise the **level** on the next cohort (₹69, then ₹79) — never the shape. Founding-ten price stays locked 12 months. |
| 10 | Token-mode explicit-end fix | A deliberate "doctor ended consult" signal distinct from participant disconnect, in `consultation-verification-service.ts`. **→ Gate 2**, ships together with the no-show exclusion. |
| 11 | Cost-cut stack (LiveKit, Groq, Luna, stop composing, R2) | **→ Gate 1.** Until it lands, cost per consult is ₹36.46, not ₹6.55, and the cap breaks even at 343 consults. |
| 12 | DM → booked → completed conversion | Instrument it in the first pilot. Decides ARPU; no published benchmark exists for doctor creators. |
| 13 | e-NACH above the UPI ceiling | Confirm limits and setup flow with Razorpay *before* quoting the first custom plan (needed from ~750 committed consults). |
| 14 | ~~Are the three tier levels right?~~ | **Dissolved 2026-08-20** — no published tiers; one rate + cap (see Ruled out). The remaining level test is ₹999 / ₹49 / ₹12,499 in the first five conversations. |
| 15 | ~~Where does the DM-only plan sit?~~ | **Dissolved 2026-08-20** — one plan, one rate; the text-vs-video cost gap closed to ~₹2, removing the reason for a separate plan. |
| 16 | Razorpay Partner Program vs paste-your-keys | Partner APIs can pre-create sub-merchant accounts and (possibly) pay us a volume commission — the thing that felt like a favour to Razorpay can be a small revenue line. Confirm onboarding UX, KYC time, and whether refund scope rides along (pairs with Q8). Launch fallback: doctor pastes keys, or we sit through signup on the founding-ten call. |
| 17 | Custom-plan outreach trigger | Current rule: sustain 300+ for two months, then we reach out. Under ₹49 the cap binds at ~255, so that call lands ~45 consults after they first hit the ceiling. Decide before the first such doctor: keep 300 and frame as a 500-fair-use heads-up (no quote unless they ask), or nudge the trigger to sustained ~400 so they get a few capped months first. |
| 18 | Does LiveKit Ship ($50) satisfy our DPDP / recording posture, or do we need Scale ($500) for SOC 2 / BAA? | Counsel + LiveKit plan sheet. Same question exists on Twilio today (Security / Enterprise). Can erase part of the video saving. |
| 19 | WhatsApp service-message billing from 1 Oct 2026 | Confirm the India utility rate still ₹0.115 and whether in-window utility templates stay free until that date. Instrument conversation-start channel (Click-to-WhatsApp vs cold template) before October. |
| 20 | Billable modality from session, not label | If `consultation_type` is `in_clinic` but a video/voice/text session existed, the row must meter. **Precondition of the first clinic doctor who enables teleconsult hours** (they are mixed-modality by construction). `usage-ledger-service.ts` already normalises `in_clinic`/`in_person` to `in_person` — a labelled in-clinic video session would silently drop. See [`plan-teleconsult-hours.md`](../../Work/Product%20plans/plan-teleconsult-hours.md). |
| 21 | Same-episode messaging window | A clinical reply inside an already-billed visit is free. `SAME_ENCOUNTER_MAX_SECONDS` (120s) is a reconnect rule, not a two-day follow-up. Pick a care-episode window and put it on the pricing page before invoice one. |
| 22 | Extra-doctor base | Locked #9 is ₹999 per additional clinician, same included 20. Confirm in the first multi-doctor conversation that this, not a discounted second seat, is the number they hear. |
| 23 | Teleconsult-hours volume | A doctor who blocks dedicated teleconsult hours fills them from an existing list, not a DM funnel. ~650/month is reachable (3h × ~6 min × 22 days), which clears the cap and the 500 fair-use line. On today's stack that doctor is gross-margin negative at the cap. Settle by measuring the first clinic doctor who enables it; then amend the "binding constraint is the doctor's hours" claim and Q17's outreach trigger if needed. |
| 24 | Meter disclosure point | `/clinics` no longer prints ₹49. Name the in-product moment that does. Leaning: the first time they add a teleconsult availability block — "Your plan includes 20 teleconsults a month. ₹49 each after that, only when the consult happens." Must land before they can publish those hours. |

---

## ⚠️ Code conflict — needs its own session

**P0 executed 2026-08-22** — application no longer takes a platform fee or pays doctors out.
See [`plan-p0-billing-demolition.md`](../../Work/Product%20plans/billing/plan-p0-billing-demolition.md).
Apply `backend/migrations/198_deprecate_platform_fee_and_payouts.sql` (comments only). Columns remain
until P0.5.

Historical (what P0 darkened):

- `tryMarkVerified` used to call `triggerPerAppointmentPayout`; doctors had a `payout_schedule`
  including `'per_appointment'` — i.e. **we pay doctors out**, which requires the RBI PA licence we
  can't get.
- `backend/.env.example` carried a platform fee from **migration 022**: "Percent when amount >= threshold;
  flat when amount < threshold" — i.e. **percentage-based platform fee**. Keys are now unused.
Still open (P1 / P2 — do not fold into a leftover P0 session):

- The billing meter itself: **billable ≠ verified** (no-show exclusion + explicit-end signal, Gate 2).
- The **refund rail** (per-doctor credentials, adapter `refund` method, policy engine).
- **Bookings-only vs prepaid**: "no gateway connected" must short-circuit to `paymentUrl: null`
  even when a fee is configured.

Reconciling this touches payments, spans several files, and probably needs a migration. Per
`.cursor/rules/00-agent-contract.mdc` this is a STOP-and-flag item, not something to fold into a doc edit.
**Settle the pricing numbers first so it only gets ripped out once.**

> **Now planned.** Levels settled 2026-08-21, so the implementation has its own roadmap:
> [`plan-00-billing-roadmap.md`](../../Work/Product%20plans/billing/plan-00-billing-roadmap.md).
> The demolition above is its **P0** — one phase per session, each with its own plan file.

---

## Related

[`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md) · [`PRODUCT_PHASES.md`](./PRODUCT_PHASES.md) · [`ICP_AND_FIRST_CUSTOMER.md`](./ICP_AND_FIRST_CUSTOMER.md) · [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md) · [`PILOT_AGREEMENT.md`](./PILOT_AGREEMENT.md) · [`COST_TRACKER.md`](./COST_TRACKER.md) · [Cost-cut stack canvas](/Users/abhisheksahil/.cursor/projects/Users-abhisheksahil-Desktop-Clariva-Bot/canvases/cost-cut-stack.canvas.tsx) · [`plan-00-billing-roadmap.md`](../../Work/Product%20plans/billing/plan-00-billing-roadmap.md) — implementation · [`plan-teleconsult-hours.md`](../../Work/Product%20plans/plan-teleconsult-hours.md) — clinic teleconsult hours (Drafted)

**Status:** Structure `Locked` — flat fee + separate invoice (2026-08-18); **cap + custom formula
(2026-08-20)**; **refund rail + two payment modes (2026-08-21)**; **in-clinic included + base per
doctor + one teleconsult rate (2026-09-12)**. Levels (₹999 / doctor incl. 20 teleconsults / ₹49 /
₹12,499 per practice, cap binds ~255 teleconsults) `Hypothesis` — selling begins on this sheet;
validate in the first five conversations, then copy into `PRICING_AND_UNIT_ECONOMICS.md`.
History: tiers + optimised cost basis + volume/duration benchmarks added 2026-08-19; tiers replaced by
one-rate-plus-cap 2026-08-20 after the both-directions test; cancellations/refunds structure locked and
Q7 resolved 2026-08-21; gateway made optional (bookings-only vs prepaid) the same day; ₹99 meter
replaced by ₹49 the same evening after the regressivity test; custom ladder confirmed unchanged
(pinned by cap + cost floor), outreach-trigger timing left open as Q17; ₹25 "simple division"
meter ruled out the same evening (₹25 is the committed-volume rate, not the walk-in rate);
AutoPay and DM auto-refund parked 2026-08-22 (founder: why) — B-Q8;
cost-cut stack researched 2026-08-31 (today ₹36.46, after ₹6.55, FX ₹95.5; `gpt-5.2` shutdown
11 Dec 2026; Q3 answered in code; Q18/Q19 opened);
in-clinic visits taken off the meter, base made per doctor, desk seats free, free-text /
separate-EHR-SKU / in-clinic-meter ruled out 2026-09-12 (Q20–Q22 opened);
teleconsult rate confirmed channel-independent (clinic / no-social pays the same sheet),
cheaper-clinic-rate ruled out, Q20 promoted to teleconsult-hours precondition, Q23–Q24
opened 2026-09-12.

**Not legal advice.** The fee-splitting reading needs sign-off from an Indian health-tech lawyer before any
pricing page or pilot agreement goes out. The structure was chosen so that it does not *depend* on winning
that argument.
