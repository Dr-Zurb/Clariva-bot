# Halo Aid home v2 — product plan

> **Source:** Planning chat 2026-11-01. The first screen was rebuilt in that chat. This plan is the rest of the home page, written so it can be built one phase at a time.
>
> **Status:** Phases 1–3 are on the page. Phase 4 (trust, price, close) is built and waiting on your look. Phase 5 is not started. The home closing line used the proposed sentence. Change it if you want different words.
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Prefix:** `hav2`. Number tasks continuously across phases when a phase is promoted. Do not restart at 01.
>
> **Plan rules.** When a phase is selected, promote it under `docs/Work/Daily-plans/November 2026/01-11-2026/halo-aid-home-v2/p{N}-<slug>/` and mark that row `Committed` with a back-link. **Later phases are sibling `p{N}-` folders in that same `halo-aid-home-v2/` folder**, not under a later day's date. Phase 1 has no batch folder. It was built in the chat before this file existed. Do not backfill task files for it.

---

## North star

> A doctor sees the whole product in the first screen: content, booking, consult, record, and analysis, on one post. Scrolling shows each step up close, then the line that a view is not a visit, then the rest of the product, then what it costs.

After this plan ships:

1. The hero stays the curved row of five cards that is on `/` today.
2. How it works is the close-up of those same five steps, on the same post.
3. The edge line and the feature groups show the product, not a second list of icons.
4. Price and trust sit together on the home page. `/clinics` and `/pricing` keep the sections they already use.
5. Each repeated sentence lives in one place.

---

## Why the rest of the page is still the old one

The hero was rebuilt. Everything under the navy strip is still the July page: centered headings, icon cards, and the same sentences twice.

| Line | Where it is now |
|---|---|
| "From the post to the follow-up." | How it works is a different five steps today. This sentence is the home closing band, and it is also the `/pricing` closing band. |
| "The post, the visit, and the record" | Features heading, and the home closing band body. |
| "Patients pay into your own account…" | Features footnote, and `TrustBand` (which `/clinics` uses). |
| "A booking from your page lands back on the post…" | How it works Book step, and `EdgeBand`. |

The page never shows a product screen below the hero. How it works is five text steps named Post, Book, Check in, See, Come back. Those names do not match the hero.

---

## What is already on the page (do not re-derive)

| Surface | State |
|---|---|
| Hero | Copy on the left, five cards on a curve on the right. Files: `Hero.tsx`, `hero/HeroFlow.tsx`, `hero/FlowMinis.tsx`. Sky glow is `.halo-arch-glow` in `globals.css`. |
| Navy strip | `ThesisBand.tsx` is an empty `h-8` bar (`data-hero-strip`). The sentence "They already happen. Not in one place." is gone. Do not put it back. Do not delete the strip. |
| How it works | `HowItWorks.tsx`. Five text steps. No pictures. `id="how-it-works"`. |
| Features | `FeatureGrid.tsx`. `id="features"`. 13 titles in `FEATURE_GROUPS`, plus the wallet footnote. |
| Edge | `EdgeBand.tsx`. Two sentences, centered, no picture. |
| Trust | `TrustBand.tsx`. Used by `/clinics`. Do not edit it. |
| Price teaser | `PricingTeaser.tsx`. Home only. "₹999 a month covers the clinic and 20 teleconsults." / "Never more than ₹12,499." |
| Closing band | `FinalCtaBand.tsx`. Also used by `/pricing`. No props today. |
| Mocks kept for phase 2 | `mock/BoardMock.tsx`, `mock/BrowserFrame.tsx`. `BookingToast.tsx` was deleted. Do not recreate it for the hero. |
| Page order | Nav, Hero, ThesisBand, HowItWorks, FeatureGrid, EdgeBand, TrustBand, PricingTeaser, FinalCtaBand, Footer. |

Hero copy that stays exact:

