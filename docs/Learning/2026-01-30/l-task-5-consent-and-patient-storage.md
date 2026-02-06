# Learning Topics - Consent & Patient Storage
## Task #5: Consent Before PHI Persistence, Revocation, and Audit

---

## 📚 What Are We Learning Today?

Today we're learning about **Consent & Patient Storage** — how the bot asks for consent in plain language before saving PHI, records when and how consent was given, persists collected patient data only after consent is granted, and purges pre-consent data from memory. Think of it like **the receptionist handing the patient a consent form to sign before filing their information in the cabinet** — we never put PHI in the database until the patient says "yes"; if they say "no," we throw away the sticky note and confirm nothing was saved.

We'll learn about:
1. **Consent model** – Where consent is stored (table or columns), what fields (status, timestamp, method), and how it links to patient/conversation
2. **Task 4 handoff** – Reading collected data from getCollectedData(conversationId) and clearing it with clearCollectedData after persist or deny
3. **Consent collection flow** – Plain-language prompt, parsing yes/no, persisting only after grant, clearing on deny
4. **Placeholder patient** – Updating the existing placeholder (from Task 3/4) vs creating new; reason_for_visit not on patients table
5. **Revocation and deletion** – Updating consent status to revoked, applying lifecycle (delete/anonymize) per COMPLIANCE F
6. **Persistence and audit** – Patient-service create/update, encryption, idempotency, audit metadata only
7. **Pre-consent store purge** – Why clearCollectedData must be called after persist or consent denied

---

## 🎓 Topic 1: Consent Model and Storage

### Where Consent Lives

Consent must be **stored** so we can prove when and how the user agreed. Options:

- **Consent table** – Dedicated table linked to patient_id and/or conversation_id (e.g. migration 005)
- **Consent columns on patients** – e.g. consent_status, consent_granted_at, consent_method

**Fields to store (COMPLIANCE C):**
- **Status** – granted, revoked, pending
- **Timestamp** – When consent was given (or revoked)
- **Method** – How consent was obtained (e.g. instagram_dm)
- **Optional** – Version or scope (e.g. per purpose: booking vs. marketing) if product requires it

**Think of it like:**
- **Consent record** = The signed form with date and "via Instagram DM" noted; filed with the patient folder.

### RLS and Schema

