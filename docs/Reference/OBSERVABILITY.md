# Observability Guide
## Debugging Without Leaking Data

**⚠️ CRITICAL: Observability is essential for production systems, but must never leak PHI/PII.**

---

## 🎯 Purpose

This file governs what to log, what to never log, metrics, tracing rules, and alert thresholds.

**This file owns:**
- What to log
- What to never log
- Metrics collection
- Tracing rules
- Alert thresholds

**This file MUST NOT contain:**
- Logging implementation (see RECIPES.md)
- PII redaction rules (see STANDARDS.md)
- Compliance requirements (see COMPLIANCE.md)

---

## 📋 Related Files

- [STANDARDS.md](./STANDARDS.md) - PII redaction rules and logging standards
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI handling and audit requirements
- [RECIPES.md](./RECIPES.md) - Logging implementation patterns
- [ERROR_CATALOG.md](./ERROR_CATALOG.md) - Error classes and status codes

---

## 📊 What to Log (MANDATORY)

**Logger usage:** Use only the structured logger from `config/logger.ts` (e.g. `logger.info`, `logger.error`, `logger.warn`). Import it where needed. Do not use deprecated or ad-hoc error-logging helpers; log all errors and events through this logger with the standard fields below.

### Standard Log Fields (REQUIRED)

**All logs MUST include these fields:**

```typescript
{
  correlationId: string;    // Request correlation ID (UUID)
  path: string;            // Request path (e.g., '/appointments')
  method: string;          // HTTP method (e.g., 'GET', 'POST')
  statusCode: number;      // HTTP status code (e.g., 200, 400, 500)
  durationMs?: number;     // Request duration in milliseconds
  timestamp: string;       // ISO 8601 timestamp
}
```

**Note:** Timestamp may be logger-generated automatically (e.g., Pino). If so, do NOT add manually (avoids double timestamps).

**Rationale:**
- Enables request tracing across services
- Enables performance analysis
- Enables error correlation
- Required for production debugging

**See:** [STANDARDS.md](./STANDARDS.md) "Standard Log Fields" section

---

### Business Events (INFO Level)

**Log business events with IDs and metadata:**

```typescript
// ✅ CORRECT - Business event logging
logger.info('Appointment created', {
  correlationId: req.correlationId,
  path: req.path,
  method: req.method,
  statusCode: 201,
  durationMs: Date.now() - req.startTime,
  appointmentId: appointment.id,
  doctorId: appointment.doctorId,
  // ❌ NEVER: patientName, patientPhone, patientDob
});
```

**Allowed Fields:**
- Resource IDs (`appointmentId`, `doctorId`, `userId`)
- Status (`status: 'booked'`, `status: 'cancelled'`)
- Action (`action: 'create_appointment'`)
- Timestamps
- Metadata (no PHI)

---

### Request Logging (INFO/WARN/ERROR Level)

**Log all HTTP requests:**

```typescript
// ✅ CORRECT - Request logging
logger.info('Request completed', {
  correlationId: req.correlationId,
  path: req.path,
  method: req.method,
  statusCode: 200,
  durationMs: Date.now() - req.startTime,
  ip: req.ip,  // Allowed - not PHI
  userAgent: req.get('user-agent'),  // Allowed - not PHI
  // ❌ NEVER: req.body, req.headers, req (raw objects)
});
```

**Log Levels:**
- **INFO (200-399):** Successful requests
- **WARN (400-499):** Client errors (validation, auth failures)
- **ERROR (500+):** Server errors (database failures, unexpected errors)

---

### Error Logging (ERROR Level)

**Log all errors with context:**

```typescript
// ✅ CORRECT - Error logging
logger.error('Database connection failed', {
  correlationId: req.correlationId,
  path: req.path,
  method: req.method,
  statusCode: 500,
  durationMs: Date.now() - req.startTime,
  error: {
    name: error.name,
    message: error.message,
    stack: env.NODE_ENV !== 'production' ? error.stack : undefined,  // **MUST: Stack traces ONLY when NODE_ENV !== 'production'**
  },
  // ❌ NEVER: req.body, patient data, PHI
});
```

