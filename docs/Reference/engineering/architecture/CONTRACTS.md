# API Contracts (Locked Shapes)
## External API Response Contracts - Single Source of Truth

**⚠️ CRITICAL: These contracts are FROZEN. Do not modify without explicit approval.**

---

## 🎯 Purpose

This file locks all external API contracts. These are the shapes that frontend/backend agree on.

**This file owns:**
- Success response schema
- Error response schema
- Meta fields
- Pagination schema
- DELETE semantics
- Headers (correlation-id, idempotency-key)

**This file MUST NOT contain:**
- Implementation details (see RECIPES.md)
- Express code (see ARCHITECTURE.md)
- Business logic (see ARCHITECTURE.md)

---

## 📋 Related Files

- [STANDARDS.md](../development/STANDARDS.md) - Coding rules (references these contracts)
- [RECIPES.md](../development/RECIPES.md) - Implementation patterns
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure
- [API_DESIGN.md](./API_DESIGN.md) - API design principles
- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Frontend structure and data flow
- [FRONTEND_RECIPES.md](../development/FRONTEND_RECIPES.md) - Typed API client and consumption patterns

---

## 🌐 Frontend consumption

**Frontend MUST consume these contracts exactly.** No extra fields, no different shapes.

- **Types:** Use the success/error schemas in this file (or shared types) for all API responses. Type `data` and `meta` per contract; do not assume optional fields exist unless documented.
- **Errors:** Handle `success: false` and `error.code` / `error.message`; show user-facing message; do not log full response without redacting PII.
- **Auth:** Send backend-required headers (e.g. `Authorization: Bearer <token>`) for protected endpoints; see backend API docs and [FRONTEND_RECIPES.md](../development/FRONTEND_RECIPES.md) (F1).
- **Base URL:** Use env (e.g. `NEXT_PUBLIC_API_URL`); never hardcode.

**See:** [FRONTEND_RECIPES.md](../development/FRONTEND_RECIPES.md) for typed fetch client (F1) and [FRONTEND_STANDARDS.md](../development/FRONTEND_STANDARDS.md) for API compliance rules.

---

## ⚠️ Contract Freeze Policy

**AI Agents MUST:**
- Follow these contracts exactly - no variations allowed
- Use helpers from `utils/response.ts` to ensure compliance
- Never return manual response formats
- Never modify these contracts without explicit user approval

**If a contract needs to change:**
1. Discuss impact on frontend/backend
2. Get explicit approval
3. Update this file
4. Update STANDARDS.md if needed
5. Update RECIPES.md if needed

---

## 📌 Rule vs Example Policy

**CRITICAL FOR AI AGENTS:**

- **Text outside code blocks** = **ENFORCEMENT RULES** (must be followed exactly)
- **Code blocks** = **ILLUSTRATIVE EXAMPLES ONLY** (show format, not mandatory implementation)
- **If an example conflicts with rules, the rule always wins**

**Rationale:**
- Prevents AI from treating examples as mandatory implementation
- Clarifies that examples are illustrative, not prescriptive

**AI Agents:** 
- Follow rules (text) exactly
- Use examples (code blocks) as format guidance only
- If example shows pattern that violates rule, follow rule instead

---

## 🔁 Contract Versioning Rule

**Breaking changes require a new API version (e.g., `/v2`).**

**Rules:**
- **Breaking changes** (removal, renaming, type changes) → **MUST** create new API version (`/v2`, `/v3`, etc.)
- **Non-breaking additions** (optional fields) → Allowed within same version
- **Removal or renaming of fields** → **ALWAYS** breaking (requires version bump)

**AI Agents MUST:**
- Refuse contract-breaking changes without version bump
- Identify breaking vs non-breaking changes before implementation
- Ask for approval before creating new API versions

**Breaking Change Examples:**
- ❌ Removing a field: `{ data: { id, name } }` → `{ data: { id } }` (BREAKING)
- ❌ Renaming a field: `{ data: { userId } }` → `{ data: { user_id } }` (BREAKING)
- ❌ Changing field type: `{ data: { count: number } }` → `{ data: { count: string } }` (BREAKING)
- ❌ Changing response shape: `{ success: true, data }` → `{ result }` (BREAKING)

**Non-Breaking Change Examples:**
- ✅ Adding optional field: `{ data: { id } }` → `{ data: { id, metadata?: {...} } }` (SAFE)
- ✅ Adding to meta: `{ meta: { timestamp } }` → `{ meta: { timestamp, version? } }` (SAFE)

