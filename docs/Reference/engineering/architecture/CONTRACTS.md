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

### GET `/api/v1/bookings/public/page-info?slug=` (clk-02)

**Auth:** Public slug on `doctor_settings.public_slug`. No booking token. Rate limit matches other public patient routes (100 / 15 min / IP).

**Success `data`:**

| Field | Type | Meaning |
|--------|------|---------|
| `doctorId` | uuid | The practice the slug resolved. Unknown slug is **404**, not another practice. |
| `practiceName` | string | Practice name, or `Halo Aid` when blank. |
| `timezone` | string | Practice timezone. |
| `mode` | `book` | Always book. Reschedule stays on the token page. |
| `opdMode` | `slot` \| `queue` | That practice’s mode for today in its timezone. |
| `dayModes` | map of `YYYY-MM-DD` to `slot` \| `queue` | Optional. The next 14 clinic days. A saved day wins, then the schedule, then the clinic default. |
| `bookingAllowed` | boolean | `false` only when the doctor is not license-verified. |
| `bookingBlockedReason` | `doctor_not_verified` | Present when `bookingAllowed` is `false`. |
| `serviceCatalog` | object | Same catalog shape as the token page, when the practice has an active catalog. |
| `clinicAddress` | string | Work address, shown to patients as the clinic address. Omitted when blank. |
| `specialty` | string | Practice specialty. Omitted when blank. |

No `conversationId`, patient id, name, phone, reason, or chat booking hints.

### GET `/api/v1/bookings/public/day-slots?slug=&date=`

**Auth:** Same public slug and rate limit. `date` is `YYYY-MM-DD`.

**Success `data`:** `{ slots, timezone, opdMode, queue? }` — the same day-slot payload as `GET /api/v1/bookings/day-slots` for that doctor and date. When `opdMode` is `queue`, `queue` is `{ windows: [{ start, end }], nextToken, avgMinutes, expectedAt }`. `windows` are the doctor's open hours for that day. `nextToken` is the place the next person would take. `expectedAt` is that token's time from the window start and the average visit. Slot days omit `queue`. The person does not pick a clock time on a queue day.

Token routes `slot-page-info` and `day-slots` stay token-only.

### GET `/api/v1/bookings/public/chat-visits?slug=&c=`

**Auth:** Public slug, plus `c` (the short clinic-link code or the signed chat token). Same rate limit as the other public slug reads. `c` is a capability. Do not log it.

**Success `data`:** `{ visits }` where each visit is `{ at, token }`. `at` is the visit start as an ISO timestamp. `token` is the queue number, or `null` on a clock-time day. Only pending or confirmed visits that have not started, for the conversation that code belongs to, and only when that conversation is this practice's. An unknown, expired, or other-practice code returns `{ visits: [] }`. An unknown slug is **404**.

No name, phone, reason, appointment id, or actions.

### POST `/api/v1/bookings/public/checkout` (clk-03)

**Auth:** Public slug. No booking token. Same rate limit as the slug reads. Reschedule stays on `POST /api/v1/bookings/select-slot-and-pay`.

**Body:**

| Field | Type | Meaning |
|--------|------|---------|
| `slug` | string | Practice slug. Unknown slug is **404**. |
| `slotStart` | ISO datetime | Slot start. Past times are **400**. |
| `patientName` | string | Required. |
| `patientPhone` | string | Required. |
| `patientAge` | number | 1–120. Stored on `patients.age`. `date_of_birth` stays null. |
| `patientSex` | `male` \| `female` \| `other` | Stored on `patients.gender`. |
| `reasonForVisit` | string | Required. Stored on the appointment. Not sent to the payment description. |
| `consentGranted` | `true` | Required. Consent method `owned_booking_page`. |
| `catalogServiceKey` | string | Optional. Required when the practice catalog has more than one service. |
| `catalogServiceId` | uuid | Optional catalog id. |
| `consultationModality` | `text` \| `voice` \| `video` | Optional. Required when the chosen service has more than one mode. |
| `conversationToken` | string | Optional. The `?c=` value: either the signed booking token or an 8-character visit-page code. When it verifies for this slug's doctor and is not a reschedule token, the appointment's `conversation_id` is set and the token checkout's conversation confirmation runs. Missing, expired, or other-doctor tokens still book with `conversation_id` null and add nothing about the other practice. A reschedule token for this doctor is **400** and does not create a second appointment. |

