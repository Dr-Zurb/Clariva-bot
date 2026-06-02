# Concepts Glossary

**Purpose:** Key terms explained simply, with examples from Clariva Care.

**How to use:** When you encounter a term you don't understand, look it up here first.

---

## 🔤 A

### API (Application Programming Interface)
**Simple:** A way for programs to talk to each other.

**In Clariva:** Your backend exposes an API. Instagram calls your webhook API. You call OpenAI's API.

**Example:**
```
Instagram → POST /webhooks/instagram → Your server
Your server → POST /v1/chat/completions → OpenAI
```

### Async/Await
**Simple:** A way to write code that waits for something (like a database query) without freezing.

**In Clariva:** Almost everything is async — database queries, API calls, AI requests.

**Example:**
```typescript
// This waits for the database, then continues
const appointment = await supabase.from('appointments').select('*').single();
console.log(appointment); // Only runs after database responds
```

### Authentication (AuthN)
**Simple:** Proving WHO you are (like showing your ID at a bar).

**In Clariva:** JWT token proves a doctor is who they claim to be.

### Authorization (AuthZ)
**Simple:** Proving WHAT you can do (like checking if you're on the guest list).

**In Clariva:** RLS policies check if Doctor A can see Appointment X.

---

## 🔤 B

### Backend
**Simple:** The server-side code that users don't see. Handles data, logic, security.

**In Clariva:** Everything in `backend/src/` — Express server, services, database queries.

### BullMQ
**Simple:** A library for processing jobs in a queue (like a to-do list for your server).

**In Clariva:** When Instagram sends a webhook, we queue it for processing. BullMQ handles the queue.

**Why we use it:** Webhooks must respond in <20 seconds. Processing (AI, database) can take longer. Queue decouples receiving from processing.

---

## 🔤 C

### Controller
**Simple:** The code that handles HTTP requests. Receives request, calls services, sends response.

**In Clariva:** Files in `src/controllers/` like `payment-controller.ts`.

**Rule:** Controllers should NOT contain business logic. They just coordinate.

### Correlation ID
**Simple:** A unique ID that follows a request through your entire system, so you can trace it in logs.

**In Clariva:** Every request gets a correlation ID (UUID). Logged everywhere. Essential for debugging.

**Example:**
```
Request comes in → correlationId: "abc-123"
Controller logs: { correlationId: "abc-123", action: "create_payment" }
Service logs: { correlationId: "abc-123", gateway: "razorpay" }
Worker logs: { correlationId: "abc-123", status: "processed" }
```

### CRUD
**Simple:** Create, Read, Update, Delete — the four basic database operations.

**In Clariva:**
- Create: Book new appointment
- Read: Get appointment details
- Update: Confirm appointment after payment
- Delete: Cancel appointment

---

## 🔤 D

### Database
**Simple:** Where your data lives permanently. Like a giant spreadsheet with rules.

**In Clariva:** PostgreSQL (via Supabase). Stores appointments, patients, payments, doctors.

### DM (Direct Message)
**Simple:** Private message on social media.

**In Clariva:** Instagram DMs are how patients talk to the bot. The bot replies via DM.

### DRY (Don't Repeat Yourself)
**Simple:** If you're writing the same code twice, extract it into a function.

**Example:**
```typescript
// ❌ Repeated logic
const razorpayAmount = `INR ${(amount / 100).toFixed(2)}`;
const paypalAmount = `USD ${(amount / 100).toFixed(2)}`;

// ✅ DRY
function formatAmount(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toFixed(2)}`;
}
```

---

## 🔤 E

### Endpoint
**Simple:** A specific URL that your API responds to.

**In Clariva:** `POST /api/v1/payments/create-link` is an endpoint for creating payment links.

### Environment Variable (Env Var)
**Simple:** Configuration values stored outside your code. Secrets, API keys, URLs.

**In Clariva:** Stored in `.env` file. Accessed via `env.VARIABLE_NAME` (not `process.env`).

**Why:** Never hardcode secrets in code. `.env` is not committed to Git.

### Express
**Simple:** A popular Node.js framework for building web servers and APIs.

**In Clariva:** Your entire backend is built with Express.

---

## 🔤 F-G

### Frontend
**Simple:** The user-facing part of an application (what users see and interact with).

**In Clariva:** The doctor dashboard (future). Currently, the "frontend" is Instagram's interface.

### Gateway (Payment)
**Simple:** A service that processes credit card payments.

**In Clariva:** Razorpay (India) and PayPal (international). Patients pay through these; we never see card numbers.

### GDPR
**Simple:** EU privacy law. Gives people control over their personal data.

**In Clariva:** We must: get consent, allow data deletion, not store unnecessary data, protect data.

---

## 🔤 H-I

### HIPAA
**Simple:** US healthcare privacy law. Protects patient health information.

**In Clariva:** We must: encrypt data, control access, audit who accessed what, no PHI in logs.

### Idempotency
**Simple:** Doing something multiple times has the same effect as doing it once.

**In Clariva:** If a payment webhook is sent 3 times (retry), we only process the payment once.

**Why it matters:** Without idempotency, a patient might be charged 3 times.

### Intent (AI)
**Simple:** What the user is trying to do.

**In Clariva:** AI detects intent from patient messages: "book appointment", "ask question", "cancel", etc.

---

## 🔤 J-K

### JSON (JavaScript Object Notation)
**Simple:** A text format for representing data. Like a dictionary.

**Example:**
```json
{
  "patientName": "John Doe",
  "appointmentDate": "2026-02-15",
  "status": "confirmed"
}
```

### JWT (JSON Web Token)
**Simple:** A secure token that proves who you are. Like a digital ID card.

**In Clariva:** When a doctor logs in, they get a JWT. Every API request includes this JWT to prove identity.

---

## 🔤 L-M

### Middleware
**Simple:** Code that runs BEFORE your main handler. Can modify request, block request, or add data.

**In Clariva:** Rate limiting, authentication, logging, input sanitization — all middleware.

**Example flow:**
```
Request → rateLimiter → authMiddleware → yourController
```

### Migration
**Simple:** A script that changes your database structure (add table, add column, etc.).

**In Clariva:** Files in `backend/migrations/`. Run in order: `001_*.sql`, `002_*.sql`, etc.

### Multi-tenant
**Simple:** One application serving multiple customers, with data isolation between them.

**In Clariva:** One Clariva server serves many doctors. Doctor A cannot see Doctor B's patients.

---

## 🔤 N-O

### N+1 Query
**Simple:** A performance bug where you make 1 query, then N more queries in a loop.

**Example:**
```typescript
// ❌ N+1: 1 query for appointments, then N queries for patients
const appointments = await getAppointments(); // 1 query
for (const apt of appointments) {
  const patient = await getPatient(apt.patientId); // N queries!
}

