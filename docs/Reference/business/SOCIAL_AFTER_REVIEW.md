# Social — after the messaging refusal

> **The question this answers.** Meta refused `instagram_business_manage_messages` on 22 Oct 2026. The Instagram path is a booking link, the EHR, and the social board. How do we get doctors in a space nobody has properly taken, and what else is worth building there?
>
> **What sits elsewhere.** The board, the queue, and the visit count are [`social-assist/v1.md`](../../Work/Product%20plans/social-assist/v1.md) and [`analytics.md`](../../Work/Product%20plans/social-assist/analytics.md). The clause Meta applied is [`meta-terms/2026-09-15/AUDIT.md`](../engineering/compliance/meta-terms/2026-09-15/AUDIT.md) F1. The decision not to resubmit is [`tracks.md`](../../Work/Business/tracks.md) M3. Geography is [`GO_TO_MARKET_STRATEGY.md`](./GO_TO_MARKET_STRATEGY.md). Who to sell to is [`ICP_AND_FIRST_CUSTOMER.md`](./ICP_AND_FIRST_CUSTOMER.md). Phase order is [`PRODUCT_PHASES.md`](./PRODUCT_PHASES.md); the Instagram front door in that doc is dated by this one.
>
> **Not a build plan.** Suggestions for the founder. Promote a slice to `Product plans/` or `tracks.md` before anyone builds it.

**Owner:** Founder (commercial). **Written:** 22 Oct 2026, the evening the review came back. **§5 added 26 Oct 2026:** autoposting is already Meta’s own product, and it is not the thing to sell.

---

## TL;DR

`instagram_business_basic` is approved. Messaging is refused under Developer Policy **5.7.5**, “Facilitating Direct Conversations with Healthcare Providers.” The product that can be sold is the public page (`/d/:slug`), the social board that puts that page’s link on every post, and the diary that says which post filled a visit.

Developer Policy 5 applies to every app. An Instagram DM bot for a clinic is closed to the category, so the moat was never the bot. What remains for everyone is a link in the bio. The contest is what sits behind the link, and whether it fills a chair. The card already carries a durable page-link code, and a booking from that code lands on the card. That is the line Buffer, Publer, Predis, and Hootsuite stop short of: they can count a click. They cannot count a visit.

---

## §1 — What the refusal changes

The public site still sells the refused product.

| Surface | Line still live on 22 Oct 2026 |
|---|---|
| `frontend/components/marketing/HowItWorks.tsx` | “Patients message your Instagram account, day or night.” |
| `frontend/components/marketing/FeatureGrid.tsx` | “Every Instagram DM gets one link to your page.” |
| `frontend/components/marketing/Hero.tsx` | “Instagram messages” |
| `frontend/app/page.tsx` | “Every DM gets one link to your page.” |

A clinic that signs up on that promise cannot receive it. Meta reviews the whole app on the next submission. The public story is the page, the posts, and the bookings.

Publishing and insights are a different permission from messaging, and hospitals do schedule posts through Buffer and Hootsuite. A later file for `instagram_business_content_publish` and `instagram_business_manage_insights`, framed as “schedule this clinic’s own posts and read this clinic’s own numbers,” is a different question from the one just refused. It is still a gamble. The basic-permission text already on file says Halo Aid does not read media, so any new justification has to say what the app actually reads. On Making and on Ready, a card is **Post for me** or **I'll post it**. Post for me waits on that file. It can also carry alt text on a photo, collaborators, the AI label, the first comment the doctor wrote, a closed comment thread on a post or a reel, a copy on your story, and, on a reel, a share to the feed. The first comment and closing comments need `instagram_business_manage_comments`, which is not in the current submit. I'll post it is a reminder: the doctor posts from the phone and marks the card posted, and the file and the time stay. No Instagram URL is required. A place name, music, and a product tag can only be I'll post it. The board, the clock, the link code, and the visit count all work with no further Meta permission. Why the send itself is not the product is §5.

`instagram_business_basic` stays. Platform Terms §7.e.iii can suspend a permission unused for 28 days. Keep it exercised. It is the base for a later file and for matching a pasted post URL to a card. It does not send or receive DMs. A clinic that is not an app tester cannot Connect for messaging.

[`PRODUCT_PHASES.md`](./PRODUCT_PHASES.md) §2 still describes phase 1 as DM intake, social-in. From 22 Oct 2026 the inbound half is the public page. Phase 2 is still the content that sends people to that page. [`ICP_AND_FIRST_CUSTOMER.md`](./ICP_AND_FIRST_CUSTOMER.md) still names a DM-only tier as the way back to the solo-doctor market. That tier is closed. Its replacement is a free page, with the board, the analytics, the desk, and the chart as what is paid for.

---

## §2 — How to acquire doctors

Ranked for one person with no ad budget. The influencer doctor in the ICP doc stays the wedge: she already has reach, and she decides in one conversation. The pitch is sharper with DMs gone. She cannot see which reel filled a chair. No social tool shows her that.

