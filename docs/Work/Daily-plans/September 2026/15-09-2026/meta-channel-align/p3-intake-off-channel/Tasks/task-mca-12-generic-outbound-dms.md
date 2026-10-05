# Task mca-12: Generic outbound DMs

## 📋 Task Overview

Automated Instagram messages must not carry first name or MRN. Time + join/booking link stays (appointment management). Email subjects may still use a first name.

**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Batch:** [`plan-p3-meta-channel-align-intake-off-channel-batch.md`](../plan-p3-meta-channel-align-intake-off-channel-batch.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-16

**Change Type:**
- [x] **Update existing**

**Current State:**
- ✅ Rx IG is already link-only (`mca-01`)
- ⚠️ Previsit fan-out still passes `patientName` into the shared DM body
- ⚠️ Payment / desk confirmations still pass `patientMrn` into the IG body

**Scope Guard:**
- Expected files touched: ≤ 3
- Do not change booking-page intake (`mca-10`)
- Do not strip appointment time or join URLs

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — existing send, less payload
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance

- [x] Previsit IG/SMS body has no first name
- [x] Payment and desk confirmation IG bodies have no MRN
- [x] Focused tests pass

**Last Updated:** 2026-09-16
