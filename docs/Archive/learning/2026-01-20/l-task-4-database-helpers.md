# Learning Topics - Database Service Helpers & Utilities
## Task #4: Building Reusable Database Tools

---

## 📚 What Are We Learning Today?

Today we're learning about **Database Service Helpers & Utilities** - creating reusable functions that make database operations easier, safer, and compliant. Think of it like **creating a standardized toolkit for hospital staff** - everyone uses the same tools, follows the same procedures, and everything is properly documented and audited!

We'll learn about:
1. **What are Service Helpers?** - Reusable database functions
2. **Audit Logging Utility** - Recording all system actions
3. **Database Helper Functions** - Error handling, validation, data transformation
4. **Service Layer Patterns** - CRUD operations and business logic
5. **Error Handling** - Using AppError classes
6. **PHI Redaction** - Removing sensitive data before logging/external calls
7. **Service Role vs User Role** - When to use which client
8. **Framework-Agnostic Services** - Services that work anywhere

---

## 🎓 Topic 1: What are Service Helpers?

### What are Service Helpers?

**Service helpers** are reusable functions that make database operations easier and safer.

**Think of it like:**
- **Hospital Tool Kit** - Standardized tools everyone uses
- **Medical Procedures** - Step-by-step processes for common tasks
- **Quality Control System** - Ensures everything is done correctly

### Why Use Service Helpers?

**Without helpers:**
- Code duplicated across services
- Inconsistent error handling
- Easy to forget audit logging
- Hard to maintain

**With helpers:**
- Reusable functions (DRY principle)
- Consistent error handling
- Automatic audit logging
- Easy to maintain and update

**Think of it like:**
- **Without helpers** = Each doctor uses different procedures (inconsistent)
- **With helpers** = All doctors use standardized procedures (consistent)

### Types of Service Helpers

**1. Audit Logger:**
- Records all system actions
- Ensures compliance
- Tracks who did what, when

**2. Database Helpers:**
- Error handling
- Data validation
- PHI redaction
- Query building

**3. Service Functions:**
- CRUD operations
- Business logic
- Data transformations

**Think of it like:**
- **Audit Logger** = Medical record system (tracks all actions)
- **Database Helpers** = Quality control tools (validates everything)
- **Service Functions** = Medical procedures (standardized operations)

---

## 🎓 Topic 2: Audit Logging Utility

### What is Audit Logging?

**Audit logging** is recording all system actions for compliance and security.

**Think of it like:**
- **Security Camera System** - Records all activity
- **Medical Records** - Documents all patient interactions
- **Access Log** - Tracks who accessed what, when

### Why Audit Logging is Critical

**Compliance:**
- HIPAA requires audit trails
- GDPR requires access logging
- Legal requirement for healthcare

**Security:**
- Detect unauthorized access
- Track data breaches
- Investigate incidents

**Think of it like:**
- **Compliance** = Legal requirement (must have audit trail)
- **Security** = Detect problems (who accessed what, when)

### Audit Logger Function

**Basic Structure:**
```typescript
/**
 * Log an audit event
 * 
 * Records who did what, when, and the result.
 * Uses service role client (bypasses RLS for insertion).
 * 
 * @param correlationId - Request correlation ID (from middleware)
 * @param userId - User who performed the action (null for system operations)
 * @param action - Action performed (e.g., 'create_appointment')
 * @param resourceType - Type of resource (e.g., 'appointment')
 * @param resourceId - ID of resource affected (optional)
 * @param status - Operation status ('success' or 'failure')
 * @param errorMessage - Error message if status is 'failure'
 * @param metadata - Additional context (NO PHI allowed)
 */
async function logAuditEvent(params: {
  correlationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Use service role client (bypasses RLS)
  const { error } = await supabaseAdmin
    .from('audit_logs')
    .insert({
      correlation_id: params.correlationId,
      user_id: params.userId || null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId || null,
      status: params.status,
      error_message: params.errorMessage || null,
      metadata: params.metadata || null
    });

  if (error) {
    // Log error but don't throw (audit logging should never break main flow)
    logger.error({ error, correlationId: params.correlationId }, 'Failed to create audit log');
  }
}
```

**Think of it like:**
- **logAuditEvent** = Recording system in hospital (logs all actions)
- **Service role** = System-level access (can write to audit logs)
- **Never throw** = Audit logging shouldn't break main operations

### Helper Functions for Common Scenarios

**1. Log Data Access (Read Operations):**
```typescript
/**
 * Log data access event
 * 
 * Use when reading PHI or sensitive data.
 */
async function logDataAccess(
  correlationId: string,
  userId: string,
  resourceType: string,
  resourceId: string
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: `read_${resourceType}`,
    resourceType,
    resourceId,
    status: 'success'
  });
}
```