**The page is the billboard.** Every patient who opens `/d/:slug` sees it. Doctors follow doctors. A doctor who lands on a peer’s page, with live availability and no app to install, asks what it is. The footer line is “Are you a doctor? Get your page.” The free page is the distribution. The social board, the analytics, the desk, and the chart are the charge.

**Pages built by hand, then sent.** The healthcare clause binds apps. A person writing to a doctor from a personal account is ordinary Instagram. The message that converts is a page already made: the bio currently points at a Practo profile, a WhatsApp number, or nothing, and here is `haloaid.com/d/…`. Build it from what that doctor has already put in public, by hand. The scraping restriction and Instagram’s terms forbid automated collection of that. Ten a day. Smaller cities before the metros.

**One city before the country.** Doctors in one city sit in the same IMA chapter and the same WhatsApp groups. Five in one city are worth more than five scattered across India, because the sixth hears it without a send. Punjab is the home ground.

**Teach doctor Instagram, in public, from the Halo Aid account.** The fee post that fills Tuesday. The clinic tour that books nobody. The bio that loses the person after the reel worked. What gets a clinic account restricted: the 15 Sep scraping warning and the terms audit are real material. Buffer grew by writing about the work. Once a few doctors are on the board, format and topic totals — counts only, no patient, no caption that identifies a case — are posts nobody else can make.

**A customer’s post, with Halo Aid as collaborator.** “The fee reel brought twelve bookings,” posted by the doctor, Halo Aid added as collaborator, so it sits on both grids. That is distribution that cannot be bought.

**A room of doctors.** An IMA chapter, a CME, an alumni group. The talk is how to get patients from Instagram without a restricted account and without a post the ethics rules would object to. Doctors are wary of both, and the person who has read the rules is trusted. The audit folder is the Meta half. The medical-ethics advertising clause is the other half, and counsel confirms what a doctor may say before it is said from a stage. That is a briefing point of the same kind as L10. It is not improvised.

---

## §3 — What else belongs in this space

Each of these runs without a further Meta permission.

| Idea | Why it is ours |
|---|---|
| **Story link stickers, one code per story** | Stories are the format a doctor will actually do. The sticker carries `/d/:slug?c=…`, so a story can be scored the same way a card is. A one-line prompt a day is the smallest habit that produces a booking. |
| **The page as the clinic’s site** | Most solo doctors have no site. Hours, fees, directions, a new visit, a follow-up, book. The same link goes in the Instagram bio, the Google Business Profile appointment field, a WhatsApp status, and the board in the waiting room. |
| **A Google review ask after the visit** | The desk already knows a visit happened. An SMS afterward asks for the Google review. “Dermatologist near me” is often a larger source than Instagram. The send is an owned channel, and it starts from the chart. |
| **A season line by specialty and city** | Dengue, exams, Diwali pollution, flu. Already named as the trend line in [`exploring.md`](../../Work/Product%20plans/social-assist/exploring.md). It is the blank Sunday, and it does not need last month’s posts. |
| **Common visit counts, as topics** | Already specified there, with the floor: one visit never leaves the chart, and a rare diagnosis never leaves. This is the input no social tool can have. It waits for phase 11 of `analytics.md`. It is the line on the paid tier. |
| **A check on the card before it is public** | The banned-phrase memory Apaya keeps, plus the medical advertising rules. A dengue week does not become a cure claim. Counsel writes the list. The product applies it. The doctor can still post. |
| **WhatsApp, read before it is decided** | The clause that was applied sits in the Messenger and Instagram messaging policies. WhatsApp Business has its own document. Snapshot it the way the 15 Sep audit was done, then decide. Not this month. |

---

## §4 — Closed

- Do not press **Request again** on `instagram_business_manage_messages`. Do not file the same receptionist story. Do not open a second app (Platform Terms §7.e.i.3). A clinic Instagram that still answers people is the use Meta named. Describing the app as something else misleads Meta (Developer Policies §1).
- Do not build the DM bot further. Tester accounts may keep exercising the dev bot.
- Do not post the same card to several networks. A solo doctor lives on Instagram.
- Do not read another doctor’s account, render the video, or publish a month of posts with nobody looking. Those stays are already in `exploring.md`.
- M4, the post-review account canary, does not start. A paying clinic does not Connect Instagram for messaging.
- Do not price or pitch on autoposting. Meta already ships it. §5.

---

## §5 — Autoposting is not the product

Written 26 Oct 2026, after the board grew a choice between Halo Aid sending the post and the doctor posting it from the phone. This is an opinion for the founder. It is not a change to the M3 next action.

Meta already autoposts. The risk of “they might add scheduling and we would have nothing left” has already happened, and Buffer, Later, and Hootsuite are still in business beside it. The thing that would actually compete with Halo Aid is a clinic system, and Meta is not building one.

### What Meta ships itself

Checked 26 Oct 2026.

