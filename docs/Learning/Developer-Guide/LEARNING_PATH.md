# Developer Learning Path

**Purpose:** Your personal roadmap from beginner to expert-level developer, tailored to building Clariva Care.

**Who is this for:** You — the solo founder learning to code while building a real product.

**Philosophy:** Learn what you need, when you need it. Focus on concepts that directly apply to Clariva.

---

## 🎯 Your Goal

Build a **production-ready, globally-compliant healthcare SaaS** that:
- Handles patient data securely (HIPAA, GDPR, DPDPA)
- Processes payments globally (Razorpay, PayPal)
- Scales to 500+ doctor clients in Year 1
- Works 24/7 without manual intervention

This learning path gets you there.

---

## 📊 Skill Levels

| Level | What It Means | You Can... |
|-------|--------------|------------|
| **Beginner** | Just starting | Read code, make small changes with AI help |
| **Competent** | Can build features | Add endpoints, write services, fix bugs independently |
| **Proficient** | Can architect | Design new systems, make trade-offs, review AI code critically |
| **Expert** | Can ship to production | Handle security, compliance, performance, debugging complex issues |

**Current:** Beginner → **Target:** Proficient (Expert in key areas)

---

## 📚 Phase 1: Foundations (Weeks 1-4)

**Goal:** Understand the building blocks of your codebase.

### Week 1-2: TypeScript Fundamentals

**Why it matters:** Your entire codebase is TypeScript. Strong typing catches bugs before they reach patients.

**What to learn:**
- [ ] Variables, types, functions
- [ ] Interfaces vs Types
- [ ] Generics (used in Zod, responses)
- [ ] `async/await` (everything is async)
- [ ] `unknown` vs `any` (security!)

**Practice in Clariva:**
- Read `src/types/*.ts` — understand how we define data shapes
- Read `src/utils/validation.ts` — see Zod schemas (TypeScript + validation)

