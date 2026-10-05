# Task mca-08: Automated fan-out honors the flag

## 📋 Task Overview

Every automated Instagram/Facebook send skips a conversation (or patient) that has opted out: previsit ladder, prescription content + ready-ping, payment confirmation, comment private replies. Fail closed if the flag cannot be read.

**Program / Phase:** meta-channel-align · Phase 2 (patient-opt-out)  
**Status:** ✅ **DONE** 2026-09-16  
**Depends on:** `mca-06`

**Scope Guard:**
- One shared check, not a copy-paste boolean in each sender
- Manual doctor send stays open

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y (read only)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N (skip before send)
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance

- [x] Each listed automated path is covered by a test
- [x] Unreadable flag → skip send, log reason without PII

**Last Updated:** 2026-09-16
