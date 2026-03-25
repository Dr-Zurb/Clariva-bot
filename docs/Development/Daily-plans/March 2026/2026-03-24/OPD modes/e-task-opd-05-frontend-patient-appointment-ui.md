# Task OPD-05: Frontend — patient appointment UI (§6.4)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Implement **patient-facing** UI per [opd-systems-plan.md](./opd-systems-plan.md) **§6.4**: **appointments list** cards (mode hint), **appointment detail** with **state machine** (slot vs queue), **banners** (delay, early invite), **primary CTA** (Join / Wait), **polling** of snapshot API ([e-task-opd-04](./e-task-opd-04-patient-session-apis.md)).

**Estimated Time:** 12–20 hours  
**Status:** ✅ **DONE** (MVP)

**Change Type:**
- [x] **New feature** — new components + wiring to `frontend/lib/api.ts`

**Current State:**
- ✅ `frontend/app/book/*` — public booking flow.
- ✅ `frontend/app/dashboard/appointments/*` — **doctor** views.
- ✅ **`/my-visit?token=`** — patient “my visit” session UI (consultation token = same as `/consult/join`).
- ⚠️ Multi-appointment **list** without auth is not implemented (token identifies one visit); future authenticated `/patient/appointments` can reuse components.

**Scope Guard:** ≤ 15 files; reuse design system / Tailwind patterns from dashboard.

**Reference Documentation:**
- [DEFINITION_OF_DONE_FRONTEND.md](../../../../../Reference/DEFINITION_OF_DONE_FRONTEND.md)
- [opd-systems-plan.md](./opd-systems-plan.md) §6.1–6.4

---

## ✅ Task Breakdown (Hierarchical)

### 1. IA decision

- [x] 1.1 Confirm **URL strategy:** **`/my-visit?token=<consultation_token>`** (signed token; same as video join).
- [x] 1.2 Map **states** from §6.4 tables to React **view components** (one parent + `switch(status)` via conditions).

### 2. Shared components

- [x] 2.1 `OpdModeBadge` — slot / queue.
- [x] 2.2 `DelayBanner`, `EarlyInviteBanner` — props from snapshot.
- [x] 2.3 `PrimaryCta` — join video → `/consult/join?token=`.

### 3. Slot-specific UI

- [x] 2.4 Show **slot start–end**; link to policy copy (“what my slot means”) stub.

### 4. Queue-specific UI

- [x] 2.5 Show **token**, **ahead**, **ETA** / range; “estimate improving” cold-start copy.

### 5. Data fetching

- [x] 5.1 `useOpdSnapshot(token)` hook with **polling** (`suggestedPollSeconds`; stops on fetch error).
- [x] 5.2 Error / expired token UI — message + **Try again** (`refetch`).

### 6. Verification

- [ ] 6.1 Lighthouse / a11y: primary button focusable (Tailwind `focus:ring` on CTA).
- [ ] 6.2 Manual: slot vs queue mock snapshots.

---

## 📁 Files to Create/Update

```
frontend/lib/api.ts
frontend/app/... (new routes TBD)
frontend/components/opd/... (new)
frontend/hooks/useOpdSnapshot.ts (new)
```

**Implemented:**
- `frontend/types/opd-session.ts`
- `frontend/lib/api.ts` — `getOpdSessionSnapshot`, `acceptOpdEarlyJoin`, `declineOpdEarlyJoin`
- `frontend/hooks/useOpdSnapshot.ts`
- `frontend/components/opd/OpdModeBadge.tsx`, `DelayBanner.tsx`, `EarlyInviteBanner.tsx`, `PrimaryCta.tsx`, `OpdAppointmentCard.tsx`, `PatientVisitSession.tsx`
- `frontend/app/my-visit/page.tsx`

---

## 🌍 Global Safety Gate

- [x] **No PHI** in client logs (no token logging).
- [x] **Token in URL** — avoid logging full URL in analytics (do not `console.log` token).

---

## 🔗 Related Tasks

- Depends on: [e-task-opd-04](./e-task-opd-04-patient-session-apis.md)

---

**Last Updated:** 2026-03-24
