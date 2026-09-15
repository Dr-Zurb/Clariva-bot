# Tracks — every open thread in the business

The single place I look when planning a week. If a thread isn't here, it doesn't exist.

**States:** `URGENT` (has a legal/external deadline) · `ACTIVE` (moving this week) · `WAITING` (someone else's court) · `NEXT` (queued) · `PARKED` (deliberately not now)

**Rule:** every track has exactly **one** next action, small enough to finish in one sitting.
**⟨fill⟩** marks something only I know — fill it in on the next pass.

---

## Index

| # | Track | State | Next action |
|---|-------|-------|-------------|
| L1 | Share capital + current account | `ACTIVE` | Wed 2: both directors lodge the current-account application |
| L2 | INC-20A (commencement of business) | `WAITING` | Waiting on CA for the 180-day deadline date |
| L3 | First statutory auditor | `WAITING` | Waiting on CA: auditor appointed / ADT-1? |
| L4 | GST — register or wait | `WAITING` | Waiting on CA reply (pinged 28 Aug) |
| L5 | Trademark — HaloAid wordmark | `WAITING` | After Udyam / DPIIT, send attorney class list + clearance reports |
| L6 | Udyam / MSME registration | `WAITING` | Redo Udyam after the company current account exists |
| L7 | DPIIT Startup India recognition | `NEXT` | Apply after Udyam — needed for the cheaper TM fee |
| L8 | IP assignment from founders | `NEXT` | Print, sign two sets, scan the PDF |
| L9 | DPDP Act + health-data posture | `NEXT` | Counsel sitting: attestation vs AI-on-transcript (blocks Phase 2) |
| M1 | Meta — data deletion callback | `ACTIVE` | Optional Send Request if this Facebook account ever connected Halo Aid |
| M2 | Meta — business verification | `WAITING` | Wait. Recheck Security Centre Tue 15 Sep. Do not restart while In review. |
| M3 | Meta — app review submission | `NEXT` | Record one screencast per requested permission |
| P1 | Desk / receptionist | `ACTIVE` | Review history-link spec; promote p1; then Opus `hl-01` |
| P2 | Cockpit / EHR | `PARKED` | — |
| P3 | Bot / messaging | `PARKED` | — |
| P4 | Billing + usage metering | `PARKED` | — |
| G1 | First paying clinic | `PARKED` | — |
| G2 | Pricing | `NEXT` | Decide a number I can say out loud without flinching |
| G3 | Cost-cut stack (Gate 1) | `ACTIVE` | Watch one consult (raw STT + replay), then disable the Twilio compose hook |
| O1 | `capture/inbox.md` has gone feral | `NEXT` | Triage the 375 lines into `capture/features/` |

---

## L — Legal, entity, compliance

### L1 · Share capital + current account — `URGENT`
Payments can't land anywhere until this exists, and **L2 depends on it** — INC-20A requires the subscribers to have actually paid in the subscribed capital to a company account.

- Legal name: **HALO AID PRIVATE LIMITED**
- Incorporation date: **20 Aug 2026**
- CIN: **U62090PB2026PTC069487** (on the COI)
- PAN: **AAICH9055P** — print `PAN-AAICH9055P-unlocked-HA.pdf` (locked original still `PAN-AAICH9055P-HA.pdf`, password `20082026`)
- TAN: **JLDH04909C** — `HaloAid /Important Docs/TAN-JLDH04909C-HA.pdf` (password **143505**, Batala PIN)
- DIN (Abhishek Sahil): **11904342** — letter SRN AC5388645
- DIN (Ramesh Masih): **11904343** — MCA master data, appointed 20 Aug 2026. Portal spells the name **RAMESH MASH**; our MoA/AoA say **Ramesh Masih**. Use the DIN as filed.
- Authorised + subscribed capital (e-MoA clause 5 / SPICe+ 3A): **₹1,00,000** — 10,000 equity shares of ₹10 each. No preference.
- Filed split: **5,000 / 5,000** (Abhishek Sahil + Ramesh Masih). Intended later: **~99% me / 1% father** — CA said he will do the transfer. Do not wait on that to open the bank. INC-20A needs the **₹1,00,000 subscribed** paid into the company account (₹50,000 from each subscriber as filed).
- MoA objects (clause 3a): software / IT / web-and-mobile apps / hosting / AI and NLP — covers HaloAid as SaaS. Not a clinic or hospital company. Registered office state: **Punjab**.
- AoA: Table F (company limited by shares). Only marked alteration is **Art. 59** — first directors are Abhishek Sahil and Ramesh Masih; board of two. Transfers can be declined by the Board (standard private-company lock). Cheques signed as the Board resolves — our “only Abhishek operates” resolution is the right instrument. No founder-protective / 99-1 articles.
- Bank shortlisted (30 Aug): **ICICI iStartup** — Tech (₹0 balance) if they'll give it; else Silver (₹25,000 QAB). Fallback: HDFC SmartUp. Avoid IDFC (thin Gurdaspur network) and SBI/PNB (slow Pvt Ltd onboarding).
- Why ICICI: zero-revenue SaaS, no cash, Razorpay settles by NEFT. Minimum balance is the only cost that matters. HDFC's "free for 4 quarters then ₹50,000 AQB" cliff hits while we are still pre-revenue.
- Trap: startup variants often want a **DPIIT certificate**. We don't have one yet (L7 waits on L6, which waits on this account). Ask the branch: open the startup variant without DPIIT, or open a regular current account and convert later.
- Print pack ready **1 Sep**. Sitting **Wed 2** — both directors go lodge the application. Branch / time: ⟨fill⟩. Intended: Batala ICICI (HDFC SmartUp as backup). Ask at the counter: Pvt Ltd at this branch or regional file? iStartup Tech / Silver without DPIIT, or regular current account and convert later?
- Board resolution: `BANK-ACCOUNT-BOARD-RESOLUTION-HA.pdf`. Both directors sign the paper. **Only Abhishek operates** — father is KYC only, not a signatory. If the bank hands you their own format, use theirs and keep ours as backup.
- CA pack landed **1 Sep** (signed 18 Aug 2026, witnessed by FCA Ravi Jain). Saved in `HaloAid /Important Docs/`:
  - `MOA-INC-33-HA.pdf` — e-MoA, 10 pp
  - `AOA-INC-34-HA.pdf` — e-AoA, 27 pp
  - `INC-9-SUBSCRIBER-DECLARATION-HA.pdf` — subscriber + first-director declarations
  - `SPICE-PLUS-PART-B-INC-32-HA.pdf` — incorporation form (SRN `1-26914264231`, filed 18 Aug). RO correspondence: Gali No. 10, Shiv Nagar, Batala, Punjab 143505.
- Do not pay MCA ₹995 for certified copies — these are the filed SPICe+ copies.

**Next action:** Wed 2 — both directors lodge the current-account application. Carry prints: COI, MoA, AoA, unlocked PAN, TAN (unlocked), signed board resolution (only you operate), both directors’ KYC + photos, DIN letter. Father is KYC only. Udyam (L6) waits on the account number.

### L2 · INC-20A — `URGENT`
Form INC-20A (declaration of commencement of business) is due within **180 days of incorporation** for a company with share capital. Missing it is expensive — penalty on the company plus a per-day penalty on each officer, and the company can't legally begin operations or borrow. Requires the paid-up capital sitting in the company bank account (L1) first.

DOI is **20 Aug 2026**. Exact last day: **⟨CA to confirm⟩**.

**Next action:** waiting on the CA (pinged 28 Aug). Put the exact due date in this week’s file when it lands.
**Blocked by:** L1.

### L3 · First statutory auditor — `URGENT`
The board must appoint the first auditor within **30 days of incorporation** (if it doesn't, the members must do it within 90 days at an EGM). Given the registration is already done, this window may be open or already missed — worth checking now rather than at the first annual filing.

**Next action:** waiting on the CA (pinged 28 Aug). Write the answer here when it lands.

### L4 · GST — `ACTIVE`
My current understanding — ₹20 lakh turnover then register — is roughly the *threshold* rule for services, but it's not the whole picture, and two of the exceptions probably apply to me already. Rather than guess, get these four answered by the CA in one message:

1. **Threshold:** for a SaaS/services company in my state, is the registration threshold ₹20L, or ₹10L (special-category state)?
2. **Import of services / RCM:** I pay foreign vendors (Meta, model APIs, cloud). Does that pull me into compulsory registration under the reverse-charge rules *regardless* of turnover?
3. **Voluntary registration:** if I register now, I can claim input tax credit on all the software and cloud spend I'm already burning — does the ITC outweigh the compliance cost of monthly/quarterly returns?
4. **Invoicing before registration:** what exactly do I put on an invoice to a clinic until GST is live, so I don't have to re-issue later?

**Next action:** waiting on the CA reply (pinged 28 Aug with the four questions). Write the answers into this track when they land.

### L5 · Trademark — HaloAid wordmark — `WAITING`
Decision made: proceeding with **HaloAid**. The clearance search surfaced HaloFit and Microsoft's Halo, and I'm satisfied they're distinguishable — different mark, different logo, healthcare-EHR-for-doctors class.

Classes to file:
- **42** — SaaS, software as a service (the core one)
- **9** — downloadable software / app
- **44** — medical services (only if I'll ever touch care delivery)
- **35** — business/admin services (optional; decide with the attorney)

File **after** L6/L7 — DPIIT or Udyam recognition cuts the government fee per class roughly in half (₹4,500 vs ₹9,000), which is real money across three classes.

**Next action:** finish Udyam (L6), then send the attorney the class list and the clearance reports for a filing quote.

### L6 · Udyam / MSME — `WAITING`
Form filled on the official portal (`udyamregistration.gov.in`) on 28 Aug. Submit is blocked: bank name / IFSC / account are required. Do not use a personal account.

Saved answers: ITR No · GSTIN No · investment/turnover 0 · commenced No · Services · Non-Trading · NIC 62099 · staff 1 · address as on the COI.

**Next action:** redo submit after the company current account (L1) exists. Same answers. Save the PDF under `HaloAid /Important Docs/`.

### L7 · DPIIT Startup India recognition — `NEXT`
Also free. Gives the reduced TM fee, access to the startup schemes, and the tax exemptions worth applying for separately. Needs incorporation docs and a short write-up of what the product does and why it's innovative — I can write that in twenty minutes.

**Next action:** apply on the Startup India portal after L6.

### L8 · IP assignment — `NEXT`
Right now the code and the brand were created by *people*, not by the company. Any future investor or acquirer will ask for signed assignments, and it is dramatically cheaper to fix today than during diligence. Applies to me, any co-founder, and every contractor or designer who ever touched the product.

Written and print-ready in `HaloAid /Important Docs/` — no editing needed, every blank is filled in by pen:

- `IP-ASSIGNMENT-DEED-HA.md` — the deed + Schedule 1
- `IP-ASSIGNMENT-BOARD-RESOLUTION-HA.md` — pass this first; father signs for the company, I disclose interest under s.184
- `IP-ASSIGNMENT-HOWTO-HA.md` — signing order, what goes in each blank

**Next action:** print the two PDFs, pass the resolution, sign two sets of the deed (Punjab copyright-assignment stamp duty is ₹0 — no CA needed for this). Scan to `IP-ASSIGNMENT-SIGNED-YYYY-MM-DD-HA.pdf` in the same folder.

### L9 · DPDP Act + health data — `NEXT`
Patient data is sensitive personal data — this isn't optional, and Meta will also demand the artifacts (M1/M3 are blocked without them). Needed: privacy policy, terms of service, consent language at the point of collection, a data-deletion path, and a breach-notification plan.

Live URLs (frontend on Render, 29 Aug 2026):
- Privacy: https://haloaid.com/privacy
- Terms: https://haloaid.com/terms
- Data deletion: https://haloaid.com/data-deletion

Still open for a later counsel pass: named Grievance Officer, consent language at collection, breach-notification plan. Not a product launch — backend is not hosted.

Add to the same counsel sitting (30 Aug): **in-clinic ambient audio recording of a walk-in consult.** Today's recording attestation covers Twilio teleconsult audio as a disclosed mandate; a microphone in a physical consulting room captures a patient who never agreed to those terms and creates PHI outside the existing retention/erasure machinery. Blocks Phase 3 of [`plan-visit-narrative.md`](../Product%20plans/plan-visit-narrative.md). Related: Chrome's `SpeechRecognition` API sends audio to Google — fine for the doctor dictating, a third-party processor the moment a patient is in the room.

Also for the same counsel sitting (30 Aug): **does the recording attestation cover AI processing of transcript text?** Its six clauses disclose recording, non-deletion, patient access, replay logging, streaming-only, and video consent — none mentions transcription or sending that text to a model. (`RECORDING_ATTESTATION_POLICY_VERSION` is also still an unapproved draft.) Transcription already sends audio to Whisper/Deepgram, so a processor hop exists today; Phase 2 of [`plan-visit-narrative.md`](../Product%20plans/plan-visit-narrative.md) adds a *new* hop for a *new* purpose.

**Executed 2026-08-30 (`vnt-02` §1):** STOP. No clause covers downstream AI processing of transcript text for chart-drafting. Draft policy must not ship. Owner overrode the same day ("just do it") — the extraction route is written; clauses were not edited. **Production ship** of Phase 2 still needs owner/counsel copy plus a non-DRAFT policy version.

**Drafted 2026-08-31 — ambient walk-in spec, so the counsel sitting has questions instead of a worry:** [`p3-ambient-walkin/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p3-ambient-walkin/). Spec only — no capture code, and the plan says so in three places. Take these five to the sitting: (1) may a walk-in consult be recorded at all, with what form of consent, captured by whom, retained where; (2) per-visit or standing consent, and what withdrawal does to audio already captured; (3) the attendant/parent/interpreter in the room, who is not the data principal; (4) what the patient must be told — recorded, transcribed, read by a model to draft chart entries, kept how long, erased how; (5) whether a decline may be stored. Useful finding for the sitting: the right shape was designed once already — `appointments.recording_consent_decision/_at/_version` (migration `053`) stores a per-visit patient decision with a never-overwritten wording snapshot, and treats a decline as "consult proceeds, recording does not". Then recording-governance-v2 dismantled it on purpose (`rec-08` web-booking ask, `rec-09` DM funnel stage, `rec-10` downstream gates) and retired consent `v1.0`. **Only the columns survive.** So this is reviving a retired basis for a case the mandate never covered — not inventing one, but not switching one back on either.

Live URLs are in Meta app settings. Counsel pass (Grievance Officer, collection consent, breach plan) is later.

**Next action:** at the counsel sitting, answer whether attestation may cover AI processing of transcript text (unblocks Phase 2 ship). Do not write the extraction route until that answer is yes.

---

## M — Meta app review

The long pole. Meta's review clock runs in **weeks**, so everything here should be fired as early as possible and worked on while it waits.

### M1 · Data deletion callback — `ACTIVE`
Meta requires a working data-deletion callback endpoint before granting the messaging permissions.

Public callback (frontend on Render; acks Meta and serves a status page). Real Instagram disconnect still lives on the Express backend and will take over when that host is live.

- Callback URL: https://haloaid.com/data-deletion-callback
- Status page: https://haloaid.com/data-deletion?code=…
- Instructions page (already live): https://haloaid.com/data-deletion

On Render (`Clariva-bot-1`) add server-only `META_APP_SECRET` (or `INSTAGRAM_APP_SECRET`) so the dashboard Test can verify the signature. Do not use `NEXT_PUBLIC_`.

Callback URL is in Basic Settings. Live POST returns `200` + `{ url, confirmation_code }` on `haloaid.com`.

**Next action:** optional — Facebook → Apps and Websites → Remove Halo Aid → Send Request, only if this account ever connected the app. Otherwise M1 is done enough until the Express backend is hosted.

### M2 · Business verification — `WAITING`
**Try 2 of N — In review** (submitted Sun 13 Sep 2026 ~19:50 IST). Meta UI: ~2 working days. Official outer window still up to 14 working days. Portfolio `1014532090915807` (Halo-Aid). Use case: **App requires access to permissions on Meta for Developers**. Do not start Access verification (Tech Provider). 2FA postponed.

Checked live **Sun 13 Sep**: `https://haloaid.com` and `https://www.haloaid.com` both show the footer `HALO AID PRIVATE LIMITED (CIN U62090PB2026PTC069487)` · `Gali No. 10, Shiv Nagar, Batala, Gurdaspur - 143505, Punjab, India` · `founder@haloaid.com`. Privacy / Terms already had the same line.

Meta does not publish a hard retry cap for this Security Centre flow. Do not start Try 3 while In review. If Try 2 fails, **do not resubmit the same pack** — change something first (see below).

#### Try 1 — rejected
- Submitted **Fri 28 Aug 2026**. Status Pending until rejected **Sun 13 Sep 2026** (~16 calendar days / ~10–11 working days).
- Reason shown: “Couldn’t be verified.” No field-level note.
- Docs: COI + unlocked **TAN**. Website given: `https://haloaid.com`.
- Site timing: week notes still said **domain only / do not deploy the app** (Mon 24). Privacy / terms / data-deletion recorded live **29 Aug** — the day *after* this submit. A full marketing homepage is later still. Meta could have opened a parked or empty `haloaid.com` on Try 1.
- Even after pages existed, the public homepage said “Halo Aid” only; legal name lived on `/privacy` and `/terms`.
- Business Info was blank after the review (Meta clears those fields). That blank page was not itself the fail.

#### What we changed before Try 2
- Business Info refilled (legal name, Batala address, phone, site, PAN `AAICH9055P`). Primary business location left empty on purpose.
- Public footer shipped (commit `1c74207` on `main`) and confirmed live on apex + `www`.
- Dropped TAN. Email confirm used domain mail, not Gmail.

#### Try 2 — In review — form values as typed
| Field | Value |
|---|---|
| Business type | Private company (not Corporation / sole prop / partnership / institution) |
| Tax ID / registration (lookup) | CIN `U62090PB2026PTC069487` |
| Business name | `HALO AID PRIVATE LIMITED` |
| Alternative / trade name | `Halo Aid` |
| Street | `Gali No. 10, Shiv Nagar` |
| Street 2 | (blank) |
| Town / city | `Batala` |
| County / region | `Punjab` |
| PIN | `143505` |
| Country | India |
| Phone | `+91 8264602737` (`IN +91` + 10 digits; do not add a trailing 0) |
| Website | `https://haloaid.com` |
| Business Info tax ID | Company PAN `AAICH9055P` |
| Connection confirm | Email `founder@haloaid.com` — **done** |
| Legal-name doc | Type **Certificate of incorporation** · file `COI-U62090PB2026PTC069487-HA.pdf` |
| Address / phone doc | Type **Certificate/articles of incorporation** · **same COI again** (not PAN) |
| Address-slot types offered | Business registration/licence · **Business tax document** (this is the PAN slot) · Certificate/articles of incorporation · Change of name · Utility bill |
| Registry match | None — Meta asked for uploads |

Opened the PDFs **Sun 13 Sep** (after submit). What is actually printed:

| File | Name | Address | Phone `8264602737` | Use as |
|---|---|---|---|---|
| COI | yes | yes — “Mailing Address… HALO AID PRIVATE LIMITED, Gali No. 10, Shiv Nagar, Batala, Batala, Gurdaspur-143505, Punjab” | no | Legal name, and it *can* cover address |
| e-PAN `AAICH9055P` | yes | **no** | no | Tax ID only. **Cannot** satisfy the address/phone slot |
| TAN letter `JLDH04909C` | yes | yes — Shiv Nagar, Gali No. 10, Batala, Gurdaspur-143505, Punjab | **yes** | Best address/phone file we have |

Known thin spot on Try 2: two copies of the COI. Allowed, and the COI does carry name + RO. A reviewer can still read it as one document. PAN would not have fixed the address slot. TAN would have — it is the only PDF with name + address + the phone we typed. Try 1 already used COI + TAN and still failed (no public footer / blank Business Info then).

#### If Try 2 fails — change the pack before Try 3
Do **not** upload PAN for address. Do **not** send COI + COI again.

1. Open **View details** / Security Centre. Paste Meta’s sentence into this track before touching the form.
2. Legal name: COI as **Certificate of incorporation**.
3. Address/phone: unlocked **TAN** (`TAN-JLDH04909C-unlocked-HA.pdf` or the unlocked TAN in Important Docs) as **Business tax document**. That letter has name + Batala line + `TEL NO. 8264602737`.
4. Stronger later, do not invent: GST (L4) or company bank letter (L1). No personal utility bill. No e-PAN for the address box.
5. After a second rejection, open a Meta Business support case and ask which field failed. Do not burn Try 3 blind.
6. Recheck footer still live on both hosts before any resubmit.

**Next action:** Wait. Recheck Security Centre **Tue 15 Sep**. Do not restart while In review.

### M3 · App review submission — `NEXT`
Permissions needed: the `instagram_business_*` scopes and the `pages_*` scopes for messaging, plus Advanced Access. Each requires a screencast that shows a real user completing the flow, and a written justification.

**Next action:** record one screencast per requested permission. Do them in a single sitting.
**Blocked by:** M1, and helped by M2. Access verification (Tech Provider) starts only after M2 is verified. Policy URLs (L9) are live.

---

## P — Product

### P1 · Desk / receptionist — `ACTIVE`
Basic version is done: search, intake, booking, check-in, archive/restore, and the same-day lock (server-side conflict plus the front-desk "mark arrived" path). Same-day lock dogfooded.

Product order (30 Aug): **(1) history link → EHR** (bot after book, later the same link at the desk) · **(2) desk + payments including walk-ins** · **(3) teleconsult polish** · **(4) EHR daily clinic refine** (not a week program).

**Spec drafted 2026-08-31:** [`plan-history-link.md`](../Product%20plans/plan-history-link.md) · batch [`history-link/p1-form-to-chart/`](../Daily-plans/August%202026/31-08-2026/history-link/p1-form-to-chart/). Four fields (why today, allergies, meds, conditions). Sidecar first; doctor accepts onto the existing chart tables. Token is house HMAC, `kind: 'history-form'`. Bot line on the confirmation DM in Phase 1; desk send is Phase 2.

**Next action:** review the plan, tick HL-Q2 / HL-Q3 / HL-Q5 / HL-Q6 (or skip in writing), mark Phase 1 `Committed`. Then execute `hl-01` on Opus. Do not start desk payments in the same sitting.

### P2 · Cockpit / EHR — `PARKED`
Deliberately parked while desk and Meta are the critical path. The engineering backlog is already captured in `capture/features/` and the cockpit roadmap under `Product plans/`.

### P3 · Bot / messaging — `PARKED`
Gated on M1–M3 anyway. No point building past the permissions I don't have yet.

### P4 · Billing + usage metering — `PARKED`
Manual invoicing is fine until there are enough customers for it to hurt. Revisit when G1 produces a second paying clinic.

---

## G — Go to market

### G1 · First paying clinic — `PARKED`
The product is closer to ready than the business is. One real clinic using this daily will teach me more than another month of features.

**Next action:** — parked. Not naming clinics. Unpark when the account is open and the product is something a front desk can use daily.

### G2 · Pricing — `NEXT`
**Next action:** pick a monthly number per clinic and practice saying it out loud. It can be wrong; it can't be absent.

### G3 · Cost-cut stack (Gate 1) — `ACTIVE`
Today's real cost is **₹36.46/consult**, not the ₹25.70 this doc used to carry. After the 31 Aug picks it is ₹6.55. Write-up: [`PRICING_MODEL_DECISIONS.md`](../../Reference/business/PRICING_MODEL_DECISIONS.md) § Cost inputs and the [cost-cut stack](/Users/abhisheksahil/.cursor/projects/Users-abhisheksahil-Desktop-Clariva-Bot/canvases/cost-cut-stack.canvas.tsx). `gpt-5.2` shuts down 11 Dec 2026.

Repo default is now `gpt-5.6-luna`. Gate 3 (15 Feb–1 Aug): 2.38M tokens still on `gpt-5.2`, ~₹130–220/mo at current volume.

**Shipped 2026-09-01**
- Step 1: Gate 3 `audit_logs` query. Absolute spend tiny at founder volume.
- Step 2: replies on `gpt-5.6-luna` (14:05 UTC rows 2091 / 1997 tokens). Classification stayed on `gpt-4o-mini`. Greeting quality fine. Backend still not on Render — set `OPENAI_MODEL=gpt-5.6-luna` when the API is hosted.
- Step 3: explicit prompt cache on reply paths. First live turn 14:33 UTC: `cachedTokens: 0` / `promptTokens: 1960` — intended cache **write**. Cache **hit** (`cachedTokens` > 0) deferred. DM latency parked (webhook/tunnel, not the model).
- Step 4 (code 2026-09-03, **not live**): a Meta Cloud auth-template send path exists in the repo. **WhatsApp is not a product.** Replay OTP still goes **Twilio SMS**.

**Shipped 2026-09-04**
- Step 5: `GROQ_API_KEY` in local `.env`. Migration 227 applied. English / other → `groq_whisper`. Live row proof deferred.
- Step 6: Migration 228 applied. Hindi / Hinglish → `deepgram_nova_3`. Live Hindi row deferred (`language_code` still defaults `en-IN`). Groq live proof also deferred.

**Step 7 started 2026-09-04 (Opus)** — design changed on a verified finding. Compose is a Twilio hook (`HKbe336c348bce4c81907f6a3c55844a82`, `haloaid-consult-audio`), not `compositions.create`, but disabling it is **not** an ops flip: Twilio raw Recordings are Matroska (`.mka` / `.mkv`), which neither the browser nor Groq will read, so **the composition is the transcode**. Plan is now `ffmpeg-static` locally for STT plus `compositions.create` on demand at play time, so the meter only runs on consults someone actually replays. No migration needed — `artifact_kind` is free-text and `composition_sid` is unconstrained `TEXT`. Runbook: [`stop-composition-hook-runbook.md`](../../Reference/engineering/operations/setup/stop-composition-hook-runbook.md).

**Step 7 is code-complete as of 2026-09-04.** Landed: the `twilio-recordings.ts` wrapper; the `twilio-recording:<RT…>` artifact kind with its archival and DPDP-erasure delete routes; raw-track registration at `room-ended` plus a worker re-sweep; a local `ffmpeg-static` mix feeding STT; and `compositions.create` at play time, guarded against double-billing by Twilio's own composition list. The transcode tests run the real binary against real Matroska fixtures.

**Rollout sitting 1 — 2026-09-08.** `VOICE_TRANSCRIPTION_USE_RAW_TRACKS=true` in local `.env`.

**Rollout sitting 2 — 2026-09-12.** `RECORDING_COMPOSE_ON_DEMAND=true` in local `.env`. Repo defaults stay **off**. The hook is **still on**, so this flag is a no-op on hook-composed sessions — it is staged so it is already live when the hook comes off. Restart `npm run dev` so both flags load.

What to check on the next real consult (runbook): no `audio lookup threw`; `audio-transcode: tracks mixed` with `trackCount` ≥ 2 for a two-party call; transcript covers both speakers; `tick complete` logs `useRawTracks: true`. Replay should still mint immediately while the hook is on. Roll back either flag by setting it `false`.

One behaviour change to expect once the hook is off: the first press of play on a new consult returns "This recording is being prepared", because composing is asynchronous. Consults recorded before the flip already have a `CJ…` and are unaffected.

Steps 8 and 9 were wrongly bundled with 7. **9 does not need LiveKit** (transcode locally, push to R2, delete Twilio's copy) but does need a Cloudflare DPA since R2 would hold PHI. **8 is blocked on economics, not engineering**: LiveKit Ship has no BAA and Scale is $500/mo ≈ ₹47,750, which exceeds the entire monthly saving until roughly 1,600 consults/month.

**Next action:** one voice/video consult — confirm raw-track STT, then disable hook `HKbe336c348bce4c81907f6a3c55844a82` (`haloaid-consult-audio`). Do not disable before that consult. OTP parked.

---

## O — Operational debt

### O1 · `capture/inbox.md` has gone feral — `NEXT`
It's ~172 KB and 375 lines of agent-generated code follow-ups. Capture works; triage never happens. It's now write-only, which means everything in it is functionally lost.

**Next action:** one triage pass — move each line into the right `capture/features/<program>/backlog.md`, delete what's stale, and cap the inbox at whatever fits on one screen.