**Rationale:**
- Prevents silent frontend breakage
- Forces discipline early
- Maintains backward compatibility

---

## ✅ Success Response Contract (MANDATORY)

**Format:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Schema:**
```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;      // ISO 8601
    requestId: string;      // Correlation ID (UUID)
    [key: string]: unknown; // Optional additional meta fields
  };
}
```

**Implementation:**
- Use `successResponse(data, req)` helper from `utils/response.ts`
- **MUST** include `success: true`
- **MUST** include `meta.timestamp` and `meta.requestId`
- **MUST NOT** skip meta fields

---

## ❌ Error Response Contract (MANDATORY)

**Format:**
```json
{
  "success": false,
  "error": {
    "code": "ValidationError",
    "message": "Human-readable message",
    "statusCode": 400
  },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Schema:**
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;       // Error class name (e.g., "ValidationError")
    message: string;    // Human-readable message
    statusCode: number; // HTTP status code
    // NO index signature - TypeScript enforces exact contract
  };
  meta: {
    timestamp: string;
    requestId: string;
    [key: string]: unknown; // Optional additional meta fields allowed
  };
}
```

**Implementation:**
- Throw typed errors (AppError subclasses) - error middleware formats automatically
- **MUST NOT** add extra fields to error object (TypeScript enforces this)
- **MUST NOT** manually format error responses
- **MUST** include `meta.timestamp` and `meta.requestId`

**CRITICAL:** Error object has NO index signature - TypeScript prevents extra fields. Meta object allows additional fields (for pagination, etc.).

---

## 📊 Meta Fields Contract

**Required Fields:**
- `timestamp`: ISO 8601 string (required)
- `requestId`: Correlation ID from `X-Correlation-ID` header or generated UUID (required)

**Optional Fields:**
- Only add with explicit user request
- Document any new meta fields in API_DESIGN.md
- Never remove required fields

