# Rough draft — social media layer

**Status:** rough draft. The build plan is [`v1.md`](./v1.md). Where they disagree, v1 wins.  
**Opened:** 9 Oct 2026. **Updated:** 11 Oct 2026.  
**Where the thinking came from:** [`exploring.md`](./exploring.md).

Halo Aid is two layers. The management is the board, the queue, and the record of what went out. The brain sits on top: it suggests the idea, writes the script, looks at the filmed file before the clock starts, and feeds the next idea from what actually booked. The doctor films. Another tool makes the video. Doctors will also post from the phone, with no AI. The layer has to accept that.

This sits beside the live product. The one fixed DM reply and the doctor’s page stay as they are. This draft does not change the Meta review that is in progress.

---

## The management

This is the part Buffer and Publer both show, seen 10 Oct 2026.

| Place | What the doctor sees |
|---|---|
| Board | Idea, Saved, Scheduled, Posted. Also parked, and a season. |
| Media | The filmed files, ready to attach to a card. |
| Queue | Drafts, an approval, a calendar of times, and Sent. |
| Home | The next post. |
| Insights | What happened. Halo Aid’s number is visits from that card’s link. |

The brain is not a fourth screen. It writes onto the card, comments when the doctor asks about a file, and leaves one note on Home each day.

The sidebar follows FeedHive’s grouping, seen 10 Oct 2026.

| Group | Items |
|---|---|
| Overview | Home, with the day’s one suggestion. Analytics, with visits from the page link. |
| Content | Ideas, Schedule, Posts, Media. |
| Activity | The inbox, later, when the comments permission exists. |
| Configuration | The connected Instagram account, and the practice page. |

Studio stays out. So does Automation. That screen is a webhook a developer would wire up. A doctor never sees a URL, an API, or a workflow canvas. The growth layer is one line on Home.

---

## Three agents

Each agent owns one object. The handoff is one way.

The doctor sees one board. The three names are jobs behind the card.

| Agent | Owns | Stops before |
|---|---|---|
| **Idea generator** | The idea, the script, and where the idea sits on the board. | A clock. It does not attach a publish time. |
| **Scheduler** | The upload and the time, and the tie to the real Instagram post. | Rewriting the script. |
| **Analyzer** | The result of a Posted card, and the note back to the idea generator. | Editing a script, or moving a card. |

```
Idea generator  -- saved idea + filmed file -->  Scheduler  -- Posted card -->  Analyzer
    ^                                                                              |
    +---------------------------- one short note ----------------------------------+
```

Saving an idea accepts the words. The doctor is the only approver. There is no second person in the chain. The clock starts only after the doctor attaches the file they filmed. A script alone never publishes. Once the file is on the card, the doctor can ask the brain to look at it before the time is set. The notes are suggestions. Ignoring them still allows the clock.

---

## The card

One card moves through the whole layer. It can start at any stage.

| Start | Example |
|---|---|
| Idea | “Fees for a first visit.” Typed, or suggested. |
| Saved | The doctor kept the script and is ready to film. |
| Posted | A reel they already published from the phone. They add the caption, the page link, and the Instagram URL. |

Stages on the board: **Idea → Saved → Scheduled → Posted.** Saved accepts the words. Scheduled means the file is attached and a time is set. Posted is that time having passed, or a mark after they publish from the phone.

The board has three piles around those stages: this week, parked for later, and seasonal (dengue, exams, flu), so an idea that is not for this Sunday is not lost. A card in the seasonal pile does not publish itself next year. It comes back when the doctor saves it again.

One saved idea holds:

- a hook
- a short script
- the line on the reel cover
- a three-shot list
- the caption
- the first comment, already the page link

AI can fill any of those lines. Skipping it leaves the doctor’s own words. The video file is the doctor’s upload. Halo Aid does not render it.

Every card that is going out carries the page link in the first comment. An organic post and a scheduled post leave through the same door.

---

## Idea generator

Suggestions are optional. The doctor can type the idea and ignore the rest.

**Sources.** Four, and the doctor’s memory filters all of them.

| Source | What it contributes |
|---|---|
| The doctor | An idea they already have. |
| The analytics note | What to repeat and what to stop, once a pile of Posted cards exists. |
| Visit counts | A topic that is common enough to leave the chart. |
| The trend line | The season and the public health topic for this specialty and city. |

**Memory.** Specialty, city, languages, and a short list of phrases this doctor will not say. The generator does not write a banned phrase, and it does not show a draft that sounds like a treatment claim. The doctor is the reviewer. A dengue week stays a seasonal topic. It does not become a cure claim.

**What a visit count contains.** The topic, how many visits, the treatment those visits had in common, and whether people with that topic came back. A single visit stays in the chart. A rare diagnosis stays in the chart even as a count. No name, phone, age, sex, address, record number, photo, lab value, exact visit date, or sentence from the prescription.

The chart assistant that helps finish a note is a different call. It ends on that note. Those lines are not a source for this generator.

