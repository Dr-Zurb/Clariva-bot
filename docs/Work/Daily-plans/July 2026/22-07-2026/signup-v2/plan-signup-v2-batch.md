# signup-v2 — signup UX + identity fields

> **Status:** ✅ Complete (2026-07-22).
> **One-line intent:** Turn the bare email/password `/signup` into a doctor-shaped signup — capture name + practice basics into existing stores, tighten copy, and cross-link the demo path. **No migration, no KYC block** (that's `doctor-verification-v1`).
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · batch #1 (Gate 1: Account).

---

## Decision lock

| ID | Decision |
|---|---|
| **SU2-D1** | Collect **full name** → Supabase `user_metadata` (no migration). |
| **SU2-D2** | Collect optional **practice name** + **specialty** → existing `doctor_settings` columns via the settings API. |
| **SU2-D3** | **No license fields here** (registration number/uploads belong to `doctor-verification-v1` — DF-D6). |
| **SU2-D4** | Keep Supabase email-confirm flow + `AuthShell` chrome exactly as-is; this is additive. |
| **SU2-D5** | Add a "Prefer a guided walkthrough? Book a demo" cross-link to `/demo`. |

## Shipped

- `frontend/app/(auth)/signup/page.tsx` — full name (required) + practice/specialty (optional); doctor-facing copy; `/demo` cross-link.
- Name → `user_metadata.full_name` at `signUp`.
- Practice/specialty → `PATCH /settings/doctor` when a session exists immediately; deferred when email-confirm is required.

## Acceptance

- [x] `/signup` captures name (+ optional practice/specialty) without breaking email-confirm.
- [x] Name persists to `user_metadata`; practice/specialty to `doctor_settings` when provided + session present.
- [x] `/demo` cross-link present; copy reads doctor-facing.
- [x] Slice eslint/typecheck clean; no migration; no new gate.

**Created:** 2026-07-22. **Shipped:** 2026-07-22.