**Success `data`:** `{ paymentUrl, redirectUrl, appointmentId, mode: "book", opdMode, tokenNumber?, prepPath? }`. `prepPath` is a relative `/book/prep?t=` history-form link for the same session. The booking SMS carries the absolute form of that link. One SMS. The reason is not in the message.

- Creates one patient (`registered_via = public_clinic`, `platform` null, `conversation` none) and one appointment (`conversation_id` null, `booking_origin` `booked`).
- `bookingAllowed` is doctor verification only. An unverified doctor is **403** `DoctorNotVerifiedError`. Staff-review and chat catalog-finalized gates do not apply. The catalog fields on this body are the selection.
- Prepaid and zero-fee follow the token checkout. `redirectUrl` is the booking success page (`{BOOKING_PAGE_URL}/success`), not Instagram.
- A second pending or confirmed visit for the same phone on that UTC date is **400**. A taken slot is **409**.

### GET `/api/v1/bookings/public/history?token=` (clk-12)

**Auth:** History-form token in the query. Same public rate limit. A booking token or a join token is **401** and returns no lists. Expired or cancelled is **410** and returns no lists.

**Success `data`:** `{ listsEditable, listsHidden, alreadySent, consultationType, chips }` plus `allergies`, `medicines`, and `conditions` only when the form is empty or the patient already sent their own row. `consultationType` is `video`, `voice`, `in_clinic`, `text`, or null. This response has no open orders, no test label, and no patient name.

- No sidecar row: the three lists are empty (`{ none: false, items: [] }`) and `listsEditable` is true. The chart is not read.
- A patient row: `alreadySent` is true and `listsEditable` is false. Medicine and condition items include `name` and, when the patient answered, `durationValue` plus `durationUnit` (`days`, `months`, or `years`). Allergy items are names only. `accepted_at` is not returned.
- A `front_desk` or `assistant` row: `listsHidden` is true and the three lists are omitted. `chips` still return. The desk row is not changed.
- No patient name, phone, age, or chart rows.

### POST `/api/v1/bookings/public/history` (clk-11)

**Auth:** History-form token in the body. Same public rate limit. A booking token or a join token is **401**. Expired or cancelled is **410**.

**Body:** `token`, `noticeVersion`, `allergies`, `medicines`, `conditions`, optional `chips` (`since`, `course`, `tried`, `aim`). Allergy items are `{ name }`. Medicine and condition items are `{ name }` plus optional `durationValue` and `durationUnit` (`days`, `months`, or `years`). Both duration fields are sent together, or neither. A number without a unit is **400**. `{ none: false, items: [] }` means the patient skipped that list. `{ none: true, items: [] }` means they said none. A none list that also has items is **400**. Accepting a new chart row copies that how-long onto the medicine `started_ago_*` or the condition `diagnosed_ago_*`.

**Success `data`:** `{ listsStored, chipsSaved }`. No chart rows. No list contents in the response.

- First submit inserts `patient_history_submissions` with `source = patient` and `actor_id = patients.id`. `why_today` is the booking reason. `notice_version` is the version key only. The sentence shown on the page stays counsel-owned.
- A second submit for a patient row is **409**. A `front_desk` or `assistant` row is not updated (`listsStored: false`). Chips still save on `appointments.previsit_context` in that case. Chips are not copied into `reason_for_visit`.

### GET `/api/v1/bookings/public/history/medicines?token=` 

**Auth:** History-form token in the query. Same public rate limit. A booking token or a join token is **401**. Expired or cancelled is **410**.

**Success `data` without `q`:** `{ drugs: [{ id, genericName, brandNames, strength }] }`. The prep page loads this once and filters it while the person types, the same way the cockpit filters its catalog. No dose line, no doctor ranking, and the list is not logged.

