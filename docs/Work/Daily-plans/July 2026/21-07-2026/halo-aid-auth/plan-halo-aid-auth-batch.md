# Halo Aid — auth polish (login + signup)

> **Status:** ✅ Complete (2026-07-21). `auth-01`…`auth-04` shipped — shared `AuthShell` on `/login` + `/signup`.
> **One-line intent:** Shared Halo Aid chrome for `/login` and `/signup` — brand, mist atmosphere, design-system inputs/buttons — **without** changing Supabase auth behavior.

---

## Decision lock

| ID | Decision |
|---|---|
| **HAA-D1** | Login + signup share one `AuthShell` (logo, mist bg, centered frame). |
| **HAA-D2** | Visual polish only — same Supabase flows, redirects, error copy. |
| **HAA-D3** | Use UI kit (`Button`, `Input`, `Label`) + semantic / Halo mist tokens. |
| **HAA-D4** | No forgot-password / OAuth / magic link. |
| **HAA-D5** | Keep `data-testid="login-error-message"` and a11y hooks. |

---

## Tasks

| Task | Title | Size |
|---|---|---|
| `auth-01` | `AuthShell` component | S |
| `auth-02` | Restyle login onto shell | S |
| `auth-03` | Restyle signup + email-confirm onto shell | S |
| `auth-04` | Close gate (smoke + docs) | S |

---

## Acceptance gate

- [x] `/login` and `/signup` show Halo Aid logo + mist background + primary button.
- [x] Auth logic unchanged (Supabase flows preserved).
- [x] `data-testid="login-error-message"` preserved.
- [x] Slice lint clean; HTTP 200 smoke.

---

**Created:** 2026-07-21. **Shipped:** 2026-07-21.
