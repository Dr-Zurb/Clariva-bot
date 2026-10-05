# Task mca-06: Persist automated-messaging opt-out

## 📋 Task Overview

Add a per-conversation (or equivalent existing patient/conversation row) flag that automated send paths can check. Doctor-scoped. No PHI in the column itself — a timestamp is enough.

**Program / Phase:** meta-channel-align · Phase 2 (patient-opt-out)  
**Status:** ✅ **DONE** 2026-09-16  
**Estimated Time:** 1.5 hours

**Change Type:**
- [x] **Update existing** + new migration

**Current State:**
- ✅ Conversations are doctor-scoped; RLS exists
- ❌ No messaging-suppression flag
- ⚠️ `consent_status = revoked` is a different concept — do not overload it

**Scope Guard:**
- One new nullable timestamp (or equivalent). Do not invent a second identity table.
- Read every prior migration before writing a new one.

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y → **RLS verified?** Y — existing conversations policies cover the new column; no new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — flag lives on `conversations`; delete/CASCADE already purges the row. Meta doctor-deletion callback is unchanged (patient erasure stays account-deletion-worker).

---

## ✅ Acceptance

- [x] Automated send code can read the flag without a new API
- [x] Disconnect / data-deletion still purges the row
- [x] Migration is additive (`239_conversation_automated_messaging_opt_out.sql`). Founder unlocked Auto 16 Sep 2026. **Applied** on the app DB 16 Sep 2026.

**Last Updated:** 2026-09-16
