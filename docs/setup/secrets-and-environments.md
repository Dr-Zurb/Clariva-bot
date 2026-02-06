# Secrets & Environment Separation (COMPLIANCE.md §H, §I)

Secrets management and environment separation per [COMPLIANCE.md](../Reference/COMPLIANCE.md) §H (Secrets) and §I (Environments & Secrets).  
**Related:** [deployment-runbook.md](./deployment-runbook.md) | [DEPLOYMENT.md](../Reference/DEPLOYMENT.md)

---

## 1. Environment Separation (§I)

- **MUST:** Separate environments: **dev**, **staging**, **prod**.
- **MUST:** Different Supabase projects per environment (different `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`).
- **MUST:** Different API keys per environment (Instagram app, Razorpay, PayPal, Resend, OpenAI).
- **MUST NOT:** Use production data in dev or staging.

**Practice:**
- Dev: local `.env` / `.env.local`; Supabase dev project; test/sandbox keys.
- Staging: staging Supabase project; test or dedicated staging keys; `NEXT_PUBLIC_API_URL` = staging backend.
- Production: production Supabase project; live keys only; `NODE_ENV=production`, `LOG_LEVEL=warn` or `error`.

---

## 2. Secrets Management (§H, §I)

- **MUST:** All secrets in environment variables; validated at startup via `backend/src/config/env.ts` (Zod). No hardcoded secrets in repo or client bundle.
- **MUST:** Rotate service role keys **quarterly** (Supabase service role, Resend, etc.). Calendar a recurring task.
- **MUST:** Rotate secrets **on security incidents** (breach or suspected compromise). See [Incident response](#4-incident-response-rotation) below.
- **MUST:** Use different keys per environment (never reuse prod keys in dev/staging).
- **SHOULD:** Use a secret manager (e.g. AWS Secrets Manager, HashiCorp Vault) in production; document in runbook when adopted.

**Documentation:** All required env vars are listed in `backend/.env.example` and `frontend/.env.example`; no values committed.

---

## 3. Rotation Schedule (Quarterly)

| Secret type | Frequency | Action |
|-------------|-----------|--------|
| Supabase service role key | Quarterly | New key in Supabase Dashboard → update env in prod → restart backend. Revoke old key after verification. |
| Resend API key | Quarterly | Generate new key → update `RESEND_API_KEY` → restart. |
| Instagram / Meta tokens | Per Meta policy or on expiry | Regenerate in Meta Dashboard; update `INSTAGRAM_ACCESS_TOKEN` and related. |
| Payment webhook secrets | On rotation or incident | New secret in Razorpay/PayPal dashboard; update env; restart. |
| ENCRYPTION_KEY | On rotation or incident | New key → re-encrypt affected data or accept legacy decrypt for old payloads; document procedure. |

---

## 4. Incident Response (Rotation on Breach)

- **MUST:** Rotate all potentially exposed secrets within 1 hour of confirming a breach (or suspected compromise).
- Steps:
  1. Revoke or rotate: Supabase keys, payment secrets, Instagram token, Resend, OpenAI, `ENCRYPTION_KEY`.
  2. Update env vars in production (and staging if affected); restart backend and workers.
  3. Notify affected users per jurisdiction (GDPR, DPDPA, etc.).
  4. Log incident and post-incident review (see [compliance-monitoring.md](./compliance-monitoring.md)).

---

## 5. Env Var Management

- **Backend:** All vars validated in `config/env.ts`; server fails fast if required vars missing.
- **Frontend:** Only `NEXT_PUBLIC_*` are exposed to the client; set in Vercel (or host) for production.
- **Staging vs prod:** Use different env configs in hosting (e.g. Render “environments”, Vercel “Environment” dropdown). Never point staging at production DB or live payment keys.

---

## 6. Checklist

- [ ] Dev, staging, prod use separate Supabase projects and keys.
- [ ] No production data in dev/staging.
- [ ] Quarterly rotation scheduled for service role and critical API keys.
- [ ] Incident rotation procedure documented and known to owner.
- [ ] All required vars documented in `.env.example`; no secrets in repo.

---

**Last updated:** 2026-02-07  
**Reference:** COMPLIANCE.md §H, §I; e-task-8