**Success `data` with `q`:** `{ suggestions: [{ label, hint }] }`. `q` is at most 80 characters. A one-letter `q` returns an empty list and does not dump the catalog. `label` is the brand plus strength when the query matches a brand, otherwise the generic plus strength. `hint` is the generic when the label is a brand, otherwise null. The query is not logged.

### POST `/api/v1/bookings/public/history/photos?token=&documentType=` (clk-15)

**Auth:** History-form token in the query. Same public rate limit. A booking token or a join token is **401**. Expired or cancelled is **410**. Body is the raw file. `Content-Type` is `image/jpeg`, `image/png`, `image/webp`, or `application/pdf`. `documentType` defaults to `other` and must be one of the existing visit-document types.

**Success `data`:** `{ documentId }` (**201**). No storage path.

- Stores `visit_documents` with `source = patient`, `actor_id = patients.id`, `ordered_by = outside`. Object prefix `{doctor_id}/patient/{appointment_id}/`. Check-in is not required.
- A body over 10 MB is refused. A sixth patient file on that visit is **409**. Desk files do not count toward the five.
- Does not extract the file and does not call the desk upload.

### GET `/api/v1/bookings/public/history/photos?token=` (clk-16)

**Success `data`:** `{ photos: [{ id, documentType, downloadUrl }], canRemove }`. Only `source = patient` rows. No `file_path`. Desk documents are omitted. `canRemove` is false once `patient_checked_in_at` is set. A bad token returns no list.

### DELETE `/api/v1/bookings/public/history/photos/:documentId?token=` (clk-16)

Deletes that patient file and its object while `patient_checked_in_at` is null. After check-in the response is **409** and the file stays. A desk document id is **404** and is not deleted.

### POST `/api/v1/bookings/select-slot-and-pay` (ARM-10)

When the gate denies payment, response **403** with `error.code` = `StaffServiceReviewPendingPaymentError` or `ServiceSelectionNotFinalizedPaymentError` (canonical error envelope).

**mca-13 — optional owned-page intake** (backward compatible; omitted on returning patients):

| Field | Type | Meaning |
|--------|------|---------|
| `patientName` | string | Writes the existing conversation patient when that row has no name yet. |
| `patientPhone` | string | E.164-like phone; same row. |
| `reasonForVisit` | string | This visit’s reason when chat never collected one. |
| `consentGranted` | boolean | Must be `true` to write a placeholder row. |

When the patient row is missing name or phone and these fields are incomplete, response **400** `ValidationError` (message tells the user to finish on the booking page, not in chat). A row that already has name + phone ignores a new identity on the body. No second patient row is created.

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

- `entries` — `QueueSessionRow[]` (`appointmentId`, `tokenNumber`, patient identity including `patientPhone`, `guardianName`, `guardianRelation`, status, …).
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
  - `consultationType` — `video` | `voice` | `in_clinic` | `text` | null. Modality only. This poll does not include a prep token.
  - `suggestedPollSeconds` — number (hint for client polling; also aligns with `Cache-Control: public, max-age=…`)
  - `delayMinutes` — number | null — minutes past scheduled start while still waiting (pending/confirmed, consult not started)
  - `doctorBusyWith` — optional: `you` | `other_patient` — in-progress consult context
  - **Slot mode:** `slotStart`, `slotEnd` (ISO 8601), `earlyInviteAvailable` (boolean), `earlyInviteExpiresAt` (ISO or null)
  - **Queue mode:** `tokenNumber`, `aheadCount`, `etaMinutes`, `etaRange` `{ minMinutes, maxMinutes }` — omit or undefined when no queue row exists
  - **`inAppNotifications`** (optional, OPD-09): array of `{ type }` where `type` is `delay_broadcast` | `early_invite` | `your_turn_soon` | `queue_position_changed` — hints for banners / a11y; **queue order changes** are also detectable by comparing `tokenNumber` / `aheadCount` between polls

**No PHI** in `snapshot` (no patient name/phone). No open-order list in this phase.

