# auth-password — execution order

> Sibling of [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md). Plan = what + why + decision lock; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`AP-D1`…`AP-D10`).
>
> **Rev 2026-07-24:** `AP-D9` (email signup **OTP-verifies** the email, then sets the password —
> supersedes `AP-D5`/`OQ-4`) + `AP-D10` (**sign-in refuses unknowns**; login "use a code" →
> `shouldCreateUser:false` → "No account found — create one"). Handled by the new **Wave 5 `ap-05`**
> revision task; `ap-04`/`ap-04a` close *after* it.

> **🛑 GATE — do not start until confirmed.** This batch reworks **authentication** (adds a
> password credential path + a Settings password-change surface) and is a **5+ file** change. Per
> `.cursor/rules/00-agent-contract.mdc`, the auth-critical tasks run on **Opus**, and execution may
> not begin until the `AP-D*` decision lock is human-confirmed. It **partially reverses `AV2-D1`**
> (password returns) but keeps the reset-**link** flow retired (`AP-D4`).
>
> **Good news:** **no migration** — password is stored in Supabase-managed `auth.users`; the
> `profile_completed` signal stays in `user_metadata`.

> **Shape.** `ap-01` adds the password auth helpers + error copy (the spine the UI reuses). `ap-02`
> makes the picker password-first with the OTP fallback. `ap-03` adds the Settings → Account
> set/change-password surface with re-auth. **`ap-05` (rev)** converts the email signup to
> OTP-verify (AP-D9) + adds the login "no account" gate (AP-D10). `ap-04` does the Supabase console
> config + close gate. `ap-04a`'s console config can run in parallel (out-of-repo).
>
> **Rev status.** `ap-01`…`ap-03` code has **landed**; `ap-05` reworks part of `ap-01`/`ap-02`
> before the close gate runs.

---

## Pre-flight checklist (must be ✅ before Wave 1 code)

- [x] `AP-D1`…`AP-D8` reviewed + confirmed by a human.
- [x] `AP-D9` (OTP-verify signup) + `AP-D10` (login gate) confirmed — rev 2026-07-24.
- [x] **OQ-1** min password length → **8**. · **OQ-3** settings route → `/dashboard/settings/account`. · **OQ-5** confirm-password → **no**.
- [ ] auth-v2 `av2-01` console config already live (Google + OTP `{{ .Token }}` 6-digit) — this batch builds on it.

---

## Wave plan

```
🛑 GATE (pre-flight above) ─────────────────────────────

Wave A (out-of-repo, parallel — can start anytime):
  ap-04a  Supabase config: leaked-password protection + min length + Confirm-email OFF  [Human/Ops]

Wave 1 (~1h):
  ap-01   auth methods: signInWithPassword + signUpWithPassword + error copy            [Opus]
        │  (spine — UI + settings reuse it)
        ▼
Wave 2 (~2h):
  ap-02   picker: password-first main screen + "use a code instead" fallback            [Sonnet]
        │
        ▼
Wave 3 (~1.5h):  ✅ landed
  ap-03   Settings → Account: set/change password with re-auth                          [Opus]
        │
        ▼
Wave 5 (~2h):  ← REVISION (AP-D9 + AP-D10), reworks part of ap-01/ap-02
  ap-05   signup → OTP-verify email + set password ; login "use a code" → no-account    [Opus]
        │
        ▼
Wave 4 (~1h):  ← now the LAST wave (renamed order: runs after ap-05)
  ap-04   close gate: acceptance + smoke (login/signup/settings) + verify + capture     [Sonnet/Composer]
```

Serial by default — each wave touches shared auth surfaces. Never two Opus tasks concurrently.
`ap-05` runs **before** the `ap-04` close gate because it changes signup/login acceptance behavior.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| WA | **ap-04a** | S | **Human/Ops** | Supabase dashboard → Auth → Providers/Email | Leaked-password protection ON; min length (OQ-1); Confirm email OFF. No code. |
| W1 | **ap-01** | S | **Opus** | `lib/auth/methods.ts`; `lib/supabase/client.ts` | Add `signInWithPassword`, `signUpWithPassword`; extend `authErrorMessage` (AP error table). Do NOT touch OTP/Google helpers except copy. |
| W2 | **ap-02** | M | Sonnet | `components/auth/AuthMethodPicker.tsx`; `app/(auth)/{login,signup}/page.tsx`; ap-01 helpers | Password-first main screen (email+password inline under Google); mode-driven primary action; "use a code instead" → existing OTP step; error surface. |
| W3 | **ap-03** | S–M | **Opus** | `app/dashboard/settings/page.tsx`; `components/settings/PracticeSetupCard.tsx`; ap-01 helpers | ✅ landed. New `Account` card → `/dashboard/settings/account`; `PasswordPanel` with re-auth (AP-D6). |
| W5 | **ap-05** | M | **Opus** | `lib/auth/methods.ts`; `components/auth/AuthMethodPicker.tsx` + tests | **Rev.** Signup email path → send code → `verifyOtp` → `updateUser({password})` → `/complete-profile` (AP-D9, no confirm field, no standalone code link on signup). Login "use a code" → `shouldCreateUser:false` → "No account found — create one." (AP-D10). |
| W4 | **ap-04** | S | Sonnet/Composer | all above; `DEFINITION_OF_DONE.md` | Runs last. Acceptance + manual smoke (incl. AP-D9/AP-D10); verify Google/OTP/gates/ghost-sweep untouched; capture MFA follow-up. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| ap-04a | S | **Human/Ops** | Console config; no code. |
| ap-01 | S | **Opus** | Auth boundary — credential sign-in/sign-up + error semantics. |
| ap-02 | M | Sonnet | Frontend UI; no PHI/RLS/money. Calls ap-01 only. |
| ap-03 | S–M | **Opus** | Password-change security (re-auth guard) — easy to get subtly wrong. |
| ap-05 | M | **Opus** | Account create + email-verification + enumeration semantics — auth boundary, easy to get subtly wrong. |
| ap-04 | S | Sonnet/Composer | QA + gate. |

**Caps check:** no migration; no PHI columns; RLS unchanged. Never two Opus tasks concurrently (waves serial).

---

## Task files

- [`task-ap-01-auth-methods-password.md`](./task-ap-01-auth-methods-password.md) — ✅ landed
- [`task-ap-02-picker-password-first-ui.md`](./task-ap-02-picker-password-first-ui.md) — ✅ landed (reworked by ap-05)
- [`task-ap-03-settings-account-password.md`](./task-ap-03-settings-account-password.md) — ✅ landed
- [`task-ap-05-signup-otp-verify-and-login-gate.md`](./task-ap-05-signup-otp-verify-and-login-gate.md) — ✅ landed
- [`task-ap-04-config-and-close-gate.md`](./task-ap-04-config-and-close-gate.md) — ⏳ close (runs last; needs `ap-04a`)

---

**Created:** 2026-07-24. **Rev:** 2026-07-24 (added Wave 5 `ap-05` for AP-D9/AP-D10).
**Status:** 🚧 All code landed (`ap-01`…`ap-03`, `ap-05`). In-repo `ap-04` verify/capture done. **Remaining (Human):** `ap-04a` Supabase console → live dogfood checklist in `task-ap-04`.
