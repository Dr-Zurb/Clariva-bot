# RT-05 — Safety, emergency, webhook worker, delivery — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `safety-messages.ts`, `webhook-worker.ts`, `webhook-dm-send.ts`, `webhook-controller.ts` (high-level), `webhook-idempotency-service.ts` (referenced)  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [rt-05-safety-webhook-worker.md](../reading%20tasks/rt-05-safety-webhook-worker.md)

---

## 1. Emergency: keyword / pattern lists vs §5

**`isEmergencyUserMessage`** uses **`ALL_EMERGENCY_PATTERNS`** (EN + HI Devanagari/Latin + PA Gurmukhi/Latin) — **deterministic, no logging** of patient text (per file comment).

**Justification (§5 closed domain):**

- **Latency:** Immediate escalation without waiting on LLM when language matches obvious acute phrases.
- **Complement, not replace, LLM:** Comments in **`safety-messages.ts`** (L216–218, L147–149) state **primary** “is this emergency?” understanding uses the **intent classifier + thread context**; patterns are **acute-phrase** signals; BP crisis uses **`parsePlausibleBloodPressurePairs`** + thresholds for **post-policy** (`applyEmergencyIntentPostPolicy` in `ai-service`), not sole routing.

**Exclusions:** `emergency appointment` / `urgent appointment` are **explicitly not** emergencies (L224–225) — avoids booking-language false positives.

**Verdict:** Keyword lists are **justified** as **fast path + multilingual coverage**; **do not** replace with LLM-only for the **user-visible escalation message** (see §4 below).

---

## 2. Safety copy: templates fixed — no LLM, no invented URLs

| Export | Content |
|--------|---------|
| **`resolveSafetyMessage(kind, userText)`** | Picks **locale** via **`detectSafetyMessageLocale`** (script + Latin token heuristics, **no LLM** — L43) then returns **fixed strings** from `MEDICAL_QUERY_*` / `EMERGENCY_*` maps |
| **Emergency** | India numbers **112** / **108** + nearest hospital — **hardcoded** in all locale variants |
| **Medical** | Scheduling-assistant disclaimer + teleconsult / visit — **no** links invented by model (no URLs in these strings) |

**Verdict:** **§4.3 satisfied** — policy and emergency numbers are **not** model-generated.

---

## 3. Webhook worker & delivery (not philosophy violations — operational)

| Component | Behavior | Failure modes (notes) |
|-----------|----------|------------------------|
| **`webhook-worker.ts`** | BullMQ worker → `processWebhookJob`: payment adapters **or** Instagram comment **or** `processInstagramDmWebhook` | Job **throws** → BullMQ **retries**; **`handleWebhookJobFailed`** → dead letter after max attempts |
| **`webhook-controller.ts`** | Signature (with documented bypasses for Meta quirks), **idempotency**, queue enqueue, fast 200 | Raw body required for signature; duplicate `event_id` short-circuits |
| **`webhook-idempotency-service`** | `isWebhookProcessed` → `markWebhookProcessing` → process → `markWebhookProcessed` / failed | DB unavailable → throws (operational) |
| **`webhook-dm-send.ts`** | Per-event **send lock**, **reply throttle**, optional **recipient fallback** (2018001), `markWebhookProcessed` on skip | Throttle skip = no duplicate DM to user, still marks processed |

These are **reliability / abuse** controls, not NLU. **No change** needed for philosophy alignment.

---

## 4. Deliverable — deterministic vs LLM-assisted

| Safety / routing path | **Must stay deterministic** | **LLM-assisted today / optional** |
|------------------------|----------------------------|-----------------------------------|
| **User-visible emergency message** (`resolveSafetyMessage('emergency')`) | **Yes** — exact **112/108**, non-diagnostic wording | **Do not** generate with LLM (wrong number / jurisdiction / liability). |
| **User-visible medical deflection** (`resolveSafetyMessage('medical_query')`) | **Yes** — approved disclaimer templates | Optional future: **only** if legal approves and copy is **template-locked**, not free generation. |
| **Locale for safety copy** (`detectSafetyMessageLocale`) | **Yes** — script + keyword heuristics | LLM locale detection would add latency and failure modes; **not recommended** for this path. |
| **Acute-phrase emergency detection** (`isEmergencyUserMessage`) | **Yes** — pattern lists | **Intent classifier** already provides semantic layer; patterns = **backup + speed**. |
| **BP parsing / crisis / post-emergency stability** | **Yes** — numeric rules | Classifier + thread for **intent**; numbers for **repeat-escalation policy**. |
| **Webhook enqueue / idempotency / DM send** | **Yes** — infrastructure | N/A |

**Conclusion:** **No** safety **message body** should move to LLM generation. **Routing** already combines **classifier + deterministic** acute patterns per existing architecture. **LLM-assisted “tone polish”** for emergency is **not** recommended.

---

## 5. Planned changes (planning)

1. **Doc:** When adding emergency phrases, update **`EMERGENCY_PATTERNS_*`** + **unit tests** — same bar as philosophy header in `reason-first-triage` (bounded list, not infinite regex growth for NLU).
2. **Ops:** Dead-letter / retry alerts — existing; no philosophy task.
3. **Optional:** Link **`WEBHOOK_SECURITY.md`** from controller comment already present — no code change.

---

## 6. Handoff

| Next | Notes |
|------|--------|
| **RT-06+** | Per reading-task README |
| **Legal/compliance** | Any new country-specific emergency numbers need **product + legal** review before code |

---

## 7. Status

- [x] RT-05 read complete  
