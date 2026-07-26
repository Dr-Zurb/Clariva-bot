# Plan 00 — Integrations roadmap (master index)

## Turn Instagram-only intake into a portable multi-channel + clinical-ecosystem surface — without boiling the ocean

> **Why this exists.** Clariva's core loop is "patient reaches doctor on social → AI receptionist books → pay → consult → Rx." Today the acquisition channel is **Instagram only**. That is both the product's strength and a single-platform risk. This roadmap frames *all* integrations Clariva should consider — not just "add WhatsApp" — and sequences them against GTM (India → Gulf → US).
>
> **What this is NOT.** Not a task batch. Not API specs. Not vendor contracts. Each phase below gets its own deep-dive plan when we commit to it. Until then, treat this as the **opinionated backlog + sequencing SoT**.
>
> **Related:** [`GO_TO_MARKET_STRATEGY.md`](../../../Reference/business/GO_TO_MARKET_STRATEGY.md) · channel port at `backend/src/workers/channels/` · [`EXTERNAL_SERVICES.md`](../../../Reference/engineering/operations/EXTERNAL_SERVICES.md)

---

## Goal

Give Clariva a deliberate integrations strategy so we:

1. **De-risk Meta dependency** — acquisition does not die if Instagram policy/API/account health wobbles.
2. **Match where Indian (and Gulf) patients already message** — WhatsApp is the default channel in the target markets.
3. **Close the care loop beyond booking** — pharmacy + labs turn "booked consult" into "encounter completed."
4. **Keep the clinical core portable** — new markets = new channel adapter + payment route + compliance config, not a rewrite.

The make-or-break framing:

> Integrations are not a feature list. They are the **swappable edges** around an unchanged clinical core (cockpit, Rx, scheduling, AI funnel). Prioritize edges that either (a) acquire patients, (b) retain doctors, or (c) create a second revenue line.

---

## Product context (so later deep dives don't re-derive it)

### What Clariva is

| Layer | What it does today |
|-------|--------------------|
| **Acquisition** | AI receptionist on Instagram DMs + comment lead capture |
| **Commerce** | Token-gated booking → Razorpay → doctor payouts |
| **Care delivery** | Text / voice / video consult (Twilio + Supabase Realtime) |
| **Clinical** | Cockpit EHR — SOAP, Rx, investigations, drug safety |
| **Ops** | Verification, alerts, insights, crons |

Patients mostly stay in **Instagram + lightweight web join/book pages**. Doctors live in the **dashboard**. There is no standalone patient app.

### What's already built (do not re-propose)

| Capability | Where | Notes |
|------------|-------|-------|
| Instagram OAuth connect (today: Facebook Page–linked) | `instagram-connect-service.ts`, `/api/v1/settings/instagram` | Gated on doctor verification; **direct Instagram Login** planned in [`instagram-launch-readiness` p4](../../Daily-plans/July%202026/25-07-2026/instagram-launch-readiness/p4-direct-instagram-login/) |
| Instagram DM webhook → AI funnel | `instagram-dm-webhook-handler.ts`, `run-conversation-turn.ts` | Channel-agnostic conversation engine |
| Instagram comment → lead + proactive DM | `instagram-comment-webhook-handler.ts`, `comment-leads` | Fixed public reply copy |
| Channel adapter port + registry | `backend/src/workers/channels/` | `ChannelId = 'instagram' \| 'whatsapp'` |
| WhatsApp adapter **stub** | `channels/whatsapp/` | Compiles; **no live I/O** |
| Payment gateway abstraction | `adapters/payment-gateway.interface.ts` | Razorpay live; PayPal adapter present |
| Notification fan-out | `notification-service.ts` | DM + email + SMS for key events |
| Twilio (video/voice/SMS) | existing consult + SMS services | Reusable if WhatsApp via Twilio BSP |

### Known Instagram gaps (fix before / while expanding channels)

These are not new product ideas — they are **infra debt that every new channel inherits**:

