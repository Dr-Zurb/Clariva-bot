# Task mca-02: Vary public comment replies

## 📋 Task Overview

Public comment replies must not be one identical string. Prefix the already-fetched `@username` when present and rotate a small set of English-only variants. Same builders for Instagram and Facebook handlers.

**Program / Phase:** meta-channel-align · Phase 1 (outbound-hardening)  
**Batch:** [`plan-p1-meta-channel-align-outbound-hardening-batch.md`](../plan-p1-meta-channel-align-outbound-hardening-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md`](./EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md)  
**Estimated Time:** 0.75 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-15

**Change Type:**
- [x] **Update existing**

**Current State:**
- ✅ `COMMENT_PUBLIC_REPLY_TEXT` is one lang-23 English exception
- ✅ Handlers already resolve `commenterUsername` before reply
- ❌ Reply text is posted verbatim on every high-intent comment

**Scope Guard:**
- Expected files touched: ≤ 6 (copy helper, two handlers, lang-23/24 tests, characterization test)
- Keep the English-only exception (lang-23). Do not localize public replies.

---

## ✅ Task Breakdown

### 1. Copy
- [ ] 1.1 Add 2–3 English variants; keep the current sentence as one of them
- [ ] 1.2 Prefix `@username` when a safe handle exists
- [ ] 1.3 Same comment id must produce the same variant (retry-stable)

### 2. Handlers
- [ ] 2.1 Instagram and Facebook public-reply calls use the builder
- [ ] 2.2 Do not log the username

### 3. Tests
- [ ] 3.1 Builder unit coverage (prefix + rotation + missing username)
- [ ] 3.2 Update lang-23 / lang-24 / characterization expectations

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Public replies stay English-only (lang-23 exception list)
- No PHI in logs
- Do not change private-reply copy or the daily cap

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — existing comment reply, same API, different text
  - [x] **Consent + redaction confirmed?** Y — reply to their comment
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Two different comment ids can produce different variant bodies
- [ ] A username, when present, is prefixed
- [ ] lang-23/24 still pass

---

**Last Updated:** 2026-09-15
