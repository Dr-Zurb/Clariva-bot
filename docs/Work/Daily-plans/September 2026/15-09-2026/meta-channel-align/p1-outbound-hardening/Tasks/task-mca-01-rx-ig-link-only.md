# Task mca-01: Rx IG is link-only

## 📋 Task Overview

Instagram DMs must not carry prescription PDFs, attachment images, or a medicine text summary. The existing HMAC share URL is the IG body. Email keeps the PDF and the summary.

**Program / Phase:** meta-channel-align · Phase 1 (outbound-hardening)  
**Batch:** [`plan-p1-meta-channel-align-outbound-hardening-batch.md`](../plan-p1-meta-channel-align-outbound-hardening-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md`](./EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-15

**Change Type:**
- [x] **Update existing** — change the Instagram branch of `sendPrescriptionToPatient`

**Current State:**
- ✅ `sendPrescriptionToPatient` already mints a share URL and emails the PDF
- ❌ Instagram still attaches images + PDF and falls back to the medicine text summary
- ⚠️ If the share URL cannot be minted, IG must skip — do not dump clinical text as fallback

**Scope Guard:**
- Expected files touched: ≤ 4 (`notification-service.ts`, its tests, maybe `EXTERNAL_SERVICES.md`)
- Do not change email delivery, share-token TTL, or the ready-ping helper

---

## ✅ Task Breakdown

### 1. Instagram branch
- [ ] 1.1 Remove image and file attachments from the Instagram send path
- [ ] 1.2 Send only generic “prescription is ready” copy plus the share URL
- [ ] 1.3 If no share URL, skip Instagram (email still sends)

### 2. Tests
- [ ] 2.1 Cover: share URL present → text only, no image/file helpers
- [ ] 2.2 Cover: no share URL → Instagram not sent; email still can send
- [ ] 2.3 Message body must not include a medicine name from the fixture

### 3. Docs
- [ ] 3.1 Note the channel split on the Meta audit / external-services pointer if the live behavior changed

---

## 📁 Files to Create/Update

- ⚠️ `backend/src/services/notification-service.ts`
- ❌ focused unit test for the Instagram branch
- ⚠️ `docs/Reference/engineering/operations/EXTERNAL_SERVICES.md` — only if the documented send shape changes

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs (COMPLIANCE.md)
- Do not read `process.env` outside `config/env.ts`
- Email channel stays independent (existing all-settled pattern)
- Doctor usage increment still runs when any channel succeeds

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (no schema)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — existing Instagram send, *less* payload
  - [x] **Consent + redaction confirmed?** Y — patient already booked; we send less
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Instagram send helpers for images/files are not called from this path
- [ ] IG text has no medicine list
- [ ] Email still attaches the PDF when generation succeeds
- [ ] Focused tests pass

---

**Last Updated:** 2026-09-15  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