| Gap | Why it matters |
|-----|----------------|
| No automatic Meta token refresh (~60-day long-lived tokens) | Manual reconnect = silent acquisition death |
| `linkCommentLeadToConversation` never called | Comment → DM funnel analytics broken |
| Meta data-deletion callback is a stub | Compliance gap on Meta app review / trust |
| Comment subscriptions not automated (Dashboard-only) | Ops fragility on new doctor connect |
| Signature bypass when Meta signing fails | Pragmatic today; tighten before scale |

**Phase 0** below is exactly this hardening pass.

---

## The reframe — five integration axes

"We only do Instagram" is really "we only have one **intake channel**." Integrations span distinct axes. Prioritize *within* an axis; don't treat pharmacy and WhatsApp as peers on one list.

| Axis | Job | Examples |
|------|-----|----------|
| **A. Intake / conversation channels** | Where patients reach the bot **and where reply conversation + outbound notifications land** | Instagram (live), WhatsApp (stub), owned web widget |
| **B. Doctor productivity** | Keep Clariva in the doctor's day | Google / Outlook calendar sync |
| **C. Clinical ecosystem** | Close the encounter loop | E-pharmacy, diagnostic labs, ABDM/ABHA |
| **D. Commerce (per market)** | Collect money where the market pays | Razorpay (IN), Gulf gateways, Stripe MENA |
| **E. Growth / attribution** | Prove ROAS for ad-spending doctors | Meta Conversions API |

> **Same capability, different user habits.** IG and WhatsApp are **both full two-way bot channels** — a patient can discover, book, converse, and get reminders on *either*. The difference is behavioral, not architectural: in India/South Asia patients *tend* to discover via Instagram (DMs + comments) but *tend* to actually read messages on WhatsApp, while IG DMs often get buried. Because we can't predict which app a given patient checks, outbound (payment confirmation, consult-ready, reminders, prescriptions) fans out to **both** so the important things land where they're read — see Decision I7. We are **not** assigning IG and WhatsApp separate jobs.

---

## Decisions LOCKED 2026-07-25 (roadmap creation)

These are sequencing / scoping decisions. Per-phase deep dives MUST respect them or explicitly reopen them.

| ID | Decision | Implication |
|----|----------|-------------|
| **I1** | **WhatsApp is the next intake channel — not Messenger, not Telegram, not Google Business Messages.** | Next channel deep-dive is WhatsApp only. Messenger is opportunistic later (same Graph API, low India value). Google Business Messages is dead (shutdown). |
| **I2** | **Channel engine stays adapter-shaped.** New channels implement `ChannelAdapter`; they do not fork `run-conversation-turn`. | WhatsApp deep-dive owns parse/send/templates/connect UI — not a second AI funnel. |
| **I3** | **Hardening Instagram infra before (or as Wave 0 of) WhatsApp.** | Token lifecycle + data deletion are Phase 0. Do not scale a second Meta channel on rotting token infra. |
| **I4** | **Clinical ecosystem (pharmacy/labs) is a moat play, not a channel play.** | Separate phases from WhatsApp. Do not block WhatsApp on pharmacy partnerships. |
| **I5** | **No US-shaped integrations in this roadmap** (Surescripts, insurance clearinghouses, Epic/FHIR deep). | Matches GTM: India → Gulf → US (funded). Revisit when Phase 2 US is triggered. |
| **I6** | **Deep dives happen one phase at a time.** This file stays the index; each phase gets its own plan when committed. | Avoid writing WhatsApp + pharmacy + calendar specs in one sitting. |
| **I7** | **IG and WhatsApp are symmetric, full two-way bot channels** (discover, book, converse, get notified on either). The IG-skews-discovery / WhatsApp-skews-read pattern is *observed India/South-Asia user behavior, not a designed role split* — so outbound (payment confirm, consult-ready, reminders, prescriptions) fans out to **both** and lets real habits decide where it's read. | When WhatsApp ships: P1 splits **only by build difficulty, not by role**: **P1a outbound** then **P1b inbound**. Patient identity must carry IG sender-id *and* phone. |
| **I8** | **WhatsApp is post-sales, not pre-launch.** MVP launches on Instagram only. | Do not promote P1a/P1b task files until ~10 paying doctors with steady weekly consults. Near-term engineering = `instagram-launch-readiness` (P0 + bot polish). |