- Pill: "Built for doctors on social media"
- Headline, two lines: "Doc, we're with you on your" / "social media journey."
- Sub-line: "Helping you with the content, the booking, the consult, the record, and the analysis." Then "The complete flow."
- Button: Get started → `/signup`
- Link: "Not on social media yet? Halo Aid for clinics" → `/clinics`
- Content card title: "Plan and schedule"
- Same post: "Acne reel" in Content, Booking, and Analysis. Booking time: Thursday, 4:30 PM.
- No patient names. No made-up statistics. The only count on a hero card is the real "1" on the analysis tile.

---

## Decision lock (HAV2-DL-1 … HAV2-DL-8)

Locked in chat 2026-11-01. Later phases inherit these. Do not re-litigate in a task file.

- **HAV2-DL-1 — Pictures are drawn in code.** No screenshots of the app, no new image files, no new packages.
- **HAV2-DL-2 — One post.** Acne reel, booked Thursday, 4:30 PM, runs through the hero and through How it works. Page-open bars have no number.
- **HAV2-DL-3 — The hero is the arc.** Do not replace it with the earlier post-board window. Do not put the trust checks or the ₹999 line back under the button. Do not restore the thesis sentence.
- **HAV2-DL-4 — How it works is the close-up.** Same five steps as the hero, in the same order: Content, Booking, Consult, Record, Analysis. Not Post / Book / Check in / See / Come back.
- **HAV2-DL-5 — Blue stays inside `.halo`.** Do not edit `:root` or `tailwind.config.ts`. `--halo-wash` may be added on `.halo` if a pale block needs it. `--halo-mist` is too faint for a block behind a product window.
- **HAV2-DL-6 — Shared sections get optional props, not a rewrite.** `TrustBand` stays as `/clinics` uses it. `FinalCtaBand` may take optional `title` and `body`. Defaults must be today's copy, so `/pricing` does not change.
- **HAV2-DL-7 — Each line once on the home page.** See the table in Phase 4. `/pricing` may keep "From the post to the follow-up."
- **HAV2-DL-8 — Server Components, except the How it works tabs.** Those need `"use client"`. No PHI. No patient names. Do not read `process.env`.

---

## Open decisions (do not guess)

| ID | Needed before | Question |
|---|---|---|
| **HAV2-OQ-1** | Phase 2 | The hero stage chips say **Idea, Choose, Make, Ready**. The real board, and the Board feature body, say **Ideas, Chosen, Making, Ready**. Phase 2 used the real board names and did not change the hero chips. Say if the close-up should use the short chips instead. |
| **HAV2-OQ-2** | Phase 4 | Home closing headline. Phase 4 used the proposed line: "Your next post can bring the next visit." `/pricing` still says "From the post to the follow-up." |

---

## Phase table

| Phase | Theme | Gate (one sentence) | Status |
|---|---|---|---|
| 1 | Hero arc | The first screen shows the five steps on one post | **Shipped** in chat 2026-11-01. No batch folder. |
| 2 | How it works | All five tabs swap the matching full-size screen, by mouse and by keyboard, and auto-advance follows the rules | **Shipped** 2026-11-01 |
| 3 | Edge and features | The visit line has the Acne reel card beside it, and the three feature tiles show a small picture each | **Shipped** 2026-11-01 |
| 4 | Trust, price, close | Home scroll has one trust-and-price section and a new closing line. `/pricing` still says "From the post to the follow-up." | **Built** 2026-11-01, waiting on the owner gate |
| 5 | Close gate | The page holds at 1440, 1280, 1024, 768, 390, and 320, with keyboard, reduced motion, and the routes below | **Drafted** |

Work the next drafted phase only. Stop at its gate and wait.

---

## Phase 1 — Hero

Shipped. Leave it unless the owner asks for a hero change.

Locked leftovers for later phases: `mock/BoardMock.tsx` and `mock/BrowserFrame.tsx` are for Phase 2. The navy strip stays an empty bar.

---

## Phase 2 — How it works

**Outcome.** The doctor opens a step and sees that step's screen, large, with the same post as the hero.

