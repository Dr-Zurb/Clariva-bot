# Plan p1 — Facebook Page connect + Messenger DMs (batch)

> **Status:** 📋 Scaffolded (2026-07-26). Execution **GATED** on program decision lock.  
> **Program:** [`../README.md`](../README.md) · Prefix `fbm` · Tasks `fbm-01`…`fbm-08`  
> **One-line intent:** Doctor connects a Facebook Page → Clariva replies to Messenger DMs with the same AI receptionist as Instagram.

---

## Why this phase

Instagram Login is live without a Facebook Page. Many clinics still run a **Facebook Page** inbox; patients message there too. We already have Graph send fallbacks and partial `object: page` parsing — this phase makes Facebook a first-class Integrations card and inbound channel.

**Not in this phase:** Page comments (p2), WhatsApp, unified `doctor_channel_connections` table.

---

## Decision lock (confirm before Wave 1)

Inherit **FBM-D1…D8** from program README. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **FBM1-D1** | Facebook Login for Business → list Pages → doctor picks one Page (or single-Page auto). | Store Page id + long-lived Page token in `doctor_facebook`. |
| **FBM1-D2** | After connect: `POST /{page-id}/subscribed_apps` with `messages` (and messaging_* as needed). | Avoid silent “connected but no webhooks” (same class of bug as IG). |
| **FBM1-D3** | Conversations use `platform = 'facebook'` (type already exists). | Identity = Messenger PSID; do not collide with IG sender ids. |
| **FBM1-D4** | Env: `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_REDIRECT_URI` (new) — do not reuse `INSTAGRAM_*`. | Halo Aid FB app ≠ Halo Aid-IG. |

---

## Open questions

| ID | Question | Default if unanswered |
|----|----------|------------------------|
| **OQ-1** | Same callback host path: extend `/webhooks/instagram` to accept `object: page`, or add `/webhooks/facebook`? | **Extend existing webhook controller** if signature secret is the FB app secret; document. If secrets differ, split routes. |
| **OQ-2** | Multi-Page doctors: picker UI vs first Page only? | **v1: single Page** (first or only); picker if >1. |
| **OQ-3** | Link FB Page that already has IG connected on Halo Aid-IG? | **Independent** — doctor may connect IG and/or FB; no require-both. |

---

## Scope guard

- **DO NOT** start WhatsApp or change IG Login OAuth.
- **DO NOT** put Page tokens into `doctor_instagram` IG-login rows.
- **DO NOT** fork `run-conversation-turn`.
- Migration / RLS → **Opus** (`fbm-02`).
- Never log Page tokens or PSIDs in full if treated as sensitive in COMPLIANCE — follow existing IG patterns (ids OK, tokens never).

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `fbm-01` | Meta App: Facebook Login + Messenger + Page webhooks (ops) | S–ops | Founder |
| `fbm-02` | Migration: `doctor_facebook` (+ RLS) | M | **Opus** |
| `fbm-03` | OAuth connect / disconnect / subscribed_apps | M | Sonnet |
| `fbm-04` | `facebook` channel adapter (parse + send) | M | Sonnet |
| `fbm-05` | Wire `page` webhooks → adapter → conversation turn | M | Sonnet |
| `fbm-06` | Integrations UI: Connect Facebook card | S–M | Composer / Sonnet |
| `fbm-07` | Page token health / reconnect nudge | S | Sonnet |
| `fbm-08` | Close gate p1 | S | Composer |

---

## Acceptance gate

- [x] Verified doctor can Connect Facebook → Page authorized → dashboard shows connected Page name.
- [x] Patient Messenger DM to that Page → webhook → bot reply (Dev / tester).
- [x] Echo / delivery receipts ignored; idempotency holds.
- [x] Disconnect clears row + unsubscribes apps (best-effort). *(implemented; optional re-smoke)*
- [x] Typecheck + targeted tests green; Meta ops checklist started (`fbm-01`).

---

**Created:** 2026-07-26.