// ✅ Fixed: 1 query with JOIN
const appointments = await supabase
  .from('appointments')
  .select('*, patients(*)'); // 1 query
```

### OAuth
**Simple:** A standard for letting users log in with another service (Google, Facebook, etc.).

**In Clariva:** Future: doctors might log in with Google instead of email/password.

---

## 🔤 P

### PHI (Protected Health Information)
**Simple:** Patient data that's legally protected (name, phone, DOB, medical conditions).

**In Clariva:** Patient names, phone numbers, reasons for visit — all PHI. Never log it. Encrypt it. Control access.

### PostgreSQL (Postgres)
**Simple:** A powerful open-source database. Like Excel but much more capable and secure.

**In Clariva:** Our database, accessed via Supabase.

### Promise
**Simple:** An object representing a future value. Like an IOU.

**In Clariva:** Every database query returns a Promise. `await` waits for it to resolve.

---

## 🔤 Q-R

### Queue
**Simple:** A list of jobs to be processed, one at a time (or in parallel).

**In Clariva:** BullMQ queue holds webhook jobs. Worker processes them.

### Rate Limiting
**Simple:** Limiting how many requests someone can make in a time period.

**In Clariva:** Webhooks limited to 1000/15min. Prevents abuse and DDoS.

### Redis
**Simple:** A super-fast in-memory database. Used for caching and queues.

**In Clariva:** BullMQ uses Redis to store the job queue.

### REST API
**Simple:** A style of API using HTTP methods (GET, POST, PUT, DELETE) and URLs.

**In Clariva:** Your API is RESTful. `GET /appointments/:id` gets an appointment. `POST /appointments` creates one.

### RLS (Row-Level Security)
**Simple:** Database rules that control which rows a user can see/modify.

**In Clariva:** Doctor A can only SELECT appointments WHERE doctor_id = their_id. Enforced by database.

---

## 🔤 S

### Service (Layer)
**Simple:** Code that contains business logic. Called by controllers, calls database.

**In Clariva:** Files in `src/services/` like `payment-service.ts`, `appointment-service.ts`.

### Supabase
**Simple:** A backend-as-a-service with PostgreSQL, authentication, and RLS built in.

**In Clariva:** Our database provider. Handles hosting, backups, RLS, auth.

---

## 🔤 T-U

### TypeScript
**Simple:** JavaScript with types. Catches bugs at compile time, not runtime.

**In Clariva:** Your entire codebase is TypeScript. Types prevent bugs like "cannot read property of undefined".

### UUID
**Simple:** Universally Unique Identifier. A random ID that's (practically) guaranteed to be unique.

**In Clariva:** All IDs are UUIDs (e.g., `apt-550e8400-e29b-41d4-a716-446655440000`).

---

## 🔤 V-W

### Validation
**Simple:** Checking if input data is correct before using it.

**In Clariva:** Zod validates every request body. Invalid data → 400 error.

### Webhook
**Simple:** An external service calling YOUR server when something happens.

**In Clariva:** 
- Instagram sends webhook when patient sends DM
- Razorpay sends webhook when payment is captured
- PayPal sends webhook when payment is completed

---

## 🔤 X-Z

### Zod
**Simple:** A TypeScript library for validating data shapes.

**In Clariva:** Every API endpoint uses Zod to validate input.

**Example:**
```typescript
const schema = z.object({
  patientName: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/),
});

const validated = schema.parse(req.body); // Throws if invalid
```

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — Your curriculum
- [PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md) — Top 10 patterns
- [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — What to avoid

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
