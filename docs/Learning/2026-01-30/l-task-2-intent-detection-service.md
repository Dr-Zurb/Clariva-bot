# Learning Topics - Intent Detection Service
## Task #2: Classifying User Messages Safely with OpenAI

---

## 📚 What Are We Learning Today?

Today we're learning about the **Intent Detection Service** — how to classify user message text into one of our defined intents (book appointment, ask question, etc.) using OpenAI, while keeping PHI out of prompts and logs, auditing only metadata, and handling failures safely. Think of it like **the receptionist reading the note from the front desk and deciding which button to press** — we use AI to choose the right “button” (intent) without ever writing the patient’s name or details on the note we send out.

We'll learn about:
1. **Intent detection** – From message text to intent + confidence
2. **PHI redaction** – Why and how we strip PHI before sending anything to OpenAI
3. **Audit metadata only** – What we log (model, tokens, redaction flag) and what we never log (raw prompt/response)
4. **Retry and fallback** – Exponential backoff for transient errors; fallback to `unknown` on failure
5. **Response validation** – Using INTENT_VALUES to ensure we only return valid intents
6. **Service boundaries** – Framework-agnostic service; AppError; no PII in logs
7. **Testing focus** – Mock OpenAI; test intent mapping, fallback, and redaction

---

## 🎓 Topic 1: What the Intent Detection Service Does

### Role of the Service

The **intent detection service** takes a user’s message text and returns:
- **Intent** – One of our defined values (e.g. `book_appointment`, `ask_question`, `unknown`)
- **Confidence** – How sure the model is (e.g. 0–1), so the conversation flow can ask for clarification when needed

**Think of it like:**
- **Input** = The note on the front desk (“I’d like to book a visit for next week”)
- **Output** = Which button the receptionist presses (“book_appointment”) and how sure they are (e.g. 0.95)

### Where It Fits

- **Task 1** gave us intent types and the OpenAI client.
- **This task** implements the single place that turns “message text” into “intent + confidence.”
- **Task 3** will use that result to drive conversation state and responses.

**Think of it like:**
- **Task 1** = Installing the phone and the list of buttons
- **Task 2** = The receptionist reading the note and choosing a button (using AI)
- **Task 3** = What the receptionist says and does next based on that button

### Framework-Agnostic

The service must not depend on Express or any web framework. Controllers call the service; the service only does “classify this text” and throws AppError on unrecoverable failures.

**Think of it like:**
- **Service** = The receptionist’s decision (pure logic)
- **Controller** = The desk that receives the request and returns the HTTP response

---

## 🎓 Topic 2: PHI Redaction Before Sending to OpenAI

### Why Redact?

**COMPLIANCE.md Section G** says we must not send PHI to the AI in a way that could be stored or logged by the provider. So we **redact** (remove or mask) PHI from the text **before** we send it to OpenAI.

**Think of it like:**
- **Raw message** = “Hi, I’m John Smith, I’d like to book for my son Tom.”
- **Redacted text** = “Hi, I’m [NAME], I’d like to book for my [RELATION].”  
  We send only the redacted version to OpenAI; we never send “John Smith” or “Tom.”

### What Counts as PHI Here?

For this task we treat as PHI anything that could identify a person or that is health-related in a way we don’t want to send externally: names, DOB, phone, email, identifiers, specific clinical details. The exact redaction rules can live in a small util or inline; the important part is that **whatever we send to OpenAI must not contain PHI**.

**Think of it like:**
- **Redaction** = Blacking out the patient’s name and personal details on the copy we send out
- **Original** = Kept only in our system for business logic; never sent to the AI

### When We Redact

- **Always** before calling the OpenAI API.
- Redaction is applied to the **copy** of the text we use for the prompt; we do not log or persist that full prompt (we only log metadata).

---

## 🎓 Topic 3: Audit Metadata Only (No Raw Prompt/Response)

### What We Must Log (Metadata Only)

Per **COMPLIANCE.md Section G**, for every AI call we audit **only**:
- **correlationId** – So we can trace the request
- **model** – Which model we used
- **Token usage** – If available from the API (input/output tokens)
- **Redaction flag** – That we redacted PHI before sending
- **Action/resource** – e.g. “AI classification” so we can query AI usage

**Think of it like:**
- **Audit log** = “We used model X, used N tokens, and redacted PHI” — no patient names, no message content, no AI reply text.

### What We Must Never Log or Persist

- **Raw user message** (may contain PHI)
- **Raw AI response** (may contain or echo PHI)
- **Full prompt or full completion** when they could contain PHI

**Think of it like:**
- **Allowed** = “Call to OpenAI, model gpt-5.2, 50 tokens, redacted”
- **Not allowed** = “User said: …” or “AI said: …” when that content could be PHI

### Using the Existing Audit Logger

We use the existing `audit-logger` and add an action/resource type for “AI classification” so every intent-detection call is recorded with metadata only.

---

## 🎓 Topic 4: Retry and Fallback

### Retry (Exponential Backoff)

OpenAI (or the network) can fail temporarily. We **retry** with **exponential backoff** (e.g. wait 1s, then 2s, then 4s) for a small number of attempts so we don’t overload the API and we give transient errors a chance to resolve.

**Think of it like:**
- **Transient error** = The line was busy; we hang up and try again in a few seconds.
- **Exponential backoff** = We wait a bit longer after each failed try.

### Fallback to Unknown

If we never get a valid response (e.g. API key missing, timeout, or all retries failed), we **do not** throw to the user with an error message that might leak internals. We **return** `intent: 'unknown'` (and e.g. `confidence: 0`) and **log** the failure internally. The conversation flow (Task 3) can then ask the user to rephrase or try again.

