# auth-v2 — self-serve Google + Email OTP (retire invite/set-password)

> **Status:** 🚧 Code landed (2026-07-23) — `av2-02`…`06` implemented. **Still gated on `av2-01` console config** before dogfood/close.
> **Supersedes:** `../../22-07-2026/doctor-invite-v1/` (invite-by-email) + the `/set-password` follow-up. Those are **retired** here.
> **Sibling roadmap:** `../../22-07-2026/doctor-funnel/README.md` (Gate 1: Account) — this re-shapes Gate 1 from "admin invites" to "doctor self-serves".
>
> **One-line intent:** Replace the email/password + admin-invite + `/set-password` flow with an Eka-style method picker (**Continue with Google** / **Continue with Email**), passwordless and self-serve. Verification stays the real patient-facing gate — **unchanged**.

---

## Why this batch

The current Gate-1 (account creation) has three moving parts that all cost us:

1. **`/signup`** — email + password + confirm-email (`frontend/app/(auth)/signup/page.tsx`).
2. **Admin invite** — `inviteUserByEmail` → `/set-password`, keyed on `user_metadata.password_set` because Supabase stamps `email_confirmed_at`/`last_sign_in_at` the instant the invite link opens (`backend/src/services/doctor-invite-service.ts`).
3. **`/set-password`** — parses implicit hash tokens by hand because `@supabase/ssr` defaults to PKCE (`frontend/app/set-password/page.tsx`).

That machinery produced the whole "link expired / already registered / resend" saga (Site-URL vs Tailscale-funnel mismatch, PKCE-vs-hash tokens, `last_sign_in_at` being an unreliable "finished signup" signal). It's fragile and it's admin-gated — a doctor can't just sign up.

This batch deletes all three and replaces them with the pattern every modern app uses: pick an identity provider, land on a short "complete your profile" step, done. **No passwords anywhere.** The medical credential check (`doctor-verification-v1` / `verification-v2`) is untouched and remains the gate for anything patient-facing.

---

## Grounded current state

| Piece | Location | Note |
|---|---|---|
| Signup | `frontend/app/(auth)/signup/page.tsx` | Email+password+confirm; name→`user_metadata.full_name`; practice/specialty→`doctor_settings` (deferred when confirm required). |
| Login | `frontend/app/(auth)/login/page.tsx` | `signInWithPassword`. |
| Set-password | `frontend/app/set-password/page.tsx` | Hand-parses `#access_token`/`?code=`; stamps `user_metadata.password_set`. **Retire.** |
| `(auth)` layout | `frontend/app/(auth)/layout.tsx` | Redirects any authed user → `/dashboard`. (Why `set-password` lived *outside* the group; `complete-profile` must too.) |
| Browser client | `frontend/lib/supabase/client.ts` | `createBrowserClient` (@supabase/ssr) — PKCE by default. |
| Server client | `frontend/lib/supabase/server.ts` | Used by callback route handler + server components. |
| Middleware | `frontend/middleware.ts` | Refreshes session; unauth on `/dashboard`|`/admin` → `/login`. Matcher = `/dashboard*`, `/admin*` only. |
| Invite service | `backend/src/services/doctor-invite-service.ts` | `inviteUserByEmail`, resend/stub-clear, prefill. **Retire.** |
| Invite controller/route | `backend/src/controllers/admin-invite-controller.ts` · `routes/api/v1/admin-doctors.ts:22` (`router.post('/invite')`) · wired at `routes/api/v1/index.ts:145` | **Retire.** |
| Admin invite UI | `frontend/app/admin/doctors/invite/**` + `InviteDoctorClient` | **Retire.** |
| Funnel derive | `backend/src/services/admin-doctors-service.ts:51` (`deriveFunnelStatus`) | Uses `passwordSet` + `invitedAt` → emits `invited`/`onboarding`. **Simplify.** |
| Funnel type | `backend/src/types/admin-doctor.ts:11` (`ADMIN_DOCTOR_FUNNEL_STATUSES`) | Contains `'invited'`. **Drop it.** |
| Funnel UI | `frontend/components/admin/doctors/DoctorFunnelBadge.tsx` · `DoctorsListClient.tsx` | `invited` badge/filter + "Resend" row action. **Drop.** |
| Verification | `doctor_verification` + admin review console | **UNCHANGED** — auth-method-agnostic; remains the real gate. |

