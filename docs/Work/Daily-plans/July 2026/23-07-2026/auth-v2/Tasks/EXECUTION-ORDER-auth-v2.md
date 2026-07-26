# auth-v2 — execution order

> Sibling of [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md). Plan = what + why + decision lock; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`AV2-D1`…`D9`).
>
> **Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **🛑 GATE — do not start until confirmed.** This batch reworks **authentication** (session establishment, middleware routing) and is a **5+ file refactor** that **deletes** the invite/set-password path. Per `.cursor/rules/00-agent-contract.mdc`, the auth-critical tasks run on **Opus**, and **execution may not begin until (a) the `AV2-D*` decision lock is human-confirmed and (b) `av2-01` console config is done** (Google provider + redirect URLs + email OTP template + identity-linking + admin role). Scaffolding these files is *not* a green light to code.
>
> **Good news:** **no migration** — the `profile_completed` signal lives in `user_metadata` (AV2-D3).

> **Shape.** Seven tasks. `av2-01` is out-of-repo console config (the long pole; everything else depends on it). `av2-02` lands the callback route + auth helpers (the spine the UI reuses). `av2-03` is the method-picker UI. `av2-04` adds the complete-profile step + flag + middleware routing. `av2-05` deletes invite/set-password. `av2-06` simplifies the funnel. `av2-07` closes the gate.

---

## Pre-flight checklist (must be ✅ before Wave 1 code)

- [ ] `AV2-D1`…`D9` reviewed + confirmed by a human.
- [ ] **av2-01 done:** Google provider enabled; `/auth/callback` redirect URL allowlisted in Supabase **and** Google console (funnel + prod); email OTP template emits `{{ .Token }}`; "link identities with same email" enabled; admin Google account granted `app_metadata.role='admin'` (OQ-4).
- [ ] **OQ-1** answered — one route or two? (draft: keep both, shared picker).
- [ ] **OQ-2** answered — required fields on complete-profile (draft: name only).
- [ ] **OQ-3** answered — clean vestigial `password_set`/stubs now? (draft: leave).

---

## Wave plan

```
🛑 GATE (pre-flight above) ─────────────────────────────
Wave 0 (human/ops, parallel — external, ~hours→days for DLT-free Google):
  av2-01  Supabase + Google console config                            [Human/Ops]
        │  (blocks everything below)
        ▼
Wave 1 (~1.5h):
  av2-02  /auth/callback route + auth helpers (Google, email OTP)      [Opus]
        │
        ▼
Wave 2 (~2–3h):
  av2-03  method-picker UI for /login + /signup                        [Sonnet]
        │
        ▼
Wave 3 (~2h):
  av2-04  /complete-profile + profile_completed + middleware routing   [Opus]
        │
        ▼
Wave 4 (~1.5h):
  av2-05  retire invite + set-password (delete + rewire)               [Opus]
        │
        ▼
Wave 5 (~1h):
  av2-06  simplify funnel status (drop invited/password_set)           [Sonnet]
        │
        ▼
Wave 6 (~1h):
  av2-07  close gate: acceptance + smoke + verify + capture            [Sonnet/Composer]
```

Serial by default — each wave touches shared auth surfaces. Never two Opus tasks concurrently.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W0.0 | **av2-01** | S | **Human/Ops** | Supabase dashboard; Google Cloud console | Provider + redirect URLs (funnel + prod) + OTP template + identity-linking + admin role. **Blocks all code.** |
| W1.0 | **av2-02** | S–M | **Opus** | `lib/supabase/{client,server}.ts`; retired `set-password` (for the anti-pattern) | `app/auth/callback/route.ts` (`exchangeCodeForSession` → route by `profile_completed`); helper module `signInWithGoogle`/`sendEmailOtp`/`verifyEmailOtp`. |
| W2.0 | **av2-03** | M | Sonnet | `app/(auth)/{login,signup}/page.tsx`; `components/auth/AuthShell.tsx`; av2-02 helpers | Eka-style stacked cards; email → 6-digit OTP step; shared picker component (AV2-D8). |
| W3.0 | **av2-04** | M | **Opus** | `middleware.ts`; `(auth)/layout.tsx`; `lib/api.ts#patchDoctorSettings`; `dashboard-onboarding-service` (getting-started target) | `app/complete-profile/page.tsx` (outside `(auth)`); name(prefill)+practice/specialty → PATCH; stamp `profile_completed`; middleware enforce + matcher add. |
| W4.0 | **av2-05** | S–M | **Opus** | `doctor-invite-service.ts`; `admin-invite-controller.ts`; `routes/api/v1/{admin-doctors,index}.ts`; `app/admin/doctors/invite/**` | Delete service/controller/pages; remove `POST /invite` + wiring; drop invite/resend tests. |
| W5.0 | **av2-06** | S | Sonnet | `admin-doctors-service.ts#deriveFunnelStatus`; `types/admin-doctor.ts`; `DoctorFunnelBadge.tsx`; `DoctorsListClient.tsx`; `admin-doctors-service.test.ts` | Drop `invited`/`passwordSet`/`invitedAt`; funnel = onboarding→verification states. Update tests. |
| W6.0 | **av2-07** | S | Sonnet/Composer | all above; `DEFINITION_OF_DONE.md` | Acceptance, manual smoke (Google/email/complete-profile/existing acct), verification untouched, capture phone-OTP follow-up. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| av2-01 | S | **Human/Ops** | Console config; no code. |
| av2-02 | S–M | **Opus** | Auth boundary — session exchange + routing decision. |
| av2-03 | M | Sonnet | Frontend UI; no PHI/RLS/money. |
| av2-04 | M | **Opus** | Middleware auth-routing + metadata flag; easy to lock users out if wrong. |
| av2-05 | S–M | **Opus** | Deletes an ops endpoint + rewires routes; auth-adjacent. |
| av2-06 | S | Sonnet | Mechanical type/UI/test edits. |
| av2-07 | S | Sonnet/Composer | QA + gate. |

**Caps check:** no migration. No PHI added. RLS unchanged (state explicitly in av2-04/05 — the flag is `user_metadata`, not a policy). Never two Opus tasks concurrently (waves are serial).

---

## Acceptance gate

See the [batch plan's acceptance gate](../plan-auth-v2-batch.md#acceptance-gate).

---

## Task files

- [`task-av2-01-supabase-google-config.md`](./task-av2-01-supabase-google-config.md)
- [`task-av2-02-callback-and-auth-helpers.md`](./task-av2-02-callback-and-auth-helpers.md)
- [`task-av2-03-method-picker-ui.md`](./task-av2-03-method-picker-ui.md)
- [`task-av2-04-complete-profile-and-flag.md`](./task-av2-04-complete-profile-and-flag.md)
- [`task-av2-05-retire-invite-and-set-password.md`](./task-av2-05-retire-invite-and-set-password.md)
- [`task-av2-06-simplify-funnel-status.md`](./task-av2-06-simplify-funnel-status.md)
- [`task-av2-07-close-gate.md`](./task-av2-07-close-gate.md)

---

**Created:** 2026-07-23. **Status:** 🚧 Code landed for Waves 1–5 (`av2-02`…`06`). **Blocked on `av2-01` console config** before dogfood / `av2-07` close.
