# Onboarding & Project Context

**Purpose:** Get up to speed on Clariva Care, understand the architecture, set up dev environment, and learn key decisions.

**Audience:** New developers, AI agents, or returning developers after a break.

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) | [README.md](../../README.md) | [BUSINESS_PLAN.md](../Business files/BUSINESS_PLAN.md)

---

## 🎯 What is Clariva Care?

**Product:** AI Receptionist Bot for doctors on social media (Instagram, Facebook, WhatsApp).

**The Problem:** Doctors get 20-100+ patient inquiries per week on social media but can't respond to all of them. They lose patients, waste 5-15 hours/week on manual responses, and can't track ROI.

**The Solution:** AI bot handles inquiries 24/7, collects patient info, books appointments, and sends payment links — all while maintaining professional, compliant communication.

**Market:** Global from day 1 (India, US, UK, EU) — 2M+ doctors on social media worldwide.

**Revenue:** SaaS subscription (₹999/month in India, ~$12/month internationally; free tier available).

**Tech Stack:** Node.js + Express + Supabase (PostgreSQL) + BullMQ (Redis queues) + OpenAI + Instagram Graph API + Razorpay (India) + PayPal (International, later Stripe).

---

## 🏗️ High-Level Architecture

### User Flow

1. **Patient** sends Instagram DM to doctor's account
2. **Instagram** sends webhook to Clariva bot
3. **Bot** (AI) detects intent (book appointment, ask question, etc.)
4. **Bot** collects patient info (name, phone, reason, preferred date/time)
5. **Bot** checks doctor's availability and books slot
6. **Bot** sends payment link (Razorpay for India, PayPal for international)
7. **Patient** pays via link
8. **Payment gateway** sends webhook to Clariva
9. **Bot** confirms appointment (updates status to `confirmed`, sends confirmation DM)

### System Components

```
Instagram → Webhook → Queue → Worker → AI Service → Database
                                ↓
                          Payment Service → Razorpay / PayPal
```

**Key services:**
- **instagram-service:** Send DMs, format messages
- **ai-service:** OpenAI intent detection and response generation
- **conversation-service:** Track conversation state, patient collection flow
- **appointment-service:** Book appointments, check availability
- **payment-service:** Create payment links (region-based routing), process payment webhooks
- **webhook-worker:** Async webhook processing (Instagram, Razorpay, PayPal)

**Infrastructure:**
- **Database:** Supabase (PostgreSQL) with RLS policies
- **Queue:** BullMQ + Redis for async webhook processing
- **External APIs:** Instagram Graph API, OpenAI, Razorpay, PayPal

---

## 🛠️ Dev Environment Setup

### Prerequisites

- **Node.js:** v18+ (LTS recommended)
- **npm:** v9+
- **PostgreSQL:** via Supabase (cloud) or local
- **Redis:** For BullMQ queues (local or cloud)
- **ngrok:** For local webhook testing

### First-Time Setup

**1. Clone and install**

```bash
git clone <repo-url>
cd clariva-bot/backend
npm install
```

**2. Configure environment**

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

**Required env vars:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `INSTAGRAM_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE`
- `REDIS_URL` (for queues)
- `DEFAULT_DOCTOR_ID` (MVP: single doctor; multi-tenant later)

**3. Run database migrations**

```bash
# Migrations in backend/migrations/*.sql
# Run them in order via Supabase dashboard SQL editor or CLI
```

**4. Start dev server**

```bash
npm run dev
```

**5. Expose local server for webhooks (ngrok)**

```bash
ngrok http 3000
# Use ngrok URL for Instagram and payment gateway webhook setup
```

**6. Configure webhooks**

- **Instagram:** Meta Developer Dashboard → Webhooks → `https://<ngrok-url>/webhooks/instagram`
- **Razorpay:** Dashboard → Webhooks → `https://<ngrok-url>/webhooks/razorpay`
- **PayPal:** Developer Dashboard → Webhooks → `https://<ngrok-url>/webhooks/paypal`

---

## 📁 Project Structure

```
clariva-bot/
├── backend/
│   ├── src/
│   │   ├── config/        # Env, database, logger, queue, payment
│   │   ├── controllers/   # Request handlers (health, webhook, payment)
│   │   ├── services/      # Business logic (appointment, payment, instagram, ai, conversation)
│   │   ├── routes/        # Express routes (api/v1/*, webhooks)
│   │   ├── middleware/    # Auth, rate limiting, logging, sanitization
│   │   ├── workers/       # Async job processing (webhook-worker)
│   │   ├── adapters/      # Payment gateway adapters (Razorpay, PayPal)
│   │   ├── types/         # TypeScript types and interfaces
│   │   ├── utils/         # Helpers (errors, validation, audit-logger, encryption)
│   │   └── index.ts       # App entry point
│   ├── migrations/        # Database migrations (001_*.sql, 002_*.sql, etc.)
│   ├── tests/             # Unit, integration, e2e tests
│   └── .env               # Environment variables (DO NOT COMMIT)
├── docs/
│   ├── Reference/         # Coding standards, architecture, compliance
│   ├── task-management/   # Task creation and tracking rules
│   ├── Development/       # Daily plans, monthly plans
│   ├── Learning/          # Learning files per task
│   └── Business files/    # Business plan, pricing
└── README.md
```