- **Scheduling, free.** A public Instagram account can schedule posts, carousels, and reels from the Instagram app, up to 25 a day and 30 days ahead. [Instagram Help](https://help.instagram.com/439971288310029). Product tags, collaborative posts, and sponsored posts are not part of that scheduler. Stories are scheduled from Meta Business Suite’s Planner, which also does posts and reels. [Planner](https://www.facebook.com/business/help/1170295510042639).
- **Scheduling and numbers, paid.** Meta One plans for businesses rolled out from **15 Sep 2026**. On Advanced and above, posts and reels schedule up to a year ahead, stories up to a month, with suggested times from when followers are active, bulk upload, a grid preview, comparisons against other public accounts, and insights older than 90 days. [Meta for Business](https://www.facebook.com/business/news/introducing-meta-one-plans-for-businesses), [creator plan list](https://creators.instagram.com/blog/meta-one-creator-plans). Prices on that page start at $14.99 a month and vary by region and account. Do not quote a rupee price from them.
- **An agent in the DMs.** On **3 Jun 2026** Meta introduced Meta Business Agent for WhatsApp, Messenger, and Instagram. It answers the customer, recommends from a catalogue, qualifies a lead, closes a sale, and books an appointment. Meta had already tested it with small businesses in India, Mexico, and Brazil, and it now charges for it. [Meta’s announcement](https://www.facebook.com/business/news/conversations-2026-introducing-meta-business-agent), [Bloomberg, 3 Jun 2026](https://www.bloomberg.com/news/articles/2026-06-03/meta-sells-ai-agent-for-businesses-in-push-to-monetize-service). That is the original Halo Aid pitch, sold by the platform.

### How Meta seems to decide

This is a reading of what they ship and what they shut, not a statement they have published.

They open the door that puts more posts into their apps, because more posts mean more feed and more places to sell ads. They keep the door that earns the money or sits inside a person’s conversation: messaging, ads, and the graph of who follows whom. Publishing through an app is a complement. A receptionist inside Instagram DMs is a competitor, and for a clinic it is also the use they refused on 22 Oct under 5.7.5. Both point the same way. A caption written by a general model is the same race, against Meta AI, which is already inside their own tools and inside the paid plans.

They do take APIs away. On **4 Dec 2024** the Instagram Basic Display API stopped. Consumer apps lost the connection. What remained was the professional-account API. [Meta’s notice, 4 Sep 2024](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/). Anything whose only value is a permission Meta can revoke can disappear on a date Meta picks.

### Where the value still is

The test is: if every Instagram permission went dark tomorrow, what would a doctor still pay for?

The board, from an idea to a Ready card. The reminder, and the mark that it went out. The public page. The booking that comes back onto the card, because checkout calls `recordSocialCardVisit` with the card’s code and the appointment. Meta can count a view. It cannot count that the patient sat in the chair, what the visit was for, or whether they came back. One honest limit: Business Agent books inside the DM, so Meta can learn that a chat became a booking. It still does not have the diary.

Five places to put the work, in order.

1. **Sell the clinic, and let social be a feature of it.** A standalone scheduler is what Meta copies. A desk, a chart, and a record for an Indian clinic are regulated, local, and full of patient data. Meta will not build that.
2. **The number on the card is the visit, and Instagram’s reach is the aside.** Bookings are ours. Insights are a permission, and Meta now sells a richer version of them.
3. **What to post comes from the desk, not from Meta AI.** Common reasons people come in, with the floor already in `exploring.md`: one visit never leaves the chart, and a rare diagnosis never leaves. Season and city. The questions the desk keeps hearing. None of that is sent to Meta or to any outside model. A thought can name a patient.
4. **A check a general tool will not write.** “No cure claim. No patient a reader can name.” Counsel writes the list. The product applies it. The doctor can still post. Meta’s tools are for every kind of business. They will not specialise in a medical-advertising rule.
5. **The page is the thing the doctor owns.** The same link sits in the Instagram bio, the Google Business Profile, a WhatsApp status, and a code in the waiting room. A review ask after the visit goes out on a channel we send. Instagram is one outlet.

Filing `instagram_business_content_publish` and `instagram_business_manage_insights` is still worth doing, as a convenience that saves a few taps. If the file passes, Post for me works. If it fails, I'll post it already does the job. The price and the pitch do not depend on the outcome. The homepage still sells the refused DM use; that risk is the table in §1, and it is the risk on the M3 file.

---

## Related

- Decision record: [`tracks.md`](../../Work/Business/tracks.md) M3, M4, P3, G1.
- Terms: [`AUDIT.md`](../engineering/compliance/meta-terms/2026-09-15/AUDIT.md) F1, outcome 22 Oct 2026.
- Product already specified: [`v1.md`](../../Work/Product%20plans/social-assist/v1.md), [`analytics.md`](../../Work/Product%20plans/social-assist/analytics.md), [`exploring.md`](../../Work/Product%20plans/social-assist/exploring.md).
- Signpost lock: [`plan-meta-channel-align.md`](../../Work/Product%20plans/plan-meta-channel-align.md) MCA-DL-8. The bio link was the fallback. It is now the path.
