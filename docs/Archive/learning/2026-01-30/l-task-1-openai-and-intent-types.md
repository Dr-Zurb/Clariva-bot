# Learning Topics - OpenAI Client & Intent Types
## Task #1: Setting Up Types and Client Config for the AI Receptionist

---

## 📚 What Are We Learning Today?

Today we're learning about **OpenAI Client & Intent Types** — how to define what the bot can “understand” (intents) and how to prepare the AI client configuration without putting business logic in this step. Think of it like **designing the receptionist’s menu of actions and setting up the phone system** — you define the list of actions (intents) and the wiring (client config) so the next step can safely call the AI and track cost and compliance.

We'll learn about:
1. **Intent types** – What the bot can classify (book appointment, ask question, etc.)
2. **TypeScript types for intents** – A single, type-safe list of valid intents
3. **INTENT_VALUES const** – A runtime list for validation (Zod, membership checks)
4. **OpenAI client setup** – Initializing the client from config (no raw `process.env`)
5. **Model and token config** – Why we need model name and max_tokens (cost & compliance)
6. **Why types and config first** – Separating “what exists” from “how we use it”
7. **Compliance and cost** – How this task sets up Task 2 for audit metadata and cost protection

---

## 🎓 Topic 1: What Are Intent Types?

### What is an Intent?

An **intent** is the **goal** behind a user message — what the user is trying to do.

**Think of it like:**
- **Receptionist menu** – “Book appointment”, “Ask a question”, “Check availability”
- **Phone options** – “Press 1 for appointments, 2 for questions”
- **Bot routing** – Each message is classified into one of these goals so the bot knows what to do next

### Our MVP Intents

For the Clariva receptionist bot we use:

| Intent | Meaning |
|--------|--------|
| `book_appointment` | User wants to book a visit |
| `ask_question` | User has a general question |
| `check_availability` | User wants to know when the doctor is free |
| `greeting` | User said hello / small talk |
| `cancel_appointment` | User wants to cancel (basic) |
| `unknown` | Could not classify or fallback |

**Think of it like:**
- **Known intents** = Buttons on the receptionist’s desk
- **unknown** = “I’m not sure; I’ll ask for clarification”

### Why Define Them as Types?

- **Type safety** – Code only allows these values; typos cause compile errors.
- **Single source of truth** – One place defines “what intents exist.”
- **Easier to extend** – Later we can add e.g. `reschedule_appointment` without breaking existing code.

**Think of it like:**
- **Types** = Official list of services the receptionist can handle
- **No types** = Anyone could write “book_apointment” and bugs hide until runtime

---

## 🎓 Topic 2: TypeScript Types for Intents

### What We Put in `types/ai.ts`

We define:

1. **Intent union type** – A type that is exactly one of the valid intent strings.
2. **INTENT_VALUES** – A const array of those strings for runtime checks (Zod, `includes()`, etc.).

**Think of it like:**
- **Union type** = “The answer must be one of these.”
- **INTENT_VALUES** = The same list, but as data so we can loop and validate at runtime.

### Why Both Type and Const Array?

- **Type** – For TypeScript: function parameters, return types, no invalid strings.
- **Const array** – For runtime: validate API responses, build Zod schemas, ensure “unknown” and invalid answers are handled consistently.

**Think of it like:**
- **Type** = Compile-time checklist (developer and compiler only).
- **Const array** = Run-time checklist (when the AI returns a string, we check it against this list).

### Confidence Score Type (Optional)

We can also define a type for “confidence” (e.g. a number between 0 and 1) so Task 2 can return “intent + confidence” in a consistent shape.

---

## 🎓 Topic 3: OpenAI Client Setup

### What is the OpenAI Client?

The **OpenAI client** is the library object we use to call OpenAI’s API (e.g. chat completions for intent classification). We don’t call it in this task; we **prepare** it.

**Think of it like:**
- **Client** = The phone line to OpenAI
- **This task** = Installing the line and checking the number; we don’t make the first call until Task 2

### Where Does Config Come From?

- **All config from `config/env.ts`** – We never read `process.env` in services or types.
- **OPENAI_API_KEY** – Optional at app startup; required when any code actually calls the AI (fail fast there).
- **Optional env vars** – e.g. `OPENAI_MODEL`, `OPENAI_MAX_TOKENS` so Task 2 can use a fixed model and token limit without hardcoding.

**Think of it like:**
- **config/env** = Reception’s control panel (one place for all settings)
- **Raw process.env** = Checking the fuse box in the basement from every room (messy and error-prone)

### Why Optional Key at Startup?

- Server can start without OpenAI (e.g. health checks, webhooks that don’t use AI yet).
- When a feature that needs AI runs, it checks for the key and throws a clear error if missing.

---

## 🎓 Topic 4: Model and Token Config (Cost & Compliance)

### Why Store Model Name?

