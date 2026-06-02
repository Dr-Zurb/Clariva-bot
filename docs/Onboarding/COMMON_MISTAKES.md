# Common Mistakes to Avoid

**Purpose:** Mistakes beginners make (and how to avoid them). Learn from others' errors.

**How to use:** Before submitting code, scan this list. AI can make these mistakes too — catch them in review.

---

## 🔴 Critical Mistakes (Security/Compliance)

These can get you fined, hacked, or lose customer trust.

---

### Mistake 1: PHI in Logs

**What:** Logging patient names, phone numbers, or medical information.

**Why it's bad:** Violates HIPAA/GDPR. Logs can be accessed by support staff, stored in third-party services, leaked.

```typescript
// ❌ CRITICAL: PHI in logs
logger.info({
  patientName: patient.name, // PHI!
  patientPhone: patient.phone, // PHI!
  reason: patient.reasonForVisit, // PHI!
}, 'Patient booked appointment');

// ✅ CORRECT: Log IDs and metadata only
logger.info({
  appointmentId: appointment.id,
  doctorId: doctor.id,
  status: 'booked',
  correlationId,
}, 'Appointment booked');
```

**Remember:** If it identifies a patient or their health, it's PHI. Don't log it.

---

### Mistake 2: Hardcoded Secrets

**What:** Putting API keys, passwords, or secrets directly in code.

**Why it's bad:** Anyone with code access sees your secrets. If code is pushed to GitHub, secrets are public forever.

```typescript
// ❌ CRITICAL: Hardcoded secret
const razorpay = new Razorpay({
  key_id: 'rzp_live_abc123', // Hardcoded!
  key_secret: 'xyz789secret', // Hardcoded!
});

// ✅ CORRECT: From environment
import { env } from '../config/env';

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});
```

**Remember:** Secrets go in `.env` (which is in `.gitignore`).

---

### Mistake 3: No Webhook Signature Verification

**What:** Processing webhooks without verifying they're actually from the claimed sender.

**Why it's bad:** Anyone can fake a webhook and trigger actions (create appointments, confirm payments they didn't make).

```typescript
// ❌ CRITICAL: No signature verification
export const handlePaymentWebhook = asyncHandler(async (req, res) => {
  // Trusting the webhook blindly!
  await processPayment(req.body);
  res.json({ success: true });
});

// ✅ CORRECT: Verify signature first
export const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  
  if (!verifyRazorpaySignature(signature, req.rawBody, req.correlationId)) {
    throw new UnauthorizedError('Invalid webhook signature');
  }
  
  await processPayment(req.body);
  res.json({ success: true });
});
```

---

### Mistake 4: Using `any` Type

**What:** Using TypeScript's `any` type, which disables type checking.

**Why it's bad:** Defeats the purpose of TypeScript. Bugs slip through. Runtime errors instead of compile-time errors.

```typescript
// ❌ BAD: any disables type safety
function processPayment(data: any) {
  const amount = data.amountMinor; // No error if typo
  const currency = data.currnecy; // Typo not caught!
}

// ✅ CORRECT: Define types
interface PaymentData {
  amountMinor: number;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
}

function processPayment(data: PaymentData) {
  const amount = data.amountMinor; // Type-safe
  const currency = data.currnecy; // ERROR: Property does not exist
}
```

**If you must use `any`:** Add `// eslint-disable-next-line` with comment explaining why.

---

### Mistake 5: No RLS or Ownership Checks

**What:** Allowing users to access data they shouldn't see.

**Why it's bad:** Doctor A can see Doctor B's patients. Privacy breach. Legal liability.

```typescript
// ❌ CRITICAL: No ownership check
async function getAppointment(id: string) {
  const { data } = await supabase.from('appointments').select('*').eq('id', id).single();
  return data; // Anyone can get any appointment!
}

// ✅ CORRECT: Check ownership
async function getAppointment(id: string, userId: string) {
  const { data } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!data || data.doctor_id !== userId) {
    throw new NotFoundError('Appointment not found');
  }
  
  return data;
}
```

---

## 🟠 Major Mistakes (Bugs/Quality)

These cause bugs, crashes, or poor code quality.

---

### Mistake 6: Missing await

**What:** Forgetting `await` on async functions.

**Why it's bad:** Function returns before work is done. Data not saved. Silent failures.

```typescript
// ❌ BUG: Missing await
async function bookAppointment(data) {
  supabase.from('appointments').insert(data); // No await!
  sendConfirmationDM(data.patientId); // No await!
  return { success: true }; // Returns before insert completes!
}

// ✅ CORRECT: Await async operations
async function bookAppointment(data) {
  await supabase.from('appointments').insert(data);
  await sendConfirmationDM(data.patientId);
  return { success: true };
}
```

**Tip:** If function returns Promise, it needs `await` (unless you intentionally want fire-and-forget).

---

### Mistake 7: No Error Handling

**What:** Not catching errors, letting them crash the server.

**Why it's bad:** One bad request crashes entire server. All users affected.

```typescript
// ❌ BUG: No error handling
router.post('/payments', async (req, res) => {
  const result = await createPayment(req.body); // If this throws, request hangs
  res.json(result);
});

// ✅ CORRECT: Use asyncHandler
router.post('/payments', asyncHandler(async (req, res) => {
  const result = await createPayment(req.body); // Errors caught
  res.json(result);
}));
```