**Include:**
- Error name, message, stack (dev only)
- Correlation ID (for tracing)
- Request metadata (path, method, statusCode)
- Context (what operation was attempted)

---

## 🚫 What to Never Log (MANDATORY)

### PII/PHI (NEVER)

**MUST NEVER log:**
- Patient names
- Phone numbers
- Email addresses (if PHI)
- Dates of birth
- Medical records
- Social security numbers
- Addresses (if PHI)
- Insurance information
- Any other PHI

**Rule:** If it can identify a patient, don't log it.

**See:** [STANDARDS.md](./STANDARDS.md) "PII Redaction Rule" section

---

### Raw Request Objects (NEVER)

**MUST NEVER log:**
- `req.body` (may contain PHI)
- `req.headers` (may contain tokens, PHI)
- `req` (raw request object - contains everything)
- `res` (raw response object)

**Rationale:**
- Raw objects may contain nested PHI
- Headers may contain authentication tokens
- Body contains user input (may be PHI)

**Example:**
```typescript
// ❌ WRONG - Never log raw objects
logger.info('Request received', req);  // DANGEROUS
logger.info('Request body', req.body); // DANGEROUS
logger.info('Headers', req.headers);   // DANGEROUS

// ✅ CORRECT - Log only safe fields
logger.info('Request received', {
  correlationId: req.correlationId,
  path: req.path,
  method: req.method,
  ip: req.ip,  // Safe - not PHI
});
```

---

### Webhook Payloads (NEVER)

**CRITICAL:** Webhook payloads often contain patient identifiers.

**MUST NEVER log:**
- `req.body` for webhooks
- Webhook payload content
- Platform message content
- User identifiers from platforms

**Allowed:**
- `correlationId`
- `eventId` (platform ID or hash)
- `provider` ('facebook' | 'instagram' | 'whatsapp' | 'razorpay' | 'paypal')
- `status` ('processed' | 'failed' | 'pending')
- `ip` (request IP)

**See:** [WEBHOOKS.md](./WEBHOOKS.md) "PII Logging Rules" section

---

## 📊 Metrics Baseline (MANDATORY)

**Required Metrics:**
- `request_count` (counter) - Total requests per endpoint
- `error_count` (counter) - Total errors per endpoint
- `request_latency_ms` (histogram) - Request duration in milliseconds
- `external_api_latency_ms` (histogram) - External API call duration

**Label Rules:**
- **Allowed labels:** `route`, `method`, `status`, `error_type`
- **FORBIDDEN labels:** `user_id`, `patient_id`, `phone`, `email`, any PII/PHI

**Instrumentation Rules:**
- **Counters** for totals (request_count, error_count)
- **Histograms** for latency (request_latency_ms, external_api_latency_ms)
- **Gauges** only for system state (memory_usage, cpu_usage, queue_depth)

**Environment Rules:**
- Stack traces logged ONLY when `NODE_ENV !== 'production'`
- Metrics collected in all environments
- No vendor lock-in (use standard metric formats)

**Example:**
```typescript
// ✅ CORRECT - Safe labels
metrics.increment('request_count', {
  route: '/api/v1/appointments',
  method: 'POST',
  status: '200',
});

metrics.observe('request_latency_ms', duration, {
  route: '/api/v1/appointments',
  method: 'POST',
});

// ❌ WRONG - PHI in labels
metrics.increment('request_count', {
  user_id: req.user.id, // FORBIDDEN
  patient_phone: appointment.phone, // FORBIDDEN
});
```

**Rationale:**
- Standard metrics enable monitoring without vendor lock-in
- PHI in labels violates compliance
- Histograms provide percentile analysis
- Counters track totals over time

**AI Agents:** Always use these metric names and label rules. Never include PII/PHI in labels.

---

## 📈 Metrics Collection

### Request Metrics

**Collect per endpoint:**
- Request count (counter)
- Request duration (p50, p95, p99) (histogram)
- Error rate (4xx, 5xx) (counter)
- Success rate (calculated from counters)

**Example:**
```typescript
// Metrics collected automatically by middleware
{
  endpoint: '/api/v1/appointments',
  method: 'POST',
  count: 1000,
  durationMs: {
    p50: 120,
    p95: 350,
    p99: 500,
  },
  errorRate: 0.02,  // 2%
  successRate: 0.98, // 98%
}
```