**Reuse.** `id="how-it-works"` and `scroll-mt-20`. `BrowserFrame`, `BoardMock`. The five hero pictures in `FlowMinis.tsx` are the small versions. These are the large versions. Do not import the hero cards into this section.

**Build.**

- Rewrite `HowItWorks.tsx` as a server wrapper. Add `HowItWorksTabs.tsx` (`"use client"`).
- Eyebrow: "How it works". H2: "From the post to the follow-up."
- Desktop: heading left aligned. Under it, tabs about 0.85fr and the picture about 1.15fr, 48px gap.
- Each tab: a 48px circle, the step name, and the body. The body shows only on the active tab. Active tab sits on `--halo-mist`, `rounded-2xl`, title semibold navy. Inactive titles are ink at 70%.
- Circles up to and including the active step are filled blue with white icons. Later circles are white with a blue outline at 25%. The line is solid blue to the active step and pale after it.
- Right side: the active picture inside `BrowserFrame`, fixed height about 420px, so the layout does not jump. A `--halo-wash` block behind it. 200ms opacity crossfade. Under reduced motion, swap with no crossfade.
- Mobile: the list first, then the active picture under it.
- Tabs: `role="tablist"` `aria-orientation="vertical"` `aria-label="How Halo Aid works"`. Each step is `role="tab"` with `aria-selected` and `aria-controls`. The picture is `role="tabpanel"`. Up and Down select. Home and End jump. Roving `tabIndex`.
- Auto-advance every 6 seconds, only while the section is on screen. Pause on hover or focus. Stop for good after the first click or key. Never auto-advance under `prefers-reduced-motion: reduce`.

**Steps.** Bodies below, except Content's board words, which wait on HAV2-OQ-1.

| Step | Icon | Body | Picture |
|---|---|---|---|
| Content | `Clapperboard` | "Plan it on the board — ⟨HAV2-OQ-1 names⟩ — then put it on the schedule." | `BoardMock`. Acne reel in the last column, Reel tag, blue chip "1 booking", 2px blue ring at 30%. |
| Booking | `CalendarCheck` | "They pick a time on your page. It joins the day's list with your walk-ins." | `BookingPageMock` |
| Consult | `Video` | "The desk adds vitals and history before they sit down. See them in the clinic, or by video, voice, or text." | `ConsultMock` |
| Record | `FileText` | "Chart the visit and write the prescription on your letterhead. The PDF goes to the patient." | `RecordMock` |
| Analysis | `BarChart3` | "See which posts led to a booking, and how many people opened your page." | `AnalysisMock` |

**Pictures** (new, under `components/marketing/mock/`, presentational, `role="img"` plus a one-sentence `aria-label`):

- **BookingPageMock.** `Link2` and "Opened from Acne reel". "Your clinic". "Pick a time". Days Wed, **Thu**, Fri. Times 10:00 AM, 11:30 AM, **4:30 PM** (filled blue), 5:00 PM, 6:30 PM greyed and struck through. A full-width blue bar "Book Thursday, 4:30 PM", not a button.
- **ConsultMock.** Navy 16:9 tile, white circle with `User`, chip "Video consult" with a green dot, round `Mic`, `Video`, and red `PhoneOff`. Side panel "Chart": reason and history as grey bars. Vitals tiles BP, Pulse, SpO₂, each a grey bar. No face. No name.
- **RecordMock.** Logo mark, "Your clinic", a rule, italic blue "Rx". Three rows: grey name bar, dose pill 1-0-1 / 0-0-1 / 1-1-1, duration 5 days / 10 days / 3 days. Chip "Follow-up: in 2 weeks". "Sent to patient" with a check.
- **AnalysisMock.** "Posts that led to bookings" and a pill "This month". Three rows, each a blue thumbnail with `Clapperboard`, a title, a grey "Page opens" bar with no number, and a blue "Bookings" bar with the count. Acne reel 1. Clinic tour 0. Fees and timings 0.
- **BoardMock.** Four columns. Neutral titles already named in the July board mock may stay (Fees and timings, Clinic tour, Post-op care, Morning stiffness) plus grey bars. Column labels follow HAV2-OQ-1. Do not invent a fifth post that implies a result.

