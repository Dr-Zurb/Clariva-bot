# Comment Testing Guide
## Manual + Script Testing for Instagram Comment Leads

**Last Updated:** 2026-03-21  
**Related:** [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md)

---

## Prerequisites

- [ ] Backend deployed and running (Render: `clariva-bot.onrender.com`)
- [ ] Doctor connected via Instagram (Clariva Care / @clariva_care)
- [ ] `OPENAI_API_KEY` set (for AI classification)
- [ ] `REDIS_URL` set (for webhook queue)
- [ ] Test account: @dr_abhishek_sahil (or similar)

---

## Expected Behavior Summary

| Intent Category | Example | DM? | Public Reply? | Lead Stored? | Doctor Email? |
|-----------------|---------|-----|---------------|--------------|---------------|
| **High-intent** | book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query | ✅ | ✅* | ✅ | ✅ |
| **Low-intent** | greeting, praise, other | ❌ | ❌ | ✅ | ✅ |
| **Skip** | spam, joke, unrelated, vulgar | ❌ | ❌ | ❌ | ❌ |

*Public reply may fail with metaCode 100 (permission/restriction). DM is the primary outreach.

---

## Test Cases

### 1. High-Intent — Should Receive DM + Doctor Email

| # | Comment Text | Expected Intent | DM Received? | Doctor Email? | Pass? |
|---|--------------|-----------------|--------------|---------------|-------|
| 1.1 | how to book? | book_appointment | | | |
| 1.2 | book me | book_appointment | | | |
| 1.3 | schedule appointment | book_appointment | | | |
| 1.4 | want to book | book_appointment | | | |
| 1.5 | available tomorrow? | check_availability | | | |
| 1.6 | any slots? | check_availability | | | |
| 1.7 | when can I come? | check_availability | | | |
| 1.8 | price? | pricing_inquiry | | | |
| 1.9 | how much? | pricing_inquiry | | | |
| 1.10 | consultation fees? | pricing_inquiry | | | |
| 1.11 | more info? | general_inquiry | | | |
| 1.12 | interested | general_inquiry | | | |
| 1.13 | tell me more 👍 | general_inquiry | | | |
| 1.14 | how does it work? | general_inquiry | | | |
| 1.15 | I have stomach pain | medical_query | | | |
| 1.16 | suffering from diabetes | medical_query | | | |
| 1.17 | my mother has fever | medical_query | | | |
| 1.18 | headache for 3 days | medical_query | | | |

### 2. Low-Intent — Stored Only, No DM

| # | Comment Text | Expected Intent | Lead Stored? | No DM? | Pass? |
|---|--------------|-----------------|--------------|--------|-------|
| 2.1 | hi | greeting | | | |
| 2.2 | hello | greeting | | | |
| 2.3 | great post! | praise | | | |
| 2.4 | helpful | praise | | | |
| 2.5 | 👍 | praise | | | |
| 2.6 | nice | other (or praise) | | | |

### 3. Skip — No Storage, No Outreach

| # | Comment Text | Expected Intent | No DM? | No Lead? | Pass? |
|---|--------------|-----------------|--------|----------|-------|
| 3.1 | lol | joke | | | |
| 3.2 | haha | joke | | | |
| 3.3 | 😂 | joke | | | |
| 3.4 | DM for deals | spam | | | |
| 3.5 | check out my page | spam | | | |
| 3.6 | follow for follow | unrelated | | | |
| 3.7 | check my profile | unrelated | | | |

### 4. Edge Cases — Mixed Language, Emojis

| # | Comment Text | Expected Intent | Notes | Pass? |
|---|--------------|-----------------|-------|-------|
| 4.1 | interested hai | general_inquiry | Hinglish | |
| 4.2 | kya slot available hai? | check_availability | Hindi/English | |
| 4.3 | book karna hai | book_appointment | Hinglish | |
| 4.4 | 👍 interested | general_inquiry | Emoji + text | |
| 4.5 | @clariva_care want to book | book_appointment | @mention | |
| 4.6 | greaat post!!! | praise | Typo | |

---

## Manual Testing Steps

1. **Post a comment** on any @clariva_care post using your test account.
2. **Wait ~30–60 seconds** for webhook → queue → worker.
3. **Check:**
   - Instagram DM (high-intent only)
   - Doctor email (high + low intent)
   - `comment_leads` table in Supabase (high + low)
4. **Fill** the Pass? column in the tables above.
5. **Check Render logs** for:
   - `"Instagram comment webhook queued for processing"`
   - `"Comment: skip intent"` (for skip)
   - `"Comment: proactive DM failed"` (if DM blocked)
   - `"Email sent"`

---

## Script Testing (Local / Staging)

You can simulate comment webhooks without posting on Instagram:

```bash
cd backend
npm run test:comment "want to book"
```

Or test multiple comments from a file:

```bash
npm run test:comment -- --file scripts/test-comments.txt
```

**Requirements:**
- `TEST_COMMENT_WEBHOOK_URL` in `.env` (default: `http://localhost:3000/webhooks/instagram`)
  - For production: `TEST_COMMENT_WEBHOOK_URL=https://clariva-bot.onrender.com/webhooks/instagram`
- `TEST_INSTAGRAM_PAGE_ID` in `.env` (doctor's Instagram page ID, e.g. `17841479659492101`)
- `TEST_COMMENTER_IG_ID` in `.env` (optional; use real ID for full DM flow)

**Note:** Script sends payloads that bypass signature (comment bypass). DM will only succeed if `TEST_COMMENTER_IG_ID` is a real Instagram user ID that can receive DMs from the business.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| No DM received | OPENAI_API_KEY set? High-intent classification? User has DMs open from business? |
| No doctor email | DEFAULT_DOCTOR_EMAIL or doctor settings? Resend API key? |
| Comment not processed | Render logs; Redis/queue running? Webhook URL correct in Meta? |
| Wrong intent | Review COMMENT_INTENT_SYSTEM_PROMPT; add examples if needed |
| Public reply fails (metaCode 100) | Instagram permission; user settings; comment context |

---

## Logs to Search

In Render (or local logs):

- `payloadType: "comment:comments"` — comment webhook received
- `Comment: skip intent` — spam/joke/unrelated/vulgar
- `Comment: proactive DM failed` — user blocked or DMs closed
- `Comment reply failed` — public reply failed (metaCode 100)
- `Email sent` — doctor notification sent
- `Comment intent classification` — AI classifier ran

---

**Reference:** [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) | [e-task-7-comment-worker-and-outreach.md](./e-task-7-comment-worker-and-outreach.md)
