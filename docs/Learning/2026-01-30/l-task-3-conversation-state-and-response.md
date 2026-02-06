# Learning Topics - Conversation State & Response Generation
## Task #3: Multi-Turn Context and Medical-Safe Bot Replies

---

## 📚 What Are We Learning Today?

Today we're learning about **Conversation State** and **Response Generation** — how the bot keeps context across turns, where that context lives, and how it produces medical-appropriate (assistive, non-diagnostic) replies using OpenAI. Think of it like **the receptionist keeping a notepad for each conversation and choosing what to say next based on the last intent and recent exchange** — we store the “notepad” (state) and the exchange (messages), redact before sending anything to the AI, and never let the AI give medical advice.

We'll learn about:
1. **Conversation state** – What it includes (intent, step, collected data) and where it can live (DB, derived from messages, or in-memory)
2. **Doctor and patient resolution** – Why the webhook must resolve `doctor_id` and `patient_id` before get/create conversation
3. **Response generation** – Intent + state + recent history (redacted) → OpenAI → safe bot reply; retry and fallback
4. **Multi-turn history** – Redacted, length-limited (token budget); stored in DB as messages
5. **Storing messages** – User message with optional intent; bot reply as `system` (or `doctor`); state updated after each turn
6. **Full webhook flow** – Resolve doctor/patient → conversation → store user message → intent → state → generate response → store bot message → send via Instagram
7. **Compliance** – PHI redaction, audit metadata only, validate AI response, no medical advice

---

## 🎓 Topic 1: What Is Conversation State?

### What State Includes

**Conversation state** is the “memory” the bot uses to decide what to do next in a multi-turn conversation. It can include:

- **Current intent** – e.g. `book_appointment`, `ask_question` (from Task 2)
- **Step in flow** – e.g. “waiting for name,” “waiting for preferred time” (Task 4–5 will extend this)
- **Partial or collected data** – e.g. fields gathered so far (Task 4–5)

**Think of it like:**
- **State** = The receptionist’s notepad: “They want to book; I’ve got their name, still need phone and time.”
- **Without state** = Every message is treated as brand new; no continuity.

### Where State Can Live

The schema today has **conversations** and **messages** but no dedicated “state” column. You have three options:

| Option | Where state lives | Pros | Cons |
|--------|-------------------|------|------|
| **A** | `conversations.metadata` JSONB (new column via migration) | Persistent, one place, survives restarts | Requires migration and DB_SCHEMA update |
| **B** | Derived from last N messages (e.g. last intent, last bot step) | No schema change | Must query messages each time; logic in code |
| **C** | In-memory only, re-built from messages on load | Simplest | Lost across restarts unless you persist via messages |

**Think of it like:**
- **A** = Filing the notepad in a drawer (conversation row); always there.
- **B** = Re-reading the last few lines of the chat to infer where we are.
- **C** = Keeping the notepad only on the desk; if the desk is cleared (restart), we re-read the chat to rebuild it.

You must **document** which option you choose so future work (Task 4–5) stays consistent.

---

## 🎓 Topic 2: Doctor and Patient Resolution (Prerequisite)

### Why This Matters

The **conversations** table requires `doctor_id` and `patient_id`. The webhook worker today only has:

- **senderId** (e.g. Instagram PSID) – who sent the message
- **platform** – e.g. `instagram`
- **No** `doctor_id` or `patient_id`

So before you can “get or create conversation,” you must decide how to **resolve**:

- **doctor_id** – e.g. single doctor from env, or page_id → doctor mapping
- **patient_id** – e.g. placeholder patient per platform user (create on first message), or nullable `patient_id` if a migration is approved

**Think of it like:**
- **Conversation** = A folder that belongs to one doctor and one patient.
- **Webhook** = A letter from “Instagram user 12345.” We need to know which doctor’s practice and which patient folder it goes into before we can file it.

### What to Document for MVP

- How `doctor_id` is obtained (env var, page mapping, etc.).
- How the first message gets a `patient_id` (placeholder patient, nullable column, etc.).
- Any assumptions (e.g. single-tenant, one doctor per Instagram page).

---

## 🎓 Topic 3: Response Generation Service

### What It Does

A **response generation** step (in or alongside the AI service) produces the bot’s reply text given:

- **Current intent** (from Task 2)
- **Conversation state** (current step, collected data if any)
- **Recent message history** (redacted) for context

It calls OpenAI with **receptionist-only, medical-context prompts**: booking, questions, availability, greeting, cancel. **No diagnosis, no medical advice** (COMPLIANCE.md Section G).

**Think of it like:**
- **Input** = “Intent: book_appointment; state: waiting for time; last exchange: User: ‘Tomorrow 3pm’ Bot: ‘Got it, checking…’”
- **Output** = “I’ve reserved 3pm tomorrow for you. You’ll get a confirmation shortly.” (assistive only)

### Same Rules as Task 2

- **Redact PHI** from any text sent to OpenAI (e.g. use `redactPhiForAI` or equivalent).
- **Audit metadata only** – correlationId, model, tokens, redaction flag; no raw prompt/response with PHI.
- **Retry** with exponential backoff; **fallback** to a safe generic reply on failure (e.g. “I didn’t quite get that. Could you rephrase?” or “Thanks for your message. We’ll get back to you soon.” — no PHI, no medical advice).
- **Validate** the AI response before presenting (COMPLIANCE.md G): no medical advice; sanitize if needed.

**Think of it like:**
- **Task 2** = Classify the note (intent).
- **Task 3** = Write the reply (response) using the same redaction and audit rules.

---

## 🎓 Topic 4: Multi-Turn History and Token Budget