### GET `/api/v1/bookings/session/prep-link?token=` (clk-21)

**Auth:** Consultation token in the query. A booking token or a history-form token is **401**. A cancelled or no-show visit, or a visit whose prep window has ended, is **410**.

**Success `data`:** `{ prepPath }`. `prepPath` is `/book/prep?t=` for that same appointment. The consultation token is not in the path.

Called when the patient taps share. `GET /session/snapshot` does not mint this token.

### POST `/api/v1/bookings/session/early-join/accept?token=`

**Success `data`:** `{ "accepted": true }`  
Idempotent if already accepted.

### POST `/api/v1/bookings/session/early-join/decline?token=`

**Success `data`:** `{ "declined": true }`  
Idempotent if already declined.

**Errors:** Standard error envelope; `ValidationError` when no active early join offer or invalid state transition.

---

## 📋 Dated appointment list — desk visit-prep flags (dvp P3)

**Auth:** Doctor JWT or staff via `allowStaff` + acting doctor (`GET /api/v1/appointments?date=YYYY-MM-DD`).

When `date` is present, each appointment may include presence-only flags (no PHI values):

| Field | Type | Meaning |
|--------|------|---------|
| `has_desk_vitals` | boolean | A non-archived `patient_vitals` row exists for this appointment |
| `has_history_submission` | boolean | A `patient_history_submissions` row exists for this appointment |
| `visit_document_count` | number | Count of `visit_documents` rows for this appointment |
| `has_visit_documents` | boolean | `visit_document_count > 0` |

Omitted on non-dated list reads and on single-appointment fetches. If the 233/234 embeds are unavailable the list still returns; flags are omitted and desk dots stay hollow.

---

## 🧪 Desk visit-document lab extract (dvp / migration 236)

**Auth:** Doctor JWT or staff via `staffCapability('internal_labs', 'papers')` + acting doctor. A staff login may write only the document kinds its seats allow (`lab_report` + `us` needs `internal_labs`; everything else needs `papers`).

`GET /api/v1/appointments/:id/documents` includes `extracted_results` on each document (array, default `[]`). Each panel is keyed by `pageId` and holds a LabReport-shaped `report`, confirmed `rows`, `confirmed_at`, and `confirmed_by`.

| Method | Path | Writes | Notes |
|--------|------|--------|--------|
| `POST` | `/api/v1/appointments/:id/documents/:documentId/pages/:pageId/extract-lab` | No | Suggestion rows only. Same MIME readers as prescription extract-lab. A PDF page with no rows is rendered and sent to the gated vision reader only when that reader is enabled. Rate-limited. |
| `PUT` | `/api/v1/appointments/:id/documents/:documentId/extracted-results` | Yes | Body `{ panels: […] }`. Merges by `pageId`; does not wipe other pages. |

Desk does not create a prescription. The doctor hydrates confirmed panels into Objective Reports and may still edit.

---

## Desk lab-order projection (dvp Phase 4)

**Auth:** Doctor JWT or staff via `staffCapability('internal_labs')` + acting doctor. A `papers`-only login gets 403 on these routes. Staff never read `/api/v1/prescriptions/*`.

