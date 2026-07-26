# verification-v2 — "Request changes" status (soft re-upload)

> **Status:** ✅ Complete eng / ⏳ dogfood + apply migration 185 (2026-07-22). **Weight: Opus** — executed on Grok 4.5 at owner request. New migration on `doctor_verification` (widens the status CHECK), touches the review lifecycle that gates go-live (VER-05-adjacent), and spans DB + backend + doctor-facing + admin UI.
> **One-line intent:** Give reviewers a soft **"Request changes"** verdict — "your certificate is blurry, please re-upload" — that is distinct from a hard **Reject** ("we can't verify you"). Today the only non-approve verdict is `rejected`, which reads as a hard no even when we just need a clearer photo.
>
> **Roadmap:** builds on `doctor-verification-v1` (the `unverified → pending_review → verified | rejected` lifecycle + review path) and the admin console (`admin-console-v1..v3`: `requireAdminJwtOrSecret`, `/admin/verifications` list + detail, the doctors directory funnel). This is the **Step 2** follow-up to the Auto frontend polish shipped 2026-07-22 (icon columns + single-doc popups + reject presets on `/admin/verifications`).

---

## Why (the gap)

- The review verdict is binary: **Approve** (`verified`) or **Reject** (`rejected`). `rejected` is the only channel for "please re-upload a clearer certificate," so a doctor with a genuine registration but a blurry photo gets the same harsh "wasn't approved" experience as someone we're actually declining.
- The Auto polish (reject presets) softened the *copy* but not the *semantics* — it's still a rejection under the hood. This batch adds the real third state so the doctor sees a gentle "quick update needed" and ops can track "waiting on the doctor to fix docs" separately from "declined."

## Context that shapes the design (verified 2026-07-22)

- **Status is a single TEXT column with a CHECK constraint** (`backend/migrations/183_doctor_verification.sql`): `CHECK (status IN ('unverified','pending_review','verified','rejected'))`. Adding a state = widen that constraint. No enum type to alter.
- **`reject_reason` already carries a free-text reviewer message** and is surfaced to the doctor (`DoctorVerificationStatusView.rejectReason`, rendered in `GetVerifiedClient` and `VerificationBanner`). `changes_requested` needs the same "here's what to fix" message → **reuse this column**, no new column.
- **The re-submit path already loops back to `pending_review`.** `submitVerification` upserts `status='pending_review'` and clears the prior verdict, and `GetVerifiedClient` shows the form whenever status is `unverified | rejected`. `changes_requested` slots into that same "show the form" branch with softer copy.
- **The go-live gate keys on `=== 'verified'`.** `isDoctorVerified` returns `status === 'verified'`, so `changes_requested` is blocked automatically — **no VER-05 change needed.**
- **Review writes go through the service role** (`approveVerification` / `rejectVerification`); doctors have no write RLS. A new `requestChanges` verdict mirrors `rejectVerification` exactly (different status + audit stamp). RLS/storage untouched.
- **Admin surfaces to update:** the list row actions (`VerificationRow`), the detail page (`VerificationDetailClient`), the status filter tabs + `VerificationStatusBadge`, and the doctors directory funnel (`admin-doctors-service.deriveFunnelStatus` + `DoctorFunnelBadge`).

## Decision lock

