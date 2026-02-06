# Learning Topics - Patient Information Collection Flow
## Task #4: Field-by-Field Collection, Validation, and Pre-Consent Handling

---

## 📚 What Are We Learning Today?

Today we're learning about the **Patient Information Collection Flow** — how the bot collects name, phone, date of birth, gender, and reason for visit in a structured way, validates each field with Zod, and keeps that data **out of the database** until the user gives consent (Task 5). Think of it like **the receptionist asking one question at a time, writing answers on a temporary sticky note (memory or Redis), and only filing the form in the cabinet (patients table) after the patient signs consent** — we never put PHI in the conversation record or in logs.

We'll learn about:
1. **Field definitions** – Required vs optional (name, phone, DOB, gender, reason_for_visit) and how they map to the patients table
2. **Zod validation** – Schemas in utils/validation.ts, E.164-like phone format, and where validation runs (collection/flow layer, not HTTP controller in webhook path)
3. **Pre-consent storage** – Why conversations.metadata must NOT hold PHI; in-memory vs Redis for collected values until Task 5
4. **Collection flow logic** – Order of questions, next-question decision, partial updates, and handling interruptions
5. **Integration** – How response generation (Task 3) asks for the next field; handoff to consent step (Task 5) when required fields are complete
6. **Compliance and logging** – No PII/PHI in logs; audit metadata only (field name, status; never values)
7. **reason_for_visit** – patients table has no column; options (appointment.notes vs migration)

---

## 🎓 Topic 1: Field Definitions (Required vs Optional)

### What We Collect

The flow collects patient information for booking and context:

| Field | Required? | Notes |
|-------|-----------|--------|
| **name** | Yes | Min/max length per Zod schema |
| **phone** | Yes | E.164-like format per RECIPES |
| **date_of_birth** | Optional | Date string; product may skip |
| **gender** | Optional | Product choice |
| **reason_for_visit** | Product choice | patients table has no column; see Topic 7 |

**Think of it like:**
- **Required** = The receptionist must have name and phone before they can file the form or call back.
- **Optional** = DOB and gender improve care but aren’t mandatory for MVP; reason_for_visit gives context for the visit.

### Where This Is Defined

Define required vs optional in code and in task docs so Task 5 (consent and persist) knows which fields must be present before showing the consent step. Document any product override (e.g. reason_for_visit required in some markets).

---

## 🎓 Topic 2: Zod Validation (Schemas and Where They Run)

### Why Zod?

STANDARDS.md and RECIPES R-VALIDATION-001 require **Zod for all external input**. The webhook path has no HTTP controller, so validation runs in the **collection/flow layer** (e.g. in the service or worker that parses the user message and updates the temporary store).

### Where Schemas Live

- **utils/validation.ts** – Define one schema per field (phone, name, date_of_birth, gender, reason_for_visit).
- **Phone** – E.164-like per RECIPES: `z.string().regex(/^\+?[1-9]\d{1,14}$/)`.
- **Name** – Min/max length (e.g. 1–200 chars).
- **DOB** – Date string or date object; reject invalid dates.
- **reason_for_visit** – Length limit; no PHI in logs.

**Think of it like:**
- **Zod** = The receptionist’s checklist: “Is this a valid phone? Is the name not empty?” Invalid input is rejected with a clear prompt (e.g. “Please provide a valid phone number”) and never written to the temporary store.

### Validation Flow

1. Parse the user message for the current field (e.g. “My name is John” or “John” when we asked for name).
2. Run the value through the Zod schema for that field.
3. On **success** – Update memory/Redis and metadata (collectedFields); move to next field.
4. On **failure** – Return a clear, user-facing prompt; do not store the value; optionally track retries and offer “skip for now” after N failures (product choice).

Use **ValidationError** (ERROR_CATALOG) for validation failures so responses are consistent (e.g. 400-style handling if ever exposed via API).

---

## 🎓 Topic 3: Where Collected Values Live (No PHI in Metadata)

### The Rule: Consent Before PHI in the Database

COMPLIANCE.md Section C says **consent must be obtained before collecting/storing PHI**. If we put name, phone, or DOB into **conversations.metadata** and persist it to the DB, we’re storing PHI before consent — **not allowed**.

### What Goes Where

| Location | What it holds | PHI? |
|----------|----------------|------|
| **conversations.metadata** | Only **which** fields are collected and **step** (e.g. `collectedFields: ['name','phone']`, `step: 'collecting_dob'`) | No |
| **Memory or Redis** (keyed by conversation_id) | The **actual values** (name, phone, DOB, etc.) | Yes (pre-consent) |

**Think of it like:**
- **Metadata** = The receptionist’s checklist: “Name ✓, Phone ✓, DOB next.” No names or numbers on the checklist.
- **Memory/Redis** = The temporary sticky note with the real answers; it’s thrown away or moved to the formal file only after consent (Task 5).

### Memory vs Redis

- **In-memory (per process)** – Simple; works for single-worker. Lost on restart; acceptable because we only need it until consent or session end.
- **Redis (keyed by conversation_id, TTL e.g. 24h)** – Needed for multi-worker or restart-safe sessions. Set TTL and document purge when consent is denied (Task 5).

Document which option you use so Task 5 knows where to read collected values when building the patient record after consent.

---

## 🎓 Topic 4: Collection Flow Logic

### Order of Collection

Recommended order (document if you differ):

1. **name** (required)  
2. **phone** (required)  
3. **date_of_birth** (optional)  
4. **gender** (optional)  
5. **reason_for_visit** (product choice)

