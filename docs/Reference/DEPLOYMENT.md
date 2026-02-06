# Deployment Guide

**Purpose:** Deployment checklist, environment setup, rollback procedures, and production readiness for the Clariva bot.

**Audience:** AI agents and developers preparing for production deployment.

**Related:** [ONBOARDING.md](./ONBOARDING.md) | [SECURITY.md](./SECURITY.md) | [OBSERVABILITY.md](./OBSERVABILITY.md)

---

## 🚀 Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass (`npm test`)
- [ ] Type-check passes (`npm run type-check`)
- [ ] Lint passes with no errors (`npm run lint`)
- [ ] No `console.log` or debug statements in code (use `logger` instead)
- [ ] No TODOs or FIXMEs for critical functionality

### Security
- [ ] All secrets in environment variables (no hardcoded secrets)
- [ ] `.env` file not committed to Git (in `.gitignore`)
- [ ] Production secrets different from dev/test secrets
- [ ] Webhook signatures verified for all webhooks
- [ ] Rate limiting enabled on all public endpoints
- [ ] RLS policies enabled on all user data tables
- [ ] HTTPS/TLS for all external communication
- [ ] See [SECURITY.md](./SECURITY.md) for full checklist

### Database
- [ ] All migrations run in production database
- [ ] Database backup configured (Supabase auto-backup or manual)
- [ ] RLS policies tested (can user access only their data?)
- [ ] Indexes created for common queries
- [ ] Connection pooling configured (Supabase handles this)

### Environment Variables
- [ ] All required env vars set in production
- [ ] Production API keys configured (OpenAI, Instagram, Razorpay Live, PayPal Live)
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=warn` or `error` (not `debug` in prod)
- [ ] `PAYPAL_MODE=live` (not `sandbox`)
- [ ] Webhook secrets set (Razorpay, PayPal, Instagram)

### External Services
- [ ] Instagram webhook verified and active (use production URL, not ngrok)
- [ ] Razorpay live mode enabled; webhook configured
- [ ] PayPal live mode enabled; webhook configured
- [ ] OpenAI API key has sufficient quota
- [ ] Redis/queue service running (cloud Redis or self-hosted)

### Monitoring & Logging
- [ ] Logs configured (Pino, no PHI in logs)
- [ ] Correlation IDs enabled (middleware in place)
- [ ] Health endpoint accessible (`GET /health`)
- [ ] Future: Set up alerts (error rate, response time, queue depth)

---

## 🌍 Environment-Specific Configuration

### Development
- `NODE_ENV=development`
- `LOG_LEVEL=debug` (verbose logs)
- `PAYPAL_MODE=sandbox`
- Use ngrok for webhooks
- Test API keys (Razorpay test, PayPal sandbox, Instagram test app)

### Staging (if applicable)
- `NODE_ENV=production` (or `staging`)
- `LOG_LEVEL=info`
- `PAYPAL_MODE=sandbox` (or `live` for staging with live mode)
- Production-like setup; test webhooks with staging URLs
- Test API keys or live keys (depending on staging strategy)

### Production
- `NODE_ENV=production`
- `LOG_LEVEL=warn` or `error`
- `PAYPAL_MODE=live`
- Production API keys (live Razorpay, live PayPal, production Instagram app)
- Production database (with backups)
- Production Redis (with persistence/backups)

---

## 📦 Deployment Steps

### First-Time Production Deployment

**1. Provision infrastructure**
- Database: Supabase project (or self-hosted Postgres)
- Redis: Cloud Redis (Upstash, Redis Labs) or self-hosted
- Hosting: VPS, PaaS (Heroku, Railway, Render), or serverless (if applicable)

**2. Set up environment**
- Create production `.env` or configure env vars in hosting platform
- Set all required vars (see `.env.example`)
- Use production secrets (different from dev)

**3. Run database migrations**
```bash
# Via Supabase dashboard SQL editor or CLI
# Run all migrations in backend/migrations/ in order
```

**4. Build application**
```bash
npm run build
# Creates dist/ with compiled JS
```

**5. Start server**
```bash
npm start
# OR use process manager (PM2, systemd)
pm2 start dist/index.js --name clariva-bot
```

**6. Configure webhooks**
- Instagram: Meta dashboard → production URL (e.g., `https://api.clariva.com/webhooks/instagram`)
- Razorpay: Dashboard → live webhooks
- PayPal: Developer dashboard → live webhooks