---

## Phase overview

| Phase | Theme | Axis | Effort (rough) | Status | Promote when… |
|-------|-------|------|----------------|--------|---------------|
| **P0 — Meta infra hardening** | Token refresh, data deletion, webhook sig, comment→conversation link | A (foundation) | ~3–5 days | **In flight** → [`instagram-launch-readiness`](../../Daily-plans/July%202026/25-07-2026/instagram-launch-readiness/) | **Pre-launch** (now) |
| **IG polish — bot reliability + copy** | Throttle/non-text/staff-review/funnel dead-ends + copy | A | ~1–2 weeks | **In flight** → same program (p2/p3) | **Pre-launch** (after P0) |
| **IG direct Login** | Connect without Facebook Page; IG token refresh | A (onboarding) | ~2–4 days code + App Review lead time | **Scaffolded** → [`p4-direct-instagram-login`](../../Daily-plans/July%202026/25-07-2026/instagram-launch-readiness/p4-direct-instagram-login/) | **Pre-launch** (ops-parallel; unlocks real-doctor self-serve) |
| **P1a — WhatsApp outbound fan-out** | WA connect + templates; fan out payment/consult-ready/reminders/Rx | A | Large + KYC lead time | **Post-sales** | Trigger: ~10 paying doctors with steady weekly consults |
| **P1b — WhatsApp inbound intake** | AI booking funnel over WhatsApp | A | Medium on top of P1a | **Post-sales** | After P1a |
| **P2 — Calendar sync** | Google Calendar (+ Outlook later) | B | Medium | `Drafted` | Post-launch fast-follow |
| **P3 — Owned web chat widget** | Link-in-bio / site embed | A | Medium | `Drafted` | Post-launch (Meta-risk insurance) |
| **P4 — E-pharmacy** | Order meds from Rx → partner | C | Large | **Post-traction** | After launch traction |
| **P5 — Diagnostic labs** | Order investigations → results into chart | C | Large | **Post-traction** | After Investigations solid + traction |
| **P6 — ABDM / ABHA** | India health-ID | C | Large | `Parked` | Deliberate |
| **P7 — Gulf payments** | Regional gateway | D | Medium | `Parked` | GTM Phase 1 Gulf |
| **P8 — Meta Conversions API** | Ad attribution | E | Small–medium | `Parked` | If doctors run paid ads |

---

## Sequencing recommendation

```
PRE-LAUNCH (now)                    POST-SALES                         TRACTION / GTM
 │                                    │                                      │
 ▼                                    ▼                                      ▼
Instagram launch-readiness     →  P1a WA outbound  →  P1b WA inbound    P4 Pharmacy
  (P0 harden + bot polish         (trigger: ~10 paying doctors)         P5 Labs
   + direct IG Login p4)           P2 Calendar / P3 Web widget          P7 Gulf pay
  + Meta App Review ops                                                 P8 CAPI
```

**Rationale (locked 2026-07-25; p4 added 2026-07-26):**

1. **MVP = one channel that works.** Discovery is on Instagram. WhatsApp is convenience/reach, not a launch requirement — defer until sales prove demand.
2. **Pre-launch = harden + polish Instagram** — P0 Meta infra + bot reliability/polish + **direct Instagram Login** (no Facebook Page) so Instagram-only doctors can connect (see `instagram-launch-readiness` program). Shared engine polish also benefits future WhatsApp for free.
3. **WhatsApp after sales** — P1a outbound first (notifications land where patients read), then P1b inbound. Design notes below stay; no task files until the trigger. Facebook + WhatsApp as separate Integrations cards come with that later work.
4. **Pharmacy/labs post-traction** — partner BD; not MVP.
5. **P6–P8** — credibility / market / ads triggers only.

---

## Phase sketches (enough to discuss; not enough to build)

### P0 — Meta infra hardening

**Outcome:** Instagram (and future Meta channels) don't silently die at day 60; Meta compliance callback is real.

**Likely work (to deep-dive later):**

