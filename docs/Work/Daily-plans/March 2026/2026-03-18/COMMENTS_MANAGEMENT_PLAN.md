# Comments Management Plan
## Lead Acquisition from Instagram Comments

---

## 📋 Overview

**Goal:** Capture high-intent leads from Instagram post comments by detecting medical/doctor-related queries, then engaging via public reply + proactive DM. Maximize conversion while avoiding public solicitation and connecting only with the right people.

**Context:** Doctors receive 20–50 comments/week on posts (PROBLEM_STATEMENTS.md). Many are questions about availability, booking, pricing, or medical concerns. Currently only DM-based leads are captured. This plan extends lead acquisition to the comment section.

**Status:** ⏳ **PLANNING**  
**Created:** 2026-03-18

---

## 🎯 High-Intent Criteria (When We Reply + DM)

We send **both** a public reply and a proactive DM when the AI classifies a comment as **high intent**. The AI must understand comment context and connect only with people who appear to have medical/doctor-related queries.

### Intent Categories — REPLY + DM

| Intent | Description | Example Comments |
|--------|-------------|------------------|
| **book_appointment** | Directly asking to book or schedule | "how to book?", "book me", "schedule appointment", "want to book" |
| **check_availability** | Asking about slots, timing, when doctor is free | "available tomorrow?", "any slots?", "when can I come?" |
| **pricing_inquiry** | Asking about cost, fees, consultation charges | "price?", "how much?", "consultation fees?" |
| **general_inquiry** | General questions about the practice or doctor | "more info?", "interested", "tell me more", "how does it work?" |
| **medical_query** | User shares symptoms or medical concern | "I have stomach pain", "suffering from diabetes", "my mother has fever", "headache for 3 days" |

**Medical query (symptom sharing):** When a user shares a medical problem or symptom in a comment, we treat it as high intent. Our response: "Our doctor may be able to help with your query. If you'd like to schedule a consultation, reply here." We do **not** give medical advice publicly or in the initial DM.

---

## 🚫 What We Do NOT Reply To

The AI must filter out non-lead comments. We do **not** send reply or DM for:

| Category | Description | Example Comments |
|----------|-------------|------------------|
| **Jokes** | Humor, puns, funny replies | "lol", "haha", "😂", sarcastic jokes |
| **Memes** | Meme references, viral phrases | Generic meme text, unrelated to medical |
| **Unrelated** | Off-topic, not about doctor/practice/health | "follow for follow", "check my profile", random topics |
| **Vulgar / Disrespectful** | Profanity, insults, harassment | Abusive language, insults to doctor or practice |
| **Spam** | Promotional, bots, irrelevant links | "DM for deals", "check out my page", link spam |
| **Praise only** | Pure compliments with no question | "great post!", "helpful", "👍" (no inquiry) |
| **Greeting only** | Just hi/hello with no inquiry | "hi", "hello" (no follow-up question) |

**Principle:** Connect only with people who seem to have a genuine medical or practice-related query. Err on the side of not replying when uncertain.

---

## 📝 AI Classification Requirements

The AI must be **context-aware** and understand:

1. **Short form:** Comments are 1–20 words; different from DM conversations
2. **Noise:** Emojis, @mentions, typos, mixed language (English/Hindi)
3. **Intent vs. noise:** "interested" + emoji = general_inquiry; "lol" = joke (skip)
4. **Medical context:** Symptom sharing = medical_query (high intent)
5. **Respect:** Vulgar/disrespectful = never reply
6. **Solicitation risk:** Avoid false positives that could look like we're chasing random users

**Output:** One of: `book_appointment` | `check_availability` | `pricing_inquiry` | `general_inquiry` | `medical_query` | `greeting` | `praise` | `spam` | `joke` | `unrelated` | `vulgar` | `other`

**High-intent (reply + DM):** `book_appointment`, `check_availability`, `pricing_inquiry`, `general_inquiry`, `medical_query`  
**Low-intent (store only, no outreach):** `greeting`, `praise`, `other`  
**Skip (no storage):** `spam`, `joke`, `unrelated`, `vulgar`

---

## 🔄 Flow: Public Reply + Proactive DM

For **high-intent** comments only:

```
1. Comment webhook received
2. Parse: comment_id, commenter_ig_id, comment_text, media_id
3. Resolve media_id → doctor_id
4. Classify intent (AI)
5. If high-intent:
   a. Store lead
   b. Send proactive DM first (so user has message when they check)
   c. Post public reply: "Check your DM for more information."
   d. Notify doctor
6. If low-intent: store lead, notify doctor, no outreach
7. If skip: no action (or minimal logging)
```

