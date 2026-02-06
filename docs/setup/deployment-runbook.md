# Deployment Runbook – Clariva Backend & Frontend

Step-by-step guide to deploy backend and frontend to production (or staging).  
**Related:** [DEPLOYMENT.md](../Reference/DEPLOYMENT.md) | [COMPLIANCE.md](../Reference/COMPLIANCE.md) | [secrets-and-environments.md](./secrets-and-environments.md) | [compliance-monitoring.md](./compliance-monitoring.md)

---

## 1. Prerequisites

- [ ] Backend tests pass: `cd backend && npm test`
- [ ] Frontend build passes: `cd frontend && npm run build`
- [ ] No secrets in repo; all config via env (see [secrets-and-environments.md](./secrets-and-environments.md))
- [ ] Separate Supabase (and other) projects/keys for staging vs production

---

## 2. Backend Deployment

### Option A: Docker (Render, Railway, Fly.io, ECS, etc.)

1. **Build image** (from repo root):
   ```bash
   cd backend && docker build -t clariva-backend .
   ```
2. **Run** (env from host or secrets manager):
   ```bash
   docker run -p 3000:3000 -e PORT=3000 -e NODE_ENV=production --env-file .env.production clariva-backend
   ```
3. On **Render**: Connect repo, set root to `backend`, use Docker (Dockerfile) or Native (build: `npm ci && npm run build`, start: `node dist/index.js`). Add all env vars from [Environment matrix](#environment-matrix).
4. On **Railway**: Connect repo, set root to `backend`, add Dockerfile or use Nixpacks; configure env vars.

### Option B: Node on VPS / PaaS (no Docker)

1. **Build on server or in CI:**
   ```bash
   cd backend
   npm ci --omit=dev
   npm run build
   ```
2. **Start:**
   ```bash
   NODE_ENV=production node dist/index.js
   ```
   Or use PM2: `pm2 start dist/index.js --name clariva-backend`.

### Backend: Required env (production)

Set in hosting dashboard or `.env.production` (never commit). See `backend/.env.example` for full list; minimum:

- `NODE_ENV=production`
- `PORT=3000` (or platform-assigned)
- `LOG_LEVEL=warn` or `error`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (production Supabase project)
- `ENCRYPTION_KEY` (base64 32-byte key)
- Instagram: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- Payment: `RAZORPAY_*`, `PAYPAL_*` (live keys in prod), `PAYPAL_MODE=live`
- Notifications: `RESEND_API_KEY`, `DEFAULT_DOCTOR_EMAIL`
- Optional: `REDIS_URL` (webhook queue), `OPENAI_API_KEY`

---

## 3. Database Migrations

- Run **before** first deploy or after pulling new migrations.
- In Supabase: **SQL Editor** → run each file in `backend/migrations/` in order (001, 002, …).
- Or use Supabase CLI if configured: `supabase db push` (if linked to project).

---

## 4. Frontend Deployment (Vercel)

1. **Connect repo** to Vercel; set root to `frontend`.
2. **Build:** Next.js auto-detected. Build command: `npm run build` (default). Output: default.
3. **Environment variables** (in Vercel dashboard):
   - `NEXT_PUBLIC_API_URL` = production backend URL (e.g. `https://api.yourdomain.com`)
   - `NEXT_PUBLIC_SUPABASE_URL` = production Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = production anon key (same project as backend)
4. **Deploy:** Push to main (or trigger deploy). No `vercel.json` required for basic Next.js.

### Custom domain & SSL

- Vercel: add domain in project settings; SSL is automatic.
- Backend: use platform SSL (Render/Railway provide HTTPS) or put behind a reverse proxy (e.g. Cloudflare).

---

## 5. Webhooks (Production URLs)

After backend is live:

1. **Instagram:** Meta App Dashboard → Webhooks → Edit subscription → Callback URL: `https://<your-backend>/webhooks/instagram`. Verify token must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
2. **Razorpay:** Dashboard → Webhooks → Add URL: `https://<your-backend>/api/v1/webhooks/razorpay`. Secret = `RAZORPAY_WEBHOOK_SECRET`.
3. **PayPal:** Developer Dashboard → App → Webhooks → Add URL: `https://<your-backend>/api/v1/webhooks/paypal`. Webhook ID stored in `PAYPAL_WEBHOOK_ID`.

---

## 6. Environment Matrix

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| NODE_ENV | development | production | production |
| LOG_LEVEL | debug / info | info | warn / error |
| PAYPAL_MODE | sandbox | sandbox (or live) | live |
| Supabase | Dev project | Staging project | Production project |
| API keys | Test keys | Test or live | Live only |
| NEXT_PUBLIC_API_URL | http://localhost:3000 | Staging backend URL | Production backend URL |

Full list: `backend/.env.example`, `frontend/.env.example`. No production secrets in repo.

---

## 7. Production Readiness Checklist

Before going live or inviting first test customers:

- [ ] **5.1** All env vars set for target env; DB backups enabled (Supabase dashboard or provider).
- [ ] **5.2** Monitoring and error tracking in place (see [compliance-monitoring.md](./compliance-monitoring.md)).
- [ ] **5.3** Rate limiting and auth: verified in deployed env (e.g. hit `/health`, then protected route without token → 401).
- [ ] **5.4** Security/compliance: secrets and env separation documented ([secrets-and-environments.md](./secrets-and-environments.md)); data retention documented ([data-retention.md](./data-retention.md)).
- [ ] **5.5** Smoke test (see below).

---

## 8. Smoke Test (Production or Staging)

1. **Health:** `GET https://<backend>/health` → 200 or 503 with JSON (database/queue status).
2. **Frontend:** Open `https://<frontend>` → login page loads; login with test doctor → dashboard and appointments load.
3. **Webhook (if configured):** Send test Instagram message → bot responds (or check logs for webhook received).
4. **Booking (optional):** Complete a test booking → payment link; complete payment in sandbox/live → webhook processed.

---

## 9. Rollback

- **Backend:** Redeploy previous image or previous Git commit; restart process.
- **Frontend:** Vercel → Deployments → Promote previous deployment.
- **Database:** Only roll back migrations if safe (e.g. additive changes); otherwise restore from backup if critical.

See [DEPLOYMENT.md](../Reference/DEPLOYMENT.md) for detailed rollback steps.

---

**Last updated:** 2026-02-07  
**Reference:** e-task-8 (Deployment & Launch Prep)
