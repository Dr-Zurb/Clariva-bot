# API Design Guide
## REST API Design Principles & Standards

---

## 🎯 Purpose

This document defines API design principles, conventions, and standards for the Clariva Bot API. Follow these guidelines to ensure consistent, professional, and maintainable API design.

**Related Files:**
- [STANDARDS.md](./STANDARDS.md) - Coding rules and error handling
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Project structure
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Coding process

---

## ⚠️ DO NOT Violate Response Contracts

**AI Agents MUST NOT:**
- ❌ Return `{ data: ... }` manually - **MUST** use `successResponse(data, req)` helper
- ❌ Return `{ error, message, stack }` - **MUST** use error middleware (canonical format)
- ❌ Invent error fields like `error.details`, `error.errors` - **MUST** follow STANDARDS.md contract
- ❌ Skip `meta` object with `timestamp` and `requestId` - **MUST** include in all responses

**ALWAYS:**
- ✅ Use `successResponse(data, req)` for success responses
- ✅ Throw typed errors (error middleware formats automatically)
- ✅ Follow canonical contract: `{ success: true, data: {...}, meta: {...} }`

**See:** [STANDARDS.md](./STANDARDS.md) "Canonical Contracts" section for exact format.

---

## ⚠️ Source of Truth

**IMPORTANT:** This file complements STANDARDS.md. If there's a conflict, STANDARDS.md takes precedence. This file focuses on API design principles and conventions.

---

## 📋 Table of Contents

