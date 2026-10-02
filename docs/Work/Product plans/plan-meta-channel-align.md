# Plan — Meta channel alignment

> Keep Instagram as the front door, not the pipe for patient data. Align outbound content and patient messaging controls with Meta Developer Policies §5 and the 15 Sep 2026 terms audit.
>
> **Status:** `Committed` 2026-09-15. **Promoted to:** [`Daily-plans/September 2026/15-09-2026/meta-channel-align/`](../Daily-plans/September%202026/15-09-2026/meta-channel-align/). **Effort:** P1 shipped. P2 implemented 2026-09-16 (founder unlocked Auto). P3 implemented 2026-09-16 (`mca-12` + `mca-10` sittings).
>
> **Depends on:** [`meta-terms/2026-09-15/AUDIT.md`](../../Reference/engineering/compliance/meta-terms/2026-09-15/AUDIT.md) (F1–F8). L10 attorney packet in [`Business/tracks.md`](../Business/tracks.md).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## Why this plan exists now

The 15 Sep 2026 line-by-line Meta terms read found a healthcare clause that is plainly worded against (a) messaging between people and healthcare providers and (b) sending or collecting patient data obtained from healthcare providers. The safety plan (private replies, cap, kill switch, spike pause) is live. It does not change *what* we put in the channel.

Verified against `origin/main` as of 15 Sep 2026:

- Intake (name, age, gender, phone, **reason for visit**) is collected inside the Instagram thread.
- Prescription **PDFs and images** are attached on Instagram DMs; the medicine text summary also goes in-thread.
- There is no patient-side **stop messaging** path (consent revoke anonymizes the record; it does not suppress pings).
- Public comment replies are one identical English string.

The residual Meta discretion (Platform Terms §7.e) is not removable. This program makes the product *provably aligned* with the written rules we can meet in code.

---

## North star

Instagram carries “something happened + a link” (or a receptionist FAQ). Owned surfaces — tokenized web page, email, SMS — carry the artifact. A patient who says stop is not pinged again. Founder locked tier 1: DM → appointment link, nothing clinical in between.

---

## Decision lock (LOCKED 2026-09-15, in chat)

| ID | Decision | Implication |
|----|----------|-------------|
| **MCA-DL-1** | **Artifact out of the Meta channel.** Notifications stay generic. PDFs, images, medicine lists, and reason-for-visit do not go into IG/FB DMs or public replies. | Email/SMS and the HMAC share page keep the content. |
| **MCA-DL-2** | **P1 is subtraction + copy, no schema.** Highest exposure first. | Safe on Auto/Terra. No migration. |
| **MCA-DL-3** | **P2 is founder-unlocked on Auto (16 Sep 2026).** Per-conversation automated-messaging opt-out is a new nullable timestamp. | Additive column only; no RLS change. Read `MIGRATIONS_AND_CHANGE.md` first. |
| **MCA-DL-4** | **P3 is founder-locked tier 1 (16 Sep 2026).** Chat is FAQ + booking-link handoff only. No in-thread intake, health advice, or clinical artifacts. Counsel’s L10 read is still useful later; it is not the start gate. | `/book` grows intake first (`mca-13`…`mca-15`), then the DM funnel skips collection. Four Auto sittings; no migration; reuse existing patient row + consent columns. |
| **MCA-DL-5** | **Emergency copy stays in-thread.** 112/108 safety replies are not “data collection.” | P3 must not strip the emergency gate. |
| **MCA-DL-6** | **Doctor manual replies stay.** Opt-out suppresses *automated* sends only. | Dashboard send is not blocked. |
| **MCA-DL-7** | **App Review stays honest.** Receptionist / appointment FAQs. Dev Policies §1 bans misleading Meta. | Do not hide that this is a clinic product. |
| **MCA-DL-8** | **Instagram visit signpost (founder, 2 Oct 2026).** One word, "visit", for queue, slot, and a future mixed day. The first reply is "Hi, please choose from the following:" plus new visit / revisit / follow-up, change or cancel, and check availability. Later unmatched messages repeat that list without "Hi". A number or those words sends one link. The link is the clinic page plus an 8-character code, not the long signed token. Availability opens `&for=times`. Change, cancel, and view open `&for=change`, which says there is no upcoming visit from this chat. A new visit has no flag. A health question gets "Health questions are not answered here." and the list. A single fee is "Visit fee" only when asked. A shared address only when asked. No health talk, no record lookup, no model-written reply, no "automated" wording, no profile name in the text. Facebook is unchanged. | Bio link stays the fallback if Meta review declines. Booking-page wording is parked. |

---

## Phase table

| Phase | Folder | What | Gate | Status |
|---|---|---|---|---|
| 1 — outbound hardening | [`p1-outbound-hardening/`](../Daily-plans/September%202026/15-09-2026/meta-channel-align/p1-outbound-hardening/) | Rx IG link-only; comment reply variants; outbound copy sweep; security.txt + incident Meta notify | No clinical artifact or identical public reply on Meta send paths | **Implemented** 2026-09-15 |
| 2 — patient opt-out | [`p2-patient-opt-out/`](../Daily-plans/September%202026/15-09-2026/meta-channel-align/p2-patient-opt-out/) | Stop intent + suppression flag + skip automated fan-out | “Stop messaging me” is honored immediately; doctor can still reply | **Implemented** 2026-09-16 |
| 3 — intake off-channel | [`p3-intake-off-channel/`](../Daily-plans/September%202026/15-09-2026/meta-channel-align/p3-intake-off-channel/) | Generic outbound DMs, then booking link-first + intake on `/book` | New booking does not collect reason/name/phone in the thread | **Implemented** 2026-09-16 |

---

## What already exists (inspected 2026-09-15)

- Safety plan live: private replies, 40/day cap, `OUTBOUND_MESSAGING_DISABLED`, window-expired mapping, spike auto-pause.
- Rx share URL + HMAC token already minted in `sendPrescriptionToPatient`. Email already attaches the PDF.
- Previsit ladder already fans out SMS + email + IG; copy is name + time + join URL (no reason-for-visit).
- Consult-link priority is already SMS > email > IG.
- Payment / desk confirmations do not echo reason-for-visit.
- `revokeConsentGate` exists — data-consent only, not messaging stop.
- `fetchCommentAuthorUsername` already runs before public reply on IG and FB handlers.
- `COMMENT_PUBLIC_REPLY_TEXT` is one English constant (lang-23 exception).
- Incident steps live in `SECURITY.md`; no Meta notify step.
- Footer contact is `founder@haloaid.com`; no labeled security channel / `security.txt`.

---

## Not this program

- Kill switch / spike cron (already shipped).
- App Review screencast (M3).
- L10 clause wording (counsel writes it).
- Service-provider list: written 2026-09-17 (`meta-terms/2026-09-15/service-providers.md`). DPA/contact fills still founder.
- Founder 2FA (account hygiene, not code).
- Finder-style duplicate `* 2.ts` files (inbox only).
- Moving reminders off IG entirely (P3 / counsel).

**Created:** 2026-09-15.