**Gate.** Mouse and keyboard reach all five. The picture area does not change height between tabs. Auto-advance pauses, stops, and stays off under reduced motion. At 390px the picture is under the list and nothing scrolls sideways.

**Do not touch.** Hero files, `ThesisBand`, nav, footer, `constants.ts`, `/clinics`, `/pricing`.

---

## Phase 3 — Edge statement and features

**Outcome.** The visit line has proof beside it, and the 13 features sit in three tiles that show a small piece of the product.

### Edge (`EdgeBand.tsx`, rewrite)

- Background `--halo-mist`, `py-20`.
- Line 1, navy at 35%: "Instagram counts a view."
- Line 2, blue: "Halo Aid counts the visit."
- Body: "A booking from your page lands back on the post that sent them."
- Desktop: statement left, `PostStatsCard` right, vertically centered. Mobile: stacked.
- **PostStatsCard.** White, `rounded-3xl`, large shadow, 24px padding. Blue thumbnail with `Clapperboard` and a play icon, "Acne reel", tag "Reel". Row "Views": a long grey bar, no number, caption "On Instagram". Row "Visits booked": a short blue bar, a large "1", caption "Thursday, 4:30 PM".

### Features (`FeatureGrid.tsx`, rewrite)

- Keep the H2 "The post, the visit, and the record" and the line "One product. Nothing stitched together from five apps."
- Keep all 13 titles and bodies in `FEATURE_GROUPS` exactly.
- White background. Heading centered. Three equal-height tiles from `lg`, one column below. Each tile `rounded-3xl`, 1px border, 24px padding (32px from `sm`).
- Top of each tile: a 176px `--halo-mist` picture, `rounded-2xl`. Then the group name at 20px semibold navy. Then the features as rows: 32px icon square (blue at 10%), title 14px semibold, body 14px at ink 65%.
- Pictures, with no browser frame:
  - **Get patients.** One Ready column (label from HAV2-OQ-1) with the Acne reel card and the "1 booking" chip.
  - **See patients.** "Today", no names: 10:00 AM · Walk-in · Checked in. 11:30 AM · Booked · In clinic. 4:30 PM · Booked · Video.
  - **Keep patients.** Chip "Follow-up: in 2 weeks". "Visit history" with 12 Oct, 28 Sep, and 02 Sep, each a grey bar.
- Remove the wallet footnote. It moves to Phase 4.

**Gate.** Both sections at 1440 and 390. The 13 titles are still there. No patient names. No sideways scroll.

---

## Phase 4 — Trust, price, and the close

**Outcome.** Home has one trust block and one price card. The old price teaser is gone. `/pricing` still reads as it does today.

### Trust and price (`TrustAndPrice.tsx`, new, home only)

- Background `--halo-mist`. Two columns from `lg` (about 1.1fr and 0.9fr), top aligned. Mobile: trust, then the card.
- Eyebrow "Trust". Three rows, each a 40px icon square, an 18px semibold navy title, and one body line:
  - `ShieldCheck`: "You approve every post." / "Nothing goes out until you put it on the schedule."
  - `Lock`: "Patient records stay out of posts." / "Your patients' records stay with your practice."
  - `Wallet`: "Patients pay into your own account." / "Halo Aid is never in the middle and never takes a cut of your fee."
- Links line: "Read how we handle data in our Privacy Policy, Terms, and Data Deletion policy." Link those names to `/privacy`, `/terms`, and `/data-deletion`.
- Price card. White, `rounded-3xl`, 1px border, large shadow, 32px padding. Every figure is already on `/pricing`:
  - Eyebrow "One plan. Clinic included."
  - "₹999" at 48px bold navy, then "/ month".
  - "Covers every in-clinic visit and your first 20 teleconsults."
  - "₹49 per teleconsult after that"
  - "A no-show costs you nothing"
  - "Desk logins are free"
  - "Your bill can never cross ₹12,499"
  - "Prices exclude GST."
  - Full-width Get started → `/signup`. "See pricing" → `/pricing`.

