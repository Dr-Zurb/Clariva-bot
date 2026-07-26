# auth-password — batch plan

> Follow-on to [`../../23-07-2026/auth-v2/plan-auth-v2-batch.md`](../../23-07-2026/auth-v2/plan-auth-v2-batch.md).
> Exec order: [`./Tasks/EXECUTION-ORDER-auth-password.md`](./Tasks/EXECUTION-ORDER-auth-password.md)

---

## Why

auth-v2 went fully passwordless (Google OAuth + Email OTP) and **retired** invite / set-password /
reset-link (`AV2-D1`, `AV2-D6`). Dogfood surfaced real friction: the **Email-OTP round-trip is
cumbersome for returning doctors** — open inbox, wait, copy a code, come back — on every fresh
login (new device / cleared session). Google is already type-and-go, but not everyone uses it.

The ask: give the **email path a password** as the main input, with OTP demoted to a fallback.
This partially reverses `AV2-D1` — deliberately, and **without** resurrecting the fragile part
(the emailed reset-**link** flow). Recovery reuses the OTP we already have.

---

## Decision lock (AP-D*)

| # | Decision | Rationale |
|---|---|---|
| **AP-D1** | Password returns as a **first-class email method**. Invite + set-password + emailed **reset-link** stay retired. | The friction is real for a daily-use dashboard. Only the *link* flow was fragile; a password + client-side sign-in is not. |
| **AP-D2** | Email path is **password-first** on both `/login` and `/signup` — email + password are the main inputs. Google unchanged (one-tap). | Matches the user's mental model + autofill/password-manager speed for returning doctors. |
| **AP-D3** | OTP is demoted to a **"Use a code instead"** link = passwordless option **and** forgot-password recovery. Reuses existing `sendEmailOtp` / `verifyEmailOtp`. | One mechanism serves alternative-login + recovery. No new surface. |
| **AP-D4** | **Recovery = Email OTP only.** NO `resetPasswordForEmail`, NO reset-link page, NO redirect flow. | Keeps the exact bug-class auth-v2 killed (PKCE / hash-token / Site-URL redirect) permanently dead. |
| **AP-D5** | ~~Email signup asks for a password + keeps a "Use a code instead" escape.~~ **SUPERSEDED by AP-D9** (rev 2026-07-24): email signup **OTP-verifies the email first**, then sets the password; the standalone code link moves to **login only**. | The escape hatch created an unverified-email hole; AP-D9 closes it. |
| **AP-D6** | **Set/Change password** lives in **Settings → Account** via `updateUser({ password })`, gated by **re-authentication**: users with a password re-enter the current one (verified via `signInWithPassword`); Google/OTP-only users (no password identity) may set one using the live session as proof. | Lets Google/OTP users add a password for faster logins; the re-auth guard stops a hijacked/left-open session from silently changing it (PHI). |
| **AP-D7** | Supabase config: enable **leaked-password protection** (HIBP) + a **min length (8)**; keep **Confirm email OFF** (we verify the email ourselves via OTP — AP-D9). **No migration.** | Password is the weakest method — cheap mitigations. Confirm-email-ON would reintroduce a signup email-**link**/redirect step; AP-D9 verifies via code instead. |
| **AP-D8** | **Unchanged:** `profile_completed` routing, `/complete-profile`, middleware gates, the **ghost-account sweep**, and **doctor verification**. | Password is additive. An abandoned account is swept like any other ghost. Create-on-first-auth now scoped by AP-D10. |
| **AP-D9** *(rev)* | **Email + password signup OTP-verifies the email** before the account is usable: enter email + password → 6-digit **OTP code** → `verifyOtp` (email confirmed, session) → `updateUser({ password })` → `/complete-profile`. **No confirm-password field** (show/hide toggle + OTP recovery cover typos). Google signup unchanged (email pre-verified). | Password signup is the one path that proves *nothing* about email ownership — and our recovery **is** Email OTP, so a typo'd/unowned email = permanent lockout + dead notifications. Verifying via **code** (not a link) restores the proof OTP/Google give for free, without resurrecting the reset-link class (AP-D4). |
| **AP-D10** *(rev)* | **Sign-in refuses unknown accounts** (conventional). Password login already rejects (Supabase returns a generic error, no creation — anti-enumeration). Login's **"Use a code instead"** uses `shouldCreateUser: false` → unknown email = **"No account found — create one."** **Google stays create-on-first-auth** (OAuth always provisions — documented exception). | Passwords re-separate signup from sign-in, so a real login gate is the honest model. **Partially reverses Model C** for the email/login path; Google is the lone create-on-first exception. |
| **AP-D11** | On `/login` and `/signup`, layout = **email form first → divider → Continue with Google**. | Email/password is primary; Google is alternate. |
| **AP-D12** | Email `/signup` fields: **Full name (Dr. prefix)** → Email → Password → Practice (optional) → Specialty (optional). | Same basics as `/complete-profile`; doctor-first. |
| **AP-D13** | **"Dr." is UI chrome + normalize-on-save** (`formatDoctorDisplayName`). Store `Dr. {Name}`; never `Dr. Dr. …`. | Doctors-only product; respect without relying on typed prefix. |
| **AP-D14** | After email signup OTP + password, **stamp `full_name` + `profile_completed`** (+ optional settings) → **`/dashboard/getting-started`** — skip `/complete-profile`. | Avoid double-asking on the email path. |
| **AP-D15** | **Google path unchanged:** OAuth → callback → `/complete-profile` when incomplete. | Explicit exception; only button placement moves. |
| **AP-D16** | `/complete-profile` uses the **same Dr. prefix chrome** on the name field. | Consistency for Google users. |
| **AP-D17** | Email signup **preflight** via `POST /api/v1/auth/email-status` (service-role lookup) **before** `sendEmailOtp`. Existing → **"An account already exists — sign in instead."** (no OTP step). | `signInWithOtp(shouldCreateUser:true)` still sends a code for known emails; we must check existence ourselves. |
| **AP-D18** | Password **sign-in** preflight via the same email-status check. Unknown → **"No account found — create one."**; known + wrong password → **"Incorrect password — or use a code instead."** | Supabase collapses both into `invalid_credentials`; we distinguish for clearer UX (matches login OTP copy). |
| **AP-D19** | Settings → Account: **forgot / never-set password** uses email OTP step-up (send code → verify → `updateUser({ password })`). Current-password re-auth stays the happy path. **No reset-link.** Remove the old "I don't have a password yet" no-proof bypass. Login keeps a single "Forgot password? Use a code instead" (sign-in only). | OTP login left users stuck behind current-password in Settings; OTP is equal proof of email ownership. Keeps AP-D4 (no reset-link). |

