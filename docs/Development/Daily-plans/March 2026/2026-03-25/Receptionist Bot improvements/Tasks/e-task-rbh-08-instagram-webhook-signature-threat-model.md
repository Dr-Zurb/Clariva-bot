# Task RBH-08: Instagram webhook signature bypass — audit & threat model doc

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

**Document and periodically validate** the controller behavior where Instagram **message** or **comment** webhooks may be processed when `x-hub-signature-256` verification fails (documented tradeoff for Meta quirks). Produce a short **threat model**, operator checklist, and re-test procedure. Optionally tighten behavior if Meta API stabilizes—only as a **separate** sub-task if evidence supports it.

**Estimated Time:** 4–8 hours (research + doc + staging tests)  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-28  

**Change Type:**
- [ ] **New feature** (if code changes) — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)
- [x] **Update existing** (docs-first; JSDoc cross-link in controller)

**Current State:**
- ✅ **`docs/Reference/WEBHOOK_SECURITY.md`** — branch matrix, threat model, mitigations, staging checklist, re-audit triggers.
- ✅ **`WEBHOOKS.md`** — links + Instagram exception note; **`RECEPTIONIST_BOT_ENGINEERING.md`** §6 updated; controller JSDoc `@see`.
- ⚠️ **Notes:** Any code tightening must preserve DM/comment delivery or provide alternative verification approved by product/security.

**Scope Guard:**
- Doc deliverable mandatory; code changes optional and small (≤ 2 files) if justified.

**Reference Documentation:**
- [WEBHOOKS.md](../../../Reference/WEBHOOKS.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Code audit
- [x] 1.1 List every branch that returns 200 without signature verification vs throws 401.
- [x] 1.2 Map each to payload type (`message`, `comment`, read receipt, etc.).

### 2. Threat model (document)
- [x] 2.1 Abuse scenarios: spoofed payload feasibility given Meta IDs and Graph API requirements.
- [x] 2.2 Data exposure: what attacker gains vs normal webhook.
- [x] 2.3 Mitigations: idempotency, token binding, rate limits (`webhookLimiter`).

### 3. Operational playbook
- [x] 3.1 Staging: verify signature pass/fail with real subscription; capture expected logs (no PHI).
- [x] 3.2 Add "When to re-audit" trigger (Meta API changelog, incident).

### 4. Publish
- [x] 4.1 New or extended section in WEBHOOKS.md or `docs/Reference/WEBHOOK_SECURITY.md` (project choice).
- [x] 4.2 Link from engineering doc §6.

---

## 📁 Files to Create/Update

```
docs/Reference/WEBHOOK_SECURITY.md (new)
docs/Reference/WEBHOOKS.md (Instagram exception + See Also)
docs/Development/.../RECEPTIONIST_BOT_ENGINEERING.md §6
backend/src/controllers/webhook-controller.ts (@see WEBHOOK_SECURITY.md)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Documentation must not include live secrets or verify tokens.
- Risk acceptance must be explicit for production.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N (doc + JSDoc cross-link only)
- [x] **Any PHI in logs?** N
- [x] **External API?** Staging validation recommended per WEBHOOK_SECURITY.md §5

---

## ✅ Acceptance & Verification Criteria

- [x] Security/ops stakeholders can answer why bypass exists and when to revisit.
- [x] Linked from **WEBHOOKS.md** See Also (canonical index for webhook docs).

---

## 🔗 Related Tasks

- [RBH-01](./e-task-rbh-01-webhook-observability.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
