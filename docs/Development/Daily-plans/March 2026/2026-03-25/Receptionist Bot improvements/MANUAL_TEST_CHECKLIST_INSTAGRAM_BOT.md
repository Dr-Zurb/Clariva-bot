# Manual test checklist — Instagram receptionist bot (pre-launch)

**Purpose:** Exercise real-world DM (and comment) flows before market launch. Tick **Pass / Fail / N/A**, note build/date and environment (staging URL, `clariva-bot.vercel.app`, etc.).

**Related engineering map:** [RECEPTIONIST_BOT_ENGINEERING.md](./RECEPTIONIST_BOT_ENGINEERING.md)  
**Webhook / safety:** [WEBHOOKS.md](../../../../Reference/WEBHOOKS.md), [WEBHOOK_SECURITY.md](../../../../Reference/WEBHOOK_SECURITY.md)  
**Open product-quality tasks (failures here):** [Tasks/README.md](./Tasks/README.md) — **RBH-12** (latency) through **RBH-16** (UTF-8).

---

## 0. Preconditions

| # | Check | Pass/Fail |
|---|--------|-----------|
| 0.1 | Doctor account has Instagram connected; token healthy (dashboard **Instagram** section / RBH-10 if enabled). | |
| 0.2 | Webhook subscribed (`messages`, `message_edits`); test DM reaches worker (logs: correlation id, no duplicate reply loops). | |
| 0.3 | Test patient uses a **real IG user** (not the page). Know doctor `doctor_id` / practice for log lookup. | |
| 0.4 | Migrations applied through latest (slot steps, pause, IG health, etc. per your env). | |
| 0.5 | **PHI:** Do not paste real patient names/phones into tickets; use aliases in this sheet. | |

---

## 1. Language & tone (DM)

**Code intent:** AI replies use `RESPONSE_SYSTEM_PROMPT_BASE` in [`backend/src/services/ai-service.ts`](../../../../../../backend/src/services/ai-service.ts) — *“Respond in the SAME language…”* for **English, Hindi, Hinglish, transliterated Hindi**. Intent classifier is also multi-language. **RBH-15:** `medical_query` / `emergency` **fixed safety** copy uses [`resolveSafetyMessage`](../../../../../../backend/src/utils/safety-messages.ts) (en / hi / pa, script + Roman).

| # | Scenario | Example input (illustrative) | Expected | Pass/Fail |
|---|----------|------------------------------|----------|-----------|
| 1.1 | English booking | “Hi, I want to book an appointment” | Warm EN reply; moves toward collect / book flow. | |
| 1.2 | Hinglish | “Kya aap kal free ho? Book karna hai” | Reply in similar Hinglish/Hindi style, not forced English. | |
| 1.3 | Hindi script | “नमस्ते, अपॉइंटमेंट चाहिए” | Hindi or bilingual natural reply. | |
| 1.4 | Mixed follow-up | Start in English → user switches to Hinglish | Bot follows **last** user language/style where AI generates text. | |
| 1.5 | Regional language (e.g. Tamil/Telugu) **if you support** | Short booking ask | Document: graceful EN fallback vs model success (not explicitly in prompt today). | |
| 1.6 | RBH-16 deterministic copy | Booking opener / pause / queue link DMs | No **mojibake** (`â€` sequences); punctuation looks normal (ASCII `-` / ` - `). | |
[✅] converstation in all languages
---

## 2. Intents & routing (DM)

| # | Scenario | Input | Expected | Pass/Fail |
|---|----------|-------|----------|-----------|
| 2.1 | Simple greeting only | “hi”, “namaste” | Greeting path; **no** immediate demand for 5 fields. |✅|
| 2.2 | Book self | “I want to book for myself” | `book_appointment` → collection / slot flow. |✅|
| 2.3 | Book for someone else | “Book for my mother” | Relation capture; flow for other person. | |
| 2.4 | Multi-person | “Book for me and my brother” | Multi-person parsing; correct relation handling. | |
| 2.5 | Check availability | “Any slots tomorrow?” | Appropriate reply + slot/link behaviour per implementation. | |
| 2.6 | General question / fees (RBH-13) | “What are your fees?” / “How much is consultation?” | Structured reply from `consultation_types` (or safe fallback); **no** immediate “share full name…” intake unless user asks to book. | |
| 2.6b | Fee then clarify (RBH-13 + RBH-14) | After fee reply: “general consultation please” / “video consult” | Intent stays **pricing/q&A** (`ask_question` or fee path); **no** forced intake until explicit book. Classifier uses **prior turns**. | |
| 2.7a | Medical query (normal) RBH-15 | “ਮੇਨੂੰ ਤਿੰਨ ਦਿਨ ਤੋਂ ਬੁਖ਼ਾਰ ਹੈ” / “Menu tin din to bukhar hai” | **No** diagnosis; deflection in **Punjabi (script or Roman)** — same assistant/doctor/clinic meaning. | |
| 2.7b | Medical query (normal) RBH-15 | “ਮੇਰੇ ਨਾਲ ਪੇਟ ਦਰਦ ਹੋ ਰਿਹਾ ਹੈ” / Latin transliteration | Same; **localized** medical_query template. | |
| 2.7c | Medical query (normal) RBH-15 | “ਮੀਨੂੰ ਖੰਘ ਤੇ ਜੁਕਾਮ ਹੋ ਗਿਆ” | Same; **localized** medical_query template. | |
| 2.7d | Emergency RBH-15 | “ਮੇਰੀ ਛਾਤੀ ਵਿੱਚ ਦਰਦ ਤੇ ਸਾਸ ਨਹੀਂ ਆ ਰਹੀ” / “Meri chhati vich dard…” | **Emergency** message in **user language**; includes **112/108** (India); no booking upsell. | |
| 2.7e | Emergency RBH-15 | “ਕਿਸੇ ਨੇ ਜ਼ਹਿਰ ਖਾ ਲਿਆ” / “Kise ne zahar kha lia” | Same; pattern wins over `medical_query`. | |
| 2.7f | Emergency RBH-15 | “ਬੱਚਾ ਬੇਹੋਸ਼ ਹੋ ਗਿਆ” (“Baccha behosh ho giya”) | Same. | |
| 2.8 | Emergency phrase | “Chest pain and can’t breathe” | **EN** emergency template + **112/108**; no booking upsell. | |
| 2.8b | Non-emergency booking | “I need an **emergency appointment**” / “urgent appointment” | **Not** treated as medical emergency keywords → normal booking / classify flow. | |
| 2.9 | Payment / status | “I paid, is it confirmed?” | `check_appointment_status` or equivalent. | |
| 2.10 | Revoke consent | “Delete my data” / “revoke consent” | Consent revocation path per policy. | |
| 2.11 | Ambiguous / spam | Random emoji chain / empty | Polite deflection or `unknown`; no crash. | |