- Token expiry detection → refresh or doctor reconnect nudge (dashboard alert + email)
- Implement Meta data-deletion job (today: stub in `routes/data-deletion.ts`)
- Wire `linkCommentLeadToConversation` on first DM from a commenter
- Document / automate comment field subscription ops for new connects
- Revisit signature-bypass policy with a hardening plan

**Open in deep-dive:** refresh via Graph vs. force reconnect UX; how aggressive to alert.

---

### P1 — WhatsApp Business Platform (P1a outbound → P1b inbound)

**Reframe (Decision I7):** WhatsApp and Instagram are the *same kind of channel* — full two-way bots. WhatsApp is worth doing next because, in India/South Asia, patients reliably *read* WhatsApp while IG DMs get missed — so outbound in particular must reach both. The two slices below share one WhatsApp Business number + KYC and are split **by build difficulty, not by role**:

#### P1a — Outbound fan-out (do this first)

**Outcome:** Every important outbound message fans out to **both** Instagram *and* WhatsApp, so it lands where the patient actually reads it: payment confirmation, consult-ready ping, appointment reminders, abandoned-booking nudge, OPD mode changes, and prescription delivery.

**Architecture fit:** `notification-service.ts` already fans out to DM + email + SMS. WhatsApp is a **new arm on that existing fan-out**, not a new system. The engine is ready; the friction is Meta's outbound rules.

**Why this is the most policy-heavy slice (the catch to design for):** outbound notifications are almost always **business-initiated and outside the 24-hour window**, so nearly all of them require **pre-approved WhatsApp template messages** + **patient opt-in**. This is exactly the traffic Meta gates hardest. (Instagram has its own proactive-messaging window too — both channels need their send-eligibility handled per message.)

| Topic | Why it matters |
|-------|----------------|
| Template catalog | One approved template per notification type — map every `notification-service.ts` event (payment / consult-ready / reminder / abandoned booking / OPD / Rx) |
| Opt-in / consent | Capture WhatsApp opt-in at booking (utility vs marketing categories; DPDP + Meta policy) |
| Both vs primary+fallback | Send to IG **and** WhatsApp always, or WhatsApp-primary + IG fallback? (cost + annoyance + dedupe — see IQ6) |
| Identity anchor | Link IG sender-id ↔ phone number so one patient = one person across both channels (phone captured at booking) |
| Cloud API vs BSP | Meta Cloud API (cheaper at scale) vs Twilio/Gupshup/360dialog (faster green-tick / KYC) — see IQ3 |
| Pricing | Per-conversation Meta pricing — outbound fan-out has a real per-message cost; factor into unit economics |

#### P1b — Inbound intake (after P1a)

**Outcome:** Patients can run the same AI booking funnel over WhatsApp that they get on Instagram.

**Architecture fit:** implement the WhatsApp `ChannelAdapter` (stub exists) — parse/send only. Inbound patient-initiated messages get the free 24h window, so the funnel works naturally.

**Do not invent a second AI funnel.** Reuse `run-conversation-turn` + stages (Decision I2).

---

### P2 — Calendar sync

**Outcome:** Doctor's Google (then Outlook) busy blocks Clariva slots; Clariva bookings appear on their calendar.

**Likely work:**

- OAuth connect in settings
- Pull busy → `blocked_times` / availability resolver
- Push confirmed appointments as calendar events
- Cheap intermediate: `.ics` attach on confirmation email before full two-way sync

**Open in deep-dive:** one-way busy vs two-way; conflict resolution when doctor edits in Google.

---

### P3 — Owned web chat / link-in-bio widget

**Outcome:** A channel Clariva controls — embeddable or link-in-bio mini-chat — same AI receptionist, no Meta dependency for that traffic.

**Likely work:**

- Patient-facing chat surface (web) → same conversation/patient identity model with `platform = 'web'` (type expansion)
- Doctor shareable link + optional site embed snippet
- Auth / anonymous session + consent before PHI

**Open in deep-dive:** identity (phone OTP?) vs Instagram sender ID; whether web is first-class `ChannelId`.

---

### P4 — E-pharmacy