**7. Smoke test**
- `GET /health` → 200 OK
- Send test Instagram DM → bot responds
- Book test appointment → payment link sent → payment webhook processed

**8. Monitor**
- Check logs for errors
- Monitor queue (jobs processing)
- Monitor database (queries running)

---

### Subsequent Deployments (Updates)

**1. Test locally**
```bash
npm test
npm run type-check
npm run lint
```

**2. Build**
```bash
npm run build
```

**3. Deploy**
```bash
# Upload dist/ to server or push to hosting platform
# OR use CI/CD (GitHub Actions, GitLab CI)
```

**4. Run new migrations (if any)**
```bash
# Apply new migration files to production database
```

**5. Restart server**
```bash
pm2 restart clariva-bot
# OR let hosting platform restart automatically
```

**6. Verify**
- Check `/health` endpoint
- Test critical flows (webhook, booking, payment)
- Monitor logs for errors

---

## ⏪ Rollback Procedures

### When to Rollback

- Critical bug in production (data loss, security issue, service down)
- Unintended behavior affecting users
- Performance degradation (response time >5s, queue stalling)

### Rollback Steps

**1. Stop deployment**
- If deploy in progress, cancel it

**2. Revert to previous version**
```bash
# If using Git tags/releases
git checkout v1.2.3
npm run build
pm2 restart clariva-bot

# If using hosting platform
# Use platform's "rollback to previous version" feature
```

**3. Rollback database (if migration failed)**
- **CAUTION:** Database rollback is risky; may lose data
- If migration added columns/tables: Safe to rollback (drop added items)
- If migration modified data: Might lose changes; restore from backup

**4. Verify rollback**
- Check `/health` endpoint
- Test critical flows
- Monitor logs

**5. Fix issue and re-deploy**
- Fix bug in code
- Test locally
- Deploy fix

---

## 🏥 Health Checks & Readiness

### Health Endpoint

**URL:** `GET /health`

**Purpose:** Check if server is healthy (ready to serve traffic)

**Response (healthy):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "services": {
      "database": { "connected": true, "responseTimeMs": 42 },
      "queue": { "connected": true }
    }
  },
  "meta": { "timestamp": "...", "requestId": "..." }
}
```

**Response (unhealthy):**
```json
{
  "success": true,
  "data": {
    "status": "error",
    "services": {
      "database": { "connected": false },
      "queue": { "connected": false }
    }
  }
}
```
*Status code: 503*

**Use in production:**
- Load balancer health check
- Uptime monitoring (Pingdom, UptimeRobot)
- Auto-restart if unhealthy (PM2, Kubernetes)

---

## 🔥 Production Troubleshooting

### Server not responding

1. Check server status: `pm2 status` or hosting platform dashboard
2. Check logs: `pm2 logs clariva-bot` or platform logs
3. Restart: `pm2 restart clariva-bot`
4. Check resources: CPU, memory, disk (might be maxed out)

### Database connection fails

1. Check Supabase dashboard (service status)
2. Verify env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
3. Check connection limit (Supabase free tier: 500 connections)
4. Test connection: `GET /health`

### Queue not processing

1. Check Redis status (cloud dashboard or `redis-cli ping`)
2. Check worker logs (should see "Webhook worker started")
3. Check queue depth (too many jobs? worker overloaded?)
4. Restart worker if stalled

### Webhook not received in production

1. Verify webhook URL in Meta/Razorpay/PayPal dashboard (no ngrok, use production URL)
2. Check firewall/security group (allow inbound HTTPS)
3. Test endpoint: `curl -X POST https://api.clariva.com/webhooks/instagram`
4. Check signature verification logs (401 → invalid signature)

---

## 🔗 Related Documentation

- [deployment-runbook.md](../setup/deployment-runbook.md) — Step-by-step deploy (backend + frontend), env matrix, production checklist
- [compliance-monitoring.md](../setup/compliance-monitoring.md) — §J monitoring and alerting
- [secrets-and-environments.md](../setup/secrets-and-environments.md) — §H, §I secrets and env separation
- [data-retention.md](../setup/data-retention.md) — §F retention policy and phased automation
- [ONBOARDING.md](./ONBOARDING.md) — Dev setup
- [SECURITY.md](./SECURITY.md) — Security checklist
- [DEBUGGING.md](./DEBUGGING.md) — Troubleshooting
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Logging and monitoring

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
