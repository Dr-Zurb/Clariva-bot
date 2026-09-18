# doctor-verification-v1 — licensed-doctor gate

> **Status:** ✅ Complete 2026-07-22 (Opus) — spine + VER-05 go-live gate. Owner dogfood remaining.
> **One-line intent:** Prove a signed-up account is a **real, licensed doctor** before they go patient-facing — via a verification record, document uploads, admin review, and a go-live gate.
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · batch #4 (Gate 2: Verify — system).

---

## ⚠️ Why Opus (agent-contract escalation triggers, all present)

- **New migration** (verification table).
- **RLS / `auth.uid()`** policies on that table.
- **Supabase Storage** bucket for sensitive documents (registration cert, ID) — private + RLS + audit.
- **Admin role / authz** — a privileged reviewer path that doesn't exist today.
- **PHI / sensitive personal data** handling (DPDP) — see `REGULATORY_AND_LAUNCH_STRATEGY.md`.

**Do a design pass with Opus before touching code.** This plan is the design frame, not an execution green-light.

## Context that shapes the design

- A "doctor" **is** the `auth.users` row (no `doctors` table) → verification table keys on `auth.users(id)` (DF-D2).
- Go-live chokepoint = **Instagram connect + first patient booking**; `doctor_settings.instagram_receptionist_paused` already exists as the enforcement lever (DF-D4).
- Until this ships, the bar is enforced **manually** (invite-only + you checking NMC/state-council — DF-D5). This batch *systematizes* that.

## Decision lock (CONFIRMED in Opus design pass 2026-07-22)

| ID | Decision |
|---|---|
| **VER-D1** | Status lifecycle: `unverified → pending_review → verified` / `rejected` (+ `reason`). ✅ shipped |
| **VER-D2** | Collect: full name (as registered), **medical registration number**, **state council / NMC**, specialty, cert upload (+ optional gov ID). ✅ shipped |
| **VER-D3** | Documents in a **private** Supabase Storage bucket (`doctor-verification-docs`); folder-segment RLS; reads only via short-lived service-role-minted signed URLs; never public. ✅ shipped |
| **VER-D4** | Review is **manual by an admin/ops** in v1 (no automated registry lookup — later/ABDM). ✅ shipped |
| **VER-D5** | **Go-live gate:** `verified` required before Instagram connect / unpause receptionist / first patient booking. ✅ shipped 2026-07-22 (after `admin-console-v1`). |
| **VER-D6** | **REVISED → CRON_SECRET ops-gate.** No admin-role system exists today and building one is a security-sensitive auth surface (the codebase's own TODO flags it as a "separate plan"). v1 review endpoints reuse the `CRON_SECRET` shared-secret gate (like the existing `/admin/archival-preview`) via `requireAdminSecret`; the reviewer holds the secret server-side. The migration still ships forward-compat admin RLS keyed on a server-minted `auth.jwt()->>'role'='admin'` claim for when the proper admin-role middleware lands. |

### Added decision (design pass)

| ID | Decision |
|---|---|
| **VER-D7** | **Doctors are SELECT-only on `doctor_verification` + the docs bucket.** Supabase exposes PostgREST directly, so a doctor UPDATE policy would let a doctor `PATCH status='verified'` themselves. All writes go through the service-role backend (submit hard-codes `pending_review`; review writes terminal states). This is the core privilege-escalation guard, pinned by the migration content tests. |

## Scope guard

- New verification table + RLS; storage bucket + policies; doctor "get verified" flow; admin review surface; the go-live gate check.
- **DO NOT** log any document contents, registration numbers, or names.
- **DO NOT** expose documents via public URLs or to other doctors.
- **DO NOT** fold admin authz into the normal doctor path.

## Tasks (design-level — refine in Opus pass)

| ID | Task | Status |
|---|---|---|
| VER-01 | Migration: `doctor_verification` table + RLS (183) | ✅ done |
| VER-02 | Storage bucket (184) + signed-upload service | ✅ done |
| VER-03 | Doctor "get verified" flow (submit + status + frontend page/banner) | ✅ done |
| VER-04 | Admin review (list/detail/approve/reject), CRON_SECRET-gated | ✅ done |
| VER-05 | Go-live gate enforcement | ✅ done |
| VER-06 | Close gate | ✅ eng / ⏳ owner dogfood |

### What shipped (spine)

- **Migrations** `183_doctor_verification.sql` (+ RLS, escalation guard) and `184_doctor_verification_docs_bucket.sql` (private bucket + folder RLS). Content-sanity tests pin the load-bearing clauses.
- **Backend** `doctor-verification-service.ts` (upload-url / submit / status / list / detail+signed-urls / approve / reject + `isDoctorVerified`), doctor + admin controllers, `requireAdminSecret` middleware, routes `/api/v1/verification/*` and `/api/v1/admin/verifications/*`. 44 unit tests green; backend lint + typecheck clean.
- **Frontend** `/dashboard/get-verified` page + `GetVerifiedClient` (form + signed-URL uploads + live status), `VerificationBanner` on getting-started, sidebar "Get verified" link, `useVerificationStatusQuery`, and API client functions.

## Acceptance (frame)

- [ ] A doctor can submit registration details + docs; status → `pending_review`.
- [ ] An admin can review + approve/reject with reason; doctor sees status.
- [ ] Unverified cannot activate the IG receptionist / take patient bookings.
- [ ] Documents private (RLS); no PII/doc contents in logs; audit trail present.
- [ ] Migration reviewed against all prior migrations; RLS tested for cross-doctor + non-admin denial.

**Created:** 2026-07-22.