If you add a new consent table, ensure RLS policies apply (doctor can only see own patients' consent). Document the schema in DB_SCHEMA.md and use migration **005** (004 is already used for conversation/platform).

---

## 🎓 Topic 2: Task 4 Handoff (getCollectedData and clearCollectedData)

### Where the Data Comes From

Task 4 stores collected patient values (name, phone, DOB, etc.) in an **in-memory store** keyed by conversation_id. Task 5 reads from it:

- **getCollectedData(conversationId)** – Returns the partial patient data (PHI) collected so far
- Use this **only when consent is granted** to build the payload for patient-service create/update

### When to Clear the Store

After you persist to the patients table **or** after the user denies consent, you **must** call:

- **clearCollectedData(conversationId)** – Removes PHI from the in-memory store so it is not retained in process memory

**Think of it like:**
- **getCollectedData** = "Give me the sticky note for this conversation."
- **clearCollectedData** = "Throw away the sticky note" — either because we filed it (persist) or because the user said no (deny). Never leave PHI in memory longer than needed.

---

## 🎓 Topic 3: Consent Collection Flow

### When to Ask

When Task 4 has collected all **required** fields (name, phone) and the conversation state step is `consent`, the bot prompts the user for consent.

### Plain-Language Prompt

COMPLIANCE C requires **clear, plain-language** consent explanations. Include:

- **What** data is collected (name, phone, DOB, etc.)
- **Why** (e.g. for booking and care)
- **How long** it is kept (per retention policy)

**Think of it like:**
- **Prompt** = "We'll store your name, phone, and date of birth so we can book your appointment and care for you. We keep this per our privacy policy. Do you agree?"

### Parsing the Reply

**Product choice:**
- **Deterministic** – Keyword matching: "yes", "agree", "ok", "sure" → granted; "no", "revoke", "delete" → denied
- **AI-assisted** – Use AI to parse ambiguous replies; **redact** before sending to AI; **audit** the call; document the choice

### On Grant vs Deny

| User says | Action |
|-----------|--------|
| **Yes / I agree** | Record consent (status, timestamp, method); read getCollectedData; persist via patient-service; call clearCollectedData |
| **No / I decline** | Do not persist; call clearCollectedData; update conversation state (step off consent); send confirmation that no data was stored |

---

## 🎓 Topic 4: Placeholder Patient (Update vs Create)

### Why a Placeholder Exists

The webhook flow (Task 3/4) already creates a **placeholder patient** per platform user so the conversation has a patient_id. That placeholder has minimal data (e.g. platform, platform_external_id).

### After Consent

When consent is granted, you usually **update** that placeholder with the real name, phone, date_of_birth, and gender — rather than creating a second patient. Document your create-vs-update logic.

**reason_for_visit:** The patients table has **no** reason_for_visit column. Per Task 4, hold it for **appointment.notes** when booking, or omit per product choice.

**Think of it like:**
- **Placeholder** = A blank folder with just "Instagram user 12345" on the tab.
- **After consent** = We fill in the folder with the real name, phone, DOB, gender — one folder, one patient.

---

## 🎓 Topic 5: Revocation and Deletion

### What Revocation Means

The user can say "delete my data" or "revoke consent." When that happens:

- **Update consent status** to revoked
- **Record revocation timestamp**
- **Apply data lifecycle** per COMPLIANCE F: delete or anonymize patient data per retention policy

**Think of it like:**
- **Revocation** = The patient asks to shred their file. We mark the consent as revoked and apply our retention/deletion rules (soft delete, anonymize, or purge per policy).

### Audit and RLS

- **Audit** all consent events (granted, revoked) with correlationId and resource IDs — **no PHI** in the audit payload
- **RLS** and the service layer must enforce: no access to patient data after revocation where policy requires deletion

### MVP Scope

MVP may implement **consent grant + persist + audit** first. Full revocation (status update, delete/anonymize per COMPLIANCE F) can follow in the same task or a later one — document your choice.

---

## 🎓 Topic 6: Persistence and Audit

### When Persisting (After Consent)

- Use **patient-service** createPatient or updatePatient
- Ensure **encryption at rest** (Supabase) and **in transit** (HTTPS)
- **Idempotent** – If the user says "yes" twice, update once; do not create a duplicate patient

### Audit Logging (COMPLIANCE D)

- **Patient create/update** – Log with correlationId, resource type, resource id, changedFields only (no values)
- **Consent events** – Log granted/revoked with metadata only (no PHI)
- **No PII** in application logs; only IDs and standard log fields

**Think of it like:**
- **Audit** = "Patient record created for conversation X" — not "Patient John Doe created."

---

## 🎓 Topic 7: Pre-Consent Store Purge

### Why It Matters

Task 4 keeps collected PHI in memory until consent is handled. If we never clear it:

- PHI stays in process memory longer than necessary
- Risk of leakage if the process is inspected or logged

### When to Call clearCollectedData

| Scenario | Action |
|----------|--------|
| **Consent granted** | After persisting to patients table → clearCollectedData(conversationId) |
| **Consent denied** | Immediately → clearCollectedData(conversationId) |

**Think of it like:**
- **Always clear** = Whether we filed the form or shredded it, we never leave the sticky note on the desk.

---

## 📝 Summary

### Key Takeaways

1. **Consent model** – Store status, timestamp, method; link to patient/conversation; RLS applies.
2. **Task 4 handoff** – Read from getCollectedData(conversationId); after persist or deny call clearCollectedData(conversationId).
3. **Consent flow** – Plain-language prompt; parse yes/no (deterministic or AI); persist only after grant; clear on deny.
4. **Placeholder patient** – Update with real PHI after consent; reason_for_visit goes to appointment.notes at booking, not patients table.
5. **Revocation** – Update status to revoked; apply lifecycle (delete/anonymize) per COMPLIANCE F; audit all events.
6. **Persistence** – Patient-service create/update; encryption; idempotent; audit metadata only.
7. **Pre-consent purge** – clearCollectedData after persist or consent denied; never leave PHI in memory.

### Next Steps

After completing this task:

1. Task 6 (AI Integration Testing & Cleanup) will cover E2E and compliance checks.
2. Document consent schema in DB_SCHEMA.md if you add a consent table (migration 005).
3. Consider consent scope (booking vs. marketing) if the product requires it later.

### Remember

- **Consent first** – No PHI in the database until the user says yes.
- **Clear the store** – clearCollectedData after persist or deny.
- **Audit metadata only** – No PHI in logs or audit payloads.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 5: Consent & Patient Storage](../../Development/Daily-plans/2026-01-30/e-task-5-consent-and-patient-storage.md)  
**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) (Sections C, D, E, F)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md)
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md)
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md)
