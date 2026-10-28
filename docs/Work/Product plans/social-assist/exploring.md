# Exploring — social media assistance for doctors

**Status:** exploring. Not a build plan.  
**Opened:** 9 Oct 2026. **Updated:** 10 Oct 2026.  
**Rough draft of the feature:** [`rough-draft.md`](./rough-draft.md).  
**App-checking tracker:** [`tracker.md`](./tracker.md). Do not pay for a trial.

This is the ideation doc. It keeps the doctor’s problem, the founder’s own thinking, suggestions from the working session, and what existing social tools already do.

The live product today is the doctor’s page and the social board. Meta approved `instagram_business_basic` and refused `instagram_business_manage_messages` on 22 Oct 2026. Acquisition and what to build next: [`SOCIAL_AFTER_REVIEW.md`](../../../Reference/business/SOCIAL_AFTER_REVIEW.md). This exploration does not reopen that file.

---

## What the doctor is stuck on

A doctor who posts already knows the clinic. The blank is what to say this week, and whether last week’s reel filled a single appointment.

They see the same complaints all week, then open Instagram at night and go blank. They film a reel on the phone between patients, or they mean to and miss the week. They put one link in the bio and hope. They notice likes. They do not know which post produced a booking. When dengue, exams, or pollution show up in the city, they see it late, usually because another doctor already posted it. After a reel goes up, the first comments sit until night.

The hard part is the idea and the decision to repeat it. A fee post can look plain and fill Tuesday. A clinic tour can be watched and book nobody. A tool that only makes the video, or that sends them to study someone else’s account, leaves both of those facts invisible. They also hold back, because a patient story, a cure claim, or a face in the background can turn a post into a problem. So they post nothing, or they post something that should have stayed off the account.

### What the software takes off them

- **The blank Sunday.** A few cards ready to film, from an idea they already had, from a topic their own visits are full of, or from the season in their city. Each card is a hook, a short script, a cover line, a three-shot list, and the page link. They shoot from the card.
- **The file, before it goes out.** They share the reel they filmed and ask. The note covers the opening, the link, a claim they will not make, a format that already failed, and a patient who can be recognized. They can ignore the note and still set the time.
- **The tie to the diary.** Every post that goes out carries that post’s page link. A booking that starts there sits on the card. After a pile of cards, the next Sunday’s ideas say what to repeat and what to leave.
- **The profile.** When the hours or the address change, they get a new bio line. A reel can work and the profile can still lose the person if the bio is stale.

Filming and editing stay in the tools they already use. The live grid, reach, and comment replies wait on permissions this review does not include. Until a post’s link is on a card, the brain cannot learn from it. One patient’s prescription never becomes the idea. The count of a common topic can.

---

## Founder thinking

Halo Aid is two layers. The bottom is the management Buffer and Publer already sell: ideas on a board, a media library, a queue that posts the file at a chosen time, and a place that shows what happened. The top is the growth layer. Each day it offers one suggestion aimed at a booking: what to say, what is already saved and ready to film, or what to repeat. It does not publish the post. The doctor still films. Other tools make the video.

Buffer, seen on 10 Oct 2026, is that bottom layer. Create is the board. Publish is the queue: Queue, Drafts, Approvals, Sent, in a list or a calendar, with empty slots already waiting. Home shows the next post. Insights is in the nav. Halo Aid keeps that shape and adds the brain on top of it. The generic templates on Buffer’s home (a playlist, “what you make”) stay there. They are not a clinic.

Publer, the same day, is the same layer again: Ideas, a Media library, Posts, and Analytics. An upgrade wall offered competitor analysis, hashtags, and deeper reports. Leave that wall. The overview on the free plan was enough to see the shape. Two businesses already sell this management. That confirms the shape. Halo Aid’s work is to niche it to a doctor: the same board and queue, with the brain on top.

FeedHive, the same evening, has the clearest sidebar. Overview, Content, Activity, Configuration. Analytics on an empty account is published posts, views, engagements, and comments. Its Automation screen is a webhook: a URL, then a draft, then an optional publish, with setup for OpenClaw, Claude Code, a command line, and an API. A doctor will not build that. None of these tools, through Buffer, Publer, Predis, Ocoya, and FeedHive, offered the next post from this creator’s own results. They can generate from a prompt. They do not say what to film tomorrow.

