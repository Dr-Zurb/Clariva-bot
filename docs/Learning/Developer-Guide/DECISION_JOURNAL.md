# Decision Journal

**Purpose:** Record why we made certain architectural and technical decisions. Future you will thank present you.

**How to use:** When you wonder "why did we do it this way?", check here first.

---

## 💳 Payment Gateway Decisions

### Decision: Razorpay + PayPal (not Stripe alone)

**Date:** January 2026

**Context:** We need to accept payments globally from day 1.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Stripe only** | Best API, lowest international fees (2.9%), single integration | Not available for Indian entities without invite; can't use |
| **Razorpay only** | Best for India (UPI, netbanking, cards) | International support weak; higher fees for USD |
| **PayPal only** | Works globally, instant signup | Higher fees (~3.9%), no UPI support for India |
| **Razorpay + PayPal** | Best experience in each region | Two integrations to maintain |

**Decision:** Razorpay for India + PayPal for International

**Reasoning:**
1. We want global launch from day 1 (not India-first)
2. Indian patients expect UPI → Razorpay is best
3. International patients trust PayPal → familiar checkout
4. Stripe is ideal but inaccessible for Indian entities right now
5. Gateway abstraction layer means we can swap PayPal → Stripe later

**Future Plan:** When Clariva has enough volume or a US entity, migrate international payments to Stripe (lower fees, better API).

**Code Impact:**
- `src/adapters/payment-gateway.interface.ts` — Abstraction layer
- `src/adapters/razorpay-adapter.ts` — India gateway
- `src/adapters/paypal-adapter.ts` — International gateway
- `src/config/payment.ts` — Region-based routing

---

### Decision: Payment Link Model (not direct integration)

**Date:** January 2026

**Context:** How should patients pay?

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Payment links** | No PCI compliance needed; patients enter card on gateway | Less control; redirect UX |
| **Direct API (collect card details)** | Full control; seamless UX | PCI compliance required; legal liability |
| **Embedded checkout** | Best UX; gateway handles card | More complex integration |

**Decision:** Payment links

**Reasoning:**
1. We NEVER see card numbers → no PCI compliance burden
2. Simpler integration → faster to launch
3. Patients trust Razorpay/PayPal checkout pages
4. Works via Instagram DM (send link, patient clicks)

**Trade-off accepted:** Redirect UX is slightly worse, but compliance and security are worth it.

---

## 🗄️ Database Decisions

### Decision: Supabase (not self-hosted Postgres)

**Date:** January 2026

**Context:** Where to host our database?

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Supabase** | Managed, RLS built-in, auth system, real-time | Vendor lock-in; cost scales with usage |
| **Self-hosted Postgres** | Full control; cheapest at scale | DevOps overhead; manual backups; no RLS dashboard |
| **Firebase** | Fast to start; real-time | NoSQL (not relational); different query model |
| **PlanetScale** | MySQL; good scaling | No Postgres; no RLS |

**Decision:** Supabase

**Reasoning:**
1. **RLS (Row-Level Security)** — Critical for multi-tenant. Built into Supabase.
2. **Auth system** — Can use for doctor login later
3. **Managed** — No DevOps overhead for solo founder
4. **Postgres** — Industry standard; can migrate if needed
5. **Real-time** — Future: live dashboard updates

**Trade-off accepted:** Vendor lock-in, but Postgres underneath means we can migrate if needed.

---

### Decision: Service Role + RLS (not RLS-only)

**Date:** January 2026

**Context:** How to handle webhooks that need to write data (no user JWT)?

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **RLS only** | Simple; all access through user context | Webhooks have no user; can't write |
| **Service role only** | Full access; works for everything | No security; any code can access anything |
| **Service role for system + RLS for API** | Best of both; security where needed | Manual ownership checks needed for service role |

**Decision:** Service role for webhooks/workers + RLS for API endpoints

**Reasoning:**
1. Webhooks come from Instagram/Razorpay — no user JWT
2. Webhooks need to create appointments, update payments
3. API endpoints have JWT → can use RLS
4. Manual ownership checks when using service role (see SECURITY.md)

