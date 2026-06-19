> **Migrated:** 2026-06-18 from `docs/Work/deferred/` → [`capture/features/frontend-platform/`](.)

# Deferred: Frontend date/number-locale hydration sweep

**Status:** ✅ **RESOLVED 2026-05-07**

**Date deferred:** 2026-04-28
**Date resolved:** 2026-05-07

**Resolution trigger:** A second hydration overlay surfaced on `/dashboard/appointments` (Server: `"6 May 2026, 9:00 am"` vs Client: `"May 6, 2026, 9:00 AM"`), exactly the failure mode the original 2026-04-28 entry warned about. Sweep was promoted from deferred to in-flight.

**What landed:**

- New helper module `frontend/lib/format-date.ts` with pinned-locale formatters (`formatDate`, `formatTime`, `formatDateTime`, `formatDateMedium`, `formatDateShort`, `formatDateISO`, `formatCurrencyINR`, `formatNumber`). Dates pin to `en-GB`, currency to `en-IN`, and the ISO bucket helper to `en-CA`.
- Repo-wide sweep: every `toLocaleString(undefined,...)` / `toLocaleDateString(undefined,...)` / `toLocaleTimeString(undefined,...)` / `toLocaleString([], ...)` / parameter-less `.toLocaleString()` call in `frontend/` was migrated to the helper. The single remaining direct usage of `Intl` is inside `frontend/lib/format-date.ts` itself.
- `formatDateISO` replaced the bespoke `toLocaleDateString("en-CA")` calls in `useTodaysAppointments.ts`, keeping the timezone-local YYYY-MM-DD bucket-comparison semantics.
- `formatCurrencyINR` replaced the inline `₹${main.toLocaleString(...)}` patterns in `app/book/page.tsx` and `lib/practice-setup-card.ts`.

**Files touched in the sweep (33):**

```
frontend/lib/format-date.ts                                                   (new)
frontend/components/appointments/AppointmentsListWithFilters.tsx              (the 2026-05-07 trigger)
frontend/components/appointments/AddAppointmentModal.tsx
frontend/components/dashboard/DoctorDashboardEventFeed.tsx
frontend/components/dashboard/cockpit/NowNextCard.tsx
frontend/components/dashboard/cockpit/useTodaysAppointments.ts
frontend/components/consultation/PreviousPrescriptions.tsx
frontend/components/consultation/PrescriptionForm.tsx
frontend/components/consultation/RecordingReplayPlayer.tsx
frontend/components/consultation/TextConsultRoom.tsx
frontend/components/consultation/SnapshotReviewPanel.tsx
frontend/components/consultation/FollowUpInlineBooker.tsx
frontend/components/consultation/cockpit/ReadyCard.tsx
frontend/components/consultation/cockpit/PreviousRxPopover.tsx
frontend/components/consultation/cockpit/CockpitHeader.tsx
frontend/components/opd/PatientVisitSession.tsx
frontend/components/opd/EarlyInviteBanner.tsx
frontend/components/patients/PatientCockpit.tsx
frontend/components/patients/PatientCockpitRail.tsx
frontend/components/patients/PatientConversationsList.tsx
frontend/components/patients/PatientPrescriptions.tsx
frontend/components/patients/PatientVisitsTimeline.tsx
frontend/components/patients/PatientsListWithFilters.tsx          (consolidated 2026-04-28 hot-fix into helper)
frontend/components/ehr/VitalTrendModal.tsx
frontend/components/ehr/sections/ProblemListSection.tsx
frontend/components/ehr/TemplatePicker.tsx
frontend/components/practice-setup/MyServiceCatalogTemplatesModal.tsx
frontend/components/service-reviews/ServiceReviewsInbox.tsx
frontend/components/settings/InstagramConnect.tsx
frontend/app/dashboard/settings/practice-setup/availability/page.tsx
frontend/app/r/[id]/page.tsx
frontend/app/c/voice/[sessionId]/page.tsx
frontend/app/c/text/[sessionId]/page.tsx
frontend/app/data-deletion/DataDeletionClient.tsx
frontend/app/book/page.tsx
frontend/lib/practice-setup-card.ts
```

**Verification:**

- `rg "toLocale(Date|Time)?String"` and `rg "\.toLocaleString"` over `frontend/` return only references inside `frontend/lib/format-date.ts` (and a couple of explanatory comments).
- `npx tsc --noEmit` does not surface any new errors in the touched files. The pre-existing TS errors in `OpdQueueStrip`, `PatientRxView`, `ConsultationCockpit`, etc. are unrelated to this sweep.
- Dev server (`npm run dev`) recompiles without warnings after the changes.

**Follow-up (still open, low-priority):**

- An ESLint rule banning bare `toLocale(Date|Time)?String` outside `frontend/lib/format-date.ts` (proposed in §4 of the original doc) is **not** in place yet. Add when next touching `eslint.config.*`. Until then, the inline JSDoc on the helper plus the search-friendly comment block is the only guard against regressions.
- Manual cross-locale verification (`Accept-Language: en-US`, `en-GB`, `en-IN`, `hi-IN`) was **not** performed end-to-end on every surface. The hydration-error symptoms only surface on the *initial* SSR-vs-CSR diff, so any future regression should yell loudly in dev mode at the next contributor.

---

## Why this kept happening (kept for history)

`toLocaleDateString(undefined, ...)` / `toLocaleString(undefined, ...)` / `toLocaleTimeString(undefined, ...)` (and the parameter-less `.toLocaleString()`) all resolve to the **runtime's default locale**, which differs between:

- **Server render (Node):** typically `en-US` or whatever ICU was built with on the host
- **Client hydrate (browser):** the visitor's browser locale (en-GB, en-IN, en-US, hi-IN, …)

The moment the two disagree on a single character (`"6 May 2026, 9:00 am"` vs `"May 6, 2026, 9:00 AM"`), React 18 throws a hydration error and the page becomes unstable.

We picked **option 1: pin a locale** (`en-GB` for dates, `en-IN` for currency) project-wide and fenced it behind a single helper module so future call sites can't drift.

---

## Original hot-fix (2026-04-28)

`frontend/components/patients/PatientsListWithFilters.tsx` was the first surface that surfaced this bug. It was hot-fixed inline by pinning `formatDate()` to `en-GB`. As of the 2026-05-07 sweep, that inline pin has been replaced with a call to `formatDate` from `frontend/lib/format-date.ts` — the helper takes over the byte-identical-output guarantee.

---

## Related

- Trigger that prompted the original defer: `frontend/components/patients/PatientsListWithFilters.tsx` (2026-04-28)
- Trigger that promoted from deferred → resolved: `frontend/components/appointments/AppointmentsListWithFilters.tsx` (2026-05-07)
- Next.js docs on hydration mismatches: <https://nextjs.org/docs/messages/react-hydration-error>

---

**Last updated:** 2026-05-07