**Think of it like:**
- **Failure** = The receptionist couldn’t read the note (line down, or note missing).
- **Fallback** = They press the “I’m not sure” button (unknown) and log the problem; they don’t tell the patient “our AI crashed.”

### When OPENAI_API_KEY Is Missing

If the key is not set, we **do not** call OpenAI. We return fallback (e.g. `unknown`) immediately so the app can run without AI (e.g. health checks, webhooks that don’t use classification yet).

---

## 🎓 Topic 5: Response Validation (INTENT_VALUES)

### Why Validate?

The AI might return a string that isn’t one of our intents (typo, different format, or model drift). We **validate** the response against **INTENT_VALUES** (from Task 1). If it doesn’t match, we treat it as **unknown**.

**Think of it like:**
- **INTENT_VALUES** = The list of buttons on the desk.
- **AI says** “book_apointment” (typo) → we don’t have that button → we use “unknown.”

### How We Use It

- Parse the model output (structured output or parsed text).
- Check membership in `INTENT_VALUES` (or equivalent type-safe check).
- If valid → return that intent and confidence.
- If invalid → return `unknown` and a low confidence (e.g. 0).

---

## 🎓 Topic 6: Service Boundaries and Errors

### Service Throws AppError

The service does **not** return `{ error: '...' }`. On unrecoverable failures (e.g. misconfiguration after retries), it **throws** an **AppError** (e.g. ValidationError, InternalError) as per **STANDARDS.md**. Controllers wrap the call in **asyncHandler** and the global error middleware turns AppError into the right HTTP response.

**Think of it like:**
- **Service** = Either returns intent + confidence, or throws.
- **Controller** = Catches and maps to HTTP (e.g. 500) without exposing PHI or internals.

### No PII in Logs

We never log raw user message or AI response. We log only safe metadata (e.g. “intent classification failed”, correlationId, redaction flag). **STANDARDS.md** and **COMPLIANCE.md** both require no PII in logs.

**Think of it like:**
- **Log** = “Classification failed for request abc-123”
- **Not log** = “User said: John Smith wants to…”

### No asyncHandler in the Service

**asyncHandler** belongs in **controllers**. The service is plain async functions; it throws on error and returns a result on success.

---

## 🎓 Topic 7: Optional Caching and Prompt Design

### Optional Response Caching

We may cache the result for **identical redacted input** (e.g. same redacted text → same intent + confidence) to reduce cost and latency. If we add caching (e.g. in-memory or Redis), we document where and how (e.g. key = hash of redacted text; TTL if needed). Cache is **per redacted input**, never per raw PHI.

**Think of it like:**
- **Cache key** = “Hi, I’m [NAME], I’d like to book” (redacted)
- **Cache value** = { intent: 'book_appointment', confidence: 0.9 }
- **Raw message** is never the key.

### Medical-Context Prompt (Receptionist Only)

The prompt we send to OpenAI must be for **receptionist intents only** — booking, questions, availability, greeting, cancel. We do **not** ask the model to diagnose or give clinical advice. **COMPLIANCE.md Section G**: AI is assistive (intent classification) only.

**Think of it like:**
- **Prompt** = “Classify this as one of: book appointment, ask question, check availability, greeting, cancel, unknown.”
- **Not** = “What is wrong with this patient?” or “Suggest a treatment.”

---

## 🎓 Topic 8: Testing Focus

### What to Test

- **Intent mapping** – For a given (redacted) input, we get the expected intent (mock OpenAI).
- **Fallback** – When OpenAI is unavailable or returns invalid data, we get `unknown` and no PHI in logs.
- **Retry behavior** – Transient failure then success (e.g. mock fails once, then returns; we get intent).
- **PHI redaction** – The text we send to the mock does not contain PHI (e.g. assert on the argument passed to OpenAI).
- **Validation** – Invalid intent string from mock → we return `unknown`.

### What We Don’t Test Here

- We don’t test the real OpenAI API in unit tests (use mocks).
- We don’t test conversation flow (that’s Task 3).

---

## 📝 Summary

### Key Takeaways

1. **Intent detection service** – Single place that takes message text and returns intent + confidence using OpenAI, with correlationId for audit.
2. **PHI redaction** – We redact PHI from text before sending anything to OpenAI; we never send or log raw user message or AI response with PHI.
3. **Audit metadata only** – We log correlationId, model, token usage, redaction flag; we never log or persist raw prompt/response when they could contain PHI.
4. **Retry and fallback** – Exponential backoff for transient errors; on failure or missing API key we return `unknown` and log safely.
5. **Response validation** – We validate the AI response against INTENT_VALUES; invalid → `unknown`.
6. **Service boundaries** – Framework-agnostic; throws AppError; no asyncHandler in service; no PII in logs.
7. **Prompt design** – Receptionist intents only; no diagnosis or clinical advice (COMPLIANCE.md G).
8. **Tests** – Mock OpenAI; cover intent mapping, fallback, retry, redaction, and validation.

### Next Steps

After completing this task:
1. Use the intent + confidence in Task 3 (conversation state and response generation).
2. Ensure all AI calls in production go through this service so audit and redaction are consistent.

### Remember

- **Redact first** – Nothing with PHI goes to OpenAI or into logs.
- **Metadata only** – Audit “that we called AI and how,” not “what we sent or received.”
- **Fallback gracefully** – Return `unknown` on failure; don’t expose errors or PHI to the user.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 2: Intent Detection Service](../../Development/Daily-plans/2026-01-30/e-task-2-intent-detection-service.md)  
**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) (Section G – AI Safety & Governance)
- [RECIPES.md](../../Reference/RECIPES.md) (retry, caching, fallback if documented)
