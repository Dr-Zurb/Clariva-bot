# Editor — the doctor and the person who cuts the reel

> **The question this answers.** A doctor who already posts often has someone else cut the video. Should Halo Aid be the place they hand the brief over and get the cut back, and if so, what is the first version?
>
> **What sits elsewhere.** The board is [`v1.md`](./v1.md). The doctor is the only approver (DL-12). The visit on the card is the product: [`SOCIAL_AFTER_REVIEW.md`](../../../Reference/business/SOCIAL_AFTER_REVIEW.md) §5. The parked line is [`capture/inbox.md`](../../capture/inbox.md), 13 Oct 2026. Desk staff are a different login: `clinic_staff` is one doctor per person, role `receptionist` only (migration 200).
>
> **Not a build plan.** Written from the working session of 30–31 Oct 2026. Promote a slice before anyone builds it.

**Owner:** Founder. **Written:** 31 Oct 2026. **Revised the same evening:** the doctor does not edit the video. A message names a moment or a stretch, and may point at one file already on Resources. There is no list of takes. The doctor-side tasks are [`p12-review`](../../Daily-plans/October%202026/11-10-2026/social-assist/p12-review/plan-p12-social-assist-review-batch.md). The editor’s page is not in that phase.

---

## TL;DR

Keep the idea. Do not build the editor home, the accounts, or the full review screen yet.

Ask five doctors who post reels whether they have an editor and how the footage moves today. If two or more describe a messy handoff, build one private link on a Making card: a brief the doctor chooses, a cut coming back, a timestamped thread, and **Mark ready** still belonging to the doctor. If most of them cut their own reels, leave this parked.

The card stays in Making. There is no new column. The editor never posts, never sees the chart, and never sees the whole note.

---

## Whether to build it

The wedge in [`SOCIAL_AFTER_REVIEW.md`](../../../Reference/business/SOCIAL_AFTER_REVIEW.md) is a doctor who is already on Instagram. That doctor often pays someone to cut. If the cut lands on the card, the post still goes out through the board and keeps the page-link code, so the visit count still works. One editor usually works for several doctors, so the seat can also be how the next clinic hears about Halo Aid. Later it can be a reason for a higher price. Pricing has no number yet ([`tracks.md`](../../Business/tracks.md) G2).

The reasons to wait are stronger this month.

- No clinic is paying. The desk is the active product track. Social is a feature of the clinic, not a second product (same doc, §5).
- A doctor who does not yet use the board will not hand a card to an editor. The 13 Oct line assumed the doctor does the ideas, the filming, and the posting until after launch.
- Many solo doctors cut in CapCut or in Instagram. For them the seat has no user.
- A deep review tool is Frame.io’s market. Halo Aid’s edge is the visit, not the player.

**The check.** Five doctors, in conversation, three questions: do you have an editor, how do you send the footage, what goes wrong? Two or more messy handoffs and the first slice is worth it. Mostly self-edited reels and it stays parked.

---

## What the session settled

### Keep

- Four columns. Ideas, Chosen, Making, Ready. The handoff is a state on a Making card: with the editor, or back with the doctor.
- The doctor is the only approver. **Mark ready** is the decision. Dragging to Ready means the same thing it means today.
- One thread on one card. A line, a file, and a time in the video. No inbox of every reel mixed together.
- A timestamp belongs to the file that was playing. Cut 2 does not inherit Cut 1’s notes.
- Two screens of the same card, switched from the header. **Draft** and **Review**. Review exists only once an editor is on the card, and opens on its own when a file comes back.
- The caption stays the doctor’s. A wording idea from the editor is a message.

### Draft

The Making sheet as it is. The note and the clips on the left. The phone, the caption, and **Mark ready** on the right.

### Review

The whole sheet swaps. The left plays the file under review. A photo fills that same place. The right is only the thread. The doctor sets one moment, or a start and an end, into the message. That does not send by itself. **Send** is the instruction: shorten this, add this, add a clip from Resources. **Mark ready** is on this screen too. It is the same action as on Draft. There is no row of takes.

### Change from the first sketch

The editor does not receive the note. A thought can name a patient ([`SOCIAL_AFTER_REVIEW.md`](../../../Reference/business/SOCIAL_AFTER_REVIEW.md) §5). The files they need are the ones already on Resources. The doctor does not pick a subset, and Review does not invent a second list of takes. Footage of a patient who can be recognized stays off that shelf unless the doctor has consent. Skin and dental before-and-after clips are the usual case.

The editor does not see Ideas, Chosen, the rest of Making, Ready, Schedule, Analytics, Settings, or the chart. Visit counts and booking names stay with the doctor, as the 13 Oct line already said.

### Leave out of the first slice

- An editor login, and a home that lists several doctors’ handles.
- A new column between Chosen and Making.
- The editor typing the caption, connecting Instagram, or pressing Post.
- A proposed posting time as its own field. A time can be a line in the thread. The real time is still set on Ready.
- Drawing on the frame, live watching together, reactions, and comment filters.

---

## Engineering

None of this needs a new Instagram permission, and it does not touch messages. The 22 Oct refusal does not apply.

**Media before UI.** The board refuses a video over 100 MB (`social-card-service`). A phone reel is often larger than that. Supabase is still on the free plan, and last cycle’s egress already tripped the grace banner ([`tracks.md`](../../Business/tracks.md) M3, checked 8 Oct 2026). Every play of a cut counts as a download. Pick where these files live before drawing the player: the paid database plan, or a store that does not bill the download. Confirm that plan’s single-upload cap against the 100 MB the board already allows. In the first slice the cut is uploaded, because it is the file that can post. A raw take over the cap can be a link the doctor pastes, not a second uploader.

**Who the editor is.** Do not put them on `clinic_staff`. That row is a receptionist, and one login maps to one doctor. An editor is outside the clinic and may work for more than one.

The first slice is a private link on one card. No account. Same family as the history-link token: it expires, the doctor can revoke it, and it is never logged. Uploads use a signed URL for that card only. Editor accounts, and a home across several handles, wait until someone using the link asks for them. A new login role is an access-control change and needs the close review `AGENTS.md` reserves for that.

**Retention.** Keep the latest cut, and one before it. When the doctor marks the card Ready, delete the raw takes and the older cuts. A posted card already drops its file.

**Mail.** One email when it is the other person’s turn. Without that, the thread moves back to WhatsApp.

**The sheet.** `SocialCardPanel.tsx` is already about 5,100 lines. Review is its own component, mounted by the Draft / Review switch. It does not grow that file.

---

## Order

1. The five conversations. Write the answers on this file. Do not start a phase from the inbox line.
2. Choose the store for the files, and check the upload cap.
3. Doctor side, tasked 31 Oct 2026 as phase 12 (`soc-31`…`35`): hand the Making card to a name, then a message about a moment or a stretch. The editor’s page is not in that phase.
4. The private link, the cut coming back, and the editor reading Resources. Only after phase 12.
5. Accounts and a list of handles, only if the link is actually used.

---

## Closed

- Do not build a second board for the editor.
- Do not add a column.
- Do not let the editor post, schedule, or hold the Instagram login.
- Do not send the note, the chart, or Analytics across.
- Do not price the clinic on this seat until G2 has a number and a doctor has used the link.
