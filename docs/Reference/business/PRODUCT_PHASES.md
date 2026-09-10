# Product phases & competitive position

> **The question this answers.** Halo Aid is built for **doctor creators** — a segment nobody else is
> serving. That raises two questions this doc commits to: *what order do we build in*, and *what do we own
> by the time better-funded companies notice?*
>
> **What this is NOT.** Not geography sequencing — that's
> [`GO_TO_MARKET_STRATEGY.md`](./GO_TO_MARKET_STRATEGY.md). Not pricing — that's
> [`PRICING_MODEL_DECISIONS.md`](./PRICING_MODEL_DECISIONS.md). Not the engineering gate — that's
> [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md). This is the *product-phase* and
> *defensibility* call.
>
> **Not investment advice.** Strategic judgement captured from discussion, for planning.

**Owner:** Founder (commercial). **Started:** 2026-08-19.

---

## TL;DR — the sequence

**Appointments + EHR → social infrastructure → doctor growth.** Three acts, one promise.

Blur the *story* between them deliberately. Keep the *build order* hard.

---

## §1 — The thesis: the doctor is the product, not the practice

Every incumbent builds for the **practice**. EkaCare, HealthPlix, Practo Ray — their unit of value is the
clinic as a business: its records, its billing, its front desk. Their data model assumes a location, a
waiting room, walk-ins, a receptionist.

We build for the **doctor as a professional**: their reach, their craft, their standing among peers, their
skill. Nobody in Indian healthtech serves that.

This is the through-line that makes three phases one company rather than a startup chasing revenue. It is
also why the incumbents' advantages transfer poorly — a doctor creator often has no clinic at all, so
retrofitting our shape means fighting their own assumptions.

---

## §2 — The three phases

| Phase | What it is | Status |
|---|---|---|
| **1 — Appointments + EHR** | The consult happens and gets recorded. DM intake, booking, payment link, consult, prescription, chart. | **Now.** See [`ehr/plan-00-ehr-roadmap.md`](../../Work/Product%20plans/ehr/plan-00-ehr-roadmap.md) |
| **2 — Social infrastructure** | Content creation, scheduling, multi-platform, analytics, video. The production side. | Next |
| **3 — Doctor growth** | CME and case discussion, mentorship, peer groups, workshops, craft development. | Later |

### The naming hides an overlap worth being precise about

Phase 1 is *already* social — DM intake is the front door. What phase 2 adds is the other half of the same
loop:

- **Phase 1 is social-in** — converting inbound that already arrived.
- **Phase 2 is social-out** — producing the content that creates the inbound in the first place.

Same channel, opposite direction. That is exactly why those two blur naturally: they are two halves of one
loop, not two products. Phase 3 is neither — it is the doctor themselves rather than their channel.

### The doctor's real barrier in phase 2

Content isn't blocked on motivation, it's blocked on vocabulary. Hook, retention curve, B-roll, aspect
ratio, thumbnail CTR — a doctor has never been trained in any of it. It is a **translation problem**, which
is the kind a doctor-founder is unusually well placed to solve.

We are currently solving it manually for ourselves in
[`HaloAid Socials`](../../../HaloAid%20Socials/README.md) — the generate loop, card templates, hook drafts.
**That workflow is the phase-2 prototype.** Keep notes on where *we* struggle, not just what we ship; it's
the only window in which we experience the problem as a naive user rather than as its author.

---

## §3 — Blur the story, sharpen the build order

Good positioning makes the phases feel like one product deepening. That's worth doing deliberately.

But **blur in the narrative is good; blur in the build order is how sequencing discipline dies.** It's the
permission structure that lets a phase-3 feature get built in month four because it "sort of belongs to
phase 1 anyway." Narrative continuous, roadmap gates hard.

### Blur is also a pricing defence

This is the part not to underrate. Each phase moves who the doctor compares us against:

