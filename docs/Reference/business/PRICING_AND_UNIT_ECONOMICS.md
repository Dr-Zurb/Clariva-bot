# Pricing & unit economics

The working board is a Cursor canvas (interactive margin calculator, open beside chat):

**[Pricing & unit economics](/Users/abhisheksahil/.cursor/projects/Users-abhisheksahil-Desktop-Clariva-Bot/canvases/pricing-unit-economics.canvas.tsx)**

Pick a plan and a consult volume; revenue, cost to serve, and gross margin recalculate. Companion to [`COST_TRACKER.md`](./COST_TRACKER.md) — that board is vendor spend in total, this one is spend per doctor.

---

## The two things this page decides

**Anchor against a salary, not against software.** [`GO_TO_MARKET_STRATEGY.md`](./GO_TO_MARKET_STRATEGY.md) puts Indian solo-doctor software ARPU at ₹1,000–5,000/mo. A receptionist costs ₹12,000–20,000/mo and does less. Pricing as staff replacement is what makes the unit economics close.

**Never sell an uncapped flat fee.** Video cost is variable and revenue is not. On a flat ₹2,000/mo with no cap, the lines cross around 130 consults/month and the busiest doctor becomes the biggest loss. Base fee + included video minutes + metered overage removes the trap structurally instead of pricing for the worst case.

## Status of the numbers

Cost basis lives in [`PRICING_MODEL_DECISIONS.md`](./PRICING_MODEL_DECISIONS.md) § Cost inputs and the
**[cost-cut stack](/Users/abhisheksahil/.cursor/projects/Users-abhisheksahil-Desktop-Clariva-Bot/canvases/cost-cut-stack.canvas.tsx)**. Snapshot 31 Aug 2026:

| Input | Source | Confidence |
|---|---|---|
| FX ₹95.5 / USD | Aug 2026 average | Firm — rebase if the rupee moves |
| Today's cost ₹36.46 / 6-min consult | Twilio room + recording + composition + blended STT + AI guess | **Use this until Gate 1 ships** |
| After-cut ₹6.55 / 6-min consult | LiveKit + Groq Turbo + Luna + no compose + R2 | Planning only — not shipped |
| Planning number ₹8 | Rounded up from ₹6.55 | Until Gate 3 measures AI |
| Consult length ~6 min | Indian teleconsult benchmarks | **Measure in our pilots** |
| AI ₹15 today / ₹0.90 after Luna | Modelled, not queried | **Weakest number — Gate 3** |
| Willingness to pay ₹999 / doctor + ₹49 / teleconsult | Untested hypothesis | **Test in the first five conversations** |
| In-clinic included in the base | Locked 2026-09-12 in [`PRICING_MODEL_DECISIONS.md`](./PRICING_MODEL_DECISIONS.md) #9–#10 | Structure locked; levels still a hypothesis |

Real AI cost is already recoverable: `logAIClassification` in `backend/src/utils/audit-logger.ts` writes `model` and `tokens` into `audit_logs` under `action = 'ai_classification'` for every AI call. Query it before trusting the ₹15.

## Downstream of this doc

Locking price unblocks P1 items already open in [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md) — the pricing/order form (§9), the refund policy (§2), and the Razorpay flow.

---

**Created:** 2026-08-16.
**Owner:** Founder (commercial).
**Status:** `Draft` — hypothesis on levels. Structure as of 2026-09-12: ₹999 per doctor covers
unlimited in-clinic + 20 teleconsults; ₹49 per further teleconsult; cap ₹12,499 per practice;
desk logins free. Relock numbers after the first five paying doctors.
**Capital context:** Bootstrapping (GTM-Q1 answered) — every customer must be gross-margin positive from month one.