**Order:** DM first, then public reply. If DM fails (user blocks business DMs), public reply still tells them to check DMs; they may initiate.

---

## 📢 Message Templates

### Public Reply (Strict — No Solicitation)

**Single approved variant:**
> "Check your DM for more information."

**Rules:**
- No mention of: appointment, book, schedule, consultation, price, fee
- No medical claims or advice
- Neutral, informational only
- Avoids legal/solicitation risk

### Proactive DM (By Intent)

**Structure:**
1. Acknowledgment (tied to their comment)
2. Doctor may help (soft, non-promotional)
3. Doctor details (name, specialty, practice)
4. Soft CTA

| Intent | Acknowledgment | CTA |
|--------|----------------|-----|
| book_appointment | "You expressed interest in booking." | "Reply here if you'd like to schedule." |
| check_availability | "You asked about availability." | "Reply here if you'd like to schedule a consultation." |
| pricing_inquiry | "You asked about pricing." | "Reply here if you'd like more details." |
| general_inquiry | "You had a question." | "Reply here if you'd like to connect." |
| medical_query | "Our doctor may be able to help with your query." | "If you'd like to schedule a consultation, reply here." |

**Doctor details block:** Name, specialty, practice name, location. No prices, guarantees, or promotional language in initial DM.

---

## 🗂️ Data Model

**New table: `comment_leads`**

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| doctor_id | UUID | FK to doctor |
| comment_id | VARCHAR(255) | Instagram comment ID (unique) |
| commenter_ig_id | VARCHAR(255) | Commenter's IG user ID |
| comment_text | TEXT | Raw comment |
| media_id | VARCHAR(255) | Post/media ID |
| intent | VARCHAR(50) | Classified intent |
| confidence | DECIMAL(3,2) | 0–1 |
| public_reply_sent | BOOLEAN | Whether we replied on comment |
| dm_sent | BOOLEAN | Whether we sent DM |
| conversation_id | UUID | FK, set when user DMs and we link |
| created_at | TIMESTAMPTZ | |

---

## 🛠️ Technical Components

| Component | Purpose |
|-----------|---------|
| Comment webhook handler | Receive Meta `comments` webhook events |
| Doctor–media mapping | Resolve media_id → doctor_id via Instagram API |
| Comment intent classifier | AI (or hybrid) to classify comment |
| Comment reply service | POST /{comment_id}/replies |
| Proactive DM | Reuse Instagram messaging; recipient = commenter |
| Deduplication | One reply + one DM per (commenter, media) |
| Idempotency | Avoid duplicate processing of same comment_id |

---

## 📐 Phased Rollout

| Phase | Scope | Est. |
|-------|-------|------|
| **1** | Webhook subscription, payload parsing, lead storage, doctor notification | 1–2 w |
| **2** | Intent classification (AI), high vs low vs skip | 1 w |
| **3** | Public reply only (high-intent) | 3–5 d |
| **4** | Proactive DM (high-intent) | 1 w |
| **5** | Analytics, tuning, link comment→DM→booking | 1 w |

---

## ⚠️ Compliance & Safety

- **Public reply:** No solicitation, no medical advice, no promotional language
- **DM content:** "May be able to help" — not "will cure"; factual doctor info only
- **Medical queries:** Acknowledge, invite to schedule — never diagnose or advise in comment or initial DM
- **Vulgar/spam:** Never engage; do not store PHI from such comments
- **Privacy:** Comment is public; DM is 1:1; store only what's needed for lead follow-up

---

## 🔗 References

- [PROBLEM_STATEMENTS.md](../../../Business%20files/PROBLEM_STATEMENTS.md) — Comment volume (20–50/week)
- [Instagram Webhooks — Comments](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/)
- [l-task-1-instagram-setup.md](../../../Learning/2026-01-21/l-task-1-instagram-setup.md) — `instagram_manage_comments` scope
- [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

## 📋 Open Decisions

- [ ] Exact confidence threshold for high-intent (e.g. 0.7)
- [ ] Whether to include `general_inquiry` in reply+DM or only store
- [ ] Doctor–media mapping: API lookup vs cache
- [ ] Throttling: max replies/DMs per post or per hour
- [ ] Reels support (Meta may limit comment webhooks for Reels)
- [ ] Multilingual: Hindi/mixed language support from day one

---

**Last Updated:** 2026-03-18
