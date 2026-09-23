# Meta / Instagram terms — compliance audit (2026-09-15)

Clause-by-clause read of the documents in this folder against Halo Aid's implementation as of `origin/main` `389b69e` (private replies + cap + kill switch + window-expired mapping + spike auto-pause all live on Render).

**What was reviewed** (snapshots in this folder; Meta's live pages are canonical):

| Snapshot | Source | Doc date |
|---|---|---|
| `meta-platform-terms.md` | developers.facebook.com/terms | Last updated 3 Feb 2026 |
| `meta-developer-policies.md` | developers.facebook.com/devpolicy | Last updated 3 Feb 2026 |
| `meta-app-development-guidelines.md` | …/app-dev-guidelines | Effective 3 Feb 2025 |
| `instagram-terms-of-use.md` | help.instagram.com/581066165581870 | Current |
| `instagram-scraping-restriction-help.md` | facebook.com/help/instagram/740480200552298 | Current |
| `instagram-community-guidelines.md` | help.instagram.com/477434105621119 (Community Standards index) | Current |
| `instagram-private-replies-doc.md` | …/instagram-platform/private-replies | Current |
| `messenger-error-codes.md` | …/messenger-platform/error-codes | Current |

**Honest scope note:** this audit can make Halo Aid *provably compliant*. It cannot remove Meta's discretion — Platform Terms §7.e ("in our sole discretion", enforcement "automated and manual", "with or without notice") and Instagram ToU §6 ("if you create risk or legal exposure for us") reserve it explicitly. That residual is what the L10 contract clause and the spike watch are for.

---

## Verdict at a glance

| # | Finding | Severity | Owner |
|---|---|---|---|
| F1 | Dev Policies §5 **Healthcare clause** — plainly worded against messaging between people and healthcare providers, and against patient data in the channel | **Counsel, high — biggest terms risk we have** | Founder → attorney (merge into L10) |
| F2 | No patient-side **opt-out** handling in the DM bot (Dev Policies §5 requires immediate opt-out respect) | Shipped 16 Sep 2026 (`mca-06`…`mca-09`) | Implemented |
| F3 | Public comment reply is **one identical string** for every commenter (App Dev Guidelines: "uniquely tailored"; Community Standards: spam = "substantially similar" bulk behavior) | **Fixed 15 Sep 2026** — `@username` + 3 English variants (`mca-02`) | Engineering |
| F4 | We meet the Platform Terms **Tech Provider** definition → the clinic contract must bind clients to Meta terms | Counsel — new clause point for L10 | Founder → attorney |
| F5 | **Service-provider list** + written-processing terms (Platform Terms §5.a) | **Written 2026-09-17** — [`service-providers.md`](./service-providers.md). DPA/contact `⟨fill⟩` and Redis vendor still founder. | Founder |
| F6 | No labeled **security-vulnerability reporting channel** (Platform Terms §6.a.ii) | **Fixed 15 Sep 2026** — `/.well-known/security.txt` + footer line (`mca-04`) | Engineering |
| F7 | **Incident reporting to Meta** missing from our incident runbook (Platform Terms §6.b) | **Fixed 15 Sep 2026** — step in `SECURITY.md` (`mca-04`) | Engineering |
| F8 | Messaging mechanics, data handling, privacy policy, deletion callback | **Compliant** — evidence below | — |

---

## F1 — The Healthcare clause (read this one)

Developer Policies §5, "Messages, Calls and Data", verbatim:

> **Healthcare:** Don't use Messenger and/or Instagram Messaging features, including messaging and calling, to facilitate direct conversations between people and healthcare providers or to send or collect any patient data obtained from healthcare providers.

Halo Aid automates DM conversations on a clinic's Instagram account: booking, FAQs, previsit reminders, prescription-ready notices, consultation links. A plain reading of this clause touches all of it. Two halves, different weights:

- **"facilitate direct conversations between people and healthcare providers"** — ambiguous in practice. Clinics and hospitals run Instagram messaging widely, Meta markets business messaging for appointment booking, and enforcement against front-desk/scheduling use is not visible. The strictest reading still catches a receptionist bot.
- **"send or collect any patient data obtained from healthcare providers"** — the sharper half. Previsit reminders, prescription-ready notices, and consult links are patient data *originating from the provider's systems* pushed through the channel. This is harder to argue around than the FAQ bot.

What this is **not**: a reason to panic-disable the product. It is the reason the next counsel sitting exists.

**Actions:**
1. **Counsel (L10 packet, added):** ask the attorney to read Dev Policies §5 "Healthcare" against (a) the receptionist FAQ/booking conversations and (b) provider-derived patient data in DMs. Get a written read before a paying clinic is live.
2. **Product lever, if counsel says narrow it:** keep Instagram for inbound FAQs/booking only; move provider-data notifications (reminders, prescription-ready) to SMS/email. This option already exists as the parked reminder-channel decision — the code paths are separable.
3. **App Review (M3):** framing stays receptionist/appointment-FAQs and must stay *accurate* — Dev Policies §1 bans misleading Meta. Do not describe flows we run as something else.

## F2 — Patient opt-out (gap)

Developer Policies §5, verbatim:

> **Opt-out:** Provide an appropriate legally sufficient means for people to request an opt-out of this messaging functionality, on an ongoing basis. Immediately respect all requests (on or off Messenger and Instagram Messaging) by people to block, discontinue, or otherwise opt out of the messaging functionality.

**Shipped 16 Sep 2026 (`mca-06`…`mca-09`):** `conversations.automated_messaging_opted_out_at` plus STOP/START gate. Automated IG/FB fan-out skips the thread; doctor dashboard / native inbox is not wrapped. The "no opt-out" note in `dm-copy.ts` is still about the recording *disclosure*, a different thing.

## F3 — Identical public comment replies (gap, small)

App Development Guidelines: "**Ensure your comments are uniquely tailored for each person.**" Community Standards' spam definition (incorporated by Dev Policies §5) covers "substantially similar behavior" at frequency.

`COMMENT_PUBLIC_REPLY_TEXT` was a single constant. **Shipped 15 Sep 2026 (`mca-02`):** `buildCommentPublicReplyText` prefixes a safe `@username` and rotates three English variants, retry-stable by comment id. Cap unchanged.

## F4 — We are a Tech Provider (contract consequence)

Platform Terms glossary: a Tech Provider is an app "whose primary purpose is to enable Users thereof to access and use Platform or Platform Data." That is Halo Aid; the doctor is the Client. Duties we already meet: per-client separation (`doctor_id` scoping + RLS), processing only for the client's purpose, client list (the doctors table), disconnect path (5.b.ii.6).

Duty we do **not** yet meet — §5.b.ii.4.a: we may share Platform Data with the Client only if we "**first contractually prohibit such Client from Processing Platform Data in a way that would violate these Terms**." The pilot/customer agreement has no such clause.

**Action:** added to the L10 attorney packet (point 6). Note: this is the *contractual* Tech Provider duty — it is **not** the Security Centre "Access verification (Tech Provider)" program, which stays not-started per the standing decision.

## F5 — Service-provider list (ops)

Platform Terms §5.a: processors of Platform Data need written terms (standard DPAs qualify), and §5.a.iv: on request we must produce the list with contacts, data types, agreements.

Platform Data (tokens, IG-scoped IDs, usernames, message content) currently flows through: **Supabase** (storage), **Render** (compute/logs), **OpenAI** (DM text → receptionist replies), **Redis provider if enabled** (webhook queue). Resend/Twilio handle notifications but should be checked for IG-derived fields before being ruled out.

**Action:** **Written 2026-09-17.** [`service-providers.md`](./service-providers.md) — Supabase, Render, OpenAI, Redis-if-enabled. Resend/Twilio/Razorpay checked and excluded (no IGSID / token / message body). Fill DPA dates and the Redis vendor name. Keep the file current when a provider is added or dropped. §5.a.iii: when dropping one, ensure deletion.

## F6 — Security-vulnerability channel (ops, small)

Platform Terms §6.a.ii: "an easily accessible way for people to report security vulnerabilities in your App." The site footer's `founder@haloaid.com` is a general contact, not a labeled security channel.

**Action:** **Shipped 15 Sep 2026 (`mca-04`).** `frontend/public/.well-known/security.txt` + “Report a security issue” on the marketing and legal footers, both pointing at `founder@haloaid.com`. Live after the next frontend deploy.

## F7 — Incident notification to Meta (doc, small)

Platform Terms §6.b: any unauthorized processing or compromise of Platform Data (that includes leaked/abused IG tokens) must be reported to Meta "as soon as practicable" via their incident form, with remediation cooperation.

**Action:** **Shipped 15 Sep 2026 (`mca-04`).** `SECURITY.md` incident list step 6.

## F8 — Where we are compliant (evidence)

- **Messaging window** (Dev Policies §5 "Acceptable message types"): user-id DMs are `RESPONSE` inside 24h only. A reply to a message that just arrived is not gated here. Instagram and Facebook do not carry clinic-record notices: reminders, waiting-room and consult join links, payment and desk confirmations, slot or reschedule confirmations, abandoned-booking nudges, visit-type staff notes, recording-replay and post-consult links, account-closure notes, schedule-change notes, and prescription notices. Those stay on SMS or email where a channel exists. The booking page shows the visit. If a send still lands outside the window, Graph `code 10` / `2534022` / `2018278` / `2018065` maps to `MessageWindowExpiredError` (409), is never retried, and is counted as `window_expired`. No Message Tags are used anywhere, so no `HUMAN_AGENT` misuse is possible. `CONFIRMED_EVENT_UPDATE` is not used (deprecated 27 Apr 2026).
- **Comment outreach** (Private Replies doc): `recipient.comment_id` private reply, one per comment, inside 7 days, plus capped public reply, for booking, availability, and pricing only. A symptom comment gets neither a private reply nor a public "check your DM". 40/doctor/UTC-day, fail-closed (`comment-lead-service.ts`).
- **Spam posture** (Community Standards via Dev Policies §5): intent-gated outreach, daily cap, kill switch (`OUTBOUND_MESSAGING_DISABLED`), failure-spike auto-pause (8 failures / 15 min → pause + email). Block-shaped errors count toward the spike.
- **Opt-in** (Dev Policies §5.a): all conversations are patient-initiated (inbound DM or their comment). Whether that is "legally sufficient consent" in India is a counsel question (L9/L10) — mechanically we never cold-contact.
- **No scraping** (ToU §4.2): data enters only via webhooks and permitted Graph reads on connected accounts; no login-credential collection ever (OAuth only) — ToU §4.2 credential clause satisfied.
- **Prohibited Practices** (Platform Terms §3.a): no ads use, no sale/licensing of Platform Data, no surveillance, no eligibility determinations, no de-anonymization. §3.a.vii noted: a core-functionality change requires re-submitting App Review.
- **Data use restraint** (Dev Policies §5 "Data"): messaging data is used to run the messaging product (leads inbox, conversations, analytics on our own sends). Nothing is used for ads/profiling outside the product.
- **Privacy policy** (Platform Terms §4): live, public, non-geoblocked at https://haloaid.com/privacy; deletion path documented; URL goes in the App Dashboard field (M3 submission step).
- **Deletion** (Platform Terms §3.d): user-facing deletion callback live (M1, https://haloaid.com/data-deletion-callback); disconnect purges tokens.
- **Token security** (Platform Terms §6.a.iv): tokens encrypted at rest (`ENCRYPTION_KEY`), never logged, never shared beyond processors.
- **Healthcare-adjacent AI processing:** DM text goes to OpenAI as our Service Provider under §5.a — permitted structurally; the *consent* side is the existing L9 counsel thread.

## Founder account hygiene (from the scraping help doc + ToU — not code)

The scraping warning on the founder's account came from Meta's account-level classifiers, not the API. The help doc's own list: don't give credentials to third-party tools, review recent logins, strong password, **turn on 2FA** (currently postponed — do it), review connected apps. Add: avoid running several accounts from one device/IP as a habit, keep the app-contact email current and unfiltered (Developer Alerts arrive from facebookmail.com — Dev Policies §3), keep Business Manager info accurate.

## Standing obligations to remember

- Platform Terms §7.e.iii: permissions unused for **28 days** can be suspended — after App Review approval, keep the flows exercised.
- Platform Terms §7.d: Meta may demand certifications/attestations on request — this folder is the evidence base.
- Platform Terms §11.d: terms change with notice; re-snapshot on Meta's next "Last updated" bump.
- Indemnification (§9) runs from us to Meta and is uncapped — context for the L10 liability-cap discussion with counsel.