### Why Include History?

So the model knows the last few exchanges and can say things like “Got it, I’ve noted 3pm tomorrow” instead of “What time?” again.

### Redacted and Length-Limited

- **Redact** every message in the history before sending it to OpenAI (same PHI rules as Task 2).
- **Limit length** so you stay within token limits and cost (EXTERNAL_SERVICES.md): e.g. last 5–10 message pairs, or a cap around ~500 tokens for history. Document your choice.

**Think of it like:**
- **History** = Last few lines of the notepad we send to the AI.
- **Redacted** = Names and PHI blacked out.
- **Limited** = We don’t send the whole conversation, only the last N messages or last N tokens.

### Where History Comes From

From the **messages** table: load recent messages for the conversation (oldest to newest), redact content, then pass that into the response-generation prompt.

---

## 🎓 Topic 5: Storing Messages and Updating State

### User Message

When the user sends a message:

- Store it via **message-service** with `conversation_id`, `sender_type: 'patient'`, `content`, and optional **intent** (the `messages` table has an `intent` column; you can persist the result from Task 2 here for traceability).

### Bot Reply

When the bot replies:

- Store the reply as a **message** with `conversation_id`, `sender_type: 'system'` (or `'doctor'` if the product prefers), and `content` = the generated reply.
- Do **not** store raw prompts or full AI responses that contain PHI in logs or in message content beyond what you intentionally send to the user.

### State After Each Turn

- **Update state** after each turn (e.g. step advancement, or updating intent/collected data), according to the storage option you chose (DB metadata, derived from messages, or in-memory).

**Think of it like:**
- **User message** = One line on the notepad: “Patient said X; intent = book_appointment.”
- **Bot message** = Next line: “System said Y.”
- **State** = Where we are in the flow after that exchange.

---

## 🎓 Topic 6: Full Webhook Flow (Integration)

The end-to-end flow in the webhook worker (or controller) should look like:

1. **Resolve** `doctor_id` and `patient_id` (or placeholder).
2. **Get or create** conversation (conversation-service).
3. **Store** incoming user message (message-service), with optional intent.
4. **Detect intent** (Task 2: classifyIntent).
5. **Get/update** conversation state (per your chosen option).
6. **Generate** bot response (response generation service: intent + state + redacted history).
7. **Store** bot message (message-service, `sender_type: 'system'` or `'doctor'`).
8. **Send** reply via Instagram service.
9. **Persist** state after the turn (if using DB or in-memory with persistence).

**Think of it like:**
- **Receptionist** = Receives note → files it in the right folder → checks notepad (state) → writes reply → files reply → sends it back → updates notepad.

### Boundaries

- **Controllers** use asyncHandler; **services** throw AppError; **no PII** in logs (STANDARDS.md, ARCHITECTURE.md).

---

## 🎓 Topic 7: Compliance and Safety (Recap)

### COMPLIANCE.md Section G – AI Safety & Governance

- **Assistive only** – No autonomous diagnosis or prescription; no medical advice in replies.
- **Redact PHI** before sending anything to OpenAI.
- **Do not persist** raw AI prompts or responses if they may contain PHI.
- **Audit** every AI call with **metadata only** (model, tokens, redaction flag, correlationId).
- **Validate** AI responses before presenting to users; sanitize if needed.

### Safe Fallback

If response generation fails (timeout, API error, invalid output):

- Return a **safe generic reply** (e.g. “I didn’t quite get that. Could you rephrase?” or “Thanks for your message. We’ll get back to you soon.”).
- No PHI, no medical advice, no raw errors to the user.

### RLS and Retention

- **RLS** – Conversations and messages are protected by RLS (see RLS_POLICIES.md). The worker uses the service role (bypasses RLS) for webhook processing; document any new policies if the schema changes.
- **Retention** – Message content is PHI; follow existing retention for messages. No new retention policy is required for “state” unless you introduce one.

---

## 📝 Summary

### Key Takeaways

1. **Conversation state** – Current intent, step, and (later) collected data; can live in DB metadata (Option A), be derived from messages (B), or in-memory re-built from messages (C). Document the choice.
2. **Doctor/patient resolution** – Webhook must resolve `doctor_id` and `patient_id` before get/create conversation; document how (env, placeholder patient, etc.) for MVP.
3. **Response generation** – Intent + state + redacted recent history → OpenAI → safe, assistive reply; same redaction, audit, retry, and fallback rules as Task 2.
4. **Multi-turn history** – Redacted and length-limited (e.g. last 5–10 pairs or ~500 tokens); loaded from messages, passed to response generation.
5. **Storing messages** – User message with optional intent; bot reply as `system` (or `doctor`); state updated after each turn.
6. **Webhook flow** – Resolve doctor/patient → get/create conversation → store user message → intent → get/update state → generate response → store bot message → send via Instagram.
7. **Compliance** – PHI redaction, audit metadata only, validate AI response, no medical advice, safe fallback.

### Next Steps

After completing this task:

1. Task 4–5 will extend state with collected patient fields and consent before PHI storage.
2. Keep prompts in code or config; avoid storing raw prompts with user data.
3. If you add `conversations.metadata` (Option A), add a migration and update DB_SCHEMA.md per MIGRATIONS_AND_CHANGE.md.

### Remember

- **State** = Where we are in the conversation; document where it lives.
- **History** = Last N messages, redacted and token-capped, for context only.
- **Response** = Assistive receptionist only; never medical advice; always redact and audit.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 3: Conversation State & Response Generation](../../Development/Daily-plans/2026-01-30/e-task-3-conversation-state-and-response.md)  
**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) (Section G – AI Safety & Governance)
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md)
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md)
