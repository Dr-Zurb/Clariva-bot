# Go-to-Market & Market Expansion Strategy

> **The question this answers.** Clariva is built in India by an India-resident founder with a **global ambition** and an honest view that *"the serious money is in developed markets (US/UK)."* So: **India-first then global, or sell globally day 1?** This doc commits to a sequence and the triggers for moving between markets.
>
> **What this is NOT.** Not regulatory/legal mechanics — those live in [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md). Not the engineering launch gate — that's [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md). This is the *commercial* geography + sequencing call.
>
> **Not financial/fundraising advice.** Business judgement for planning; pressure-test with operators and investors who know health-tech.
>
> **Related:** [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md) (§8 Going global) · [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md) · [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md)

---

## TL;DR — the call

**Launch India-first, but treat India as the launchpad, not the destination.** Architect for global from day one (already underway), prove a retaining, referenceable paying base in the home market where learning is cheap, then **graduate deliberately into a high-ARPU market on a trigger — and that first "serious money" market is most likely the Gulf (UAE), not the US.** Selling into the US on day 1, as an India-resident first-time founder with no US customers, is the most reliable way to burn 18 months and the runway.

> **It is not "India vs global day 1."** It's: *where do you win your first ~50–100 paying, retained, referenceable customers fastest and cheapest, while building toward high-ARPU markets?* For you, today, that's India.

---

## §1 — The honest premise (and why it changes the *goal*, not the *start*)

The instinct is correct: the money is elsewhere.

| | India (solo doctor) | US (private practice) |
|---|---|---|
| Typical software ARPU | ₹1,000–5,000/mo (~$12–60) | $300–1,000+/mo |
| Multiple | 1x | **~10–20x** |

India SMB-healthtech monetisation is genuinely hard — low ACVs, price sensitivity, churn, heavy support. Several well-funded Indian healthtechs never escaped that gravity.

**Conclusion:** India is where you **earn the right** to chase serious money — not where the serious money is. Use it as a launchpad; don't over-invest in it as an end state.

---

## §2 — Why "US day 1" fails right now (mechanics, not pessimism)

1. **Months of cost before the first sale.** Serious US buyers require **HIPAA + signed BAAs + SOC 2 Type II**. SOC 2 alone is ~6–12 months and real spend — *before* revenue.
2. **CAC is brutal and trust-gated.** A knife fight against Epic, athenahealth, and hundreds of point solutions. Doctors buy on references + local credibility you don't yet have, with no US presence to build it.
3. **The product is the wrong shape for the US today.** What's built is tuned to *Indian* practice: Instagram/WhatsApp DM intake, a receptionist bot booking over DMs, Razorpay/UPI, cash-pay telemedicine. US healthcare runs on **insurance billing (CPT/ICD, claims, prior auth), Surescripts e-prescribing, EHR interoperability** — and patients don't DM their doctor on Instagram. Entering the US ≈ rebuilding the product.

---

## §3 — Why India-first is the correct *first* move (for this founder, now)

- **Founder–market fit** — you live here, understand the doctor's reality, can sit across from customers. A real edge you have nowhere else yet.
- **CAC is a fraction**; sales cycles are shorter.
- **Ground truth, cheaply** — real consults/prescriptions hardening the AI, safety strip, and workflows.
- **The product already fits** — WhatsApp/Instagram-native, cash-pay, telemedicine-first *is* the Indian market.
- **Referenceable, retaining revenue is what makes global expansion fundable and survivable.**

---

## §4 — Don't assume the US is your *first* global market

"Developed markets" is not one thing. Decompose by ARPU × entry-cost × fit-as-built:

| Market | ARPU | Entry barrier | Fit (as built) | Verdict |
|---|---|---|---|---|
| **India** | Low | Low (DPDP, telemedicine guidelines) | Native | **Launchpad — start here** |
| **US** | Highest | Very high (HIPAA, SOC 2, insurance/billing, litigious, crowded, needs local presence) | Poor (insurance/EHR-shaped) | Biggest prize, worst odds remote — **later, via flip + raise** |
| **UK / EU** | Medium | High (NHS procurement slow/low-margin; GDPR; EU fragmented + MDR for SaMD) | Medium | Slow; private niches only |
| **Gulf (UAE / KSA)** | **High** | Medium (DHA/MOH licensing) | **Strong** — private-pay, English, telemedicine-progressive, **WhatsApp-native patients**, large expat-doctor base | **Underrated — likely best first high-ARPU market** |
| **SEA / similar EMs** | Medium | Medium | Strong (India-like) | Natural adjacent expansion |

