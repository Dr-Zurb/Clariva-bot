# Task RBH-17: Receptionist architecture — LLM for language, system for facts & actions

## 2026-03-28 — Align product with industry-style “AI receptionist” patterns

---

## 📋 Task Overview

**Problem (product clarity):** The team wants **open-ended, multilingual conversation** without maintaining **limitless keyword lists**, while still guaranteeing **correct fees, links, and booking state** from **our database**. Today the codebase **mixes** three approaches: (1) **full LLM** replies with injected `DoctorContext`, (2) **regex/keyword** gates (`isPricingInquiryMessage`, locale heuristics), (3) **deterministic** blocks (`buildFeeQuoteDm`, safety messages). This is correct in spirit but **easy to drift**—e.g. mid-booking pricing relied on prompt injection until recently; keywords will always lag human language.

**Goal:** Document and implement a **clear contract**:

| Layer | Responsibility | Technology |
|-------|----------------|------------|
| **Understand** | What the user wants (book, fee, medical, emergency, small talk…) | LLM **classification** (+ optional rules for safety/latency) |
| **Decide** | Which **server actions** run (emit fee block, emit slot link, advance `state.step`, deflect medical…) | **Code** — explicit state machine + policies (RBH-14 style) |
| **Say** | Tone, language, empathy, bridging sentences | LLM **generation** *or* templates — but **must not invent** DB facts |

**Guiding sentence:** *The model interprets; the platform executes; facts come from `doctor_settings` and APIs, never from model weights.*

**Estimated Time:** 1–2 days (doc + acceptance criteria); follow-ups RBH-18–20  
**Status:** ✅ **DONE** (2026-03-28) — docs + DM inventory + webhook comments  
**Change Type:**
- [x] **Update existing** — docs, small refactors toward the pattern
- [ ] **New module** — optional “action composer” (see RBH-19)

**Reference (current code):**
- `backend/src/services/ai-service.ts` — `classifyIntent`, `generateResponse`, prompts
- `backend/src/workers/instagram-dm-webhook-handler.ts` — branch ordering, `DoctorContext`, fee path
- `docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md` — principle #2 already states this; keep in sync

---

## ✅ Task Breakdown

### 1. Architecture doc (this task delivers clarity for juniors)
- [x] 1.1 Add subsection **“Three-layer receptionist”** to `RECEPTIONIST_BOT_CONVERSATION_RULES.md` (Understand → Decide → Say) with one sequence diagram (mermaid optional).
- [x] 1.2 List **anti-patterns** explicitly:
  - ❌ Encoding every Hinglish variant as regex (unbounded).
  - ❌ Letting the model **paraphrase** fee tables without a **server-rendered** canonical block.
  - ✅ Classifier returns **intent**; optional **topics** (`pricing`, `booking`, …) from model JSON (RBH-18).
- [x] 1.3 Define **when keywords are still OK:** emergency regex (speed), simple greeting (cost), HIPAA/safety fixed copy.

### 2. Code alignment checklist (incremental; no big-bang)
- [x] 2.1 Inventory webhook branches: label each as **Understand** (AI only), **Decide** (code), **Say** (AI vs template). → `docs/Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`
- [x] 2.2 Ensure **every user-visible fact** (fee ₹, link URL, slot list) has a **single code path** that produces it (even if AI wraps the text). → “Canonical sources” table in same doc
- [x] 2.3 Add code comment block at top of `instagram-dm-webhook-handler.ts` main decision tree: *“Order: safety → paused → step gates → intent policies → actions.”*

### 3. Verification
- [x] 3.1 Review with team: “We are not trying to beat ChatGPT on breadth; we beat it on **correct clinic data**.” → principle note in CONVERSATION_RULES
- [x] 3.2 Link this task from `Tasks/README.md`. *(already indexed as RBH-17)*

---

## 📁 Files to Create/Update

```
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
backend/src/workers/instagram-dm-webhook-handler.ts (header comment / inventory)
docs/.../Tasks/README.md
```

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (doc-first); code comments only unless 2.x expands
- [x] **PHI in logs?** N
- [x] **External API?** N for this doc slice

---

## 🔗 Related Tasks

- **RBH-18** — classifier JSON topics (replace keyword growth)
- **RBH-19** — hybrid reply composer (server blocks + AI phrasing)
- **RBH-14** — context-aware routing (already aligns with “Decide” layer)

---

**Last Updated:** 2026-03-28
