# Task av2-05: Retire invite + set-password (backend + frontend deletion + rewire)

> **Filename:** `task-av2-05-retire-invite-and-set-password.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 🛑 STOP — deletes an ops endpoint + rewires routes

Removes the admin invite API + the set-password page. Run on **Opus**. Only start after `av2-02`/`03`/`04` are in and the self-serve path is proven — this deletes the fallback.

---

## 📋 Task Overview

Delete the invite service/controller/route, the admin invite UI, and the `/set-password` page; remove their wiring and tests. The self-serve Google + Email-OTP flow (av2-02→04) fully replaces them.

**Program / Batch:** auth-v2 · Wave 4
**Estimated Time:** ~1.5h
**Status:** ⏳ Not started. **Model: Opus.**
**Change Type:** 🗑️ Deletion + route rewire (no migration).
**Depends on:** `av2-02`, `av2-03`, `av2-04` (self-serve must work before removing the fallback).

**Current State (to delete/rewire):**
- `frontend/app/set-password/page.tsx`
- `frontend/app/admin/doctors/invite/**` (page + `InviteDoctorClient`)
- `backend/src/services/doctor-invite-service.ts`
- `backend/src/controllers/admin-invite-controller.ts`
- `backend/src/routes/api/v1/admin-doctors.ts:22` → `router.post('/invite', inviteDoctorHandler)` + import (L14)
- `backend/src/routes/api/v1/index.ts:145` → invite wiring/comment
- Tests: `backend/tests/unit/controllers/admin-invite-controller.test.ts`, `backend/tests/unit/services/doctor-invite-service.test.ts` (+ any set-password/route tests)

**Scope Guard:**
- **DO NOT** touch `deriveFunnelStatus`/types/badges here — that's `av2-06` (kept separate so this stays a pure deletion).
- **DO NOT** remove `doctor_settings` prefill *capability* used elsewhere — only the invite-time prefill.
- **DO NOT** delete the verification review console — only the invite bits.
- Grep for stragglers (`inviteDoctor`, `set-password`, `password_set`, `inviteRedirectTo`, `InviteDoctorClient`, `/doctors/invite`) and clean links (e.g. any "Invite doctor" button/nav — though the button moves in av2-06 with the list edits; coordinate).

**Ordering note:** the admin "Invite doctor" button lives in `frontend/app/admin/doctors/page.tsx` header + `DoctorsListClient`. Remove the button/nav pointing at `/admin/doctors/invite` here (since the route is deleted); the `invited` **filter/badge** removal is `av2-06`.

---

## ✅ Task Breakdown

### 1. Frontend deletions
- [ ] 1.1 Delete `frontend/app/set-password/page.tsx`.
- [ ] 1.2 Delete `frontend/app/admin/doctors/invite/**` (page + `InviteDoctorClient`).
- [ ] 1.3 Remove the "Invite doctor" action/link pointing at `/admin/doctors/invite` (admin doctors page header). Remove any nav/menu entry.
- [ ] 1.4 Remove any `/set-password` links (e.g. the "expired" copy referencing resend).

### 2. Backend deletions + rewire
- [ ] 2.1 Delete `backend/src/services/doctor-invite-service.ts` + `backend/src/controllers/admin-invite-controller.ts`.
- [ ] 2.2 `routes/api/v1/admin-doctors.ts`: remove the `import { inviteDoctorHandler }` + `router.post('/invite', …)`; keep the rest of the admin-doctors routes intact.
- [ ] 2.3 `routes/api/v1/index.ts`: remove the invite wiring + comment (~L145).

### 3. Tests
- [ ] 3.1 Delete invite service/controller tests; remove any route test asserting `POST /admin/doctors/invite`.
- [ ] 3.2 Grep the test tree for `inviteDoctor` / `set-password` / `password_set` references and clean.

### 4. Straggler sweep
- [ ] 4.1 `rg -n "inviteDoctor|inviteRedirectTo|set-password|password_set|/doctors/invite|InviteDoctorClient"` → zero (except intentional av2-06 funnel edits, done there).

### 5. Verification
- [ ] 5.1 `cd backend && npm run type-check && npm run lint && npm test` green (invite tests removed).
- [ ] 5.2 `cd frontend && npm run lint` + `tsc --noEmit` no new errors in touched files; no dead imports/links.

---

## 📁 Files to Create/Update

```
DELETE: frontend/app/set-password/page.tsx
DELETE: frontend/app/admin/doctors/invite/**  (page + InviteDoctorClient)
DELETE: backend/src/services/doctor-invite-service.ts
DELETE: backend/src/controllers/admin-invite-controller.ts
DELETE: backend/tests/unit/controllers/admin-invite-controller.test.ts
DELETE: backend/tests/unit/services/doctor-invite-service.test.ts
EDIT:   backend/src/routes/api/v1/admin-doctors.ts   (drop import + POST /invite)
EDIT:   backend/src/routes/api/v1/index.ts           (drop invite wiring/comment)
EDIT:   frontend/app/admin/doctors/page.tsx          (drop "Invite doctor" button/link)
DO NOT TOUCH: deriveFunnelStatus/types/badges (av2-06) ; verification console
```

---

## 🧠 Design Constraints

- **Pure deletion + rewire** — no behavior change beyond removing invite/set-password.
- Keep the admin doctors **directory** + verification review fully working.
- Leave existing users' vestigial `password_set` metadata alone (OQ-3 draft: harmless).

---

## ✅ Acceptance Criteria

- [ ] Invite service/controller/route + admin invite UI + `/set-password` all removed; no dead imports/links.
- [ ] `POST /api/v1/admin/doctors/invite` no longer exists; other admin-doctors routes intact.
- [ ] Straggler grep clean; backend tests green (invite tests removed); frontend lint/tsc clean.
- [ ] Admin directory + verification review still function.

---

**Created:** 2026-07-23. **Closed:** —