The flow decides the “next question” from current state: e.g. if name is missing → ask name; if name is present and phone is missing → ask phone.

### Partial Information and One Field at a Time

- Collect **one field per turn** (or per confirmed value).
- Update the temporary store (memory/Redis) and **metadata** (collectedFields only) incrementally.
- Do not persist to the **patients** table in this task; that happens only after consent in Task 5.

**Think of it like:**
- **One field at a time** = Receptionist asks “What’s your name?” → writes it on the sticky note → then “What’s your phone?” → writes that → then “Date of birth?” (optional).

### Interruptions

The user may change intent mid-collection (e.g. “Actually, I just have a question”). **Product choice:**

- **(A)** Preserve partial collection and resume when intent returns to book_appointment.  
- **(B)** Reset collection when intent changes.

Document and implement one; ensure state and temporary store are updated consistently (e.g. clear or retain Redis key by product rule).

---

## 🎓 Topic 5: Integration with Response Generation and Consent Handoff

### Task 3 (Response Generation)

When conversation state indicates “collecting patient info”:

- Response generation (Task 3) should ask for the **next missing field** or confirm the value just provided.
- Prompt text must **not** log or persist PHI; use only metadata (e.g. “asking for phone”) in logs.
- Feed the model with redacted history and current step so it can say things like “What’s the best phone number to reach you?” or “Got it, and your date of birth?”

**Think of it like:**
- **State** = “We have name, need phone.”  
- **Response** = Bot says “What’s the best phone number to reach you?” — no PHI in the log line.

### Task 5 (Consent and Persist)

When **all required fields** are collected:

- Transition to the **consent step** (handled in Task 5).
- Do **not** persist to the patients table in Task 4; Task 5 persists only after consent is granted.
- Task 5 reads collected values from memory/Redis, shows consent UX, and on “yes” creates/updates the patient and clears or retains the temporary store per product policy.

**Think of it like:**
- **Task 4** = Fill the sticky note and pass it to the front desk.
- **Task 5** = “Sign here to file this”; only after signing do we put it in the cabinet (patients table).

---

## 🎓 Topic 6: Compliance and Logging

### No PII/PHI in Logs

- Log only **correlationId**, resource IDs (e.g. conversation_id), and **metadata** such as “field collected” or “validation_failed” for a field name.
- Never log the actual value of name, phone, DOB, or reason_for_visit.

### Audit (COMPLIANCE.md Section D)

- Log a “patient_data_collection” (or similar) event with **metadata only**: e.g. `{ fieldName: 'phone', status: 'collected' }` or `{ fieldName: 'phone', status: 'validation_failed' }`.
- Do **not** include field values in audit payloads.

**Think of it like:**
- **Logs** = “We collected phone for conversation 123” — not “We collected 555-1234.”

### Data Classification

Treat name, phone, DOB, and reason_for_visit as **PHI/administrative** per COMPLIANCE.md Section B; same handling for redaction, retention, and access as other PHI.

---

## 🎓 Topic 7: reason_for_visit and the patients Table

The **patients** table (001_initial_schema) has **name**, **phone**, **date_of_birth**, **gender** — but **no reason_for_visit** column.

Options:

- **(A)** Collect reason_for_visit for context and store it on **appointment.notes** when booking the appointment.  
- **(B)** Add **patients.reason_for_visit** via a migration if the product wants it on the patient record.

Document which option you implement. Either way, validate and store the value in the temporary store (memory/Redis) in Task 4; Task 5 (and booking flow) decide where it is persisted.

---

## 📝 Summary

### Key Takeaways

1. **Fields** – Name and phone required; DOB, gender, reason_for_visit optional or product-dependent. reason_for_visit has no patients column today; use appointment.notes or a migration.
2. **Zod** – All field values validated in utils/validation.ts; phone E.164-like; validation in collection/flow layer (no HTTP controller in webhook path). Use ValidationError for failures.
3. **No PHI in metadata** – conversations.metadata holds only collectedFields and step. Collected values live in **memory or Redis** (keyed by conversation_id, TTL) until Task 5.
4. **Collection flow** – Order: name → phone → DOB → gender → reason_for_visit. One field at a time; next-question from state; optional max retries or “skip for now” per product.
5. **Interruptions** – Product choice: preserve and resume, or reset collection; document and implement one.
6. **Integration** – Task 3 asks for next field or confirms value; when all required fields are in, transition to consent step (Task 5). No persistence to patients in Task 4.
7. **Compliance** – No PII/PHI in logs; audit metadata only (field name, status; no values). Treat collected fields as PHI.

### Next Steps

After completing this task:

1. Task 5 implements consent UX and persistence to the patients table (and optionally appointment.notes for reason_for_visit).
2. If you use Redis for pre-consent values, set TTL and document purge on consent denied.
3. Add unit tests for Zod schemas and flow logic (next field, partial update, validation failure); type-check and lint.

### Remember

- **Metadata** = What we’ve collected (field names + step), not the values.  
- **Memory/Redis** = Where the values live until consent.  
- **Consent** = Gate for putting anything into the patients table (Task 5).

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 4: Patient Information Collection Flow](../../Development/Daily-plans/2026-01-30/e-task-4-patient-collection-flow.md)  
**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [RECIPES.md](../../Reference/RECIPES.md) (R-VALIDATION-001, phone regex)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) (Sections B, C, D)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md)
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md) (ValidationError)
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)