---

## 3. Collection & booking (DM)

| # | Scenario | Steps | Expected | Pass/Fail |
|---|--------|-------|----------|-----------|
| 3.1 | `collecting_all` | User sends all fields in one message | All captured; confirm or next step; **no** parrot full list unnecessarily. | |
| 3.2 | Partial send | Name + phone only | Ask **missing** only; acknowledge what was received. | |
| 3.3 | Book for someone else + details | Relation + patient details | Reason/name align with “other” person. | |
| 3.4 | Confirm details | User says “yes” / corrects one field | Confirm or patch single field; no restart. | |
| 3.5 | Consent | Accept / deny | Grant → proceed; deny → handled per `consent-service`. | |
| 3.6 | Slot link | After consent | Real slot URL (no placeholder `[link]` in user-visible text). | |
| 3.7 | Slot pick | User sends “1” / “2” | Correct slot resolution; appointment created or next step. | |
| 3.8 | Duplicate mid / edit | Send message, edit message in IG | No double booking; idempotency / message_edit policy per [WEBHOOKS.md](../../../../Reference/WEBHOOKS.md) RBH-11. | |

---

## 4. Cancel & reschedule (DM)

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| 4.1 | Cancel — has upcoming | Lists or choice; confirms cancel. | |
| 4.2 | Cancel — none | Clear message. | |
| 4.3 | Reschedule — choice + slot | Link or steps work; state correct. | |
| 4.4 | Edge: multiple appointments | Merged list / right target selection. | |

---

## 5. Payments & post-booking (DM)

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| 5.1 | Payment link sent → user pays | Status updates; no duplicate payment spam. | |
| 5.2 | User says “paid” before webhook | Sensible reply; eventual consistency. | |
| 5.3 | Acknowledgment after confirmation | Short ack handled; no infinite loop. | |

---

## 6. Receptionist pause & human handoff (RBH-09)

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| 6.1 | Pause **off** | Normal automation. | |
| 6.2 | Pause **on** (dashboard) | Single handoff message; **no** full booking AI loop (except `revoke_consent` if applicable). | |
| 6.3 | Custom pause message | Custom text appears if configured. | |
| 6.4 | Comment + pause | High-intent public reply behaviour per spec; lead/email unchanged. | |

---

## 7. Instagram comments (if product enabled)

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| 7.1 | High-intent: “How to book?” | DM template + public reply per policy. | |
| 7.2 | Medical symptom in comment | `medical_query` handling; no careless diagnosis. | |
| 7.3 | Spam / joke | No reply or skip per classifier. | |
| 7.4 | Doctor/page echo | No reply loop. | |

---

## 8. Reliability & abuse

| # | Scenario | Expected | Pass/Fail |
|---|----------|----------|-----------|
| 8.1 | Rapid-fire 5 messages | Locks/throttle; one coherent thread; no duplicate sends. | |
| 8.2 | Very long message | Truncation / sensible handling; no 500. | |
| 8.3 | Special characters / links | Sanitization; no XSS in stored content. | |
| 8.4 | Webhook retry (same event) | Idempotent; user sees one logical outcome. | |

---

## 9. Observability (ops)

| # | Check | Pass/Fail |
|---|--------|-----------|
| 9.1 | Logs: **no** full raw body / message text in production for PHI review. | |
| 9.2 | `correlationId` traceable from webhook → worker → send. | |
| 9.3 | Failed sends visible (metrics / logs) without message content. | |

---

## 10. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Tester | | | |
| Product | | | |

**Build / commit:** _______________  
**Environment:** _______________

---

**Last updated:** 2026-03-28