---

## 🧠 Key Architectural Decisions

### Decision 1: Dual Payment Gateway (Razorpay + PayPal)

**Why:** Global launch from day 1; Stripe ideal but invite-only for Indian entities.

**Solution:** Razorpay for India (best Indian experience), PayPal for international (trusted globally, instant onboarding). Gateway abstraction layer (`IPaymentGateway`, adapters) enables future Stripe migration when Stripe opens in India.

**Impact:** Multi-gateway support, region-based routing by doctor country.

### Decision 2: Async Webhook Processing (BullMQ)

**Why:** Instagram and payment gateways require <20s response; processing (AI, DB) can take longer.

**Solution:** Webhooks verified + queued immediately (200 OK <1s); async worker processes jobs.

**Impact:** Fast webhook response, reliable processing, retry on failure.

### Decision 3: Service Role + RLS for Database

**Why:** Need to bypass RLS for system operations (booking from webhooks) while enforcing RLS for API.

**Solution:** Service role client for workers/webhooks; anon client for API + RLS. Manual ownership checks when using service role (e.g., payment-service checks `appointment.doctor_id`).

**Impact:** System can book appointments on behalf of patients; doctors can only access their own data.

### Decision 4: Conversation State Machine

**Why:** Patient collection flow is multi-turn (name → phone → reason → date/time).

**Solution:** Conversation service tracks state (awaiting_name, awaiting_phone, etc.); AI detects when to advance state.

**Impact:** Robust multi-turn conversations, resumable flows.

### Decision 5: OpenAI for Intent Detection

**Why:** Need to understand patient messages ("book appointment" vs "ask question" vs "cancel").

**Solution:** OpenAI GPT-4 Turbo (or o1) for intent detection and response generation; structured output for reliability.

**Impact:** Accurate intent detection, natural responses, cost-effective (vs fine-tuning or custom NLP).

### Decision 6: Global Compliance from Day 1

**Why:** Launching globally (US HIPAA, EU GDPR, India DPDPA); healthcare data is sensitive.

**Solution:** No PHI in logs, RLS on all user data, consent tracking, audit logs, webhook signature verification.

**Impact:** Compliance-first architecture; ready for any market.

---

## 🔧 Common Workflows

### Start a coding session

