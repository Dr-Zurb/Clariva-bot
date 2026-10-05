# Task mca-03: Confirm outbound DM copy

## 📋 Task Overview

Confirm that automated Instagram/Facebook *notification* copy does not echo reason-for-visit or other clinical content. Fix leftovers. Do not redesign the reminder ladder.

**Program / Phase:** meta-channel-align · Phase 1 (outbound-hardening)  
**Batch:** [`plan-p1-meta-channel-align-outbound-hardening-batch.md`](../plan-p1-meta-channel-align-outbound-hardening-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md`](./EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-15

**Change Type:**
- [x] **Update existing** — only if a leftover is found

**Current State (inspected 2026-09-15):**
- ✅ Payment / desk confirmations: time + MRN, no reason-for-visit
- ✅ Previsit ladder: first name + time + join URL
- ✅ Consult-link and Rx ready-ping: generic + URL
- ⚠️ Rx content send is `mca-01` — this task verifies the rest

**Scope Guard:**
- Expected files touched: ≤ 3
- Do not move reminders off Instagram (counsel / P3)

---

## ✅ Task Breakdown

### 1. Sweep
- [ ] 1.1 Read notification builders that fan out to Instagram
- [ ] 1.2 If any builder echoes reason-for-visit or medicines, strip that from the IG body only
- [ ] 1.3 Record “no change needed” in this file if the sweep is clean

### 2. Pin
- [ ] 2.1 Add or extend a test so a future medicine/reason string cannot silently return to the Rx IG body

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N (copy-only unless a leftover forces a send-path edit)
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [x] No automated IG notification builder includes reason-for-visit
- [x] Findings written in Notes

## 📝 Notes

Sweep 2026-09-15: payment / desk confirmations, previsit ladder, consult-link, and Rx ready-ping do **not** echo reason-for-visit. The leftover was the Rx **content** send (medicine summary + PDF/image attachments) — closed in `mca-01`. No further copy edits. Reminders still include first name + time; that is P3 / counsel, not this phase.

---

**Last Updated:** 2026-09-15