The growth layer is that missing line. Once a day, one suggestion: film the card already saved, or a new idea from the season and from visit counts that are common enough to leave the chart. After a pile of posted cards, the line says what to repeat and what to leave. The doctor can ignore it. It does not publish. Sunday is still when a few cards get written out to shoot. The daily line is the reminder, not a new post every morning.

A real person growing an Instagram account has an idea, makes the post, posts it, looks at what happened, and does more of what worked. Halo Aid assists that process where it can. Doctors will also post from the phone, with no AI. The layer has to accept that.

The doctor sees one board. Three agents are the jobs behind a card, not three apps to walk between.

1. **Idea generator.** The doctor’s own thoughts, plus suggestions. A suggestion can come from the analytics note, from visit counts that are common enough to leave the chart, and from the trend line. Scripts, the reel-cover line, the shot list, and the organization of ideas sit on the card. The generator does not render the video. AI is available. It is not required. It stops when the doctor saves the idea for execution.
2. **Scheduler.** The autoposter. A saved idea is scheduled only after the doctor has accepted the words and attached the file they filmed. Before the clock starts, the doctor can ask the brain to look at that file. A reel posted from the phone still comes home: they paste its Instagram URL, or the analyzer never sees it.
3. **Analyzer.** What worked and what did not, fed back into the idea generator. It stays quiet on advice until there is a pile of Posted cards. After one fee post and one tour, “leave the tour” is a guess. For the first posts it only lists what went up. The trend line and the common visit counts can still propose ideas before that pile exists.

Approval and posting are two moments. Saving an idea accepts the words. The clock starts only after the file is attached. A script alone never publishes. Between the file and the clock, the doctor can ask the brain about that file. The notes are suggestions. The doctor can ignore them and still set the time.

A card can start at any stage. An idea starts at the top. A script the doctor already wrote starts in the middle. A reel already posted from the phone starts at the end, with its Instagram URL, so the board still knows it exists.

The board organizes ideas into this week, parked for later, and seasonal ones that come back (dengue, exams, flu).

### What the growth model is allowed to read

Patient personal information never goes to this model. A name, phone, age, sex, address, record number, photo, lab value, exact visit date, or sentence from the chart stays in the chart.

Masking the name on one prescription still leaves that person’s health record, so one prescription never becomes a post idea. The chart assistant that helps the doctor finish a note is a different call. It ends on that note. It does not feed the growth model.

What can leave the chart is a count that cannot be walked back to one visit: the topic, how many visits, the treatment those visits had in common, and whether people with that topic came back. A single visit stays in. A rare diagnosis stays in even as a count, because one case can still point at one person.

### Trend line, without other doctors

Seen in Predis on 10 Oct 2026: competitor analysis is “paste any public account and read its grid.” Halo Aid does not do that. It points a doctor at other doctors, and it fights the line already told to Meta, that Halo Aid does not read media.

The trend section is the season and the public health topic for that specialty and city, plus the doctor’s own common visit counts. Dengue, exam stress, pollution, flu. The idea generator reads that line the same way it reads last week’s analytics note.

### Ask before posting

The doctor shares the filmed file on the card, the way a file is shared in a chat, and asks for a look before it goes out. The brain already holds this doctor’s board: the scripts, the Posted cards, the visit score on each, the trend line, and the visit counts that were allowed to leave the chart. It comments on this file against that. It does not attach a patient’s record to the file.

The comment is short. The opening against the hook on the card. Whether the reel points people to the page. A claim the memory forbids. A format the last note said to leave. A fit with this week’s topic. A face, name, or case on screen that identifies a patient. That last one is “keep this file off the public account.” Those frames are not kept as a source for the next idea.

What the brain knows on day one is the board. Posts that never came home, and the live Instagram grid, wait. The review already in progress says Halo Aid does not read media. Reading the whole account is a later permission. Until then, a phone post teaches the brain only after its URL is pasted onto a card.

---

## Suggestions from the working session

The value layer is the management, then the brain on top. Management is the board, the autoposter, and the analytics. The brain is idea generation, the look at the file before it goes out, and the note back into the next idea. Scripts sit on the card. Video creation stays outside.

