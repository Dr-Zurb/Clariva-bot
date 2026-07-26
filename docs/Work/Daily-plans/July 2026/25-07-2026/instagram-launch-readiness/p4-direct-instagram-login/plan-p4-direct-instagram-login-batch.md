# Plan p4 — Direct Instagram Login connect (batch)

> **Status:** 📋 Scaffolded (2026-07-26). Execution **GATED** on decision lock.  
> **Program:** [`../README.md`](../README.md) · Prefix `ilr` · Tasks `ilr-17`…`ilr-21`  
> **One-line intent:** Let a doctor connect Instagram **without** a Facebook Page / Business Suite — via **Instagram API with Instagram Login** — and keep tokens alive with Graph refresh.

---

## Why this phase

Today's connect flow uses **Facebook Login + Page-linked Instagram** (`facebook.com/dialog/oauth` + `me/accounts` → Page token). That forces doctors to create a Facebook account, Page, and Business Suite link — the biggest onboarding drop-off for "Instagram-only" doctors.

Meta's **Instagram API with Instagram Login** lets the doctor authorize with Instagram credentials only. We already shipped this once (`e-task-13`, 2026-02-06) and later rolled back (almost certainly because App Review / Advanced Access for `instagram_business_*` scopes was not granted — "Invalid Scopes"). The recipe exists; the gating wall is Meta ops + a contained code re-apply.

**Not in this phase:** generalized `doctor_channel_connections` table, Facebook Messenger channel, WhatsApp connect. Those come later under the 3-social Integrations hub.

---

## Decision lock (confirm before Wave 1)

| ID | Decision | Implication |
|----|----------|-------------|
| **ILR4-D1** | **Clean swap** — replace FB Page OAuth with Instagram Login. No dual-path in v1. | Existing FB-linked rows must **reconnect**. Acceptable when only test accounts are connected. |
| **ILR4-D2** | **No migration** — reuse `doctor_instagram`; store IG professional account id in `instagram_page_id` (same as e-task-13). | Webhook resolution (`getDoctorIdByPageId`) stays. |
| **ILR4-D3** | Env vars keep names `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` but must point at the **Instagram app** (Business Login for Instagram), not the Facebook app. | Document in `.env.example` + ops task. |
| **ILR4-D4** | **60-day IG user tokens must refresh** via `graph.instagram.com/refresh_access_token` inside the existing `ilr-04` health cron path. | Without this, clean swap recreates silent day-60 death. |
| **ILR4-D5** | Meta App product config + App Review for IG Login scopes is **ops-parallel** (`ilr-17`). Code can be tested in Dev mode with app-role IG accounts before Advanced Access. | Real doctors blocked until review clears. |
| **ILR4-D6** | Defer generalized multi-channel connections table to post-sales FB/WA work. | Scope stays ≤ connect service + controller + token refresh + UI copy. |

---

## Open questions

| ID | Question | Default if unanswered |
|----|----------|------------------------|
| **OQ-1** | Any **production** doctors currently connected via FB Page path? | **Assume no** (test accounts only) → clean swap. If yes, STOP and design dual-path + `auth_type` migration (Opus). |
| **OQ-2** | Same Meta app vs dedicated Instagram app (`Clariva-Receptionist-Bot-IG`)? | Prefer the **Instagram app** already referenced in e-task-13 (`1643017033348333`) if still valid; confirm in dashboard. |
| **OQ-3** | Keep Facebook Page connect as a later "Facebook" card? | **Yes, later** — not in this phase. |

---

## Scope guard

- **DO NOT** start WhatsApp or Facebook Messenger adapters.
- **DO NOT** introduce `doctor_channel_connections` here.
- **DO NOT** redesign Settings → Integrations hub (copy/error strings only on existing Instagram card).
- Reuse e-task-13 recipe; do not invent a third OAuth path.
- PHI / migration → if OQ-1 flips to "yes production doctors", STOP + Opus.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ilr-17` | Meta App: Instagram Login product + App Review (ops) | S–ops | Founder |
| `ilr-18` | OAuth swap: Instagram Login connect (code) | M | **Opus** / Sonnet |
| `ilr-19` | IG long-lived token refresh in health sweep | S | Sonnet |
| `ilr-20` | Settings UI copy: drop "Facebook Page" dead-ends | S | Composer |
| `ilr-21` | Close gate p4 | S | Composer |

**Prior art:** [`e-task-13-instagram-api-instagram-login-migration.md`](../../../February%202026/Week%201/2026-02-06/e-task-13-instagram-api-instagram-login-migration.md) (marked DONE; code was reverted).

---

## Acceptance gate

- [ ] Connect button → `www.instagram.com/oauth/authorize` with `instagram_business_*` scopes.
- [ ] Callback exchanges via `api.instagram.com` + long-lived via `graph.instagram.com`; saves IG user_id + username; no Page list.
- [ ] Health cron can refresh IG user tokens before expiry (or nudge reconnect if refresh fails).
- [ ] UI no longer tells doctors to create a Facebook Page for the happy path.
- [ ] Meta ops checklist started; Advanced Access tracked.
- [ ] Typecheck + targeted tests green; manual connect with app-role IG account works in Dev.

---

**Created:** 2026-07-26.
