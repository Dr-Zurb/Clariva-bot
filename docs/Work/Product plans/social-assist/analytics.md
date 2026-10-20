# Analytics — the page that measures posts

**Status:** specified 19 Oct 2026. Tasks are not cut. Build phase 9, then phase 10 on a test account. Phase 11 waits.
**Decided in chat** 19 Oct 2026, after the posted list proved to be a list of titles and not a measurement.
**Inherits** [`v1.md`](./v1.md). Where this file and v1 disagree about Analytics, this file wins. DL-10 was revised the same day to say so.

A post is there to fill a visit. This page answers, for a period the doctor picks: what went out, what Instagram sent back to the clinic, and which posts did the work.

Clinic Insights stays the practice page. Its post funnel still counts comment leads and DMs by Instagram media id. This page does not replace that funnel and does not copy it.

The review submitted 8 Oct 2026 stays basic and messages. Nothing in phase 9 changes it. Phase 10 asks a test account for Instagram’s post numbers on reconnect. A second review that would let every doctor grant posting and those numbers is a business item. It is not part of building the page.

---

## Where the numbers come from

| Source | What it can say | When |
|---|---|---|
| Cards Halo Aid already keeps | Posts sent, format, topic, the day and the hour, bookings that started from that card’s page link | Phase 9. The link booking is a running total today, so the day of each new one starts being kept in this phase. Older link bookings stay on the card as a lifetime total and are not invented into a week. |
| Instagram chats Halo Aid already answers | New enquiries, bookings that came out of those chats, and how many enquiries became a booking | Phase 9. These records already have a day. |
| Instagram, for each post and for the account | Views, reach, likes, comments, saves, shares, profile visits, follows from a post, reel watch time, followers and how many were gained | Phase 10. Needs `instagram_business_manage_insights`, which is not in the review of 8 Oct. |

Likes and comment counts can be read with the basic permission. The text already submitted with that permission says Halo Aid does not read media, so those counts wait for phase 10 with the rest of Instagram’s numbers.

The page shows counts, the doctor’s own titles, and the first line of a caption the doctor wrote. It does not show a patient name, a phone, a comment, or a DM. The log for this page is counts only.

---

## The page

Route stays `/dashboard/social`, tab **Analytics**.

**Period.** 7 days, 30 days, or 90 days. The same control Insights already uses. 30 days is the opening choice. Every total is shown next to the period before it: a booking count of 4 that was 2 in the previous period reads as up 2. A total of zero is shown on these tiles. Zero here is the measurement. It is not printed on a post that simply has nothing to say.

**What Instagram brought the clinic.** Four tiles. Phase 9.

- Enquiries. New Instagram chats in the period.
- Bookings. Bookings from those chats, plus bookings that started from a card’s page link on a day this phase recorded.
- How many enquiries became a booking, as a percentage. Hidden when there were no enquiries.
- Posts sent.

**How the posts did.** Four tiles. Phase 10, and only when this account has granted the insights permission. Views, reach, interactions, and followers with the number gained in the period. A doctor without the permission does not see an empty row.

**The chart.** Posts sent on each day, as bars. Enquiries and bookings as lines on the same days. Phase 10 adds views as a line. A day with nothing stays a gap, not a fake point.

**Best posts.** The three posts in the period with the most bookings, then the most enquiries, then the most views. A post with none of those is not called a best post. Each one shows its picture when Halo Aid has one, the title, the day, and the numbers that ranked it. **Open on Instagram** when the post has an address.

**What works.** Two small tables. One row per format that was actually posted: Post, Reel, Story. Posts, average views once phase 10 has them, bookings. One row per topic the doctor set. A card with no topic is absent from that table. It is not a row called “No topic.”

**Posting rhythm.** Posts per week for the last eight weeks, drawn as a small bar row. Under it, the weekday and the hour when this doctor’s posts usually go out, once there are at least four posts. Fewer than four posts leaves that line off.

**All posts.** Every posted card in the period, newest first. The columns are the picture, the title, the day, the format, views, likes, comments, saves, bookings, **Open on Instagram**, and **Use again**. Views, likes, comments, and saves are phase 10 columns and are absent until the permission is granted. The doctor can sort by day, views, or bookings. **Use again** is unchanged: words, tags, and the inspiration link go back to Thoughts and ideas. The file, the Instagram address, and the time do not. It does not post.

The page address of a card stays off this tab.