| Move | Who assists |
|---|---|
| Notice, write the script, keep the ideas organized | Idea generator |
| Look at the filmed file before it goes out | Idea generator, on the doctor’s ask |
| Put the filmed file up at a chosen time, or take a phone post back in | Scheduler |
| Look, then say what to repeat and what to stop | Analyzer |

One saved idea holds the hook, a short script, the reel-cover line, a three-shot list, the caption, and the page link already written as the first comment. The doctor picks it and it sits ready to film.

Five rules keep the loop closed:

- **Approval is the save.** The clock never starts on a script alone. The file they filmed has to be attached. The doctor can ask for a look at that file first. The notes do not block the clock.
- **The page link is on every card that goes out.** Visits from that link are the score that exists before Instagram reach does.
- **A phone post can come home** by pasting the Instagram URL.
- **A memory of this doctor** filters every suggestion: specialty, city, languages, and the claims they will not make. A dengue week does not become a cure claim.
- **The note says what to stop.** After a pile: repeat the fee posts, leave the clinic tour, and here is this week’s health topic. Before the pile: list what went up, plus the trend line and the visit counts that are common enough to leave the chart.

Three assists sit beside the three agents:

- **The profile.** Bio, highlights, and the link are the storefront. When hours or the address change on the practice page, offer a new bio line. People decide to follow from the profile after the reel.
- **The first hour.** After a post goes up, list early comments and offer one public reply that points to the page. The doctor sends it. That waits on the comments permission. Until then, a reminder that comments are waiting is enough.
- **The Sunday batch.** The weekly output is a few cards ready to shoot, not a post every morning. Stories are the light layer in between: one prompt, posted from the phone.

The score is visits from the page. Follower count can sit beside saves and reach later. A post that only grows the audience and never fills a visit is a weak post for this product.

Publishing from Halo Aid needs an Instagram permission this review does not include. The card and the clock can exist before that permission. Until then, the doctor copies the card and posts from the phone, then pastes the URL back.

---

## Inspiration from the world

General tools do four jobs: write, design, schedule, and report. The healthcare copies add a gate the general tools treat as optional: a person approves the words before anything is public. Halo Aid takes the write, the schedule, and the report. It leaves the video design to those tools.