Appointment demographic fields match the desk list (`Appointment` snake_case). Order projection is camelCase.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/v1/appointments/lab-pending` | Register before `/:id`. Doctor-scoped, last 60 days, not date-scoped. Oldest pending first. |
| `GET` | `/api/v1/appointments/:id/lab-orders` | Latest non-superseded prescription only. Empty when unattested, missing, or no investigation orders. |
| `PUT` | `/api/v1/appointments/:id/lab-orders` | Body `{ updates: […] }`. Close or reopen attested orders. |

Each order:

```
{
  orderId: string;
  label: string;
  kind: string;
  status: 'pending' | 'uploaded' | 'not_done';
  reasonCode: string | null;
  reasonNote: string | null;
  documentId: string | null;
}
```

`GET /lab-pending` `data`:

```
{
  items: Array<{
    id: string;
    patient_id: string | null;
    patient_name: string;
    patient_phone: string;
    patient_mrn: string | null;
    patient_age: number | null;
    patient_sex: string | null;
    appointment_date: string;
    status: string;
    patient_checked_in_at: string | null;
    days_pending: number;
    report_uploaded: boolean;
    orders_closed: number;
    orders_total: number;
    orders: Array<{
      orderId: string;
      label: string;
      kind: string;
      status: 'pending' | 'uploaded' | 'not_done';
      reasonCode: string | null;
      reasonNote: string | null;
      documentId: string | null;
    }>;
    has_visit_documents: boolean;
    visit_document_count: number;
  }>
}
```

`GET` / `PUT /:id/lab-orders` `data`: `{ orders: Array<order> }`.

`PUT` body `{ updates: Array<{ orderId, status, documentId?, reasonCode?, reasonNote? }> }`. `uploaded` requires `documentId` on a same-visit in-house `lab_report` or `imaging`. `not_done` requires `reasonCode` (`sample_not_collected` | `patient_refused` | `sample_rejected` | `machine_down` | `done_outside` | `other`); `other` requires `reasonNote`. `pending` deletes the fulfillment row.

Day list (derived): latest attested Rx has ≥1 investigation order. `report_uploaded` is true when every order is `uploaded` or `not_done`. Cancelled appointments are excluded. The mixed-login Labs pending chip hides closed rows; the lab-only date list shows both.

---

## Social cards (soc-03, soc-05, soc-07, soc-10, soc-11, soc-12, soc-13, soc-20)

Doctor-owned marketing cards. Authenticated. No patient fields. The file is a photo, a video, audio, or a document in the `social-card-files` bucket. The card response says `hasFile`, `fileKind` (`photo`, `video`, `audio`, `document`, or null), and `postable`. It does not return the object key. `postable` is true only for JPEG, PNG, WebP, MP4, and MOV.

`GET /api/v1/social/cards`  
`POST /api/v1/social/cards`  
`PATCH /api/v1/social/cards/:id`  
`POST /api/v1/social/cards/:id/reuse` returns `201` with `{ card }`.  
`DELETE /api/v1/social/cards/:id` returns `200` with `data: null`. That move puts the card in the bin.  
`GET /api/v1/social/cards/bin` returns `{ cards }` still in the bin.  
`POST /api/v1/social/cards/:id/restore` returns `{ card }` and clears `deletedAt`.  
`DELETE /api/v1/social/cards/bin/:id` removes one binned card, its file, and its code. A card still on the board is not removed. Returns `200` with `data: null`.  
`DELETE /api/v1/social/cards/bin` removes every binned card for this doctor. Returns `200` with `data: null`.

`GET /api/v1/social/columns` returns `{ columns }`.  
`POST /api/v1/social/columns` body `{ name }` returns `201` with `{ column }`. The new column sits immediately before Ready.  
`PATCH /api/v1/social/columns/:id` body `{ name }` renames a named column. The four opening columns stay.  
`DELETE /api/v1/social/columns/:id` returns `200` with `data: null`. Cards in that column go back to Thoughts and ideas. The column name is not logged.

`POST /api/v1/social/cards/uploads` body `{ contentType }` returns `{ path, token }` for a file that will be attached on create.  
`POST /api/v1/social/cards/:id/file/upload` is the same mint for a card that already exists.  
`POST /api/v1/social/cards/:id/file` body `{ path }` attaches that object and leaves the column as it is.  
`DELETE /api/v1/social/cards/:id/file` removes the object. A Ready card moves to `making`. Any other column stays. Returns `{ card }`.  
`GET /api/v1/social/cards/:id/file` returns `{ downloadUrl }` for the owner. Another doctor gets nothing.

A thought can also keep reference files. These are not the file that posts. Photos, videos, audio, and documents each have their own cap of ten.  
`POST /api/v1/social/cards/:id/scraps` body `{ path }` returns `201` with `{ scrap }`. An eleventh file of that kind is refused with `The pile is full`.  
`GET /api/v1/social/cards/:id/scraps/:scrapId` returns `{ downloadUrl }`.  
`DELETE /api/v1/social/cards/:id/scraps/:scrapId` removes that reference and its object. Returns `200` with `data: null`.  
The path is not logged and is not in the response.

**Card:**

```json
{
  "id": "uuid",
  "stage": "thoughts",
  "title": "Fees for a first visit",
  "format": null,
  "topic": null,
  "words": {},
  "hasFile": false,
  "fileId": null,
  "fileKind": null,
  "postable": false,
  "scraps": [],
  "frames": [],
  "sourceUrl": null,
  "scheduledAt": null,
  "makeAt": null,
  "publishError": null,
  "instagramUrl": null,
  "visitCount": 0,
  "columnId": null,
  "pagePath": "/d/clinic",
  "createdAt": "2026-10-11T00:00:00.000Z",
  "updatedAt": "2026-10-11T00:00:00.000Z"
}
```

`stage` is `thoughts`, `chosen`, `making`, `ready`, `custom`, or `posted`. `custom` means the card sits in a column the doctor named. Create defaults to `thoughts`. `ready` is accepted only when `filePath` is a JPEG, PNG, WebP, MP4, or MOV. A GIF, HEIC, WebM, voice note, or document can sit on an earlier column and cannot land on Ready. A later move to `ready` needs a photo or a video already on the card. A file may also sit on any earlier column. Adding a file does not change the column. `posted` is not a column the doctor moves to. `columnId` is the column the card sits in, or null when the card is posted or has not been placed in one. Create and PATCH may send `columnId` to put the card in that column. Moving a card off Ready clears the time and keeps the file.

**Column:**

```json
{
  "id": "uuid",
  "kind": "custom",
  "name": "Film on Sunday",
  "position": 3
}
```

`kind` is `thoughts`, `chosen`, `making`, `ready`, or `custom`. The first four exist once per doctor, in that order. A `custom` column is inserted immediately before Ready. `name` is 1–80 characters. The response does not include `doctor_id`.

`format` is `post`, `reel`, or `story`, or null. A post does not need `shots`.

`words` may include `note`, `caption`, `altText`, `firstComment`, `hook`, `script`, `coverLine`, `shots` (up to three strings), `line`, `location`, `collaborator`, `crop` (`original`, `square`, `portrait`, or `landscape`), `storyPlace` (`fill` or `fit`). `portrait` is 4:5, `square` is 1:1, `landscape` is 16:9, and `original` is the photo's own ratio inside 4:5 to 1.91:1, `aiGenerated`, `shareToFeed`, `shareToStory`, `commentsOff`, `music`, `stickers`, `productTag`, and `handNote`. `altText` is the optional description of a picture, up to 500 characters. `music` or `productTag` means the card is finished on the phone. An older `stickers` value is ignored. `handNote` is a reminder for a card the doctor posts from the phone, up to 500 characters. It is not sent. `note` is the idea on a thought, up to 4000 characters. It is not the caption. `caption` may be 2200 characters. Saving a different format keeps the words of the formats that are hidden. Lines wrap. A heading line starts with `# `. A to-do line starts with `- [ ] ` or `- [x] `; an older line that starts with `- ` is an unticked to-do. A bullet line starts with `* `. A numbered line starts with `1. ` and the numbers are rewritten in order. A quote line starts with `> `. A whole line `!hr` is a divider. Two columns are a whole line `!cols`, the left lines, a whole line `!|`, the right lines, then a whole line `!/`. A whole line `!file:` plus a scrap id points at one reference already on that card. `!file:piece` points at the card’s own file. Deleting that line does not delete the file. A whole line `!link:` plus a link id points at one inspiration link on that card. Unknown keys are rejected, including `patientId`, `patientName`, `phone`, `name`, `complaint`, and `diagnosis`.