1. [API Versioning](#api-versioning)
2. [Endpoint Naming Conventions](#endpoint-naming-conventions)
3. [HTTP Methods & Usage](#http-methods--usage)
4. [Response Format Standards](#response-format-standards)
5. [Error Response Format](#error-response-format)
6. [Request Format Standards](#request-format-standards)
7. [Status Codes](#status-codes)
8. [Pagination](#pagination)
9. [Filtering & Sorting](#filtering--sorting)
10. [Authentication & Authorization](#authentication--authorization)
11. [Rate Limiting](#rate-limiting)
12. [API Documentation](#api-documentation)

---

## 1. API Versioning

### Version Strategy

**MUST:** Use URL-based versioning in the path.

```
/api/v1/...
/api/v2/...
```

**Pattern:**
- Current version: `/api/v1/`
- Health check (unversioned): `/health` (for monitoring tools)
- Root endpoint (unversioned): `/` (API information)

**Example:**
```typescript
// routes/index.ts
router.use('/api/v1', apiV1Routes); // Versioned endpoints
router.use('/health', healthRoutes); // Unversioned (monitoring)
router.get('/', getRootController); // Unversioned (API info)
```

### Versioning Rules

- **MUST:** Version breaking changes (new major version)
- **SHOULD:** Maintain backward compatibility within a major version
- **MUST:** Document deprecation timeline (minimum 6 months)
- **SHOULD:** Support at least current and previous major version

---

## 2. Endpoint Naming Conventions

### Resource Naming (MUST)

**Rules:**
- Use **plural nouns** for resource names
- Use **kebab-case** for multi-word resources
- Be **specific** and **descriptive**
- Use **nouns**, not verbs

**Examples:**
```
✅ GOOD:
GET    /api/v1/appointments
POST   /api/v1/appointments
GET    /api/v1/appointments/:id
PUT    /api/v1/appointments/:id
DELETE /api/v1/appointments/:id

GET    /api/v1/doctors
GET    /api/v1/patient-records
GET    /api/v1/availability-slots

❌ BAD:
GET    /api/v1/appointment (singular)
GET    /api/v1/getAppointments (verb)
GET    /api/v1/appointments/get (verb in path)
GET    /api/v1/appointment_list (snake_case)
```

### Nested Resources

**Pattern:** Use nested paths for related resources.

```
✅ GOOD:
GET /api/v1/doctors/:doctorId/appointments
GET /api/v1/doctors/:doctorId/availability
POST /api/v1/appointments/:appointmentId/notes

❌ BAD:
GET /api/v1/doctors-appointments/:doctorId (flat structure)
```

**Rule:** Only nest when there's a clear parent-child relationship.

---

## 3. HTTP Methods & Usage

### Method Semantics

| Method | Usage | Idempotent | Safe | Response Body |
|--------|-------|------------|------|---------------|
| `GET` | Retrieve resource(s) | ✅ Yes | ✅ Yes | ✅ Data |
| `POST` | Create resource | ❌ No | ❌ No | ✅ Created resource |
| `PUT` | Replace entire resource | ✅ Yes | ❌ No | ✅ Updated resource |
| `PATCH` | Partial update | ❌ No | ❌ No | ✅ Updated resource |
| `DELETE` | Delete resource | ✅ Yes | ❌ No | ❌ Usually empty (204) |

### Standard Endpoints Pattern

For each resource, implement these standard endpoints:

```typescript
// Collection endpoints
GET    /api/v1/appointments          // List all (with pagination)
POST   /api/v1/appointments          // Create new

// Item endpoints
GET    /api/v1/appointments/:id      // Get by ID
PUT    /api/v1/appointments/:id      // Replace entire resource
PATCH  /api/v1/appointments/:id      // Partial update
DELETE /api/v1/appointments/:id      // Delete
```

### Method Usage Guidelines

**GET:**
- **MUST:** Never modify data
- **MUST:** Use query parameters for filtering/sorting
- **SHOULD:** Support pagination for large collections

**POST:**
- **MUST:** Use for creating resources
- **MUST:** Return 201 (Created) with Location header
- **SHOULD:** Return created resource in response body

**PUT:**
- **MUST:** Replace entire resource (all fields required)
- **MUST:** Be idempotent (same request = same result)
- **SHOULD:** Return updated resource

**PATCH:**
- **MUST:** Update only provided fields
- **SHOULD:** Return updated resource
- **MUST:** Validate only provided fields

**DELETE:**
- **MUST:** Be idempotent
- **MUST:** Return 204 (No Content) on successful deletion
- **MUST:** Return 404 (Not Found) if resource doesn't exist (treated as error, not success)

**DELETE Idempotency Policy (MANDATORY):**
- **Option A (REST Standard - CHOSEN):** If resource doesn't exist → 404 Not Found (not success)
  - Client knows resource was never there or already deleted
  - More informative for client error handling
  - Matches REST semantics: "resource not found" is an error condition

**Implementation:**
```typescript
export const deleteResource = asyncHandler(async (req: Request, res: Response) => {
  const { id } = getResourceParamsSchema.parse(req.params);
  
  const resource = await getResourceService(id);
  
  if (!resource) {
    throw new NotFoundError('Resource not found'); // 404 - not success
  }
  
  await deleteResourceService(id);
  
  // 204 No Content - successful deletion
  return res.status(204).send();
});
```

**AI Agents:** Use Option A. If resource doesn't exist, return 404. Do not return 204 for missing resources.

---

## 4. Response Format Standards

### Success Response Format (MUST)

**Standard Structure:**
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Implementation:**
```typescript
// Use successResponse helper (from utils/response.ts)
import { successResponse } from '../utils/response';

export const getResource = asyncHandler(async (req: Request, res: Response) => {
  const resource = await getResourceService();
  return res.status(200).json(successResponse(resource, req));
});
```

**Note:** `successResponse` returns a response object that must be sent with `res.json()`. The status code is set explicitly with `res.status()`.

### Single Resource Response

```json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-01-17T10:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Collection Response (with pagination)

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "1", "name": "Item 1" },
      { "id": "2", "name": "Item 2" }
    ],
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

### Empty Response (DELETE)

```json
// Status: 204 No Content
// No response body
```

**OR** if you need to return data:

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

---

## 5. Error Response Format

### Canonical Error Shape (MANDATORY - AI Agents Must Not Deviate)

**All errors MUST follow this exact structure. AI agents MUST NOT invent new error formats.**

**Standard Structure:**
```json
{
  "success": false,
  "error": {
    "code": "ValidationError",
    "message": "Validation failed",
    "statusCode": 400
  },
  "meta": {
    "timestamp": "2026-01-17T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Error Object Contract (MANDATORY):**
- `error.code`: String - Error class name (ValidationError, NotFoundError, etc.)
- `error.message`: String - Human-readable error message
- `error.statusCode`: Number - HTTP status code (400, 404, 500, etc.)
- **NO additional fields allowed** in error object (except in development mode for stack traces)

**AI Agent Rules:**
- **MUST NOT** add fields like `error.details`, `error.errors`, `error.data`, `error.stack` (unless in development)
- **MUST NOT** create new error response formats
- **MUST** use error middleware to format errors (see STANDARDS.md)
- **MUST NOT** manually format error responses in controllers
- **MUST NOT** return errors in success response format

**Implementation:**
```typescript
// Error middleware handles this automatically
// Just throw typed errors in controllers/services

if (!resource) {
  throw new NotFoundError('Resource not found');
}

if (!valid) {
  throw new ValidationError('Invalid input');
}
```

**Development Mode Exception:**
In development (`NODE_ENV=development`), stack traces may be included:
```json
{
  "success": false,
  "error": {
    "code": "InternalError",
    "message": "Unexpected error",
    "statusCode": 500,
    "stack": "Error: ..."  // Only in development
  },
  "meta": { ... }
}
```

### Error Codes (Allowed - No New Codes Without Approval)

**Standard Error Codes:**
- `ValidationError` - 400 (Invalid input)
- `UnauthorizedError` - 401 (Not authenticated)
- `ForbiddenError` - 403 (Not authorized)
- `NotFoundError` - 404 (Resource not found)
- `ConflictError` - 409 (Resource conflict)
- `InternalError` - 500 (Server error)

**MUST NOT** create new error codes without updating STANDARDS.md first.

**See:** [STANDARDS.md](./STANDARDS.md) for error handling details.

---

## 6. Request Format Standards

### Request Headers (MUST)

**Required Headers:**
```
Content-Type: application/json (for POST/PUT/PATCH with body)
Authorization: Bearer <token> (for protected endpoints)
```

**Optional Headers:**
```
X-Request-ID: <uuid> (client-provided request ID)
X-Correlation-ID: <uuid> (client-provided correlation ID)
Accept: application/json
```

### Request Body (POST/PUT/PATCH)

**MUST:** JSON format
**MUST:** Validated with Zod schemas
**MUST:** Content-Type: application/json

**Example:**
```json
{
  "patientName": "John Doe",
  "phone": "+1234567890",
  "appointmentDate": "2026-01-20T14:00:00.000Z",
  "reason": "Checkup"
}
```

### Query Parameters (GET)

**Pattern:** Use query parameters for filtering, sorting, pagination.

```
GET /api/v1/appointments?status=confirmed&page=1&pageSize=20&sortBy=date&sortOrder=asc
```

**Validation:**
```typescript
const querySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const validated = querySchema.parse(req.query);
```

---

## 7. Status Codes

### Standard Status Codes (MUST)

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST (resource created) |
| `204` | No Content | Successful DELETE (no response body) |
| `400` | Bad Request | Validation errors, malformed request |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Authenticated but not authorized |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource conflict (duplicate, constraint violation) |
| `413` | Payload Too Large | Request body exceeds limit |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | Service down (database, external API) |

### Status Code Usage Rules

**200 OK:**
- GET requests (single resource or collection)
- PUT/PATCH requests (update successful)

**201 Created:**
- POST requests (resource created)
- **MUST:** Include `Location` header with resource URL
- **SHOULD:** Return created resource in response body

**204 No Content:**
- DELETE requests (resource successfully deleted)
- No response body
- **Note:** If resource doesn't exist, return 404 (not 204) per DELETE idempotency policy above

**400 Bad Request:**
- Validation errors (Zod validation fails)
- Malformed request body
- Invalid query parameters

**401 Unauthorized:**
- Missing authentication token
- Invalid/expired token
- **MUST:** Include `WWW-Authenticate` header

**403 Forbidden:**
- Valid authentication but insufficient permissions
- Access denied to resource

**404 Not Found:**
- Resource doesn't exist
- Route not found (use 404 handler)

**409 Conflict:**
- Duplicate resource (e.g., email already exists)
- Constraint violation
- Business rule violation

**500 Internal Server Error:**
- Unexpected errors
- Database connection failures
- Unhandled exceptions

**503 Service Unavailable:**
- Database down
- External service unavailable
- Health check failures

---

## 8. Pagination

### Pagination Format (MUST)

**Query Parameters:**
```
?page=1&pageSize=20
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrevious": false
    }
  },
  "meta": { ... }
}
```

### Pagination Rules

- **MUST:** Default to page 1 if not specified
- **MUST:** Default pageSize to 20 (configurable, max 100)
- **MUST:** Include pagination metadata in response
- **SHOULD:** Support `hasNext` and `hasPrevious` booleans
- **SHOULD:** Use cursor-based pagination for large datasets (future enhancement)

**Implementation:**
```typescript
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export async function listResources(query: PaginationQuery): Promise<PaginatedResponse<Resource>> {
  const { page, pageSize } = query;
  const offset = (page - 1) * pageSize;
  
  const { data: items, count } = await supabase
    .from('resources')
    .select('*', { count: 'exact' })
    .range(offset, offset + pageSize - 1);
  
  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    items: items || [],
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}
```

---

## 9. Filtering & Sorting

### Filtering

**Pattern:** Use query parameters for filters.

```
GET /api/v1/appointments?status=confirmed&doctorId=123&startDate=2026-01-01
```

**Validation:**
```typescript
const filterSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  doctorId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const filters = filterSchema.parse(req.query);
```

### Sorting

**Pattern:** Use `sortBy` and `sortOrder` query parameters.

```
GET /api/v1/appointments?sortBy=createdAt&sortOrder=desc
```

**Validation:**
```typescript
const sortSchema = z.object({
  sortBy: z.enum(['createdAt', 'date', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
```

**Implementation:**
```typescript
if (sortBy && sortOrder) {
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });
}
```

### Combined Example

```
GET /api/v1/appointments?status=confirmed&page=1&pageSize=20&sortBy=date&sortOrder=asc
```

---

## 10. Authentication & Authorization

### Authentication Headers

**MUST:** Use Bearer token authentication.

```
Authorization: Bearer <jwt-token>
```

**Implementation:**
```typescript
// middleware/auth.ts
export const authenticateToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }
  
  // Verify token (Supabase Auth)
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new UnauthorizedError('Invalid token');
  }
  
  req.user = user;
  next();
});
```

### Protected Routes

```typescript
// routes/appointments.ts
router.post(
  '/appointments',
  authenticateToken, // Authentication middleware
  createAppointmentController
);
```

### Authorization

**MUST:** Check permissions after authentication.

```typescript
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  // Check if user has permission
  if (!hasPermission(req.user, 'create:appointment')) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // Proceed with creation
});
```

**See:** [COMPLIANCE.md](./COMPLIANCE.md) for RBAC and access control details.

---

## 11. Rate Limiting

### Rate Limit Headers

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642518000
```

### Implementation

```typescript
// middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});
```

**See:** [RECIPES.md](./RECIPES.md) for implementation details.

---

## 12. API Documentation

### OpenAPI/Swagger (SHOULD)

**SHOULD:** Use OpenAPI 3.0 specification for API documentation.

**Example:**
```yaml
openapi: 3.0.0
info:
  title: Clariva Bot API
  version: 1.0.0
paths:
  /api/v1/appointments:
    get:
      summary: List appointments
      parameters:
        - name: page
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AppointmentList'
```

### Documentation Requirements

**MUST:** Document all endpoints with:
- HTTP method and path
- Request parameters (path, query, body)
- Response format
- Status codes
- Authentication requirements
- Example requests/responses

**SHOULD:** Use JSDoc comments in controllers.

```typescript
/**
 * Create appointment
 * POST /api/v1/appointments
 * 
 * Creates a new appointment for a patient.
 * 
 * @requires Authentication Bearer token
 * @body {CreateAppointmentDto} appointment data
 * @returns {Appointment} Created appointment
 * @throws {ValidationError} 400 - Invalid input
 * @throws {UnauthorizedError} 401 - Not authenticated
 */
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  // ...
});
```

---

## 📝 Best Practices Summary

### DO:
✅ Use RESTful conventions (plural nouns, HTTP verbs)  
✅ Version APIs in URL path (`/api/v1/`)  
✅ Use standardized response format (successResponse helper)  
✅ Return appropriate status codes  
✅ Validate all inputs with Zod  
✅ Use query parameters for filtering/sorting/pagination  
✅ Include pagination metadata in collection responses  
✅ Document endpoints with JSDoc  
✅ Handle errors consistently (error middleware)  
✅ Use Bearer token authentication  

### DON'T:
❌ Use verbs in endpoint paths  
❌ Mix naming conventions (use kebab-case consistently)  
❌ Return inconsistent response formats  
❌ Skip input validation  
❌ Use wrong status codes  
❌ Expose internal errors to clients  
❌ Hardcode pagination values  
❌ Forget to document endpoints  

---

## 🔗 Related Files

- [STANDARDS.md](./STANDARDS.md) - Error handling, validation rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Project structure
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Coding process

---

**Last Updated:** 2026-01-17  
**Version:** 1.0.0  
**Status:** Active