| Phase | Their anchor if the layers stay distinct | Result |
|---|---|---|
| 1 | EkaCare, ~₹8,000/year EMR | We look expensive |
| 2 | Buffer, generic creator tools — near free | We look absurd |
| 3 | Conference fees — expensive, but a *personal* budget, not the practice's | Wrong wallet |

If the layers read as separate products, each gets price-checked against its cheapest specialist and we
lose every comparison. If it reads as one product, the doctor anchors on the whole. **The instinct to blur
is commercially load-bearing, not cosmetic.**

---

## §4 — The competitive read

### The threat is not who it looks like

We have been benchmarking against cheap auto-DM tools (ReplyKaro, Beyond Chat). That's the wrong watch
list — those tools would need clinical compliance, prescriptions, and medical liability appetite to reach
us. Long, unappealing climb.

**The real risk is EkaCare / HealthPlix / Practo Ray moving sideways.** The asymmetry is uncomfortable:

| | They need | We need |
|---|---|---|
| To reach the other's position | An Instagram DM ingestion layer — public Meta API, ~a quarter of work | A clinical record, ABDM, prescription compliance — the whole T1–T6 roadmap |

**Their path to us is shorter than our path to them.** Worth sitting with rather than arguing past.

### What blunts it

Their organisation is oriented around the clinical record — roadmap, sales pitch, customer conversations.
Ours is oriented around the doctor's *growth*. EMRs are **cost-centre** software; ours is a revenue-centre
purchase. A doctor cuts documentation software in a bad month and does not cut the thing bringing patients
in. Companies rarely cross that DNA line well.

The defensible sentence is therefore **not** "we do Instagram DMs well" — copyable in a quarter. It's
**"we are the system of record for a practice that has no clinic."**

### The tension to design around

Run every phase-2/3 idea through one filter: *can this be followed?*

| | Scalable | Defensible |
|---|---|---|
| AI video tools, content help, courses | Yes | **No** — copyable in a quarter |
| Community, mentorship, case groups, convening doctors | **No** | Yes — relationships and clinical credibility |
| CME accreditation | Partly | **Yes — by regulation** |

**What's defensible isn't scalable; what's scalable isn't defensible.** The resolution isn't picking one:
use the non-scalable defensible thing as **distribution and retention**, and the scalable copyable thing as
**revenue**. Community is how doctors arrive and why they stay; software is what they pay for.

CME accreditation is the rare item that is defended by a legal barrier rather than by effort — see below.

### The asset we consistently under-play

**A doctor selling to doctors.** A funded generalist team copies the DM flow in a quarter and cannot fake
clinical credibility in five years. Compound it in the product's clinical judgement and in how we show up
to the first fifty doctors.

---

## §5 — CME: the strongest phase-3 business, and the only external clock

Indian doctors need **30 CME credit hours every five years** to renew their licence. Punjab requires 50.
Maharashtra mandates 6 credit points a year. This is a gate on the right to practise, not a
nice-to-have.

Three things make it stronger than growth courses:

