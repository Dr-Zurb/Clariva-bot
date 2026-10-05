# Task mca-07: Detect stop + confirm in-thread

## 📋 Task Overview

Recognize “stop messaging me” (English / Hindi / Hinglish) as a messaging opt-out, distinct from data-consent revoke. Confirm in-thread. Re-opt-in only on an explicit start-again phrase.

**Program / Phase:** meta-channel-align · Phase 2 (patient-opt-out)  
**Status:** ✅ **DONE** 2026-09-16  
**Depends on:** `mca-06`

**Current State:**
- ✅ `revokeConsentGate` already outranks the rest of the DM chain — pattern to copy, not reuse
- ❌ Classifier has no stop-messaging intent
- ⚠️ Recording-disclosure “no opt-out” copy in `dm-copy.ts` is a different legal object — do not conflate

**Scope Guard:**
- Emergency gate still wins for 112/108
- Do not stop the doctor’s manual dashboard send

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y (writes the flag from `mca-06`)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — existing classifier path
  - [ ] **Consent + redaction confirmed?** (same as current DM classify)
- [x] **Retention / deletion impact?** N beyond the flag

---

## ✅ Acceptance

- [x] Stop phrases set the flag and acknowledge
- [x] Mere inbound after stop does not re-enable automation
- [x] Explicit start-again clears the flag

**Last Updated:** 2026-09-16