`scraps` is an array of `{ id, fileKind, postable, face }`, at most ten of each kind. `fileKind` and `postable` use the same meanings as on the card. `face` is `sheet` for a spreadsheet, `slides` for a deck, `page` for another document, or null. The array is empty when the card has no reference files. Ready still posts the single card file, not a scrap.

`frames` is the rest of a post or a story, after the card file, in order. Each item is `{ id, fileKind }`. `fileId` is the id of the card file when the card has one. That id stays on that picture when the order changes. A post or a story holds ten pictures in all, so `frames` holds at most nine. Only a JPEG, PNG, or WebP can be added. `POST /api/v1/social/cards/:id/frames` body `{ path }` returns `201` with `{ card }`. `PUT /api/v1/social/cards/:id/frames/order` body `{ ids }` lists `fileId` and every frame id in the new order. The first picture becomes the card file. The ids stay the same. An older request may send `piece` for the card file; the saved `fileId` replaces it. `GET /api/v1/social/cards/:id/frames/:frameId` returns `{ downloadUrl }`. `DELETE /api/v1/social/cards/:id/frames/:frameId` removes that picture. The path is not logged and is not in the response. A send posts every picture on the card, in order. One picture uses that file. More than one picture on a post goes as one carousel. More than one picture on a story goes up as its own story, in that order. A reel still sends only the card file. Before a photo is sent it is made into a JPEG that Instagram will take: at most 1440 pixels wide, between 4:5 and 1.91:1, at most 8 MB. A chosen crop of 4:5, 1:1, or 16:9 is used. Original keeps the photo's ratio inside that range. A story photo is 9:16. Fill crops it to cover that frame. Fit keeps the whole photo, centered, on a black 9:16 frame. `storyPlace` is `fill` or `fit`; a missing value is fill. A photo used as a reel uses the same fill or fit inside 9:16. A video reel is sent as the file. Every picture in one carousel uses the first picture's ratio. The doctor's saved file is left as it was.