1. **Enforcement is tightening right now.** The West Bengal Medical Council
   [began demanding certificate uploads in April 2025](https://medicaldialogues.in/news/health/doctors/minimum-30-cpd-credit-hours-mandatory-for-license-renewal-wb-medical-council-tells-doctors-146165);
   their vice-president said the council had *never previously asked* for evidence. A mandate that just
   became enforced is the best possible timing.
2. **The budget exists and is resented.** Punjab doctors were reported
   [paying out of pocket for expensive private seminars](https://www.tribuneindia.com/news/punjab/punjab-medical-council-recognises-dept-training-for-docs-registration/)
   purely to hit their hours. We'd displace a disliked spend, not create a new one.
3. **Accreditation is a legal barrier, and barriers cut both ways.** West Bengal requires the provider be
   registered under the Society Act and splits the hours 20 in-state / 10 out-of-state. Maharashtra
   approves online providers case by case and
   [caps in-state doctors at 33.3% online](https://www.maharashtramedicalcouncil.in/cme/CMENotice/New%20CME%20Guidelines.pdf),
   while allowing 100% online for out-of-state and overseas doctors. A genuine slog — and the reason a
   generalist SaaS team never touches it.

It also carries **zero clause 6.1 exposure**: it's the doctor-growth business with none of the
patient-solicitation risk that shadows the marketing side.

> ⚠️ **This is the one item in the plan with a clock we don't control.** Everything else is gated by our
> own engineering speed; accreditation is gated by state councils and measured in quarters. **Start the
> paperwork in phase 2, ship the product in phase 3** — otherwise we sit on finished software waiting on a
> council.

---

## §6 — The regulatory constraint on phase 3

IMC 2002 **clause 6.1** (operative): a physician shall not directly or indirectly solicit patients or
advertise themselves. Standard creator-growth tooling ships features that are prohibited for Indian
doctors — testimonial collection, before-and-after galleries, superlative claims, buying followers.

Full treatment and the pricing consequence:
[`PRICING_MODEL_DECISIONS.md` → Clause 6.1](./PRICING_MODEL_DECISIONS.md#clause-61--the-constraint-on-anything-we-sell-later).

**The gift inside the constraint:** a techie building doctor-growth tools ships a review widget in week two
and quietly exposes every customer to a licence action. "The growth engine that keeps you compliant" is a
product only a doctor builds.

---

## §7 — What changes today

Nothing in the build. The sequence is right and phase 1 stays phase 1.

One thing does change: **what we collect from the first fifty doctors.** If act two is doctor development,
those conversations should be gathering it now — where they're stuck on content, what they wish they were
better at clinically, how they currently scrape together CME hours and what it costs them.

Free while we're already talking to them. Impossible to reconstruct once they're just rows on a dashboard.
**The fifty design partners are act one's revenue and act two's research — but only if we ask.**

---

## §8 — Open questions

| # | Question | What would settle it |
|---|---|---|
| 1 | **The one-sentence test.** Can all three phases be said without the word "and"? | If it comes out "bookings and content and education," it's three products and the blur is spin. If it's closer to *the doctor's practice runs itself so the doctor can be a doctor*, it's one promise on a widening surface. |
| 2 | Do doctors want us as a growth partner at all? | **Test it for free.** A monthly case-discussion call or WhatsApp group for doctor creators — zero engineering. Thirty regulars validates phase 3 and builds the distribution channel. Nobody showing up saves two years. |
| 3 | ABDM — is decision **E4** still right? | [`ehr/plan-00-ehr-roadmap.md`](../../Work/Product%20plans/ehr/plan-00-ehr-roadmap.md) locked "generic/global, no ABDM/FHIR in V1" on 2026-05-03. The India-first commitment in `GO_TO_MARKET_STRATEGY.md` is dated 2026-05-31 — *later*. E4 optimises for portability we don't need until the Gulf, while costing the exact checkbox an EkaCare rep uses against us now. Reclassify from "closed" to **"dated decision, revisit at 50 customers."** |
| 4 | Which phase-2 features are worth building at all? | Run each through §4's "can this be followed?" filter before it enters a roadmap. |
| 5 | Do we have the credibility to sell growth? | Creators check follower counts before buying growth advice. `HaloAid Socials` growing *is* the credential for act two — or the reason to partner with a doctor who has already grown. |
| 6 | Capital path (GTM-Q1, still open) | Early + bootstrapped means we fund the market education and a funded competitor harvests it. Early + funded means we use the window. This decides whether being first here is an advantage at all. |

---

## Related

[`GO_TO_MARKET_STRATEGY.md`](./GO_TO_MARKET_STRATEGY.md) · [`PRICING_MODEL_DECISIONS.md`](./PRICING_MODEL_DECISIONS.md) · [`ICP_AND_FIRST_CUSTOMER.md`](./ICP_AND_FIRST_CUSTOMER.md) · [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md) · [`ehr/plan-00-ehr-roadmap.md`](../../Work/Product%20plans/ehr/plan-00-ehr-roadmap.md)

**Status:** `Draft` — phase *order* is settled; phase 2 and 3 contents are directional, not committed.
Revisit after the first fifty doctors.