**The overlooked move:** the **Gulf** gives US-adjacent ARPU without US-level friction, and your WhatsApp-first, cash-pay, telemedicine product transfers almost as-is. A far more natural "second country" than grinding into the US insurance maze.

---

## §5 — The strategy: "Build global, launch India, graduate on triggers"

| Phase | Market | Window | Goal |
|---|---|---|---|
| **0** | **India** | now → ~6–12 mo | ~50–100 paying, **retained, referenceable** clinics; clear the `LAUNCH_READINESS_CHECKLIST.md` P0 gate |
| **1** | **Gulf (UAE)** — first high-ARPU beachhead | ~12–24 mo | Local medical licensing; swap payment/channel layer; price to local norms; prove the product travels + earns real ARPU |
| **2** | **US**, deliberately | when funded | SOC 2 + HIPAA, US entity, US commercial hire/co-founder, insurance/billing/EHR product work scoped — a **raise-funded campaign**, not a side quest |

Expansion is **earned, not impatient** — see triggers in §8.

---

## §6 — Product portability: the engineering is ahead of the GTM

The reassuring part: only a thin layer is country-specific, and it's **already abstracted**.

- **Universal core (travels):** the cockpit, Rx, SOAP, scheduling, drug-interaction/allergy safety, AI assist.
- **Country-specific (swappable):** intake **channel**, **payment**, **local compliance**.
  - Channel-adapter registry: `backend/src/workers/channels/registry.ts` (+ WhatsApp/Instagram adapters).
  - Payment abstraction: documented `PaymentGateway` interface, India→Razorpay / international→PayPal ([`EXTERNAL_SERVICES.md`](../engineering/operations/EXTERNAL_SERVICES.md)).
  - Region/data-residency config: [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md) §6/§8.

**Implication:** the technical lift to add a market is **bounded** — new channel adapter + payment route + local compliance config, on top of an unchanged clinical core. Don't let "but the product is India-shaped" become a reason to delay; the architecture already anticipates this.

---

## §7 — The capital fork (decides the tempo)

| If you are… | Then… |
|---|---|
| **Bootstrapping / thin runway** | India-first is the only solvent path — you cannot afford US CAC + compliance pre-revenue. Reach cash-flow in India, expand to the Gulf for ARPU. |
| **Raising VC (global thesis)** | Investors want the big-TAM (US) story **and** proof you can sell. Proven playbook: **India for product + early PMF → flip to a Delaware C-corp → raise → fund the US/global GTM.** |

**The India→global path is well-paved**, not invented: Freshworks, Chargebee, Postman, Zenoti, Whatfix, Gupshup all began India-built and went global/US.

---

## §8 — Graduation triggers (move markets on these, not on vibes)

Advance from one phase to the next only when **most** hold:

- [ ] **Net revenue retention > 100%** (existing customers expand, don't churn).
- [ ] **CAC payback < ~12 months** in the current market.
- [ ] **The product runs without founder hand-holding** on every account.
- [ ] **Reference logos + a repeatable, documented sales motion** exist.
- [ ] For Phase 2 (US): **funded**, with SOC 2/HIPAA underway and a US commercial presence lined up.

---

## §9 — Open questions to lock (answer in-thread, then record here)

These three variables would sharpen the sequence into specific dates/markets:

- **GTM-Q1 — Capital path?** Bootstrapping vs raising (and rough runway). *Decides tempo and whether the US is even near-term.* → leans the §7 fork.
- **GTM-Q2 — In-market network?** Any US / UK / Gulf design partners, doctors, distribution, or a potential local co-founder? *A warm beachhead can override the default market choice.*
- **GTM-Q3 — Relocation / in-market hiring?** Willing to relocate or hire in-market for the developed-market push, or must it stay remote? *Remote-only strengthens the Gulf-before-US case.*

> Once GTM-Q1–Q3 are answered, this doc can be upgraded into an 18-month sequence with named market, milestones, and raise/flip timing.

---

**Created:** 2026-05-31.
**Owner:** Founder (commercial).
**Status:** `Draft` — strategic; revisit after GTM-Q1–Q3 are locked.
**One-liner:** Launch India (launchpad) → Gulf (first real ARPU) → US (funded, deliberate). Build global, sell local first, graduate on triggers.