`contentType` is a photo (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP, TIFF), a video (MP4, MOV, WebM, M4V, 3GP, AVI, MKV), audio (MP3, M4A, WAV), or a document: PDF, Word, PowerPoint, Excel, plain text, CSV, RTF, or OpenDocument. A photo is at most 8 MB. A video is at most 100 MB. Audio is at most 15 MB. A document is at most 10 MB. On a post, a reel, or a story, the card file and a reference are a photo or a video. A document or an audio file is refused. The card file is a JPEG, PNG, WebP, MP4, or MOV. A photo chosen for a reel is held as a short MP4 when it is sent.

`publishError` is null, `not_connected`, or `meta_rejected`. It is set when a scheduled send does not go out. `not_connected` also covers an Instagram login that no longer works. The card stays on its day and is tried again 15 minutes later. The running API checks every minute and sends a due Ready card that can go out on its own. A passing Instagram error, a 5xx, or a dropped connection is tried up to three times within one send. A container Instagram is still preparing (a video can take minutes) is waited on for up to 5 minutes. Before a publish call is repeated, Instagram is asked whether the post already went up, so a card is not posted twice. Once a post is up, the card leaves Ready even when the link does not come back; it is then Posted with `instagramUrl` null. The card is marked Posted as soon as the post is up; the first comment, comments off, and a story copy follow. A story copy of a video goes first, because marking the card Posted removes the stored file. A card the doctor will post, or one with music or a product tag, is left for the phone. A photo on a reel is held as a short video and sent as a reel. A photo send includes alt text when it is set, on that picture, or on the first picture of a carousel. A post or a reel includes up to three collaborator usernames. An AI-generated card is marked as such. A reel can also be shared to the feed. When Your story is on, a post or a reel is also sent as a story: a photo is 9:16, each photo in a set is its own story, and a reel is a video story. A story card with several photos sends each one as its own story, in order. The caption, the first comment, and collaborators stay on the post. A post or a reel can have comments turned off after it is up. A post or a reel posts the first comment after it is up, unless comments are turned off. Turning comments off keeps the saved first comment. A place name, music, a product tag, and a hand note are not sent. `POST /cron/social-card-publish` does the same send. It logs counts and a status code only.