---

### System Metrics

**Collect system-level metrics:**
- CPU usage
- Memory usage (heap, RSS)
- Database connection pool size
- Active request count
- Queue depth (if using queues)

**Example:**
```typescript
// Health check endpoint provides these
{
  database: {
    connected: true,
    responseTimeMs: 15,
  },
  memory: {
    used: '450mb',
    total: '512mb',
    rss: '680mb',
  },
  uptime: '2d 14h 30m',
}
```

---

### Business Metrics

**Collect business-level metrics:**
- Appointments created per day
- Appointments cancelled per day
- Active users per day
- Webhook processing rate
- Error rate by type

**Implementation:**
- Log business events with standard fields
- Aggregate in log aggregation tool (e.g., Datadog, New Relic)
- Create dashboards from aggregated logs

---

## 🔍 Tracing Rules

### Correlation IDs (MANDATORY)

**Rule:** All requests MUST have correlation ID.

**Format:** UUID v4

**Source:**
- Client may provide `X-Correlation-ID` or `X-Request-ID`
- Server validates format (must be valid UUID)
- Server generates UUID if not provided or invalid

**Usage:**
- Include in all log entries
- Include in all error responses
- Include in all external API calls
- Enable distributed tracing

**See:** [CONTRACTS.md](./CONTRACTS.md) "Headers Contract" section

---

### Request Timing (MANDATORY)

**Rule:** All requests MUST have duration tracking.

**Implementation:**
- `requestTiming` middleware sets `req.startTime`
- `requestLogger` middleware calculates `durationMs`
- Included in all log entries

**Use Cases:**
- Performance monitoring
- Slow request detection
- Alert on high p95/p99 latencies

---

### Distributed Tracing

**Rule:** Include correlation ID in all external API calls.

**Example:**
```typescript
// Include correlation ID in external API calls
const response = await externalApi.call({
  headers: {
    'X-Correlation-ID': req.correlationId,
  },
});
```

**Enables:**
- Tracing requests across services
- Correlating errors across services
- Performance analysis across services

---

## 🚨 Alert Thresholds

### Error Rate Alerts

**Alert when:**
- Error rate > 5% for 5 minutes
- 5xx error rate > 1% for 5 minutes
- 429 (rate limit) errors > 10% for 1 minute

**Rationale:**
- High error rate indicates system issues
- 5xx errors indicate server problems
- 429 errors indicate abuse or misconfigured limits

---

### Latency Alerts

**Alert when:**
- p95 latency > 1 second for 5 minutes
- p99 latency > 2 seconds for 5 minutes
- Any request > 5 seconds

**Rationale:**
- High latency degrades user experience
- Indicates performance problems
- May indicate resource exhaustion

---

### System Health Alerts

**Alert when:**
- Database connection pool exhausted
- Memory usage > 90%
- CPU usage > 90% for 5 minutes
- Queue depth > 1000 (if using queues)

**Rationale:**
- Prevents system failure
- Enables proactive scaling
- Prevents cascading failures

---

## 📝 Log Retention

### Production Logs

**Retention:** 30 days minimum

**Required Fields:**
- All standard fields (correlationId, path, method, statusCode, durationMs)
- Timestamp
- Log level

**Storage:**
- JSON format (structured logging)
- Log aggregation tool (Datadog, New Relic, CloudWatch)
- Encrypted at rest

---

### Audit Logs

**Retention:** 7 years (compliance requirement)

**Required Fields:**
- All standard fields
- User ID
- Action performed
- Resource ID
- Timestamp
- Success/failure status

**Storage:**
- Separate audit table (Supabase)
- Encrypted at rest
- Immutable (append-only)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "Audit Logging" section

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [STANDARDS.md](./STANDARDS.md) - PII redaction rules
- [COMPLIANCE.md](./COMPLIANCE.md) - Audit requirements
- [RECIPES.md](./RECIPES.md) - Logging implementation
- [ERROR_CATALOG.md](./ERROR_CATALOG.md) - Error definitions