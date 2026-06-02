# e-task-7: Known Issues & Follow-up Items
## February 2026

Follow-up items from [e-task-7-bug-fixes-and-reference-compliance.md](./e-task-7-bug-fixes-and-reference-compliance.md). None are release blockers.

---

## 1.2 Medium / low bugs and known issues

| Item | Severity | Notes | Follow-up |
|------|----------|--------|-----------|
| Patients list page | Low | Placeholder only ("Patient list and detail will be added in Task 5"). No API list yet. | Implement when adding patient list feature; add loading/error and role="alert" per DoD. |
| Manual triage (booking, payment, notifications) | Low | E2E covers login → dashboard → appointments. No formal manual pass on booking/payment/notification flows. | Optional: run manual checklist from e2e-runbook; log any bugs as tickets. |

---

## 1.3 Error handling consistency

**Status: Verified.**

- **Backend:** Controllers use `asyncHandler`; services throw `AppError` subclasses (`NotFoundError`, `ValidationError`, etc.); error middleware returns canonical `errorResponse` shape. No manual `res.status().json()` for errors except rate-limit/timeout.
- **Frontend:** Data pages (appointments list, appointment detail, patient detail) use try/catch, user-friendly messages, and `role="alert"` + `aria-live="polite"` on error blocks. Login and signup use `role="alert"` for form errors. No PHI in error copy.

---

## 2.1 Performance

**Status: Quick pass done; no critical issues.**

- **Backend:** `listAppointmentsForDoctor` and similar list endpoints use a single query (no N+1). No obvious N+1 in appointment or patient services.
- **Indexes:** Not audited. Supabase/Postgres typically index primary keys and common filters; add indexes if slow queries appear (e.g. by `doctor_id`, `appointment_date`).
- **Client bundles:** Next.js code-splits by route. No ad-hoc audit of bundle size; defer unless metrics show issues.

**Deferred:** Formal index review, bundle analysis, and query profiling.

---

## 2.2 UX polish (loading, errors, a11y)

**Status: Verified for existing flows.**

- **Loading:** `appointments/loading.tsx` and `appointments/[id]/loading.tsx` (and patients detail) use skeleton/aria-busy. Dashboard and patients list are static or placeholder.
- **Errors:** See 1.3; user-facing errors use role="alert" and friendly copy.
- **Accessibility:** Nav has `aria-label="Main navigation"`, `aria-current="page"` on active link, and `focus:ring` on sidebar links. Form inputs have labels; error regions have `aria-live="polite"`.

**Deferred:** Full DEFINITION_OF_DONE_FRONTEND pass (e.g. contrast audit, focus order) when adding new features.

---

**Last updated:** 2026-02-07
