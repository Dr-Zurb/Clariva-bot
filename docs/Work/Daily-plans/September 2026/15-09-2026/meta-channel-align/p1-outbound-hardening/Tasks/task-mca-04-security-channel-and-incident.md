# Task mca-04: Security channel + Meta incident step

## 📋 Task Overview

Meet Platform Terms §6.a.ii (labeled vulnerability reporting) and §6.b (notify Meta when Platform Data is in an incident).

**Program / Phase:** meta-channel-align · Phase 1 (outbound-hardening)  
**Batch:** [`plan-p1-meta-channel-align-outbound-hardening-batch.md`](../plan-p1-meta-channel-align-outbound-hardening-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md`](./EXECUTION-ORDER-p1-meta-channel-align-outbound-hardening.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-15

**Change Type:**
- [x] **Update existing** + small public file

**Current State:**
- ✅ Footer already shows `founder@haloaid.com`
- ❌ No `/.well-known/security.txt`
- ❌ Footer does not label a security-report path
- ❌ `SECURITY.md` incident list has no Meta notify step

**Scope Guard:**
- Expected files touched: ≤ 5
- Inbox stays `founder@haloaid.com` (already read). Do not invent a new mailbox.

---

## ✅ Task Breakdown

### 1. Public channel
- [ ] 1.1 Add `/.well-known/security.txt` on the marketing host
- [ ] 1.2 Add a “Report a security issue” line on the marketing footer and legal footer

### 2. Runbook
- [ ] 2.1 Add one step to the security-incident procedure: if Instagram tokens or IG-derived data are in scope, notify Meta via the developer incident form and record when

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] `https://haloaid.com/.well-known/security.txt` will exist after frontend deploy
- [ ] `SECURITY.md` names the Meta incident form
- [ ] Footer has a labeled security-report link

---

**Last Updated:** 2026-09-15