### Closing band

- Add optional `title` and `body` to `FinalCtaBand`. Defaults are today's strings, character for character, so `/pricing` does not change.
- `body={null}` hides the paragraph.
- Home passes `title` from HAV2-OQ-2 and `body={null}`. Do not ship the proposed line unless the owner has approved it.
- Buttons stay Get started and Book a demo.

### Page order after this phase

1. Hero
2. Navy strip (`ThesisBand`, unchanged)
3. How it works
4. Edge statement
5. Features
6. Trust and price
7. Closing band
8. Footer

Remove `TrustBand` and `PricingTeaser` from `app/page.tsx`. Delete `PricingTeaser.tsx` only after nothing imports it. Do not delete `TrustBand.tsx`.

### Each line once

| Line | Stays | Leaves the home page |
|---|---|---|
| "From the post to the follow-up." | How it works heading | Home closing band. It remains the `/pricing` default. |
| "The post, the visit, and the record" | Features heading | Home closing band body |
| "Patients pay into your own account…" | Trust and price | Features footnote. `TrustBand` still has its own sentence for `/clinics`. |
| "A booking from your page lands back on the post…" | Edge statement | How it works Booking body (already reworded in Phase 2) |

**Gate.** Scroll the home page once. `/pricing` closing band still says "From the post to the follow-up." and "The post, the visit, and the record — in one place." `/clinics` trust section is unchanged.

---

## Phase 5 — Close gate

No new sections. Check, then fix only what this program broke.

**Viewports.** 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 320×700.

**Checks.**

- No sideways scroll (`document.documentElement.scrollWidth` is within `innerWidth`).
- Both hero headline lines stay one line each.
- Get started → `/signup`. Clinics link → `/clinics`. Nav Book a demo → `/demo`. See pricing → `/pricing`. Privacy, Terms, and Data Deletion open. Nav How it works and Features scroll to `id="how-it-works"` and `id="features"`.
- Every link and every How it works tab is reachable by keyboard. The focus ring is visible.
- With reduced motion on: no rise animation, no tab crossfade, no auto-advance.
- `/clinics` trust section unchanged. `/pricing` closing band unchanged.

**Commands,** from `frontend/`:

- `npx eslint` and `npx prettier --check` on the touched files.
- `npx tsc --noEmit`. Report errors in touched files only. There must be none. The repo already has errors elsewhere.
- `npm test`. Report the result. No test covers the home page. Do not treat older clinic-test failures as this phase.

---

## Files

**Phase 2.** Change `HowItWorks.tsx`. Add `HowItWorksTabs.tsx` and the mocks named above. `BoardMock` and `BrowserFrame` may be adjusted to match this spec. Add `--halo-wash` on `.halo` if it is not already there.

**Phase 3.** Change `EdgeBand.tsx` and `FeatureGrid.tsx`. Add `PostStatsCard`.

**Phase 4.** Add `TrustAndPrice.tsx`. Change `FinalCtaBand.tsx` (props only) and `app/page.tsx` (order and imports). Delete `PricingTeaser.tsx`.

**Do not touch, any phase.**

- `MarketingNav.tsx`, `MarketingFooter.tsx`, `constants.ts`
- `TrustBand.tsx`, `/clinics`, `/pricing`, `/demo`
- Hero files and `ThesisBand.tsx`, unless the owner asks
- Every `* 2.tsx` and `* 3.tsx` duplicate
- `ProofSection*.tsx`, `Testimonials.tsx`
- Anything under `components/dashboard/`
- `:root` tokens and `tailwind.config.ts`

---

## Verification that every phase runs

From `frontend/`, eslint and prettier on the touched files, and `tsc` with the note in Phase 5. Browser check at 1440 and 390 at least, plus the phase's own gate. Send a screenshot of the section. Stop.