**Trend line.** Dengue, exam stress, pollution, flu, and the same kind of public health topic. It does not open another doctor’s account.

**The daily suggestion.** One line on Home. It points at a card already saved, or it offers one new idea from the trend line and from visit counts that may leave the chart. After a pile of Posted cards, it also says what to repeat and what to stop. The doctor can ignore it. It never sets the clock. The Sunday sitting is still where a few cards get written out to film. Through Buffer, Publer, Predis, Ocoya, and FeedHive on 10 Oct 2026, this line was missing. Those tools generate from a prompt. They do not name tomorrow’s post from this account.

A weekly sitting produces a few cards ready to shoot. It does not produce a post every morning. Stories are a lighter card: one prompt, posted from the phone.

The generator reads the analyzer’s note and does not suggest a format the note said to leave alone. Before a pile of Posted cards exists, the note only lists what went up. The trend line and the common visit counts can still suggest ideas in that early stretch.

### Ask before posting

The doctor shares the filmed file on the card and asks for a look. This is one comment, not a new stage.

The brain compares the file with what it already holds for this doctor:

- the card they are about to post (hook, script, caption, page link)
- Posted cards on the board, and which of them brought a visit
- the latest analytics note
- the trend line
- visit counts that were allowed to leave the chart
- the memory of claims this doctor will not make

It does not receive a patient’s record, and it does not receive the live Instagram grid. The grid waits on a later permission. The review submitted on 8 Oct 2026 says Halo Aid does not read media. Until a phone post’s URL is on a card, that post is invisible to this comment.

The comment covers the opening against the hook, whether people are sent to the page, a forbidden claim, a format the note said to leave, a fit with this week’s topic, and anyone on screen who can be identified as a patient. An identifiable patient means “keep this file off the public account.” Those frames are not stored as a source for the next idea.

The doctor sets the time after reading the comment, or without asking.

---

## Scheduler

A saved idea arrives with a file the doctor filmed. The doctor sets a time. That card publishes then. This is the autoposter.

The clock never starts without both the accepted words and the file. A card with a script and no file stays in Saved.

A reel posted from the phone is marked **Posted** with the Instagram URL. The idea generator does not have to be involved. The card still keeps the page link, so a visit can be tied to it.

Publishing the file through Instagram needs a content-publishing permission. That permission is not in the review submitted on 8 Oct 2026. Until it exists, the doctor posts from the phone and pastes the URL back. The card and the chosen time are still the same object.

When hours or the clinic address change on the practice page, offer a new bio line. Bio, highlights, and the link are the storefront. People decide to follow after the post, from the profile.

---

## Analyzer

It reads Posted cards only. The note goes back to the idea generator.

Two scores, and it shows a number only when it has it.

| Score | What it is | When it exists |
|---|---|---|
| Visits | Bookings that started from that card’s link | As soon as the card is Posted and the link code is kept |
| Instagram | Reach, saves, follows | After `instagram_business_manage_insights` is approved. Not in the 8 Oct 2026 review. |

Until the Instagram score exists, the analyzer still works: which kind of post went up, which Posted card produced a visit, what to repeat, and what to stop.

The note that says what to repeat waits for a pile of Posted cards. Before that, it only lists what went up. After the pile, it is a few lines. Example: “Fee posts brought visits. Clinic-tour reels were watched and booked nobody. Suggest fee posts. Leave the tour.”

Follower count can sit beside the Instagram score later. It is not the goal. A like, a reach number, and a click on a link are attention. The score is a booking that started from that card’s link. A post that only grows the audience and never fills a visit is a weak post.

---

## What v1 is

The board and its three piles. One line on Home each day. The card with a script and a page link. AI as a button on those lines, held back by the phrases this doctor will not say. A Saved mark when the doctor accepts the words. An optional look at the filmed file before the time is set. A Scheduled mark when the file and a time are attached. A Posted mark that keeps the Instagram URL for anything published from the phone. The visit score on those Posted cards. The trend line. Visit counts that are common enough to leave the chart. A seasonal card that returns only when the doctor saves it again.

The note that says what to repeat waits until there is a pile of Posted cards. Before that pile, ideas still come from the doctor, the trend line, and those visit counts.

## What waits

- The Instagram call that publishes the uploaded file. The card and the time exist before that permission.
- Reach, saves, and follows.
- Listing early comments and offering one public reply. That is the comments permission, a separate Meta file.
- Reading the doctor’s existing grid. The current review says Halo Aid does not read media.

## Out of this layer

Rendering the video. A prompt that fills a month of posts. Reading another doctor’s account. Re-posting the same card forever with nobody choosing. A second person who must approve. A switch that publishes with nobody looking. A workflow URL, an API, or any setup a doctor would have to wire up. The DM reply. Comment private replies. Sending one patient’s complaint, diagnosis, or treatment to the idea generator. Inventing a photo of a patient. Posting the same card to several networks.