---

## Decision lock (DRAFT — confirm before any code)

| ID | Decision | Rationale / implication |
|----|----------|-------------------------|
| **AV2-D1** | Auth methods = **Google OAuth** + **Email OTP** (6-digit code). No password anywhere. | Matches the Eka method-picker. Kills password reset + `set-password`. Phone deferred (AV2-D5). |
| ↳ **rev 2026-07-24** | **Partially reversed by [`auth-password` AP-D1](../../24-07-2026/auth-password/plan-auth-password-batch.md):** password returns as a first-class email method (password-first login/signup). **Reset-link / invite / `/set-password` stay retired** (AP-D4). Email OTP remains the fallback + recovery + signup email-verify step. | Dogfood: OTP round-trip was cumbersome for returning doctors. |
| **AV2-D2** | **Open** self-serve signup. Anyone can create an account; **verification remains the patient-facing gate** (`isDoctorVerified`, unchanged). | Standard EMR shape. Open + Google is *lower* spam than open email (real Google account required). Verification blocks junk from doing harm. |
| **AV2-D3** | "Profile complete" signal = **`user_metadata.profile_completed: true`**. **No migration.** | Routing-only convenience, **not a trust boundary** — `user_metadata` is client-writable, so never gate anything sensitive on it. The real gate stays verification (service-role). Replaces the retired `password_set` signal. |
| **AV2-D4** | Email method = **OTP code entry** (`verifyOtp`, client-side), **not** magic link. | `verifyOtp` runs client-side with **no redirect** → sidesteps the redirect-URL / hash-token bug class that broke `/set-password`. Also device-agnostic (enter the code where you started). |
| **AV2-D5** | **Phone OTP deferred** to a later batch. | Needs an SMS provider + India **DLT** registration (multi-day, external). Would gate the whole batch. Phone is better as an **OTP-verified attribute inside verification** (pay only for real doctors) — parked, see `capture/inbox.md`. |
| **AV2-D6** | **Retire** invite + set-password entirely (delete service, controller, route, both pages, admin invite UI). Admin console **keeps** verification review; **loses** invite + resend + the `invited` funnel bucket. | The whole reason invite existed (admin-gated onboarding) is replaced by self-serve. |
| **AV2-D7** | Existing email/password accounts keep working via **Email OTP** (same email → same Supabase user). Enable Supabase **"link identities with the same email"** so Google links instead of duplicating. **No data migration.** | Beta volume is tiny (you + a couple test docs). `password_set` metadata becomes vestigial/harmless. |
| **AV2-D8** | **Unify** login + signup onto one **method-picker component**; both routes render it (thin copy differences). | Under OTP + `shouldCreateUser:true`, login and signup are the same action. Keeps two routes for muscle-memory/links. |
| **AV2-D9** | Post-auth first-timers route to **`/complete-profile`** (outside the `(auth)` group). Full name (prefilled from Google) required; practice/specialty optional → `PATCH /settings/doctor`; then stamp `profile_completed` → `/dashboard/getting-started`. | Session already exists post-auth, so the settings PATCH is immediate (no deferral like old signup). Route lives outside `(auth)` because that layout bounces authed users to `/dashboard`. |

---

## Target flow

```
/login or /signup  (method picker — Google / Email)
        │
        ├── Continue with Google ──▶ Supabase OAuth ──▶ /auth/callback (server: exchangeCodeForSession)
        │                                                     │
        └── Continue with Email ──▶ enter email ──▶ enter 6-digit OTP (verifyOtp, client)
                                                              │
                                        profile_completed? ───┼── no ──▶ /complete-profile ──▶ /dashboard/getting-started
                                                              └── yes ─▶ /dashboard
```

Verification (`/dashboard/get-verified` → admin review) is **downstream and unchanged**; it still gates Instagram-connect / going patient-facing.