| Tool | What to look at | Link |
|---|---|---|
| Ocoya | One prompt becomes a month of posts. Workflows can create and publish on a trigger. Campaigns generate a week, and only approved posts get scheduled. The calendar is the Planner. | [Product](https://www.ocoya.com/) · [Workflows](https://www.ocoya.com/features/workflows) · [How a workflow is built](https://docs.ocoya.com/help/create-a-workflow) · [Daily poster](https://help.ocoya.com/en/articles/12733293-how-to-use-the-daily-scheduler) · [Campaigns](https://help.ocoya.com/en/articles/16413475-creating-ai-powered-campaigns-with-ocoya) |
| Predis | The whole post, carousel or video, plus competitor themes. Competitor analysis, seen 10 Oct 2026, reads any public account’s grid. Leave that. Keep the idea of a timely topic, fed by the season, not by another doctor. | [AI social media manager](https://predis.ai/ai-social-media-manager/) |
| FeedHive | Seen 10 Oct 2026. Sidebar grouped as Overview, Content, Activity, Configuration. Copy that grouping. Analytics on an empty account showed published posts, views, engagements, comments. No next-post suggestion. Leave Studio and unattended automation. | [Product](https://www.feedhive.com/) |
| Buffer | Seen 10 Oct 2026 on the free plan, channel halo.aid connected. Create is the board. Publish is the queue: Queue, Drafts, Approvals, Sent, as a list or a calendar. Home shows the next post. Insights is in the nav. Copy that management. Leave the generic templates and the browser extension. The brain sits on top. | [Product](https://buffer.com/) |
| Publer | Seen 10 Oct 2026 on the free plan, Halo Aid account connected. Ideas, Media, Posts, Analytics. Copy the media library next to the board and the queue. Leave the upgrade wall: competitor analysis, hashtags, and export reports. | [Product](https://publer.com/) |
| Apaya | Read 10 Oct 2026. A clinic group. Every draft waits. Banned phrases and approved language are the useful part. They also offer hands-free publishing. Leave that. Public marketing, not the chart. | [Healthcare social](https://apaya.com/enterprise/industry/multi-location-healthcare-social-media-management) |
| PostPlanify | Read 10 Oct 2026. A second person approves before a practice post goes live. A solo doctor is their own approver. | [For medical practices](https://postplanify.com/social-media-scheduler-for-medical-practices) |
| ViralDashboard | Read 10 Oct 2026. An approval chain and an audit for a clinic group. Their page says the tool does not hold health records. | [Healthcare](https://viraldashboard.io/jv/industries/healthcare) |
| Hootsuite’s healthcare note | A person reviews every AI draft. Patient details never go into the writer. Their newer AI claims a next-post line from likes and public trends, not from a diary. | [Guide](https://blog.hootsuite.com/social-media-healthcare/) |

### What Ocoya’s workflow tab actually is

Confirmed while clicking through on 9 Oct 2026. The Workflows screen is empty until a workflow is built and set live. A workflow is a chain: a trigger, an AI agent, then **Create social post**. That last step can publish or save a draft. The Daily poster template is schedule, then agent, then post. Posts it sends show up in **Planner**.

**Campaigns** is the other path. Describe a week, generate the posts, approve the ones to keep. **Run campaign** schedules only the approved ones.

For a doctor, the draft choice on **Create social post** matches this product. The publish choice is the autoposter, and it belongs to the scheduler, after the words are accepted and the filmed file is attached.

### What to take

- A memory of this doctor: specialty, city, languages, and the phrases they will not say. Apaya, read 10 Oct 2026, keeps banned phrases and approved language, and a reviewer can send a caption back when it sounds like a treatment claim. Here the doctor is that reviewer. A dengue week does not become a cure claim.
- One sitting produces a week of cards, not one caption.
- Each card has a hook, a short script, a caption, and a first comment that is only the page link.
- The management is the shape Buffer and Publer both sell: a board, a media library for the filmed files, a queue, and analytics. Seen 10 Oct 2026. That confirms the shape. The niche is a doctor, and the brain sits on top.
- The brain sits on that management. It fills the card, looks at the file before the clock starts, and writes the note after a pile of sent posts.
- Buffer’s management, monthly tab, 1 channel, seen 10 Oct 2026: Free $0, Essentials $6, Team $12. The yearly prices were not on screen. The queue is the cheap part. The brain is the reason a clinic product can cost more than $6.
- Old winners come back on a season. Clinics already repeat dengue, exams, or flu. SocialBee can re-post the same item forever with nobody choosing. A fee post comes back because the doctor saves it again.
- The goal on the board is visits from the page, not follower count.
- The trend is the season and the public health topic. Other doctors’ accounts stay out.

### What those apps cannot see

Their analyzer stops at reach, saves, and likes. Halo Aid can add the visit, because a Posted card keeps the link code. It can also see which common visit topics rose in the clinic, as a count, which a video tool never can.

Hootsuite’s newer AI, described on their site in 2026, says it can recommend what to create next from likes and public trends. Later counts clicks on a link in bio. Both stop at attention. The line on Home is about a visit.

### Left aside on purpose

Video rendering. Reading another doctor’s account. Auto-publish of a month of posts with nobody looking, which is what ContentStudio offers from one prompt. A design tool that invents patient pictures. Sending one patient’s complaint, diagnosis, or treatment to the growth model. Posting the same card to several networks. A solo doctor lives on Instagram.

Also left: an endless re-post of the same card, a second employee who must approve, a hands-free publish switch, and a workflow URL. PostPlanify, ViralDashboard, and Apaya are built for a clinic group with staff. The doctor here accepts their own words. FeedHive’s Automation screen is a webhook. A doctor never sees it.

Reach, saves, and follows need `instagram_business_manage_insights`. Publishing a file from Halo Aid needs a content-publishing permission. Neither is in the review submitted on 8 Oct 2026. The basic-permission text on that file says Halo Aid does not read media. The board, the weekly ideas, the trend line, and the visit count do not need those permissions.

---

## Open, still exploring

- Whether stories are their own lane or a light card on the same board.
- How hard the first-hour comment assist waits on `instagram_business_manage_comments`.
- Whether the Sunday batch is three cards or “enough to film this week.” ⟨fill⟩
- The smallest visit count that may leave the chart as a topic. One visit never leaves. A rare diagnosis never leaves. The floor above that is ⟨fill⟩.