**Empty.** No posts in the period: “Nothing has been posted.” The tiles still show the clinic numbers for that period, so a week of enquiries with no new post is visible.

**Picture.** Sending a post removes the file. Phase 9 keeps a small private picture of what was sent, and deletes that picture when the card is deleted. A post that already went out has no file left. Phase 10 may fill its picture from Instagram when the post can still be read. Until then the row has no picture. The picture is the post, never a photo from a chart.

---

## Phase 9 — the clinic’s numbers

Ships the page above without Instagram’s view and reach numbers.

In order:

1. A send remembers Instagram’s id for that post, and keeps the small picture. A booking that starts from a card’s page link is stored with its day from then on. The lifetime count on the card stays. The doctor runs the migration in Supabase. Posts already sent keep working with no picture and no id until phase 10 can match them.
2. One read for the tab: this period and the period before, the day series, the format totals, the topic totals, and the post rows. Counts and the doctor’s own words only.
3. The screen replaces the current list. The period switch, the four clinic tiles, the chart, best posts, what works, posting rhythm, and the posts table.

**Gate.** A dummy Instagram chat in the period counts as an enquiry. A dummy booking from that chat counts as a booking. A dummy booking from a card’s page link counts on that post and in the period, and the card still receives no patient name or phone. A post with no booking has no booking number on its row. The four tiles show zero when the period is empty. Insights’ own post funnel is unchanged. Typecheck, lint, and the new tests are green.

**Left alone.** The review of 8 Oct. The connect scopes. The DM reply. Today, OPD, Patients, Alerts. The caption. Schedule.

---

## Phase 10 — Instagram’s numbers, on a test account

Starts after phase 9’s gate. Does not resubmit the review already in progress.

In order:

1. Connect asks for `instagram_business_manage_insights` the same way it already asks for posting. A test account grants it by connecting again. An account that has not granted it keeps the phase 9 page.
2. Halo Aid stores a stats row per post and one account row per day, so follower growth has a yesterday. A post made from the phone is matched by its Instagram address.
3. A job on the running API refreshes the numbers. A new post is read every six hours on its first two days, then daily. A story is read every hour while it is live. Instagram stops returning a story’s numbers after 24 hours, so a story that was not read in that window stays without them. The job logs counts and a status code only.
4. The “how the posts did” tiles, the views line, and the views, likes, comments, and saves columns appear for an account that granted the permission.

**Gate.** On the test account, a post sent from Halo Aid shows views and likes that match what Instagram shows for that post, after a refresh. A story read inside its first day still has its numbers the next day. An account that has not reconnected does not see those tiles. No patient field is read or logged. The review file of 8 Oct is unchanged.

The second Meta submission, posting plus these numbers, for doctors who are not the test account, is queued on the business track. It is not a task in this phase.

---

## Phase 11 — the sentence, later

Starts when phase 10 has been used long enough that the numbers are real. DL-14 still holds until then: no suggestion line on the board, no writer button, no look at the file.

One sentence at the top of Analytics, written from the numbers already on the page. It names a format or a topic and what it did. Example shape: fee reels brought three enquiries; the last two posts were seen by half as many people as usual. A button puts a new title into **Thoughts and ideas**. The sentence does not get its own tab. It does not post.

Comments are a later permission, not this phase’s opening. A comment or a DM can name a symptom. The model receives themes and counts. It does not receive the comment, the DM, a name, or a phone.

**Gate.** The sentence matches the numbers on the page for that period. The new card lands in Thoughts and ideas and does not post. A log of the run contains no caption, no comment, and no patient field.

---

## Out of this plan

A posting goal, a “you are three posts short” nudge, and a takeaway that is not computed from the numbers above. Reading another doctor’s account. Putting the booking address in a caption. Replacing Clinic Insights. A chart of followers with no clinic number beside it. An export. Tag filters copied from a scheduler. Auto-posting a month of cards from one prompt.

---

## Build order

| Phase | Ships | Starts |
|---|---|---|
| **9** | Period, clinic tiles, chart, best posts, what works, rhythm, the posts table, the picture kept at send | Next. Tasks not cut. |
| **10** | Views, reach, likes, comments, saves, followers, on a test account | After phase 9’s gate |
| **11** | One sentence, and a card in Thoughts | After phase 10 has real numbers |

Phases stay in `docs/Work/Daily-plans/October 2026/11-10-2026/social-assist/` when they are tasked. Prefix stays `soc`, numbering continues after `soc-30`.