**2. Log Data Modification (Create/Update/Delete):**
```typescript
/**
 * Log data modification event
 * 
 * Use when creating, updating, or deleting data.
 * Includes changed fields (field names only, not values).
 */
async function logDataModification(
  correlationId: string,
  userId: string,
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  changedFields?: string[]  // Field names only, not values!
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: `${action}_${resourceType}`,
    resourceType,
    resourceId,
    status: 'success',
    metadata: changedFields ? { changedFields } : undefined
  });
}
```

**3. Log AI Interaction:**
```typescript
/**
 * Log AI interaction event
 * 
 * Use when sending data to AI services or receiving AI responses.
 */
async function logAIIntraction(
  correlationId: string,
  userId: string,
  conversationId: string,
  model: string,
  tokens: number,
  redactionApplied: boolean
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: 'ai_interaction',
    resourceType: 'conversation',
    resourceId: conversationId,
    status: 'success',
    metadata: {
      model,
      tokens,
      redactionApplied  // Whether PHI was redacted before sending
    }
  });
}
```

**4. Log Security Event:**
```typescript
/**
 * Log security event
 * 
 * Use for failed authentication, rate limiting, suspicious activity.
 */
async function logSecurityEvent(
  correlationId: string,
  userId: string | undefined,
  eventType: string,
  severity: 'low' | 'medium' | 'high',
  ipAddress?: string
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: 'security_event',
    resourceType: 'security',
    status: 'failure',
    metadata: {
      eventType,
      severity,
      ipAddress
    }
  });
}
```

**Think of it like:**
- **Helper functions** = Pre-filled forms (makes logging easier)
- **Common scenarios** = Standard procedures (read, write, AI, security)

---

## 🎓 Topic 3: Database Helper Functions

### What are Database Helpers?

**Database helpers** are utility functions that make database operations safer and easier.

**Think of it like:**
- **Quality Control Tools** - Validate everything before use
- **Safety Checks** - Prevent errors before they happen
- **Data Sanitizers** - Clean data before logging

### Error Handling Helper

**Map Supabase errors to AppError:**
```typescript
/**
 * Handle Supabase errors and map to AppError
 * 
 * Converts Supabase PostgREST errors to appropriate AppError subclasses.
 * 
 * @param error - Supabase error object
 * @param correlationId - Request correlation ID for logging
 * @throws AppError subclass based on error type
 */
function handleSupabaseError(error: unknown, correlationId: string): never {
  if (!error || typeof error !== 'object') {
    throw new InternalError('Unknown database error');
  }

  const supabaseError = error as { code?: string; message?: string };

  // Map Supabase error codes to AppError
  switch (supabaseError.code) {
    case 'PGRST116':  // Not found
      throw new NotFoundError('Resource not found');
    
    case '23505':  // Unique violation
      throw new ConflictError('Resource already exists');
    
    case '23503':  // Foreign key violation
      throw new ValidationError('Invalid reference');
    
    case '23502':  // Not null violation
      throw new ValidationError('Required field missing');
    
    default:
      logger.error({ error, correlationId }, 'Database error');
      throw new InternalError('Database operation failed');
  }
}
```

**Think of it like:**
- **Error mapping** = Translating error codes to user-friendly messages
- **AppError classes** = Categorized errors (validation, not found, etc.)

### Ownership Validation Helper

**Check if user owns the resource:**
```typescript
/**
 * Validate resource ownership
 * 
 * Ensures doctor_id matches authenticated user ID.
 * Used for defense in depth (RLS also enforces this).
 * 
 * @param doctorId - Doctor ID from resource
 * @param userId - Authenticated user ID
 * @throws ForbiddenError if ownership doesn't match
 */
function validateOwnership(doctorId: string, userId: string): void {
  if (doctorId !== userId) {
    throw new ForbiddenError('Access denied: Resource does not belong to user');
  }
}
```

**Think of it like:**
- **Ownership check** = Verifying you have permission (defense in depth)
- **RLS + validation** = Double security (database + application)

### PHI Sanitization Helper

**Remove PHI from objects before logging:**
```typescript
/**
 * Sanitize data for logging
 * 
 * Removes PHI fields from objects before logging.
 * Only keeps IDs and safe metadata.
 * 
 * @param data - Object that may contain PHI
 * @returns Sanitized object (no PHI)
 */
function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const phiFields = ['patient_name', 'patient_phone', 'name', 'phone', 'date_of_birth', 'content'];
  const sanitized = { ...data };

  // Remove PHI fields
  for (const field of phiFields) {
    delete sanitized[field];
  }

  // Keep only IDs and safe metadata
  return {
    id: sanitized.id,
    doctor_id: sanitized.doctor_id,
    resource_id: sanitized.resource_id,
    status: sanitized.status,
    // ... other safe fields
  };
}
```