1. Review monthly plan: `docs/Development/Monthly-plans/2025-01-09_1month_dev_plan.md`
2. Check today's tasks: `docs/Development/Daily-plans/YYYY-MM-DD/`
3. Read task file (e.g., `e-task-4-payment-integration.md`)
4. Check "Current State" to see what exists
5. Implement using [STANDARDS.md](./STANDARDS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [RECIPES.md](./RECIPES.md)
6. Run tests: `npm test`
7. Type-check: `npm run type-check`
8. Lint: `npm run lint`

### Add a new feature

1. Create task file using `docs/task-management/TASK_TEMPLATE.md`
2. Mark "Change type: New feature"
3. Follow task breakdown
4. Reference [STANDARDS.md](./STANDARDS.md) and [RECIPES.md](./RECIPES.md)
5. Write tests alongside code
6. Update docs if new patterns emerge

### Change existing code

1. Create task file using `docs/task-management/TASK_TEMPLATE.md`
2. Mark "Change type: Update existing"
3. Follow [CODE_CHANGE_RULES.md](../task-management/CODE_CHANGE_RULES.md):
   - Audit current implementation
   - Map impact
   - Implement changes
   - Remove obsolete code
   - Update tests and docs
4. Verify no dead code remains

### Debug an issue

1. Check logs with correlation ID (Supabase logs, console, or future monitoring)
2. Trace request flow (webhook → queue → worker → service → DB)
3. Check env vars are set correctly
4. Verify external API keys (Instagram, OpenAI, Razorpay, PayPal)
5. Test locally with ngrok
6. See [DEBUGGING.md](./DEBUGGING.md) (once created) for checklist

---

## 📖 Where to Find Things

### "I need to..."

| What | Where |
|------|-------|
| Understand coding standards | [STANDARDS.md](./STANDARDS.md) |
| Learn the project structure | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Find implementation patterns | [RECIPES.md](./RECIPES.md) |
| Check compliance rules | [COMPLIANCE.md](./COMPLIANCE.md) |
| Add a webhook | [WEBHOOKS.md](./WEBHOOKS.md) |
| Design an API endpoint | [API_DESIGN.md](./API_DESIGN.md) |
| Write tests | [TESTING.md](./TESTING.md) |
| Understand errors | [ERROR_CATALOG.md](./ERROR_CATALOG.md) |
| Add external API | [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) |
| Check database schema | [DB_SCHEMA.md](./DB_SCHEMA.md) |
| Set up RLS | [RLS_POLICIES.md](./RLS_POLICIES.md) |
| Run migrations | [MIGRATIONS_AND_CHANGE.md](./MIGRATIONS_AND_CHANGE.md) |
| Configure defaults | [SAFE_DEFAULTS.md](./SAFE_DEFAULTS.md) |
| Know when code is done | [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md) |
| Create a task | [task-management/TASK_TEMPLATE.md](../task-management/TASK_TEMPLATE.md) |
| Change existing code | [task-management/CODE_CHANGE_RULES.md](../task-management/CODE_CHANGE_RULES.md) |

---

## 🤔 Decision Log

**Why we made certain choices:**

### Why Razorpay + PayPal (not Stripe)?
- **Goal:** Global launch from day 1.
- **Stripe:** Ideal for international (2.9% fees, best API) but invite-only for Indian entities.
- **Razorpay:** Best for India (UPI, cards, netbanking; local support).
- **PayPal:** Instant international onboarding; trusted globally; higher fees (~3.9%+) but enables global launch now.
- **Future:** Swap PayPal → Stripe when Stripe opens in India or we have US entity. Gateway abstraction makes this a single-adapter swap.

### Why OpenAI (not local LLM)?
- **Quality:** GPT-4 Turbo / o1 provides accurate intent detection and natural responses.
- **Speed:** Acceptable latency (<2s for most requests).
- **Cost:** $0.01-0.10 per patient conversation (vs hours of manual work).
- **Structured output:** Reliable JSON for intent detection (better than parsing free-form text).

### Why BullMQ (not other queue)?
- **Redis-backed:** Fast, reliable, persistent queues.
- **Retries:** Automatic retry with exponential backoff.
- **Dead letter:** Failed jobs stored for manual review.
- **TypeScript:** Good TypeScript support.

### Why Supabase (not self-hosted Postgres)?
- **RLS:** Built-in Row-Level Security (critical for multi-tenant).
- **Auth:** Auth system (future: doctor login).
- **Real-time:** Future: real-time dashboard for doctors.
- **Managed:** No DevOps overhead; focus on product.

### Why Service Role + RLS (not only RLS)?
- **Webhooks:** Need to book appointments on behalf of patients (webhook has no user JWT).
- **RLS:** Protects API endpoints (doctors see only their data).
- **Solution:** Service role for system operations; manual ownership checks when bypassing RLS.

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Type-check
npm run type-check

# Lint
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Expose local server for webhooks
ngrok http 3000
```

---

## 🧭 Navigation Tips

- **Start here:** [README.md](../../README.md) for project overview
- **Business context:** [BUSINESS_PLAN.md](../Business files/BUSINESS_PLAN.md)
- **Monthly roadmap:** [Monthly-plans/2025-01-09_1month_dev_plan.md](../Development/Monthly-plans/2025-01-09_1month_dev_plan.md)
- **Today's tasks:** [Development/Daily-plans/YYYY-MM-DD/](../Development/Daily-plans/)
- **Coding rules:** [Reference/](../Reference/) folder (20+ docs)
- **Task creation:** [task-management/](../task-management/)

---

## ❓ Common Questions

### "How do I test webhooks locally?"
Use ngrok to expose localhost; configure webhook URL in Meta/Razorpay/PayPal dashboard with ngrok URL.

### "Where do I find the database schema?"
[DB_SCHEMA.md](./DB_SCHEMA.md) has full schema; `backend/migrations/` has SQL files.

### "What's the difference between anon and service role?"
- **Anon:** For API endpoints; RLS enforced (doctors see only their data).
- **Service role:** For webhooks/workers; bypasses RLS (system operations like booking on behalf of patient).

### "Why do we use correlation IDs?"
To trace a request through the entire flow (webhook → queue → worker → service → DB). See [OBSERVABILITY.md](./OBSERVABILITY.md).

### "Can I use `process.env` directly?"
No — use `env` from `config/env.ts` (validated with Zod). See [STANDARDS.md](./STANDARDS.md).

### "How do I add a new webhook?"
Follow [WEBHOOKS.md](./WEBHOOKS.md) and the R-WEBHOOK-001 pattern in [RECIPES.md](./RECIPES.md).

---

## 🔗 Related Documentation

- [README.md](../../README.md) — Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Detailed architecture
- [BUSINESS_PLAN.md](../Business files/BUSINESS_PLAN.md) — Business context
- [STANDARDS.md](./STANDARDS.md) — Coding rules
- [COMPLIANCE.md](./COMPLIANCE.md) — Global compliance

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
