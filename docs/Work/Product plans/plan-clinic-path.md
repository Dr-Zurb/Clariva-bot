# Plan — Clinic path

> One product. Two pitches. Instagram optional for clinics that do not receive patients there.
>
> **Status:** `Committed` 2026-09-12. **Promoted to:** [`Daily-plans/September 2026/12-09-2026/clinic-path/`](../Daily-plans/September%202026/12-09-2026/clinic-path/). **Effort:** P1 half a day, frontend only. P2 one sitting, backend + frontend — **escalate (migration + go-live gate).**
>
> **Depends on:** pricing lock in [`PRICING_MODEL_DECISIONS.md`](../../Reference/business/PRICING_MODEL_DECISIONS.md) (2026-09-12 — in-clinic included, teleconsults metered, base per doctor) and public line in [`BRAND.md`](../../Reference/business/BRAND.md).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## Why this plan exists now

Walk-in clinics and founding-ten warm intros will search "Halo Aid" or land on `/`. Today's homepage and Google snippet are creator-only. That is correct for inbound Instagram, and wrong for a clinic doctor with no social.

Two separate problems, two gates:

1. **Discovery.** A clinic doctor reads "Instagram DMs" and leaves. Fix copy destinations, not the homepage argument.
2. **Go-live.** `getOnboardingStatus` ANDs `instagramConnected` for every account. A clinic that signs cannot complete. Fix the gate, not the price sheet.

---

## North star

A clinic doctor arriving from a friend's referral never reads a sentence that says this product needs Instagram. A clinic doctor who says patients do not message them there can go live. A creator doctor's homepage and checklist stay exactly as they are.

---

## Decision lock (LOCKED 2026-09-12, in chat)

| ID | Decision | Implication |
|----|----------|-------------|
| **CLP-DL-1** | **`/` stays creator-first.** Hero, badge, thesis, How it works, What converts — creator opener. No rupees and no See pricing in the first viewport; the nav Pricing tab is enough. | No front-door chooser. No two-homepage splash. |
| **CLP-DL-2** | **Second pitch lives at `/clinics`.** Same product, clinic opener (patient records / visits / Rx). Instagram mentioned as available, not required. | You hand this URL on walk-ins. Searchers who click "For clinics" land here. |
| **CLP-DL-3** | **"For clinics" is a nav exit, not a gate.** One link in shared marketing nav. | Clinic visitor on `/clinics` must not be thrown back to `/` by "How it works" / "What converts". |
| **CLP-DL-4** | **Google snippet names both audiences.** Root meta description is infrastructure, not positioning. `<h1>` stays the creator line. | Search result must not say Instagram-only. |
| **CLP-DL-5** | **One price sheet.** `/clinics` and `/pricing` use the locked sentence: ₹999 / doctor covers the clinic + 20 teleconsults; ₹49 after; cap ₹12,499. | No clinic SKU. No second number. |
| **CLP-DL-6** | **Ask the behaviour at signup, not on `/`.** Question: "Do patients message you on Instagram or Facebook?" Answers: **Yes** / **Not yet**. | Not "creator vs clinic." Not a plan chooser. |
| **CLP-DL-7** | **"Not yet" drops Instagram from the go-live AND.** Practice info + pricing + availability still required. Instagram step stays visible and optional. | Existing accounts backfill as Yes so today's checklists do not change. |
| **CLP-DL-8** | **P2 is escalate.** New settings field + change to the go-live gate for every account. | Do not run P2 on Auto. Read `COMPLIANCE.md` and `MIGRATIONS_AND_CHANGE.md` first. |

---

## Phase table

| Phase | Folder | What | Gate | Status |
|---|---|---|---|---|
| 1 — discovery | [`p1-discovery/`](../Daily-plans/September%202026/12-09-2026/clinic-path/p1-discovery/) | Meta, sitemap, `/clinics`, nav exit, `/demo` copy | A clinic searcher can find a page that does not require Instagram | **Implemented** 2026-09-12 |
| 2 — go-live | [`p2-go-live/`](../Daily-plans/September%202026/12-09-2026/clinic-path/p2-go-live/) | Signup question + Instagram optional | A "Not yet" test doctor completes without Instagram; a Yes account is unchanged | **Implemented** 2026-09-12 — apply migration 232 |

When Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch under `docs/Work/Daily-plans/September 2026/12-09-2026/clinic-path/p1-discovery/` and becomes `Committed`. **Later phases promote as sibling subfolders under the same `clinic-path/` plan folder** (the one created on the start date), not under the later day's date.

---

## What already exists (inspected 2026-09-12)

- Marketing home: `frontend/app/page.tsx` + `Hero`, `ThesisBand`, `HowItWorks`, `FeatureGrid`, `ProofSection`, `TrustBand`, `FinalCtaBand`.
- Pricing page already matches the locked sheet.
- Hero has no rupees and no See pricing link. Pricing lives in the nav.
- Shared nav: `NAV_LINKS` in `frontend/components/marketing/constants.ts` — anchors are absolute to `/#…`.
- Demo page copy is still Instagram-first (`frontend/app/demo/page.tsx`).
- No `app/sitemap.ts` / `robots.ts`.
- No `practice_type` (or equivalent) on `doctor_settings`.
- Go-live AND: `backend/src/services/dashboard-onboarding-service.ts` — `complete = instagramConnected && practiceInfoSet && pricingSet && availabilitySet`.
- Checklist always includes Connect socials: `frontend/components/dashboard/onboarding/onboarding-steps.ts`.
- Signup extras already live on `frontend/app/complete-profile/page.tsx` (practice name, specialty) via `patchDoctorSettings`.

---

## Explicitly out of scope

- Front-door "which are you?" splash
- Homepage rewrite or second SKU
- Pricing / metering / seat changes
- Making Instagram disappear from the checklist
- Real patient data in verification

---

## Docs to sync when a phase ships

- [`BRAND.md`](../../Reference/business/BRAND.md) — note `/clinics` as the second public pitch
- [`ICP_AND_FIRST_CUSTOMER.md`](../../Reference/business/ICP_AND_FIRST_CUSTOMER.md) — Raj's public URL is `/clinics`, not `/`

---

**Created:** 2026-09-12.  
**Owner:** Founder (commercial + product).  
**Prefix:** `clp` — continuous `01`…`10`.