---

## Target flow

```
/login  (sign-in — refuses unknowns, AP-D10; Google below form, AP-D11)
   └─ Email + Password  (MAIN)
         ├─ Sign in  → signInWithPassword → routeAfterAuth
         │        (unknown → "No account found"; wrong password → "Incorrect password…")
         └─ "Use a code instead" → OTP  shouldCreateUser:FALSE
                  └─ unknown email → "No account found — create one."
   ── or ──
   └─ Continue with Google                       (create-on-first)

/signup  (OTP-verify email AP-D9; Google below; email path skips complete-profile AP-D14)
   └─ Dr. name + Email + Password + practice/specialty (optional)
         └─ Create account:
              1. capture fields
              2. send 6-digit OTP → verifyOtp → updateUser({ password })
              3. stamp full_name (Dr.) + profile_completed (+ settings)
              4. → /dashboard/getting-started
   ── or ──
   └─ Continue with Google → /complete-profile (AP-D15/D16, Dr. prefix chrome)

Settings → Account → Set / Change password
         ├─ Change: current password → updateUser({ password })   (AP-D6)
         └─ Forgot / never set: email OTP → updateUser({ password })  (AP-D19)
```

Verification (`/dashboard/get-verified` → admin review) is downstream and **unchanged**.

---

## Auth mechanics (specify — do not build here)