---

## Auth mechanics (specify, do not build)

### Google (OAuth, PKCE code flow — the *clean* redirect path)
```ts
// browser client
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}/auth/callback` },
});
```
- Google → Supabase → `GET /auth/callback?code=...`. The **server** client (`lib/supabase/server.ts`) calls `exchangeCodeForSession(code)` (code-verifier cookie was set by the browser client at initiation), sets session cookies, then redirects by `profile_completed`.
- Redirect URL must be allowlisted in **both** Supabase Auth URL config **and** the Google console (AV2-01).

### Email (OTP code — no redirect)
```ts
// step 1: send code
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
// step 2: user enters the 6-digit code from the email
await supabase.auth.verifyOtp({ email, token, type: "email" });
```
- Requires the Supabase **email OTP template to emit `{{ .Token }}`** (a 6-digit code), not only the magic-link (AV2-01).
- `verifyOtp` establishes the session client-side → then `router.push` to `/complete-profile` or `/dashboard`. No callback route needed for the email path.

### Profile-complete flag + routing
- Stamp: `await supabase.auth.updateUser({ data: { profile_completed: true } })` at the end of `/complete-profile`.
- Enforce: `middleware.ts` — authed + `!user.user_metadata.profile_completed` hitting `/dashboard/*` → redirect `/complete-profile`. Add `/complete-profile` to the matcher and require auth there. **Never** use this flag for anything but routing (AV2-D3).

### RLS / DB
- **No migration.** No table/column/policy change. `doctor_settings` writes go through the existing settings API (service-role backend); the flag lives in `auth.users.user_metadata`.

---

## What gets deleted (demolition — AV2-05/06)

```
DELETE  frontend/app/set-password/page.tsx
DELETE  frontend/app/admin/doctors/invite/**          (page + InviteDoctorClient)
DELETE  backend/src/services/doctor-invite-service.ts
DELETE  backend/src/controllers/admin-invite-controller.ts
EDIT    backend/src/routes/api/v1/admin-doctors.ts     (remove POST /invite)
EDIT    backend/src/routes/api/v1/index.ts             (remove invite wiring/comment ~L145)
EDIT    backend/src/services/admin-doctors-service.ts   (deriveFunnelStatus: drop passwordSet/invitedAt/invited)
EDIT    backend/src/types/admin-doctor.ts               (drop 'invited' from ADMIN_DOCTOR_FUNNEL_STATUSES)
EDIT    frontend/components/admin/doctors/DoctorFunnelBadge.tsx     (drop 'invited')
EDIT    frontend/components/admin/doctors/DoctorsListClient.tsx     (drop 'invited' filter + 'Resend' action)
DELETE  invite/resend/set-password unit tests; UPDATE deriveFunnelStatus test
```

New funnel after simplification: `onboarding → pending_review → verified | rejected | changes_requested`.
```ts
export function deriveFunnelStatus(input: {
  verificationStatus: VerificationStatus | null;
}): AdminDoctorFunnelStatus {
  const v = input.verificationStatus;
  if (v === "pending_review" || v === "verified" || v === "rejected" || v === "changes_requested") return v;
  return "onboarding"; // authed but not yet submitted for verification
}
```

---

## ⚠️ Scope guard

- **No migration.** If anything pushes toward a schema change, STOP and re-confirm — the flag stays in `user_metadata`.
- **Do NOT touch** the verification flow, `doctor_verification`, RLS, storage, or payments.
- **Do NOT** add phone/Apple (AV2-D5).
- `profile_completed` is **routing-only** — never a security/authorization gate (AV2-D3).
- Keep the `AuthShell` chrome; this is a flow swap, not a re-theme.
- Google redirect URLs + email OTP template are **console config** (AV2-01), not code — get them right once (this is the same class of mismatch that broke invites twice).

---

## Proposed task list

| Task | Title | Size | Model | Notes |
|---|---|---|---|---|
| `av2-01` | Supabase + Google console config (provider, redirect URLs, OTP template, identity-linking) | S | **Human/Ops** | Out-of-repo. The real long pole. Gate for the rest. |
| `av2-02` | `/auth/callback` route + browser auth helpers (Google, email OTP) | S–M | **Opus** | Auth boundary — session establishment. |
| `av2-03` | Method-picker UI for `/login` + `/signup` (Eka-style cards; email→OTP step) | M | Sonnet | Frontend UI; calls av2-02 helpers. |
| `av2-04` | `/complete-profile` page + `profile_completed` flag + middleware routing | M | **Opus** | Middleware auth-routing is sensitive. |
| `av2-05` | Retire invite + set-password (backend + frontend deletion + rewire) | S–M | **Opus** | Removes an ops endpoint + wiring; auth-adjacent. |
| `av2-06` | Simplify funnel status (drop `invited`/`password_set`) + types + badges + list | S | Sonnet | Mechanical; update tests. |
| `av2-07` | Close gate: acceptance, smoke, verification, capture follow-ups | S | Sonnet/Composer | |

Whole batch is auth + a 5+ file refactor → runs under the **Opus** contract; the auth-critical tasks (`02`, `04`, `05`) are Opus, UI/mechanical (`03`, `06`) can be Sonnet.

---

## Acceptance gate

- [ ] Google sign-in works end-to-end (new user + returning), landing correctly by `profile_completed`.
- [ ] Email OTP works end-to-end (new + returning) with **no redirect** and no hash-token handling.
- [ ] First-timer lands on `/complete-profile`; name prefilled for Google; practice/specialty persist; flag stamped; then `/dashboard/getting-started`.
- [ ] Existing email/password account signs in via Email OTP (same user, verification/settings intact); Google on the same email **links** (no duplicate).
- [ ] Invite + `/set-password` fully removed; admin console has **no** invite/resend/`invited`; verification review unchanged.
- [ ] Funnel simplified to `onboarding → pending_review → verified|rejected|changes_requested`; tests updated.
- [ ] Middleware routes authed-but-incomplete users to `/complete-profile`; unauth still → `/login`.
- [ ] Backend + frontend `type-check` + `lint` + tests green for the slice. **No migration.**

---

## Open questions

- **OQ-1:** Merge `/login` and `/signup` into a single route (e.g. `/login` only, `/signup`→redirect), or keep both rendering the shared picker? **Draft (AV2-D8): keep both routes**, shared component.
- **OQ-2:** Should `/complete-profile` require anything beyond full name (e.g. force specialty)? **Draft: name required; practice/specialty optional** (mirror signup-v2 SU2-D2).
- **OQ-3:** Clean up existing invite stubs / vestigial `password_set` metadata now, or leave harmless? **Draft: leave** (beta volume; harmless).
- **OQ-4:** Admin login — confirm the Google account (matching your current admin email) gets `app_metadata.role='admin'` before cutover, so you're not locked out. **Must confirm in AV2-01.**

---

## References

- Retires: `../../22-07-2026/doctor-invite-v1/` · `frontend/app/set-password/page.tsx`
- Auth: `frontend/lib/supabase/{client,server}.ts` · `frontend/middleware.ts` · `frontend/app/(auth)/layout.tsx`
- Funnel: `backend/src/services/admin-doctors-service.ts` · `backend/src/types/admin-doctor.ts`
- Rules: `.cursor/rules/00-agent-contract.mdc` · `DEFINITION_OF_DONE.md`
- Supabase: Next.js SSR Auth (OAuth code flow, `signInWithOtp`/`verifyOtp`)

---

**Created:** 2026-07-23 (Opus, planning). **Rev:** 2026-07-24 — `AV2-D1` partially reversed by auth-password (password returned; reset-link stays retired). See [`../../24-07-2026/auth-password/`](../../24-07-2026/auth-password/).
**Status:** 📋 Task files scaffolded — exec order + `av2-01`…`av2-07` under [`./Tasks/`](./Tasks/EXECUTION-ORDER-auth-v2.md). **Execution GATED:** confirm `AV2-D*` + finish `AV2-01` console config before Wave 1.