**Example:**
```json
{
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 📄 Pagination Contract

**Format:**
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrevious": false
    }
  },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Schema:**
```typescript
interface PaginatedResponse<T> {
  success: true;
  data: {
    items: T[];
    pagination: {
      page: number;        // Current page (1-indexed)
      pageSize: number;    // Items per page
      total: number;       // Total items
      totalPages: number;  // Total pages
      hasNext: boolean;    // More pages available
      hasPrevious: boolean; // Previous pages available
    };
  };
  meta: Meta;
}
```

**Query Parameters:**
- `page`: Positive integer (default: 1)
- `pageSize`: 1-100 (default: 20)

---

## 🗑️ DELETE Endpoints Contract (MANDATORY)

**Response Rule:**
- Successful DELETE **MUST** return `200 OK` with canonical success response
- **MUST NOT** return `204 No Content` (breaks client expectations & meta fields)
- **Format:** `{ success: true, data: null, meta: { timestamp, requestId } }`

**Rationale:**
- Clients need `meta.requestId` for request tracing
- Consistent format across all endpoints simplifies frontend logic
- `204 No Content` provides no information about the operation result

**Example:**
```json
{
  "success": true,
  "data": null,
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Error Case:**
- If resource doesn't exist → `404 Not Found` (not success)
- Format: Standard error response with `error.code: "NotFoundError"`

---

## 🔑 Headers Contract

### X-Correlation-ID

**Purpose:** Request tracing across services

**Format:** UUID v4

**Behavior:**
- Client MAY provide `X-Correlation-ID` or `X-Request-ID` header
- Server MUST validate format (must be valid UUID)
- Server MUST generate UUID if not provided or invalid
- Server MUST return `X-Correlation-ID` header in response

**Example:**
```
Request:  X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
Response: X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
```

### Idempotency-Key

**Purpose:** Prevent duplicate webhook processing

**Format:** Platform-specific ID OR hash-based identifier

**Platform-Specific IDs:**
- **Facebook/Meta:** `req.body.entry?.[0]?.id` (message events) OR `req.body.entry?.[0]?.messaging?.[0]?.message?.mid` (messaging)
- **Instagram:** `req.body.entry?.[0]?.id` (media events)
- **WhatsApp:** `req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id` (message ID)

**Fallback (if platform doesn't provide stable ID):**
- Hash normalized payload + timestamp bucket (5-minute window)
- Format: `hash(payload + floor(timestamp/300000))`

**Storage:**
```json
{
  "event_id": "platform-specific-id",
  "provider": "facebook|instagram|whatsapp|razorpay|paypal",
  "received_at": "2026-01-17T10:30:00.000Z",
  "status": "processed|failed|pending"
}
```

---

## 🔄 Idempotency Contract (Webhooks)

**Behavior:**
- Check idempotency BEFORE processing
- Return `200 OK` if already processed (idempotent)
- Store: `{ event_id, provider, received_at, status }`

**Response:**
- If already processed → `200 OK` with `{ success: true, data: { idempotent: true } }`
- If new → Process and return normal response

---

## 📅 Public booking — slot page info (ARM-09)

**Auth:** Query param `token` = signed **booking token** scoped to one `conversationId` + `doctorId`.

### GET `/api/v1/bookings/slot-page-info?token=`

**Success `data`** includes existing fields (`doctorId`, `practiceName`, `conversationId`, `mode`, `opdMode`, optional `serviceCatalog`, etc.). **Optional non-PHI hints** (backward compatible — older clients ignore unknown keys):

| Field | Type | Meaning |
|--------|------|---------|
| `suggestedCatalogServiceKey` | string | Catalog `service_key` (lowercase) pre-filled from chat when selection is final. |
| `suggestedCatalogServiceId` | string | Optional stable id from doctor catalog. |
| `suggestedConsultationModality` | `text` \| `voice` \| `video` | Optional modality aligned with conversation state. |
| `matchConfidence` | `high` \| `medium` \| `low` | Last matcher band (for UI messaging only). |
| `serviceSelectionFinalized` | boolean | True when hints come from a finalized catalog selection. |
| `servicePickerLocked` | boolean | When true, `/book` should not let the patient pick a different service row (visit type fixed in chat). |
| `bookingAllowed` | boolean | **ARM-10:** `false` when payment must not run until chat/staff gate clears (book mode only; reschedule is always `true`). |
| `bookingBlockedReason` | `staff_review_pending` \| `service_selection_not_finalized` | Present when `bookingAllowed` is `false`. |

**Omitted** when staff review still blocks alignment (`pendingStaffServiceReview` without finalization), when `serviceSelectionFinalized` is not true, when `consultationType` is `in_clinic`, or when the suggested key is not in the token-scoped `serviceCatalog` (e.g. stale state after catalog edit).

### POST `/api/v1/bookings/select-slot-and-pay` (ARM-10)

When the gate denies payment, response **403** with `error.code` = `StaffServiceReviewPendingPaymentError` or `ServiceSelectionNotFinalizedPaymentError` (canonical error envelope).

**ARM-11:** If the doctor has an active teleconsult **catalog** but the conversation cannot resolve a catalog service for quoting, checkout returns **400** `ValidationError` (no silent fallback to legacy flat fee). See [RECIPES.md](../development/RECIPES.md) ARM-11.

---

## 🩺 Doctor OPD session snapshot (pdm-02 / pdm-12)

**Auth:** Doctor JWT (`requireDoctorAuth`). Returns PHI for the authenticated doctor's appointments on the requested date.

### GET `/api/v1/opd/session?date=YYYY-MM-DD`

> **Replaces** legacy `GET /api/v1/opd/slot-session` and `GET /api/v1/opd/queue-session` (deprecated 2026-05-17; sunset **2026-08-01**). See [plan-opd-per-day-mode.md](../Work/Daily-plans/May%202026/17-05-2026/opd-per-day-mode/plan-opd-per-day-mode-batch.md) (DL-11).

**Success `data`:** discriminated union on `mode` (`OpdSessionPayload`).

Shared fields on both variants:

| Field | Type | Meaning |
|--------|------|---------|
| `date` | string | `YYYY-MM-DD` echo |
| `snapshotAt` | string | ISO 8601 server snapshot time |
| `modeSource` | `fact` \| `policy` \| `doctor_settings` \| `default` | DL-9 resolver cascade tag |
| `modeChangeCount` | number | Flips on this date (`doctor_opd_session_modes.change_count`); UI soft-nudge when ≥ 2 (DL-14) |
| `entries` | array | Slot rows or queue rows (doctor-scoped PHI) |
| `counts` | object | Mode-specific aggregate counts |

**Slot mode** (`mode: "slot"`):

- `entries` — `SlotSessionRow[]` (`appointmentId`, `slotStatus`, `scheduledAt`, patient identity, `opdEventType`, delay/early-invite fields, …).
- `counts` — `{ all, upcoming, running_late, in_consultation, completed, missed, cancelled, overflow }` (`upcoming` includes `grace`).

**Queue mode** (`mode: "queue"`):

- `entries` — `QueueSessionRow[]` (`appointmentId`, `tokenNumber`, patient identity, status, …).
- `counts` — `{ all, active, done, missed }`.

**Mode resolution (DL-9)** — first match wins:

1. `doctor_opd_session_modes` fact row for `(doctor_id, date)`, if present.
2. `opd_policies.mode_schedule.date_overrides` (later array entry wins on overlap).
3. `opd_policies.mode_schedule.date_range_overrides` (later wins on overlap).
4. `opd_policies.mode_schedule.weekly_overrides[weekday]`.
5. `opd_policies.mode_schedule.default_mode`.
6. `doctor_settings.opd_mode` (legacy column fallback).
7. `'slot'` ultimate default.

Past dates return the **materialised** fact mode when a row exists; today/future use the resolver when no fact row.

### Deprecated doctor session endpoints

| Endpoint | Behaviour | Deprecation headers |
|----------|-----------|---------------------|
| `GET /api/v1/opd/slot-session?date=` | Same payload shape as unified endpoint when resolved mode is `slot`; **409** if day is queue mode | `Sunset`, `Deprecation`, `Link` → `/api/v1/opd/session?date=YYYY-MM-DD` |
| `GET /api/v1/opd/queue-session?date=` | Same when mode is `queue`; **409** if day is slot mode | Same |

Clients should migrate to `GET /api/v1/opd/session` before **2026-08-01**.

---

## 🏥 Patient OPD session snapshot (e-task-opd-04)

**Auth:** Query param `token` = signed **consultation token** (same as patient video join link). Signature must be valid; `exp` may be expired for read-only snapshot polling.

**Rate limit:** 100 requests / 15 minutes / IP on session routes (see [RATE_LIMITING.md](../development/RATE_LIMITING.md)).

### GET `/api/v1/bookings/session/snapshot?token=`

**Success `data`:**
- `snapshot` — **PatientOpdSnapshot** (object):
  - `appointmentId` (uuid)
  - `status` — `pending` | `confirmed` | `cancelled` | `completed` | `no_show`
  - `opdMode` — `slot` | `queue`
  - `suggestedPollSeconds` — number (hint for client polling; also aligns with `Cache-Control: public, max-age=…`)
  - `delayMinutes` — number | null — minutes past scheduled start while still waiting (pending/confirmed, consult not started)
  - `doctorBusyWith` — optional: `you` | `other_patient` — in-progress consult context
  - **Slot mode:** `slotStart`, `slotEnd` (ISO 8601), `earlyInviteAvailable` (boolean), `earlyInviteExpiresAt` (ISO or null)
  - **Queue mode:** `tokenNumber`, `aheadCount`, `etaMinutes`, `etaRange` `{ minMinutes, maxMinutes }` — omit or undefined when no queue row exists
  - **`inAppNotifications`** (optional, OPD-09): array of `{ type }` where `type` is `delay_broadcast` | `early_invite` | `your_turn_soon` | `queue_position_changed` — hints for banners / a11y; **queue order changes** are also detectable by comparing `tokenNumber` / `aheadCount` between polls

**No PHI** in `snapshot` (no patient name/phone).

### POST `/api/v1/bookings/session/early-join/accept?token=`

**Success `data`:** `{ "accepted": true }`  
Idempotent if already accepted.

### POST `/api/v1/bookings/session/early-join/decline?token=`

**Success `data`:** `{ "declined": true }`  
Idempotent if already declined.

**Errors:** Standard error envelope; `ValidationError` when no active early join offer or invalid state transition.

---

## 📝 Version

**Last Updated:** 2026-05-17  
**Version:** 1.2.0

---

## See Also

### Tier 1 (Must-Have):
- [STANDARDS.md](../development/STANDARDS.md) - Coding rules (references these contracts)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure
- [AI_AGENT_RULES.md](../development/AI_AGENT_RULES.md) - AI behavior rules

### Tier 2 (Required for Safe Coding):
- [RECIPES.md](../development/RECIPES.md) - Implementation patterns
- [API_DESIGN.md](./API_DESIGN.md) - API design principles

### Tier 4 (Operational Safety):
- [WEBHOOKS.md](../operations/WEBHOOKS.md) - Webhook idempotency contract

### Change Management:
- [MIGRATIONS_AND_CHANGE.md](../development/MIGRATIONS_AND_CHANGE.md) - Contract evolution rules