`makeAt` is an ISO time, or null. It is when to start making the card. PATCH may set it only while the card is Chosen or Making. Null clears it. Moving the card off Chosen and Making clears it. Starting a Chosen card, by moving it to Making, also clears it. A time set again on Making is when to work on that card. It is not the publish time, and storing it does not publish. The card stays in its column when the time arrives. On the day the tag reads start today. After the time passes it reads late, and a late or today card sorts to the top of Chosen. The Schedule shows the card on that day. If that day arrives and the card is still Chosen or Making, it stays there.

`scheduledAt` is an ISO time, or null. PATCH may set it only when the card is Ready and has a file. Null clears it and leaves the card Ready. Storing the time does not publish. `postNow: true` sets the time to now, clears `publishError`, and starts sending that one card in the background. The response returns before Instagram answers; the client reads the card list until the card is Posted or has a `publishError`. `postNow` may come with `words`, which are saved first. A card the doctor will post, or one with music or a product tag, is refused. A card already being sent (claimed in the last 10 minutes with no error) is refused with 409. Setting a time gives the card one durable code if it does not have one. Clearing the time does not retire that code. A posted card keeps its time and stays on that day in Schedule, marked Posted. Deleting the card does.

`pagePath` is `/d/:slug`, or `/d/:slug?c=` plus that card’s code once the code exists. It is null when the doctor has no public slug. It is not copied into the first comment. The code is not a separate response field and is not logged. Chat codes in `visit_page_links` still expire after one hour.

`sourceUrl` is an inspiration link, or null. Create and PATCH may send it. A non-empty value is an `http` or `https` link, at most 500 characters. It is not the Instagram post. Halo Aid does not fetch it and does not log it.

`links` is the inspiration links kept on the card, each `{ id, url }`. There is no fixed count. PATCH may send the list. Each url follows the `sourceUrl` rule. The first link is also stored as `sourceUrl`. The values are not logged.

`instagramUrl` is set by PATCH `{ instagramUrl }` on a Ready card that has a file. The value must be an `https` link to an Instagram post, reel, or story. That PATCH sets `stage` to `posted`, clears the time and the file, and keeps the page code, minting one if the card does not have one. The card leaves Schedule. Halo Aid does not fetch the URL and does not log it.

`visitCount` is how many public bookings started from that card’s `?c=` code. A booking with no code, a retired code, or another doctor’s code does not change the card. The count is a number. The card does not receive a patient name, phone, patient id, or appointment id. The same booking also stores the calendar day, in the doctor’s timezone, so Analytics can place it in a week. That day row is not on the card. If the count fails, the booking still succeeds. `POST /api/v1/social/cards/:id/reuse` copies a posted card into a new `thoughts` card with the same title, format, topic, and words. The copy has no file, time, Instagram URL, page code, or visit count. The posted card stays as it is.

`GET /api/v1/social/analytics?from&to` reads one doctor’s clinic numbers for an inclusive period of at most 90 days. `from` and `to` are `YYYY-MM-DD`. The response is counts, the doctor’s titles, the caption’s first line, and a short-lived picture address when a send kept one. Enquiries are new Instagram chats. Bookings are appointments from those chats, plus bookings from a card’s page link, each appointment once. A cancelled appointment is left out. Conversion is omitted when the period has no enquiries. A post’s own bookings are the link bookings for that card, plus a chat booking whose comment lead names that post, still one appointment once. Days follow the doctor’s timezone. The response has no patient, no phone, no appointment id, no comment, and no Instagram media id. When this account has granted insights, the same response adds `instagram.tiles` for views, reach, interactions, and followers gained, a `views` number on each day, and views, likes, comments, and saves on each post in the period. A missing measurement is null. An account that has not granted insights omits `instagram`. Those numbers are read from stored rows. Opening the tab does not call Instagram. `sentence` is one line computed from those same counts. `sentence.title` is set only when the line names a format or a topic. The line does not call a model, and it is not logged.

List and create wrap the card as `{ cards }` and `{ card }`. Update returns `{ card }`.

---

## 📝 Version

**Last Updated:** 2026-09-13  
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