| ID | Decision |
|---|---|
| **VERV2-D1** | New status `changes_requested` — **non-terminal**, parallel to `rejected`: `pending_review → changes_requested → (doctor re-submits) → pending_review`. Softer intent than `rejected` (which stays the hard "we can't verify you"). |
| **VERV2-D2** | **No new column.** Reuse `reject_reason` as the reviewer's message for both `rejected` and `changes_requested` (they're mutually exclusive states). The only schema change is widening the status CHECK constraint. Comments rename its meaning to "reviewer note." |
| **VERV2-D3** | Review becomes **3-way: Approve / Request changes / Reject.** *Request changes* = fixable (re-upload / correct a field); *Reject* = declined (not a licensed doctor / fraud). Both require a note; approve does not. |
| **VERV2-D4** | **Go-live gate (VER-05) unchanged** — `isDoctorVerified` already gates on `=== 'verified'`, so `changes_requested` stays blocked. This batch must NOT touch gate logic. |
| **VERV2-D5** | Doctor-facing `changes_requested` **reuses the `rejected` form branch** with distinct, softer copy + icon; identical upload/re-submit path (→ `pending_review`). |
| **VERV2-D6** | Surface the state **end-to-end**: admin list filter tab + badge variant, **and** the doctors directory funnel (add `changes_requested` to the funnel enum + `deriveFunnelStatus` + `DoctorFunnelBadge`). This is the one deliberate cross-touch into `admin-console-v3` code — flagged for traceability. |
| **VERV2-D7** | **Out of scope:** email/WhatsApp notifications on verdict change (backlog — no verdict email exists today), and any change to `rejected` semantics. |

## Scope guard

- **Build:** migration `185` (widen CHECK + comment) · add `changes_requested` to `VERIFICATION_STATUSES` · `requestChangesVerification` service fn + tests · `POST /admin/verifications/:doctorId/request-changes` controller + route + tests · admin 3-way UI (list row + detail) with note presets · "Changes requested" filter tab + badge variant · doctor-facing copy in `GetVerifiedClient` + `VerificationBanner` · directory funnel surface.
- **DO NOT** add a new column — reuse `reject_reason`.
- **DO NOT** touch VER-05 / `isDoctorVerified` / any go-live gate logic.
- **DO NOT** change RLS policies, the storage bucket, or the upload/submit flow.
- **DO NOT** change what `rejected` means or its existing copy beyond disambiguating it from "request changes."
- **DO NOT** log the reviewer note, full name, or any PII — logs stay `doctorId` + `correlationId` + event.
- **DO NOT** build verdict notifications (backlog).

## Tasks

| ID | Task | Weight | Status |
|---|---|---|---|
| VERV2-01 | Migration `185_doctor_verification_changes_requested.sql` — widen status CHECK to include `changes_requested`; update table/lifecycle comment; idempotent + reverse migration; migration unit test | Opus | ✅ |
| VERV2-02 | Types + service — add `changes_requested` to `VERIFICATION_STATUSES`; `requestChangesVerification()` (mirrors `rejectVerification`); confirm `isDoctorVerified` unaffected; unit tests | Opus | ✅ |
| VERV2-03 | Admin controller + route — `requestChangesVerificationHandler` + `POST /admin/verifications/:doctorId/request-changes` (required `note`); unit tests | Opus | ✅ |
| VERV2-04 | Admin UI — API client fn + 3-way action (Request changes) on list row + detail, with note presets; "Changes requested" filter tab + badge variant | Auto | ✅ |
| VERV2-05 | Doctor-facing — `changes_requested` branch in `GetVerifiedClient` + `VerificationBanner` with soft copy + icon; frontend `VerificationStatus` union | Auto | ✅ |
| VERV2-06 | Directory funnel surface + close gate — funnel enum/`deriveFunnelStatus`/`DoctorFunnelBadge`; typecheck + lint + tests; dogfood the 3-way loop | Auto | ✅ eng / ⏳ dogfood + migrate |

## Acceptance (frame)

- [ ] Reviewer can pick **Request changes** with a note on a pending submission (list row + detail); status becomes `changes_requested`, audit fields stamped.
- [ ] Doctor sees a soft "quick update needed" message + the note + the re-submit form; re-submitting returns them to `pending_review`.
- [ ] **Reject** is still available and still means the hard "declined"; the two are visually and semantically distinct.
- [ ] `changes_requested` appears in the admin list filter + badge and in the doctors directory funnel.
- [ ] Go-live stays blocked for `changes_requested` (no VER-05 change). RLS/storage untouched.
- [ ] Migration is idempotent + has a documented reverse; no reviewer note or PII in logs.
- [ ] Typecheck + lint + tests green; owner dogfood passes (pending → request changes → doctor re-submits → pending → approve).

**Created:** 2026-07-22.