**Outcome:** From finalized Rx, patient can order medicines via a partner (1mg / PharmEasy / Apollo / Netmeds — TBD); doctor optionally sees fulfillment status.

**Depends on:** stable Rx PDF + public share link (largely shipped).

**Open in deep-dive:** partner choice, revenue share, controlled substances, "Clariva-branded vs white-label redirect."

---

### P5 — Diagnostic labs

**Outcome:** Doctor orders investigations from Plan/Investigations tab; partner schedules collection; results land back in the chart.

**Depends on:** Investigations tab production quality.

**Open in deep-dive:** partner APIs (Redcliffe / Thyrocare / etc.), result ingestion format, patient consent for sharing orders.

---

### P6 — ABDM / ABHA (parked)

**Outcome:** Doctor/patient link to India health IDs; selective record share for legitimacy + interoperability.

**Why parked:** compliance-heavy, slow partner onboarding, not required for first paying India cohort. Plan deliberately; don't sprint.

---

### P7 — Gulf payments (parked)

**Outcome:** `PaymentGateway` implementation for UAE/KSA regional processor (PayTabs / Telr / Network International / Stripe MENA — TBD).

**Trigger:** GTM Phase 1 Gulf beachhead. Engineering lift is bounded by existing adapter.

---

### P8 — Meta Conversions API (parked)

**Outcome:** Server-side events (lead, booking paid) → Meta for ad attribution.

**Trigger:** evidence that a meaningful share of doctors run paid IG/FB ads. Otherwise skip.

---

## Explicitly out of scope (for now)

| Idea | Why not |
|------|---------|
| Google Business Messages | Product shut down |
| Apple Messages for Business | High bar, low India relevance near-term |
| Telegram as intake | Low doctor/patient expectation in India clinical context |
| Facebook Messenger as a *priority* | Same Graph API → cheap later; not a GTM unlock |
| US EHR/insurance rails (Surescripts, claims, Epic) | GTM Phase 2; wrong product shape today (Decision I5) |
| Building our own pharmacy/lab | Partner; don't become a logistics company |

---

## Open questions (answer before / during deep dives)

These sharpen sequence; update this table when answered.

| ID | Question | Affects |
|----|----------|---------|
| **IQ1** | Are early doctors acquiring **organically** or running **paid Instagram ads**? | Whether P8 (CAPI) moves up |
| **IQ2** | Near-term GTM bias: **India-deepening** vs **Gulf-entry prep**? | WhatsApp urgency framing + whether P7 planning starts early |
| **IQ3** | WhatsApp: **Meta Cloud API** vs **BSP** (Twilio / Gupshup / …) for v1? | P1 architecture + KYC timeline |
| **IQ4** | Pharmacy partner preference / BD warm path? | P4 vendor choice |
| **IQ5** | Calendar: Google-only v1, or Google + Outlook from day one? | P2 scope |
| **IQ6** | Outbound: fan out to **both** IG + WhatsApp always, or **primary + fallback** (e.g. WhatsApp primary, IG only if no WA opt-in)? | P1a UX + WhatsApp per-conversation cost + patient annoyance/dedupe |

---

## How to use this doc

1. **This file is the SoT for integration sequencing** until a phase is promoted.
2. When a phase is committed → write `plan-p{N}-<slug>.md` (deep dive) in this folder, then promote to `Daily-plans/<date>/integrations/p{N}-…/` per [`PHASED-PLANS-GUIDE.md`](../../process/PHASED-PLANS-GUIDE.md).
3. Do **not** expand scope into US clinical rails or random social channels without updating Decisions I1 / I5.
4. Capture drive-by ideas in [`docs/Work/capture/inbox.md`](../../capture/inbox.md); promote here only if they survive triage.

---

**Created:** 2026-07-25  
**Owner:** Founder (product)  
**Status:** `Drafted` — strategic index; deep dives TBD  
**One-liner:** Pre-launch = harden + polish Instagram. Post-sales = WhatsApp (outbound then inbound). Post-traction = pharmacy/labs. GTM-triggered = ABDM / Gulf pay / CAPI.
