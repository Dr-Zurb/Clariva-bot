# Task RBH-11: Document `message_edit` / mid fallback (operator & developer)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

**Documentation-only** task: explain why `tryResolveSenderFromMessageEdit`, Graph fetches, optional single-conversation fallback, and **`decodeMidExperimental`** exist; when operators should escalate; and pointers to Meta troubleshooting. Reduces mistaken “delete experimental code” actions and speeds incident response.

**Estimated Time:** 2–4 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — Docs only (no production code required)

**Current State:**
- ✅ **What exists:** Implementation in `instagram-dm-webhook-handler.ts` (RBH-05 split); scattered notes in daily-plan troubleshooting files.
- ✅ **What's done:** Canonical section in [WEBHOOKS.md](../../../../../../Reference/WEBHOOKS.md) (RBH-11); troubleshooting links + code paths; [RECEPTIONIST_BOT_ENGINEERING.md](../RECEPTIONIST_BOT_ENGINEERING.md) §5 + changelog.
- ⚠️ **Notes:** Do not log example mids with real PHI.

**Scope Guard:**
- Files touched: ≤ 4 markdown docs.

**Reference Documentation:**
- [WEBHOOKS.md](../../../../../../Reference/WEBHOOKS.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../RECEPTIONIST_BOT_ENGINEERING.md)
- Existing troubleshooting: [instagram-dm-reply-troubleshooting.md](../../../../February%202026/Week%203/instagram-dm-reply-troubleshooting.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Consolidate behavior description
- [x] 1.1 Summarize controller choice: `message_edit` not queued; primary path is `message` event.
- [x] 1.2 Summarize worker fallback chain (DB mid → Graph → single conversation → experimental decode).

### 2. Publish
- [x] 2.1 Add section to WEBHOOKS.md or `docs/setup/instagram-dm-reply-troubleshooting.md` (extend existing).
- [x] 2.2 Link from RECEPTIONIST_BOT_ENGINEERING.md §5 (`decodeMidExperimental` row).

### 3. Review
- [x] 3.1 Engineer sanity-check: doc matches current code paths (RBH-05: `instagram-dm-webhook-handler.ts`, `webhook-controller.ts`).

---

## 📁 Files to Create/Update

```
docs/Reference/WEBHOOKS.md
docs/Development/Daily-plans/.../instagram-dm-reply-troubleshooting.md (if exists — else create under docs/setup/)
docs/Development/.../RECEPTIONIST_BOT_ENGINEERING.md
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No patient examples; synthetic IDs only.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N
- [x] **Any PHI in logs?** N
- [x] **External API?** N

---

## ✅ Acceptance & Verification Criteria

- [x] New engineer can understand why fallbacks exist without reading 2.7k lines of worker.
- [x] Engineering doc changelog updated.

---

## 🔗 Related Tasks

- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)
- [RBH-08](./e-task-rbh-08-instagram-webhook-signature-threat-model.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
