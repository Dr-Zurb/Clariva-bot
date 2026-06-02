# Task 4: Simplify Regex to Fast-Path Only
## 2026-03-26 — AI Receptionist Initiative

---

## 📋 Task Overview

After AI-first extraction is in place, simplify the regex layer to handle only clearly structured input: phone (10 digits), email, "male"/"female", age (standalone number), and labeled formats ("Name: X", "Age: 25"). Remove complex heuristics that try to guess name/reason from natural language—let AI handle those.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-15

**Change Type:**
- [x] **Update existing** — extract-patient-fields.ts, collection-service; follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** extractFieldsFromMessage with many heuristics (name from first part, reason from "he is X", etc.); isSymptomLike, isRelationshipOrGenderLike guards
- ❌ **What's missing:** Clear separation of "fast path" (regex) vs "AI path"; simplified regex that doesn't over-extract
- ⚠️ **Notes:** Regex currently tries to do too much; causes wrong extractions that block AI

**Scope Guard:**
- Expected files touched: ≤ 3 (extract-patient-fields.ts, collection-service)

**Reference Documentation:**
- [AI_RECEPTIONIST_PLAN.md](../../AI_RECEPTIONIST_PLAN.md)
- [extract-patient-fields.ts](../../../backend/src/utils/extract-patient-fields.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define Fast-Path Patterns

- [x] 1.1 Keep regex for: phone, email, gender, age (labeled/60Y/standalone), age+gender combo, labeled name, labeled reason
- [x] 1.2 Skip when fastPathOnly: name firstPart/beforeNumber heuristics; reason iHave/heIs/getChecked heuristics
- [x] 1.3 Rationale: Labeled formats unambiguous; natural language → AI

### 2. Implement Fast-Path-Only Mode

- [x] 2.1 Add extractFieldsFromMessage(text, options?: { fastPathOnly?: boolean })
  - [x] 2.1.1 fastPathOnly=true: only phone, email, gender, age, labeled name/reason
  - [x] 2.1.2 fastPathOnly=false (default): full heuristics for backward compat
- [x] 2.2 In validateAndApplyExtracted, use fastPathOnly: useAIFirst when AI-first triggered

### 3. Merge Guards

- [x] 3.1 Keep isSymptomLike, isRelationshipOrGenderLike in collection-service (safety net for AI output)

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: "Name: Ramesh Masih, Age: 56, 9814861579" → regex extracts all
- [ ] 4.3 Manual test: "he is my father he is male" (only gender missing) → fastPathOnly, AI extracts gender
- [ ] 4.4 No regression: "male" → gender; "9814861579" → phone

---

## 📁 Files to Create/Update

```
backend/src/
├── utils/
│   └── extract-patient-fields.ts  (UPDATED - fast-path-only mode, remove heuristics)
└── services/
    └── collection-service.ts      (UPDATED - call with fastPathOnly when AI-first)
```

**Existing Code Status:**
- ✅ `extract-patient-fields.ts` — Full regex + heuristics
- ✅ `collection-service.ts` — validateAndApplyExtracted, merge guards

---

## 🧠 Design Constraints

- Backward compatibility during rollout (flag)
- Merge guards in collection-service must remain (safety for bad AI output)
- No PHI in logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – extraction logic)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (N for this task)

---

## ✅ Acceptance & Verification Criteria

- [ ] Fast-path regex: phone, email, gender, labeled name/age/reason only
- [ ] Natural language name/reason → AI handles
- [ ] No over-extraction from "he is my father he is male"
- [ ] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI-first extraction](./ai-receptionist-e-task-1-ai-first-extraction.md) — Prerequisite
- [e-task-2: Conversation-aware extraction](./ai-receptionist-e-task-2-conversation-aware-extraction.md) — Prerequisite

---

**Last Updated:** 2026-03-26  
**Reference:** [TASK_TEMPLATE.md](../../TASK_TEMPLATE.md)