**Think of it like:**
- **Sanitization** = Removing confidential information (patient names, phones)
- **Safe logging** = Only logging IDs and metadata (no PHI)

### Data Classification Helper

**Classify data as public/administrative/PHI:**
```typescript
/**
 * Classify data sensitivity
 * 
 * Determines if data is public, administrative, or PHI.
 * Used for appropriate handling and logging.
 * 
 * @param data - Data to classify
 * @returns Data classification
 */
function classifyData(data: Record<string, unknown>): 'public' | 'administrative' | 'phi' {
  const phiFields = ['patient_name', 'patient_phone', 'name', 'phone', 'date_of_birth', 'content'];
  
  // Check if any PHI fields are present
  const hasPHI = phiFields.some(field => field in data && data[field] != null);
  
  if (hasPHI) {
    return 'phi';
  }
  
  // Check if administrative data (appointment status, availability, etc.)
  const adminFields = ['status', 'appointment_date', 'is_available'];
  const hasAdmin = adminFields.some(field => field in data);
  
  if (hasAdmin) {
    return 'administrative';
  }
  
  return 'public';
}
```

**Think of it like:**
- **Classification** = Categorizing data by sensitivity (like medical record classification)
- **Appropriate handling** = Different rules for different data types

### PHI Redaction Helper

**Redact PHI before external calls:**
```typescript
/**
 * Redact PHI from text
 * 
 * Removes or replaces PHI in text before sending to external services (AI, etc.).
 * 
 * @param text - Text that may contain PHI
 * @returns Text with PHI redacted
 */
function redactPHI(text: string): string {
  // Replace phone numbers
  let redacted = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
  
  // Replace names (simple pattern - can be enhanced)
  // This is a basic example - real implementation would be more sophisticated
  redacted = redacted.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME_REDACTED]');
  
  // Replace dates that look like DOB
  redacted = redacted.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '[DATE_REDACTED]');
  
  return redacted;
}
```

**Think of it like:**
- **Redaction** = Blacking out sensitive information (like redacting medical records)
- **External calls** = Sending data outside system (must remove PHI first)

---

## 🎓 Topic 4: Service Layer Patterns

### What is the Service Layer?

**Service layer** is where business logic and database operations live.