---

### Mistake 8: Business Logic in Controller

**What:** Putting complex logic in the controller instead of a service.

**Why it's bad:** Hard to test. Hard to reuse. Controllers become huge.

```typescript
// ❌ BAD: Business logic in controller
export async function createPaymentHandler(req, res) {
  // Complex logic doesn't belong here
  const doctor = await getDoctor(req.user.id);
  const gateway = doctor.country === 'IN' ? 'razorpay' : 'paypal';
  const adapter = gateway === 'razorpay' ? razorpayAdapter : paypalAdapter;
  const link = await adapter.createLink({ ... });
  await supabase.from('payments').insert({ ... });
  await sendDM(patient.id, `Pay here: ${link}`);
  res.json({ link });
}

// ✅ CORRECT: Controller coordinates, service contains logic
export const createPaymentHandler = asyncHandler(async (req, res) => {
  const validated = schema.parse(req.body);
  const result = await paymentService.createPaymentLink(validated, req.correlationId);
  return res.json(successResponse(result, req));
});
```

---

### Mistake 9: N+1 Queries

**What:** Making one query, then N more queries in a loop.

**Why it's bad:** 100 appointments = 101 database queries. Slow. Expensive.

```typescript
// ❌ SLOW: N+1 queries
const appointments = await getAppointments(doctorId); // 1 query
for (const apt of appointments) {
  apt.patient = await getPatient(apt.patientId); // N queries!
}

// ✅ FAST: Single query with join
const appointments = await supabase
  .from('appointments')
  .select('*, patients(name, phone)')
  .eq('doctor_id', doctorId); // 1 query
```

---

### Mistake 10: Using process.env Directly

**What:** Accessing environment variables without validation.

**Why it's bad:** Might be undefined. No type safety. Fails at runtime, not startup.

```typescript
// ❌ BAD: Undefined, no validation
const apiKey = process.env.OPENAI_API_KEY; // Might be undefined
const result = await openai.chat({ apiKey }); // Fails at runtime

// ✅ CORRECT: Validated at startup
import { env } from '../config/env';

const result = await openai.chat({ apiKey: env.OPENAI_API_KEY }); // Guaranteed to exist
```

---

## 🟡 Minor Mistakes (Style/Maintenance)

These make code harder to read or maintain.

---

### Mistake 11: Inconsistent Naming

**What:** Mixing naming conventions (camelCase, snake_case, PascalCase).

**Why it's bad:** Confusing. Hard to search. Looks unprofessional.

```typescript
// ❌ INCONSISTENT
const patient_name = data.patientName; // snake_case variable
const AppointmentStatus = 'confirmed'; // PascalCase constant
function GetDoctor() { } // PascalCase function

// ✅ CONSISTENT
const patientName = data.patientName; // camelCase variable
const appointmentStatus = 'confirmed'; // camelCase variable
function getDoctor() { } // camelCase function
```

**Convention:**
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Files: `kebab-case.ts`
- Database: `snake_case`

---

### Mistake 12: No Comments on Non-Obvious Code

**What:** Complex logic with no explanation.

**Why it's bad:** You (or AI) won't understand it in 3 months.

```typescript
// ❌ UNCLEAR: What does this do?
const slots = availability.filter(s => 
  s.dayOfWeek === date.getDay() && 
  !appointments.some(a => a.time === s.time && a.date === date)
);

// ✅ CLEAR: Comment explains the "why"
// Filter to slots that:
// 1. Match the requested day of week
// 2. Don't conflict with existing appointments on that date
const slots = availability.filter(s => 
  s.dayOfWeek === date.getDay() && 
  !appointments.some(a => a.time === s.time && a.date === date)
);
```

---

### Mistake 13: Dead Code

**What:** Leaving commented-out code, unused imports, or unreachable code.

**Why it's bad:** Clutters codebase. Confusing. Makes code harder to read.

```typescript
// ❌ BAD: Dead code
import { unusedFunction } from './utils'; // Never used

function processPayment(data) {
  // const oldLogic = processOldWay(data); // Commented out
  // console.log('debug:', data); // Debug statement left in
  
  if (false) {
    handleSpecialCase(); // Unreachable code
  }
  
  return processNewWay(data);
}

// ✅ CLEAN: Remove dead code
function processPayment(data) {
  return processNewWay(data);
}
```

---

## 🧹 Self-Check Before Committing

Run through this checklist:

### Security (Critical)
- [ ] No PHI in logs
- [ ] No hardcoded secrets
- [ ] Webhook signatures verified
- [ ] RLS or ownership checks in place

### Quality (Major)
- [ ] All async operations have `await`
- [ ] Using `asyncHandler` for routes
- [ ] Business logic in services, not controllers
- [ ] No N+1 queries

### Style (Minor)
- [ ] Consistent naming
- [ ] Comments on complex logic
- [ ] No dead code or unused imports

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — Your curriculum
- [PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md) — Top 10 patterns
- [../../Reference/engineering/compliance/SECURITY.md](../../Reference/engineering/compliance/SECURITY.md) — Full security guide
- [../../Reference/engineering/development/CODE_QUALITY.md](../../Reference/engineering/development/CODE_QUALITY.md) — Style guide

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