**Code Impact:**
- `src/config/database.ts` — Two clients: `supabase` (anon) and `supabaseAdmin` (service role)
- Services use `supabaseAdmin` for webhook operations
- Controllers use `supabase` with RLS for user operations

---

## 📬 Queue Decisions

### Decision: BullMQ (not AWS SQS or direct processing)

**Date:** January 2026

**Context:** Webhooks from Instagram must respond in <20 seconds, but processing (AI, database) can take longer.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Direct processing** | Simple; no queue setup | Slow response; webhook timeouts; no retry |
| **BullMQ (Redis)** | Fast; good TypeScript support; retries; dead letter | Requires Redis |
| **AWS SQS** | Managed; scalable | Complex setup; AWS dependency; overkill for MVP |
| **RabbitMQ** | Feature-rich | Complex setup; operational overhead |

**Decision:** BullMQ with Redis

**Reasoning:**
1. **Fast webhook response** — Queue job in <100ms, return 200
2. **TypeScript support** — Good types, familiar API
3. **Retry with backoff** — Automatic retry on failure
4. **Dead letter queue** — Failed jobs stored for debugging
5. **Redis already needed** — Can use same Redis for caching later

**Trade-off accepted:** Requires Redis, but Redis is simple to run (cloud or local).

---

## 🤖 AI Decisions

### Decision: OpenAI GPT-4 Turbo (not local LLM or fine-tuned model)

**Date:** January 2026

**Context:** Need AI to detect patient intent and generate responses.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **OpenAI GPT-4** | Best quality; reliable; structured output | API cost; latency; rate limits |
| **Local LLM (Llama)** | No API cost; no rate limits | Lower quality; infrastructure to host |
| **Fine-tuned model** | Specific to our use case | Expensive to train; hard to update |
| **Simple regex/rules** | No cost; fast | Can't handle natural language variety |

**Decision:** OpenAI GPT-4 Turbo

**Reasoning:**
1. **Quality matters** — Patients expect natural conversation
2. **Structured output** — Can request JSON for reliable intent parsing
3. **Cost acceptable** — $0.01-0.10 per conversation is nothing vs manual labor
4. **Fast to iterate** — Change prompts, not retrain model

**Trade-off accepted:** API costs scale with usage, but so does revenue.

**Cost Control:**
- Use `gpt-4-turbo` (cheaper than `gpt-4`)
- Short prompts; avoid unnecessary context
- Cache common responses (future)

---

## 🔒 Security Decisions

### Decision: No PHI in Logs (strict)

**Date:** January 2026

**Context:** We handle patient data. Logs are stored, accessed by multiple systems.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Log everything** | Easy debugging | HIPAA violation; privacy breach risk |
| **No PHI in logs** | Compliant; safe | Harder to debug patient-specific issues |
| **Encrypted PHI in logs** | Compliant; can decrypt for debugging | Complex; key management |

**Decision:** No PHI in logs (strict policy)

**Reasoning:**
1. **HIPAA/GDPR compliance** — Fines can be $50K+ per violation
2. **Simplicity** — No encryption key management
3. **Correlation IDs** — Can trace requests without patient data
4. **IDs are enough** — Log appointment ID, not patient name

**Implementation:**
- Log: `appointmentId`, `doctorId`, `status`, `correlationId`
- Never log: `patientName`, `patientPhone`, `reasonForVisit`, `medicalInfo`

---

## 📝 Add Your Own Decisions

As you build Clariva, add decisions here:

```markdown
### Decision: [Title]

**Date:** [When]

**Context:** [What problem were you solving?]

**Options Considered:**
| Option | Pros | Cons |
|--------|------|------|
| Option A | ... | ... |
| Option B | ... | ... |

**Decision:** [What you chose]

**Reasoning:** [Why you chose it]

**Trade-off accepted:** [What you gave up]
```

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — Your curriculum
- [../../Reference/ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) — System architecture
- [../../Business files/BUSINESS_PLAN.md](../../Business files/BUSINESS_PLAN.md) — Business context

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