```ts
// login (password-first) — refuses unknowns (AP-D10)
await supabase.auth.signInWithPassword({ email, password });

// login "use a code instead" — passwordless + forgot-password, does NOT create (AP-D10)
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
await supabase.auth.verifyOtp({ email, token, type: "email" });
//   → error "Signups not allowed for otp" / user-not-found ⇒ "No account found — create one."

// signup (AP-D9) — OTP-verify the email, THEN attach the password (Confirm email OFF)
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); // send code
await supabase.auth.verifyOtp({ email, token, type: "email" });                    // email confirmed + session
await supabase.auth.updateUser({ password });                                      // attach password
//   (drop signUpWithPassword for the email path; existing verified email surfaces "already exists")

// set / change password (Settings → Account, AP-D6)
//   1. if user has a password identity: verify current via signInWithPassword(current)
//   2. then: await supabase.auth.updateUser({ password: next })
```

All paths establish/refresh the session **client-side** → hand off to the existing
`routeAfterAuth` / `destinationAfterAuth` (no callback route needed; that's Google-only).

---

## Error copy (normalize in `authErrorMessage`)

| Supabase signal | Doctor-facing copy |
|---|---|
| `invalid login credentials` (wrong password on a known email — AP-D18) | "Incorrect password — or use a code instead." |
| `user already registered` (signup) | "An account already exists — sign in instead." |
| login OTP on unknown email (`shouldCreateUser:false` → signups-not-allowed / user-not-found) | "No account found — create one." |
| weak / short password | "Password is too short (min N characters)." |
| leaked password (HIBP) | "That password has appeared in a data breach. Choose another." |
| existing OTP codes (`otp_expired`, etc.) | unchanged |

---

## Security note (PHI)

Password becomes the primary email method, so the weakest-link surface grows. Mitigations in this
batch: **leaked-password protection + min length + re-auth on change**. Google/OTP remain the
phishing-resistant options. **MFA** (TOTP / passkeys) is the natural follow-up — parked, not in scope.

---

## Open questions (draft answers)

- **OQ-1** — min password length? → **locked: 8**, plus HIBP leaked-password protection.
- **OQ-2** — strength meter UI? → **locked: no meter**; length rule + show/hide toggle; rely on Supabase leaked check.
- **OQ-3** — settings route? → **locked:** new `Account` card → `/dashboard/settings/account`.
- **OQ-4** — keep "use a code instead" on `/signup`? → **REVERSED by AP-D9:** signup has **no standalone code link**; the code *is* the verify step. The code link is **login-only** now.
- **OQ-5** — confirm-password field? → **locked: no** (show/hide toggle + OTP recovery cover typos — AP-D9).
- **OQ-6** *(rev 2026-07-24)* — email signup verify email? → **locked: yes, via 6-digit OTP** (AP-D9). Login gate refuses unknowns (AP-D10).

---

## Caps / guardrails

- **No migration.** No PHI columns. RLS unchanged (the only stored change is Supabase-managed
  `auth.users.encrypted_password`).
- Touches **authentication** + **5+ files** → auth-critical tasks run on **Opus** (agent-contract).
- Partial reversal of `AV2-D1` is intentional; reset-**link** stays retired (AP-D4).

---

## Acceptance gate

- `/login`: email + password signs in; **unknown → "No account found — create one."** (AP-D18); **wrong password → "Incorrect password — or use a code instead."**; "use a code instead" logs in a **known** user via OTP (AP-D10).
- `/signup`: email + password → **6-digit OTP verify** → `/complete-profile`; existing verified email → "sign in" copy; **no confirm-password field**, **no standalone code link** (AP-D9).
- Settings → Account: password user changes password only after re-auth; Google/OTP-only user can set one.
- Google path still creates-on-first-auth; routing/gates/ghost-sweep/verification unchanged.
- Supabase: leaked-password protection ON, min length 8, Confirm email OFF.
- `tsc --noEmit` + `npm run lint` clean for touched files; component/unit tests green.

---

**Created:** 2026-07-24. **Rev:** 2026-07-24 (AP-D9 OTP-verify signup + AP-D10 login gate; supersedes AP-D5 / OQ-4).
**Status:** 🚧 Code landed through AP-D11–D16 (signup details + Google below + Dr. prefix). **Remaining (Human):** `ap-04a` Supabase console + live dogfood (`task-ap-04` §1–2).