**Resources:**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) (free, official)
- [Total TypeScript Beginners Course](https://www.totaltypescript.com/tutorials/beginners-typescript) (free)

**Checkpoint:** Can you explain what this does?
```typescript
interface Appointment {
  id: string;
  patientName: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

function getConfirmed(appointments: Appointment[]): Appointment[] {
  return appointments.filter(apt => apt.status === 'confirmed');
}
```

---

### Week 3-4: Express & REST APIs

**Why it matters:** Your backend is Express. Every patient interaction hits your API.

**What to learn:**
- [ ] HTTP methods (GET, POST, PUT, DELETE)
- [ ] Request/Response cycle
- [ ] Middleware (runs before your code)
- [ ] Route parameters (`/appointments/:id`)
- [ ] Query parameters (`?status=confirmed`)
- [ ] Error handling

**Practice in Clariva:**
- Read `src/routes/api/v1/payments.ts` — see how routes are defined
- Read `src/controllers/payment-controller.ts` — see how requests are handled
- Read `src/middleware/*.ts` — see auth, rate limiting, logging

**Checkpoint:** Can you trace a request?
```
Patient books appointment via Instagram
→ Instagram sends webhook to POST /webhooks/instagram
→ webhookLimiter middleware checks rate limit
→ handleInstagramWebhook controller processes
→ Queue job created
→ Worker processes job
→ appointmentService.bookAppointment() called
→ Database updated
→ Instagram DM sent back to patient
```

---

## 📚 Phase 2: Database & Data (Weeks 5-8)

**Goal:** Understand how data is stored, secured, and queried.

### Week 5-6: PostgreSQL & Supabase

**Why it matters:** Patient data, appointments, payments — all in the database. Security is critical.

**What to learn:**
- [ ] Tables, columns, rows
- [ ] Primary keys (UUID in our case)
- [ ] Foreign keys (appointments → doctors)
- [ ] Basic SQL (SELECT, INSERT, UPDATE, DELETE)
- [ ] Supabase query builder (we use this, not raw SQL)
- [ ] Row-Level Security (RLS) — **critical for multi-tenant**

**Practice in Clariva:**
- Read `backend/migrations/*.sql` — see how tables are created
- Read `src/services/appointment-service.ts` — see Supabase queries
- Read `docs/Reference/RLS_POLICIES.md` — understand access control

**Checkpoint:** Can you explain what this does?
```typescript
const { data } = await supabase
  .from('appointments')
  .select('id, patient_name, appointment_date')
  .eq('doctor_id', doctorId)
  .eq('status', 'confirmed')
  .order('appointment_date', { ascending: true });
```

---

### Week 7-8: Async JavaScript & Queues

**Why it matters:** Webhooks, AI calls, payment processing — all async. If you don't understand async, bugs will be mysterious.

**What to learn:**
- [ ] Promises (`Promise`, `.then()`, `.catch()`)
- [ ] `async/await` (cleaner syntax)
- [ ] `Promise.all()` (parallel execution)
- [ ] Error handling in async code
- [ ] Event loop basics (why async exists)
- [ ] Queues (BullMQ) — async job processing

**Practice in Clariva:**
- Read `src/workers/webhook-worker.ts` — see async job processing
- Read `src/services/payment-service.ts` — see async API calls
- Read `src/adapters/paypal-adapter.ts` — see async external API

**Checkpoint:** What's wrong with this code?
```typescript
// ❌ Bug: doesn't wait for both to complete
async function processWebhook(payload) {
  sendConfirmationDM(payload.patientId); // No await!
  updateAppointmentStatus(payload.appointmentId); // No await!
  return { success: true }; // Returns before work is done
}
```

---

## 📚 Phase 3: Quality & Testing (Weeks 9-12)

**Goal:** Write code that doesn't break in production.

### Week 9-10: Testing with Jest

**Why it matters:** Healthcare software can't have bugs. Tests catch issues before patients do.

**What to learn:**
- [ ] Unit tests (test one function)
- [ ] Integration tests (test endpoint)
- [ ] Mocking (fake external services)
- [ ] AAA pattern (Arrange, Act, Assert)
- [ ] Test coverage (aim for 80%+)

**Practice in Clariva:**
- Read `backend/tests/unit/services/*.test.ts` — see unit tests
- Read `backend/tests/unit/controllers/*.test.ts` — see controller tests
- Run `npm test` — see tests pass

**Checkpoint:** Can you write a test?
```typescript
describe('selectGatewayByCountry', () => {
  it('returns razorpay for India', () => {
    expect(selectGatewayByCountry('IN')).toBe('razorpay');
  });
  
  it('returns paypal for US', () => {
    expect(selectGatewayByCountry('US')).toBe('paypal');
  });
});
```

---

### Week 11-12: Security & Compliance Basics

**Why it matters:** You're handling patient data. HIPAA fines can be $50K+ per violation. GDPR fines can be 4% of revenue.

**What to learn:**
- [ ] Input validation (never trust user input)
- [ ] SQL injection (why we use query builder)
- [ ] Authentication (JWT tokens)
- [ ] Authorization (RLS, ownership checks)
- [ ] Secrets management (env vars, never hardcode)
- [ ] PHI handling (no patient data in logs)

**Practice in Clariva:**
- Read `docs/Reference/SECURITY.md` — full security guide
- Read `docs/Reference/COMPLIANCE.md` — PHI, consent, audit
- Read `src/middleware/auth.ts` — see JWT authentication
- Read `src/middleware/sanitize-input.ts` — see input sanitization

**Checkpoint:** What's wrong with this code?
```typescript
// ❌ Multiple security issues
async function getPatient(req, res) {
  const patientId = req.query.id;
  const { data } = await supabase.rpc('get_patient', { id: patientId }); // SQL injection risk
  console.log('Found patient:', data.name, data.phone); // PHI in logs!
  return res.json(data); // No auth check - anyone can access!
}
```

---

## 📚 Phase 4: Production Skills (Weeks 13-16)

**Goal:** Ship code that works at scale, 24/7.

### Week 13-14: Error Handling & Debugging

**What to learn:**
- [ ] Error classes (ValidationError, NotFoundError, etc.)
- [ ] Error propagation (throw → catch → respond)
- [ ] Correlation IDs (trace requests through logs)
- [ ] Debugging techniques (logs, breakpoints, isolation)

**Practice in Clariva:**
- Read `src/utils/errors.ts` — error class definitions
- Read `docs/Reference/DEBUGGING.md` — troubleshooting guide
- Read `docs/Reference/ERROR_CATALOG.md` — all error codes

---

### Week 15-16: Performance & Deployment

**What to learn:**
- [ ] Database indexes (why some queries are slow)
- [ ] N+1 queries (common performance killer)
- [ ] Caching basics (when and what to cache)
- [ ] Environment configuration (dev vs staging vs prod)
- [ ] Deployment checklist (what to verify before shipping)

**Practice in Clariva:**
- Read `docs/Reference/PERFORMANCE.md` — optimization guide
- Read `docs/Reference/DEPLOYMENT.md` — deployment checklist

---

## 🎓 Graduation: Expert Areas

Once you complete the foundation, go deep in areas critical to Clariva:

### Healthcare Compliance (Expert)
- HIPAA technical safeguards
- GDPR data subject rights
- India DPDPA requirements
- Audit logging patterns

### Payment Systems (Expert)
- Payment gateway integration
- Webhook security
- Idempotency patterns
- Multi-currency handling

### AI Integration (Expert)
- OpenAI API best practices
- Prompt engineering
- Intent detection
- Conversation state management

---

## 📅 Suggested Weekly Schedule

**If you have 10-15 hours/week for learning:**

| Day | Activity | Time |
|-----|----------|------|
| **Monday** | Read theory (docs, tutorials) | 2 hrs |
| **Tuesday** | Read Clariva code (study patterns) | 2 hrs |
| **Wednesday** | Build with AI (implement features) | 3 hrs |
| **Thursday** | Build with AI (continue) | 3 hrs |
| **Friday** | Review what you built (understand it) | 2 hrs |
| **Weekend** | Optional: Deep dive on one topic | 2-3 hrs |

**Key principle:** Don't just copy AI code. Understand what it does and why.

---

## ✅ Progress Tracker

Copy this and check off as you complete:

### Phase 1: Foundations
- [ ] TypeScript basics
- [ ] Express basics
- [ ] Can read Clariva code and understand it

### Phase 2: Database & Async
- [ ] Supabase queries
- [ ] RLS concepts
- [ ] Async/await mastery
- [ ] Queue processing

### Phase 3: Quality
- [ ] Can write unit tests
- [ ] Understand security basics
- [ ] Know what PHI is and how to protect it

### Phase 4: Production
- [ ] Can debug with correlation IDs
- [ ] Understand performance basics
- [ ] Can follow deployment checklist

---

## 🔗 Related Documents

- [CONCEPTS_GLOSSARY.md](./CONCEPTS_GLOSSARY.md) — Key terms explained
- [PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md) — Top 10 patterns
- [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — What to avoid
- [RESOURCES.md](./RESOURCES.md) — External learning links

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