- **Audit** – COMPLIANCE.md section G: we must log “metadata only” for AI calls (e.g. model, token count, redaction flag). The model name is part of that metadata.
- **Cost tracking** – EXTERNAL_SERVICES.md: we track cost per request; cost depends on which model we use.

**Think of it like:**
- **Model name** = Which “line” we used (e.g. gpt-4o-mini) for the call
- **Audit** = “We used this line at this time” (no patient details)
- **Cost** = Billing per line and per usage

### Why max_tokens?

- **Token limits** – Prevents runaway output and respects API limits.
- **Cost control** – Shorter max output = lower cost and more predictable usage.
- **Compliance** – Audit can record “max_tokens requested” as part of metadata.

**Think of it like:**
- **max_tokens** = Maximum length of the reply the AI is allowed to give
- **Without it** = Risk of long, expensive, or unsafe responses

### Where These Are Used

- **Task 1** – Add optional env (e.g. `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`) and expose them via config so the client can be created with the right model and limits.
- **Task 2** – Uses this config when calling OpenAI and when writing audit metadata (model, token count).

---

## 🎓 Topic 5: Why Types and Config First (No Business Logic Here)

### What This Task Does *Not* Do

- No calls to OpenAI.
- No intent classification logic.
- No prompts, retries, or caching.

**Think of it like:**
- **This task** = Building the receptionist’s desk and wiring the phone
- **Task 2** = Training the receptionist to answer the phone and classify requests

### What This Task *Does* Do

- Defines the **intent type** and **INTENT_VALUES**.
- Ensures the **OpenAI client** can be created from **config/env** (and optional model/max_tokens).
- Keeps **types** and **config** in one place so Task 2 can focus on service logic, cost tracking, and compliance.

### Why Separate?

- **Clear boundaries** – Types and config are “what exists”; services are “how we use it.”
- **Easier testing** – Task 2 can mock the client; we don’t mix config with business rules.
- **Compliance** – Audit and cost code in Task 2 can rely on a stable config shape (model, max_tokens).

---

## 🎓 Topic 6: Compliance and Cost (Setting Up for Task 2)

### COMPLIANCE.md Section G (AI Safety & Governance)

- **PHI** – Never send PHI to the AI without redaction; we don’t send anything in Task 1, but the client/config we set up must support Task 2’s use of a fixed model and limits.
- **Audit** – Task 2 will log “metadata only” (e.g. model, token count, redaction flag). Having model and token config in Task 1 makes that metadata accurate and consistent.
- **No raw prompts/responses with PHI** – Stored or logged; Task 1 doesn’t touch prompts, but the config we add helps Task 2 record “which model, how many tokens” without storing content.

### EXTERNAL_SERVICES.md (Cost & Token Limits)

- **Cost protection** – Per-request and daily/monthly limits; model name is needed for cost tracking.
- **Token limits** – Input and output limits; `OPENAI_MAX_TOKENS` (or equivalent) supports that.
- **Circuit breaker** – Task 2 can use the same config to implement failure and cost safeguards.

**Think of it like:**
- **Task 1** = Installing the meter and the limiter on the line
- **Task 2** = Using the line and reading the meter for every call

---

## 📝 Summary

### Key Takeaways

1. **Intent types** – We define a fixed set of intents (book_appointment, ask_question, check_availability, greeting, cancel_appointment, unknown) as a TypeScript type and a const array (`INTENT_VALUES`) for runtime validation.
2. **OpenAI client** – Initialized from `config/env` only; no raw `process.env`. Key is optional at startup; required when AI is invoked.
3. **Model and token config** – Optional `OPENAI_MODEL` and `OPENAI_MAX_TOKENS` so Task 2 can enforce token limits and record model/token metadata for cost and compliance.
4. **Types and config only** – No business logic, no API calls; this task only prepares types and client configuration.
5. **Compliance and cost** – This setup allows Task 2 to satisfy COMPLIANCE.md section G (audit metadata) and EXTERNAL_SERVICES.md (cost protection, token limits).
6. **Extendable** – Intent set is MVP-aligned; we can add intents (e.g. reschedule_appointment) later without breaking existing code.

### Next Steps

After completing this task:
1. Implement intent detection service (Task 2) using these types and client config.
2. Add retry, fallback, PHI redaction, and audit logging in Task 2.
3. Use INTENT_VALUES for runtime validation (Zod or membership check) in Task 2.

### Remember

- **Config only from env** – Use `config/env.ts`; never `process.env` elsewhere.
- **Types are pure** – No Express, no business logic in `types/ai.ts`.
- **Prepare, don’t call** – Task 1 prepares; Task 2 calls the AI and handles compliance and cost.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 1: OpenAI Client & Intent Types](../../Work/Daily-plans/2026-01-30/e-task-1-openai-and-intent-types.md)  
**Reference Documentation:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) (Section G – AI Safety & Governance)
- [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md)
