# Task fbm-01: Meta App — Facebook Login + Messenger + Page webhooks (ops)

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Configure the **Facebook** Meta app (not Halo Aid-IG) for Page Login, Messenger, and Page webhooks. Track App Review for Messenger / pages permissions.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 0  
**Estimated Time:** Ops — hours setup + review lead time  
**Status:** 🟡 IN PROGRESS — repo env scaffolding ✅; Meta dashboard = Founder  
**Change Type:** Ops / checklist  
**Model:** Founder (+ agent for `.env.example` / `env.ts`)  
**Depends on:** FBM-D2 (correct app)

---

## Concrete targets (local Funnel)

| Item | Value |
|------|--------|
| **Facebook app** | Halo Aid — App ID `27623008554059525` (confirm in dashboard) |
| **Not this app** | Halo Aid-IG `1393847999343578` (`INSTAGRAM_APP_ID`) |
| **OAuth redirect** | `https://clariva-dev.tail363099.ts.net/api/v1/settings/facebook/callback` |
| **Frontend bridge** | `https://clariva-dev.tail363099.ts.net/auth/facebook-return` |
| **Page webhook callback** | `https://clariva-dev.tail363099.ts.net/webhooks/instagram` (OQ-1 default: same Funnel path; signature uses FB app secret in `fbm-05`) **or** `/webhooks/facebook` if you prefer a split — pick one and stick to it |
| **Verify token** | Prefer dedicated `FACEBOOK_WEBHOOK_VERIFY_TOKEN`, or reuse `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` if same callback |

---

## ✅ Task Breakdown

### 1. App identity
- [ ] 1.1 Confirm app id for Facebook Page path = Halo Aid `27623008554059525` (or chosen FB app) ≠ `INSTAGRAM_APP_ID`.
- [ ] 1.2 Add products: **Facebook Login**, **Messenger**, **Webhooks** (Page object).

### 2. OAuth + webhooks
- [ ] 2.1 Valid OAuth Redirect URI → `…/api/v1/settings/facebook/callback` (local Funnel + prod when ready).
- [ ] 2.2 Page webhook callback + verify token set (see table above).
- [ ] 2.3 Subscribe Page fields for p1: at least **`messages`** (add messaging_postbacks / messaging_seen if useful). Comment/feed fields → p2.

### 3. Permissions / review
- [ ] 3.1 Add for testing: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` (confirm current Meta names).
- [ ] 3.2 App roles / testers: Page admin accounts used in Dev.
- [ ] 3.3 App Review for non-testers — start when Connect + DM smoke works; log dates below.

### 4. Env alignment (repo)
- [x] 4.1 `.env.example` + `config/env.ts`: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, `FACEBOOK_FRONTEND_REDIRECT_URI`, optional `FACEBOOK_WEBHOOK_VERIFY_TOKEN`.
- [ ] 4.2 Local `backend/.env`: paste Halo Aid App ID + secret + redirect/bridge URLs (Founder — do not commit).
- [ ] 4.3 Meta **Test** Page `messages` webhook → backend log `Webhook POST received` / Instagram path if shared URL.

---

## ✅ Acceptance Criteria

- [ ] Webhook Test for Page `messages` hits local Funnel logs.
- [ ] Redirect URI registered; secrets in local `.env` for `fbm-03`.
- [ ] Status dates recorded below.

## Status log

| Date | Note |
|------|------|
| 2026-07-26 | Task created. |
| 2026-07-26 | Repo: `FACEBOOK_*` added to `env.ts` + `.env.example`. Founder Meta checklist still open. |

---

**Created:** 2026-07-26.