**Think of it like:**
- **Business Operations** = Core hospital procedures (appointment booking, patient management)
- **Data Operations** = Database queries and updates
- **Business Rules** = Validation and logic (can't book past dates, etc.)

### Service Layer Rules

**1. Framework-Agnostic:**
- Services never import Express types
- Services work with any framework
- Services are pure TypeScript functions

**2. Error Handling:**
- Services throw AppError (never return {error})
- Services return data directly (not wrapped)
- Errors are typed (ValidationError, NotFoundError, etc.)

**3. Database Operations:**
- Services call Supabase client from `config/database.ts`
- Services handle all database queries
- Services include audit logging

**Think of it like:**
- **Framework-agnostic** = Works with any system (not tied to Express)
- **Error handling** = Proper error types (categorized errors)
- **Database operations** = All queries in services (not controllers)

### Generic CRUD Functions

**Find by ID:**
```typescript
/**
 * Find resource by ID
 * 
 * Generic function to find any resource by ID.
 * 
 * @param table - Table name
 * @param id - Resource ID
 * @returns Resource or throws NotFoundError
 */
async function findById<T>(table: string, id: string): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    handleSupabaseError(error, correlationId);
  }

  return data as T;
}
```

**Find Many with Filters:**
```typescript
/**
 * Find multiple resources with filters
 * 
 * Generic function to find resources with optional filters.
 * 
 * @param table - Table name
 * @param filters - Filter object (e.g., { doctor_id: '123', status: 'pending' })
 * @returns Array of resources
 */
async function findMany<T>(table: string, filters?: Record<string, unknown>): Promise<T[]> {
  let query = supabase.from(table).select('*');

  // Apply filters
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
  }

  const { data, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data || []) as T[];
}
```

**Create:**
```typescript
/**
 * Create a new resource
 * 
 * Generic function to create any resource.
 * 
 * @param table - Table name
 * @param data - Data to insert (InsertType)
 * @returns Created resource
 */
async function create<T, I>(
  table: string,
  data: I,
  correlationId: string,
  userId?: string
): Promise<T> {
  const { data: created, error } = await supabase
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error || !created) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    userId || 'system',
    'create',
    table,
    created.id
  );

  return created as T;
}
```

**Update:**
```typescript
/**
 * Update an existing resource
 * 
 * Generic function to update any resource.
 * 
 * @param table - Table name
 * @param id - Resource ID
 * @param data - Update data (UpdateType)
 * @returns Updated resource
 */
async function update<T, U>(
  table: string,
  id: string,
  data: U,
  correlationId: string,
  userId?: string
): Promise<T> {
  const { data: updated, error } = await supabase
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Get changed fields (field names only, not values)
  const changedFields = Object.keys(data as Record<string, unknown>);

  // Audit log
  await logDataModification(
    correlationId,
    userId || 'system',
    'update',
    table,
    id,
    changedFields
  );

  return updated as T;
}
```

**Delete:**
```typescript
/**
 * Delete a resource
 * 
 * Generic function to delete any resource.
 * 
 * @param table - Table name
 * @param id - Resource ID
 */
async function deleteResource(
  table: string,
  id: string,
  correlationId: string,
  userId?: string
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    userId || 'system',
    'delete',
    table,
    id
  );
}
```

**Think of it like:**
- **Generic functions** = Standardized procedures (work for any resource)
- **Type safety** = TypeScript ensures correct types
- **Audit logging** = Automatic compliance (logs all operations)

---

## 🎓 Topic 5: Error Handling with AppError

### What is AppError?

**AppError** is a base error class that all custom errors extend.

**Think of it like:**
- **Error Categories** = Different types of medical errors (validation, not found, etc.)
- **Error Codes** = HTTP status codes (400, 404, 500, etc.)
- **Error Types** = Specific error classes (ValidationError, NotFoundError, etc.)

### AppError Classes

**Available Error Classes:**
- `ValidationError` (400) - Invalid request data
- `UnauthorizedError` (401) - Authentication required
- `ForbiddenError` (403) - No permission
- `NotFoundError` (404) - Resource not found
- `ConflictError` (409) - Resource conflict
- `InternalError` (500) - Server error

**Example:**
```typescript
// ❌ WRONG - Return error object
function getAppointment(id: string) {
  const appointment = await findById('appointments', id);
  if (!appointment) {
    return { error: 'Not found' };  // ❌ Never return {error}
  }
  return appointment;
}

// ✅ CORRECT - Throw AppError
function getAppointment(id: string): Promise<Appointment> {
  const appointment = await findById('appointments', id);
  if (!appointment) {
    throw new NotFoundError('Appointment not found');  // ✅ Throw typed error
  }
  return appointment;
}
```

**Think of it like:**
- **Throw errors** = Raise alarm (system knows something went wrong)
- **Return errors** = Hide problem (system doesn't know there's an issue)

### Error Handling Pattern

**Services throw errors:**
```typescript
// Service throws AppError
export async function createAppointment(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // Validate business rules
  if (data.appointment_date < new Date()) {
    throw new ValidationError('Cannot book past dates');
  }

  // Check ownership
  validateOwnership(data.doctor_id, userId);

  // Create appointment
  const appointment = await create('appointments', data, correlationId, userId);

  return appointment;
}
```

**Controllers use asyncHandler:**
```typescript
// Controller uses asyncHandler (catches errors automatically)
export const createAppointmentController = asyncHandler(async (req, res) => {
  const validated = createAppointmentSchema.parse(req.body);
  const appointment = await createAppointment(
    validated,
    req.correlationId,
    req.user.id
  );
  return res.status(201).json(successResponse(appointment, req));
});
```

**Think of it like:**
- **Service throws** = Raises error (service knows something wrong)
- **asyncHandler catches** = Error middleware handles it (automatic error handling)
- **Error middleware** = Formats error response (consistent error format)

---

## 🎓 Topic 6: Service Role vs User Role

### What's the Difference?

**User Role (anon key):**
- Respects RLS policies
- Can only access own data
- Used for normal operations

**Service Role (service role key):**
- Bypasses RLS policies
- Can access all data
- Used only for system operations

**Think of it like:**
- **User role** = Regular staff access (follows security rules)
- **Service role** = Admin access (bypasses security, use carefully)

### When to Use Service Role

**MUST use service role for:**
- Audit log insertion (system operation)
- Webhook processing (no user context)
- Background jobs (system operations)
- Admin operations (when explicitly required)

**MUST NOT use service role for:**
- User-initiated requests (use user context)
- Bypassing RLS "for convenience"
- Normal database operations

**Example:**
```typescript
// ✅ CORRECT - Service role for audit logging
import { getSupabaseAdminClient } from '../config/database';

const supabaseAdmin = getSupabaseAdminClient();
if (!supabaseAdmin) {
  throw new InternalError('Service role client not available');
}

await supabaseAdmin
  .from('audit_logs')
  .insert({
    correlation_id: correlationId,
    user_id: userId,
    action: 'create_appointment',
    // ...
  });

// ❌ WRONG - Service role to bypass user permissions
await supabaseAdmin
  .from('appointments')
  .select('*');  // Bypasses RLS - WRONG!
```

**Think of it like:**
- **Service role for audit logs** = System logging (no user context)
- **User role for appointments** = User operations (respects permissions)

---

## 🎓 Topic 7: Framework-Agnostic Services

### What Does Framework-Agnostic Mean?

**Framework-agnostic** means services don't depend on Express or any specific framework.

**Think of it like:**
- **Universal Tools** = Work with any system (not tied to one framework)
- **Portable Code** = Can be used anywhere (reusable)
- **Clean Separation** = Business logic separate from HTTP handling

### Why Framework-Agnostic?

**Benefits:**
- Can switch frameworks (Express → Fastify, etc.)
- Can use services in CLI tools
- Can test services without HTTP
- Better separation of concerns

**Example:**
```typescript
// ❌ WRONG - Service depends on Express
import { Request } from 'express';

export async function createAppointment(req: Request) {
  // Service tied to Express - WRONG
}

// ✅ CORRECT - Service is framework-agnostic
export async function createAppointment(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // Service works with any framework - CORRECT
}
```

**Think of it like:**
- **Framework-specific** = Tied to one system (can't reuse)
- **Framework-agnostic** = Works anywhere (reusable)

---

## 🎓 Topic 8: Complete Service Function Example

### Full Service Function with All Helpers

**Complete appointment service:**
```typescript
import { supabase } from '../config/database';
import { getSupabaseAdminClient } from '../config/database';
import { Appointment, InsertAppointment } from '../types';
import { logDataModification, logDataAccess } from '../utils/audit-logger';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { NotFoundError, ValidationError } from '../utils/errors';

/**
 * Create a new appointment
 * 
 * @param data - Appointment data to insert
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @returns Created appointment
 * @throws ValidationError if data is invalid
 * @throws ForbiddenError if ownership doesn't match
 */
export async function createAppointment(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // 1. Validate ownership (defense in depth)
  validateOwnership(data.doctor_id, userId);

  // 2. Validate business rules
  if (data.appointment_date < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  // 3. Create appointment (user role - respects RLS)
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  // 4. Audit log (service role - system operation)
  await logDataModification(
    correlationId,
    userId,
    'create',
    'appointment',
    appointment.id
  );

  return appointment;
}

/**
 * Get appointment by ID
 * 
 * @param id - Appointment ID
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @returns Appointment or throws NotFoundError
 */
export async function getAppointment(
  id: string,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // 1. Find appointment (user role - RLS ensures user can only see own)
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  // 2. Validate ownership (defense in depth)
  validateOwnership(appointment.doctor_id, userId);

  // 3. Audit log (read access)
  await logDataAccess(
    correlationId,
    userId,
    'appointment',
    id
  );

  return appointment;
}

/**
 * Update appointment status
 * 
 * @param id - Appointment ID
 * @param status - New status
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @returns Updated appointment
 */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // 1. Get existing appointment (to validate ownership)
  const existing = await getAppointment(id, correlationId, userId);

  // 2. Update status (user role - RLS ensures user can only update own)
  const { data: updated, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // 3. Audit log (changed fields: status)
  await logDataModification(
    correlationId,
    userId,
    'update',
    'appointment',
    id,
    ['status']  // Field names only, not values
  );

  return updated;
}
```

**Think of it like:**
- **Complete service** = Full medical procedure (validation, operation, documentation)
- **All helpers** = Using all tools (error handling, audit logging, validation)

---

## 🎓 Topic 9: Table-Specific Service Functions

### Why Table-Specific Functions?

**Generic functions** are good, but **table-specific functions** provide:
- Type safety (specific types)
- Business logic (table-specific rules)
- Convenience (easier to use)

**Think of it like:**
- **Generic functions** = General tools (work for everything)
- **Table-specific functions** = Specialized tools (optimized for specific tasks)

### Patient Service Functions

**Find patient by phone:**
```typescript
/**
 * Find patient by phone number
 * 
 * Used to look up existing patients before creating new ones.
 * 
 * @param phone - Patient phone number
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByPhone(
  phone: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error) {
    // Not found is OK (return null)
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Patient;
}
```

**Create patient:**
```typescript
/**
 * Create a new patient
 * 
 * Creates patient record. Used when processing webhooks.
 * 
 * @param data - Patient data to insert
 * @param correlationId - Request correlation ID
 * @returns Created patient
 */
export async function createPatient(
  data: InsertPatient,
  correlationId: string
): Promise<Patient> {
  // Check if patient already exists
  const existing = await findPatientByPhone(data.phone, correlationId);
  if (existing) {
    throw new ConflictError('Patient with this phone number already exists');
  }

  // Create patient (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(data)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    undefined,  // System operation (no user)
    'create',
    'patient',
    patient.id
  );

  return patient;
}
```

**Think of it like:**
- **Table-specific functions** = Specialized procedures (optimized for each table)
- **Business logic** = Table-specific rules (check if patient exists, etc.)

### Conversation Service Functions

**Find conversation by platform ID:**
```typescript
/**
 * Find conversation by platform conversation ID
 * 
 * Used to look up existing conversations when processing webhooks.
 * 
 * @param doctorId - Doctor ID
 * @param platform - Platform name
 * @param platformConversationId - Platform-specific conversation ID
 * @param correlationId - Request correlation ID
 * @returns Conversation or null if not found
 */
export async function findConversationByPlatformId(
  doctorId: string,
  platform: ConversationPlatform,
  platformConversationId: string,
  correlationId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('platform', platform)
    .eq('platform_conversation_id', platformConversationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Conversation;
}
```

**Create conversation:**
```typescript
/**
 * Create a new conversation
 * 
 * Creates conversation record when processing webhooks.
 * 
 * @param data - Conversation data to insert
 * @param correlationId - Request correlation ID
 * @returns Created conversation
 */
export async function createConversation(
  data: InsertConversation,
  correlationId: string
): Promise<Conversation> {
  // Check if conversation already exists
  const existing = await findConversationByPlatformId(
    data.doctor_id,
    data.platform,
    data.platform_conversation_id,
    correlationId
  );

  if (existing) {
    return existing;  // Return existing instead of creating duplicate
  }

  // Create conversation (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .insert(data)
    .select()
    .single();

  if (error || !conversation) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    undefined,  // System operation
    'create',
    'conversation',
    conversation.id
  );

  return conversation;
}
```

**Think of it like:**
- **Find functions** = Lookup procedures (find existing records)
- **Create functions** = Creation procedures (with validation and audit logging)

---

## 🎓 Topic 10: Transactions and Multi-Step Operations

### What are Transactions?

**Transactions** ensure multiple database operations either all succeed or all fail.

**Think of it like:**
- **All-or-Nothing** = Either all operations succeed, or none do
- **Atomic Operations** = Can't have partial success
- **Rollback** = Undo all changes if something fails

### Supabase Transaction Limitation

**Important:** Supabase doesn't support traditional SQL transactions via the client.

**Instead, use:**
- **Postgres RPC functions** - For complex multi-step operations
- **Compensating logic** - Undo operations if later steps fail

**Example with Compensating Logic:**
```typescript
/**
 * Create appointment with audit log
 * 
 * Uses compensating logic since Supabase doesn't support transactions.
 * If audit log fails, delete the appointment.
 */
export async function createAppointmentWithAudit(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // Step 1: Create appointment
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();

  if (appointmentError || !appointment) {
    handleSupabaseError(appointmentError, correlationId);
  }

  // Step 2: Create audit log
  try {
    await logDataModification(
      correlationId,
      userId,
      'create',
      'appointment',
      appointment.id
    );
  } catch (error) {
    // Compensating logic: Delete appointment if audit log fails
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointment.id);
    
    throw new InternalError('Failed to create audit log');
  }

  return appointment;
}
```

**Think of it like:**
- **Compensating logic** = Undo operation if later step fails (like canceling a procedure if documentation fails)
- **All-or-nothing** = Either everything succeeds, or nothing changes

### When to Use Postgres RPC

**Use Postgres RPC functions for:**
- Complex multi-step operations
- Operations that need true transactions
- Operations that need database-level guarantees

**Example:**
```sql
-- Postgres function (runs in single transaction)
CREATE OR REPLACE FUNCTION create_appointment_with_audit(
  p_doctor_id UUID,
  p_patient_name TEXT,
  p_appointment_date TIMESTAMPTZ,
  p_correlation_id TEXT,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  -- Insert appointment
  INSERT INTO appointments (doctor_id, patient_name, appointment_date)
  VALUES (p_doctor_id, p_patient_name, p_appointment_date)
  RETURNING id INTO v_appointment_id;

  -- Insert audit log
  INSERT INTO audit_logs (correlation_id, user_id, action, resource_type, resource_id, status)
  VALUES (p_correlation_id, p_user_id, 'create_appointment', 'appointment', v_appointment_id, 'success');

  RETURN v_appointment_id;
END;
$$ LANGUAGE plpgsql;
```

**Think of it like:**
- **Postgres RPC** = Database-level procedure (guaranteed transaction)
- **Compensating logic** = Application-level undo (manual rollback)

---

## 🎓 Topic 11: PHI Redaction Before External Calls

### Why Redact PHI?

**Before sending data to external services (AI, APIs):**
- **MUST** redact PHI
- **MUST** only send necessary data
- **MUST** log that redaction was applied

**Think of it like:**
- **Redaction** = Blacking out sensitive information (like redacting medical records)
- **External calls** = Sending data outside system (must remove PHI first)

### Redaction Example

**Before sending to AI:**
```typescript
import { redactPHI } from '../utils/db-helpers';

/**
 * Send message to AI for processing
 * 
 * Redacts PHI before sending to external AI service.
 */
export async function processMessageWithAI(
  message: Message,
  correlationId: string,
  userId: string
): Promise<string> {
  // Redact PHI from message content
  const redactedContent = redactPHI(message.content);

  // Send to AI (no PHI)
  const aiResponse = await openai.chat.completions.create({
    messages: [
      { role: 'user', content: redactedContent }
    ]
  });

  // Audit log (note that redaction was applied)
  await logAIIntraction(
    correlationId,
    userId,
    message.conversation_id,
    'gpt-4',
    aiResponse.usage?.total_tokens || 0,
    true  // redactionApplied = true
  );

  return aiResponse.choices[0].message.content || '';
}
```

**Think of it like:**
- **Redaction** = Removing patient names, phones before sending
- **Audit log** = Documenting that redaction was applied

---

## 🎓 Topic 12: Complete Example - Full Service

### Complete Appointment Service

**Full service with all patterns:**
```typescript
import { supabase } from '../config/database';
import { getSupabaseAdminClient } from '../config/database';
import { Appointment, InsertAppointment, UpdateAppointment, AppointmentStatus } from '../types';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';

/**
 * Create a new appointment
 */
export async function createAppointment(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // 1. Validate ownership
  validateOwnership(data.doctor_id, userId);

  // 2. Validate business rules
  if (data.appointment_date < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  // 3. Create appointment
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  // 4. Audit log
  await logDataModification(
    correlationId,
    userId,
    'create',
    'appointment',
    appointment.id
  );

  return appointment;
}

/**
 * Get appointment by ID
 */
export async function getAppointment(
  id: string,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  validateOwnership(appointment.doctor_id, userId);

  await logDataAccess(correlationId, userId, 'appointment', id);

  return appointment;
}

/**
 * Get all appointments for a doctor
 */
export async function getDoctorAppointments(
  doctorId: string,
  correlationId: string,
  userId: string,
  filters?: { status?: AppointmentStatus; startDate?: Date; endDate?: Date }
): Promise<Appointment[]> {
  // Validate ownership
  validateOwnership(doctorId, userId);

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('doctor_id', doctorId);

  // Apply filters
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.startDate) {
    query = query.gte('appointment_date', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query = query.lte('appointment_date', filters.endDate.toISOString());
  }

  const { data: appointments, error } = await query.order('appointment_date', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, userId, 'appointment', undefined);

  return (appointments || []) as Appointment[];
}

/**
 * Update appointment status
 */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // Get existing appointment (validates ownership)
  const existing = await getAppointment(id, correlationId, userId);

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    userId,
    'update',
    'appointment',
    id,
    ['status']
  );

  return updated;
}
```

**Think of it like:**
- **Complete service** = Full medical procedure (all steps included)
- **All patterns** = Using all best practices (validation, audit, error handling)

---

## 🎓 Topic 13: Best Practices

### 1. Always Use Service Role for Audit Logs

**Rule:** Audit log insertion MUST use service role client.

**Why:**
- Audit logs are system operations (not user operations)
- Service role bypasses RLS (needed for insertion)
- Prevents users from creating fake audit logs

**Example:**
```typescript
// ✅ CORRECT - Service role for audit logs
const supabaseAdmin = getSupabaseAdminClient();
await supabaseAdmin.from('audit_logs').insert({ ... });

// ❌ WRONG - User role for audit logs
await supabase.from('audit_logs').insert({ ... });  // Will fail (RLS blocks)
```

### 2. Always Include Correlation ID

**Rule:** All audit logs MUST include correlation ID.

**Why:**
- Links audit logs to specific requests
- Enables request tracing
- Required for compliance

**Example:**
```typescript
// ✅ CORRECT - Includes correlation ID
await logAuditEvent({
  correlationId: req.correlationId,  // From middleware
  userId: req.user.id,
  action: 'create_appointment',
  // ...
});

// ❌ WRONG - Missing correlation ID
await logAuditEvent({
  userId: req.user.id,
  action: 'create_appointment',
  // Missing correlationId
});
```

### 3. Never Log PHI

**Rule:** Audit logs MUST NOT contain PHI.

**Why:**
- Compliance requirement (HIPAA)
- Security best practice
- Reduces breach impact

**Example:**
```typescript
// ❌ WRONG - PHI in metadata
await logAuditEvent({
  metadata: {
    patientName: 'John Doe',  // ❌ PHI - NEVER
    patientPhone: '+1234567890'  // ❌ PHI - NEVER
  }
});

// ✅ CORRECT - Only IDs and metadata
await logAuditEvent({
  resourceId: 'appointment-uuid-123',  // ✅ Only ID
  metadata: {
    changedFields: ['status']  // ✅ Field names only
  }
});
```

### 4. Always Throw AppError

**Rule:** Services MUST throw AppError (never return {error}).

**Why:**
- Consistent error handling
- Type safety
- Error middleware can handle it

**Example:**
```typescript
// ❌ WRONG - Return error object
function getAppointment(id: string) {
  if (!appointment) {
    return { error: 'Not found' };  // ❌ Never return {error}
  }
  return appointment;
}

// ✅ CORRECT - Throw AppError
function getAppointment(id: string): Promise<Appointment> {
  if (!appointment) {
    throw new NotFoundError('Appointment not found');  // ✅ Throw typed error
  }
  return appointment;
}
```

### 5. Always Validate Ownership

**Rule:** Services MUST validate ownership (defense in depth).

**Why:**
- RLS enforces at database level
- Application validation adds extra layer
- Prevents bugs from exposing data

**Example:**
```typescript
// ✅ CORRECT - Validate ownership
export async function getAppointment(id: string, userId: string) {
  const appointment = await findById('appointments', id);
  validateOwnership(appointment.doctor_id, userId);  // ✅ Defense in depth
  return appointment;
}
```

---

## ✅ Checklist: Understanding Database Helpers

Before moving to implementation, make sure you understand:

- [ ] ✅ What service helpers are and why we need them
- [ ] ✅ How audit logging works and why it's critical
- [ ] ✅ How to create audit logs (service role, no PHI)
- [ ] ✅ How to handle Supabase errors (map to AppError)
- [ ] ✅ How to validate ownership (defense in depth)
- [ ] ✅ How to sanitize data for logging (remove PHI)
- [ ] ✅ How to redact PHI before external calls
- [ ] ✅ Service layer patterns (framework-agnostic, throw errors)
- [ ] ✅ When to use service role vs user role
- [ ] ✅ How to create CRUD service functions
- [ ] ✅ How to handle transactions (compensating logic)
- [ ] ✅ How to create table-specific service functions

---

## 🎯 Summary

**Database Service Helpers & Utilities** provide:
- **Audit Logging** - Record all system actions for compliance
- **Error Handling** - Consistent error mapping and handling
- **Data Safety** - PHI redaction and sanitization
- **Reusable Functions** - CRUD operations and helpers
- **Type Safety** - TypeScript types for all operations

**Key Concepts:**
- **Audit Logger** - Records who did what, when (service role, no PHI)
- **Database Helpers** - Error handling, validation, data transformation
- **Service Functions** - Business logic and database operations
- **AppError** - Typed errors (throw, never return {error})
- **Service Role** - System operations (audit logs, webhooks)
- **Framework-Agnostic** - Services work with any framework

**Think of it like:**
- **Service Helpers** = Standardized hospital toolkit (everyone uses same tools)
- **Audit Logging** = Medical record system (tracks all actions)
- **Error Handling** = Quality control (catches problems early)
- **PHI Redaction** = Privacy protection (removes sensitive data)

---

**Ready to create database service helpers and utilities!** 🎉

**Next Steps:**
1. Create `backend/src/utils/audit-logger.ts`
2. Create `backend/src/utils/db-helpers.ts`
3. Create `backend/src/services/database-service.ts`
4. Create table-specific service functions
5. Test and verify all helpers work correctly

---

**Last Updated:** 2026-01-20
