# Coding Workflow & Rules
## AI Agent Pre-Flight Checklist & Structured Coding Process

---

## ⚠️ DO NOT Violate Response Contracts

**AI Agents MUST NOT:**
- ❌ Return `{ data: ... }` manually - **MUST** use `successResponse(data, req)` helper
- ❌ Return `{ error, message, stack }` - **MUST** use error middleware (canonical format)
- ❌ Invent error fields like `error.details`, `error.errors` - **MUST** follow STANDARDS.md contract
- ❌ Skip `meta` object with `timestamp` and `requestId` - **MUST** include in all responses

**ALWAYS:**
- ✅ Use `res.status(XXX).json(successResponse(data, req))` for success responses (canonical signature: `successResponse(data, req, meta?)` returns object)
- ✅ Throw typed errors (error middleware formats automatically)
- ✅ Follow canonical contract: `{ success: true, data: {...}, meta: {...} }`

**See:** [STANDARDS.md](./STANDARDS.md) "Canonical Contracts" section for exact format.

---

## 🎯 Purpose

This file ensures consistent, high-quality code by following a structured workflow before writing any code. **Always reference this file before implementing features.**

**Use Case:** Before writing code in agent mode, review this file to ensure all steps are followed.

---

## ⚠️ Source of Truth Hierarchy

1. **STANDARDS.md** - MUST/SHOULD rules (overrides everything)
2. **ARCHITECTURE.md** - Project structure and layer boundaries
3. **RECIPES.md** - Copy-pastable patterns
4. **COMPLIANCE.md** - Regulatory requirements
5. **CODING_WORKFLOW.md** (this file) - Step-by-step coding process

**IMPORTANT:** If there's a conflict, STANDARDS.md wins. This file complements the standards by ensuring they're followed.

---

## 📋 Pre-Coding Checklist (MANDATORY)

**Default Change-Set Limit:** Touch ≤ 5 files per change-set. If more, STOP and ask user for approval.

Before writing ANY code, complete these steps:

### Step 1: Understand the Task
- [ ] Read the task file completely
- [ ] Identify what needs to be implemented
- [ ] Check if there are dependencies or prerequisites
- [ ] Verify the task aligns with project goals
- [ ] Check task file for any specific requirements or constraints

### Step 2: Analyze Existing Codebase
- [ ] Search for similar features/patterns in the codebase
- [ ] Identify which files will be affected
- [ ] Check for existing utilities/functions that can be reused
- [ ] Review related reference documentation (STANDARDS.md, ARCHITECTURE.md, RECIPES.md)
- [ ] Check existing controllers/services for similar functionality
- [ ] Review error handling patterns already in use

### Step 3: Identify Patterns to Follow
- [ ] Find similar controller/service/middleware patterns
- [ ] Identify naming conventions used (kebab-case, PascalCase, etc.)
- [ ] Check error handling patterns (asyncHandler usage)
- [ ] Review validation patterns (Zod schemas location and structure)
- [ ] Check response format patterns (standardized responses)
- [ ] Review middleware order and mounting patterns
- [ ] Check route organization and versioning

### Step 4: Plan Implementation
- [ ] List files to create/modify
- [ ] Identify layer boundaries (routes → controllers → services)
- [ ] Plan input validation approach (Zod schemas, what to validate)
- [ ] Plan error handling (which errors to throw, error types)
- [ ] Plan response format (use standardized response helpers)
- [ ] Plan testing approach (what needs to be tested)
- [ ] Check for missing dependencies (need to install packages?)

---

## 🏗️ Code Writing Process (STEP-BY-STEP)

### Phase 1: Setup & Structure

1. **Create/Update Files in Order:**
   ```
   types/ → config/ → utils/ → services/ → controllers/ → routes/ → index.ts
   ```
   - Types first (if new types needed)
   - Config updates (if new env vars needed)
   - Utilities (if new helper functions needed)
   - Services (business logic, framework-agnostic)
   - Controllers (HTTP handlers, use services)
   - Routes (mount controllers)
   - Update index.ts (mount routes)

2. **Follow Layer Boundaries (MUST):**
   - Routes → only import controllers
   - Controllers → can import services, utils, types
   - Services → can import utils, types, config
   - Utils → can import types only
   - Types → cannot import anything
   - **NEVER** import Express in services
   - **NEVER** import services in routes

3. **Naming Conventions:**
   - Files: `kebab-case.ts` (e.g., `appointment-controller.ts`)
   - Functions: `camelCase` (e.g., `createAppointment`)
   - Classes: `PascalCase` (e.g., `ValidationError`)
   - Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
   - Types/Interfaces: `PascalCase` (e.g., `AppointmentData`)

### Phase 2: Implementation

4. **Input Validation (MUST):**
   - Create Zod schema: **If schema used by 2+ controllers → put in `validation/` directory. Otherwise keep in controller file.**
   - Validate `req.body`, `req.query`, `req.params` BEFORE processing
   - Use `schema.parse()` - errors automatically handled by error middleware
   - Never trust external input - validate everything
   - Use descriptive error messages in schema

   ```typescript
   // ✅ GOOD - Zod validation pattern
   const createSchema = z.object({
     patientName: z.string().min(1, 'Patient name is required'),
     phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
   });
   
   const validated = createSchema.parse(req.body);
   ```

5. **Error Handling (MUST):**
   - Use `asyncHandler` wrapper for ALL async controllers
   - Throw typed errors: `ValidationError`, `NotFoundError`, `UnauthorizedError`, etc.
   - Never use `try-catch` in controllers (asyncHandler handles it)
   - Errors MUST extend `AppError` (never raw `Error`)
   - Use appropriate error types for different scenarios (see STANDARDS.md)

   ```typescript
   // ✅ GOOD - asyncHandler pattern
   export const myController = asyncHandler(async (req: Request, res: Response) => {
     // No try-catch needed
     if (!resource) {
       throw new NotFoundError('Resource not found');
     }
   });
   ```

6. **Response Format (MUST):**
   - Use `successResponse()` helper for success responses
   - Use `errorResponse()` helper for error responses (if needed in controllers)
   - Include `meta` object with `timestamp` and `requestId`
   - Use standardized format: `{ success: true, data: {...}, meta: {...} }`
   - Set appropriate status codes (200, 201, etc.)

   ```typescript
   // ✅ GOOD - Standardized response
   return res.status(201).json(successResponse({ id: 1, name: 'Test' }, req));
   ```

7. **Business Logic:**
   - Put business logic in `services/` (not controllers)
   - Services MUST be framework-agnostic (no Express imports)
   - Services receive/return plain objects (no `Request`/`Response`)
   - Services handle database operations
   - Services throw typed errors (AppError subclasses)

   ```typescript
   // ✅ GOOD - Framework-agnostic service
   export async function createAppointment(data: AppointmentData): Promise<Appointment> {
     // Business logic only - no HTTP knowledge
     const result = await supabase.from('appointments').insert(data);
     return result;
   }
   ```

8. **Database Access:**
   - Services import Supabase client from `config/database.ts`
   - Never import database client in controllers
   - Always handle database errors and map to `InternalError`
   - Check for null/undefined results and throw `NotFoundError` if appropriate

### Phase 3: Integration

9. **Route Setup:**
   - Create route file in `routes/`
   - Mount controller functions
   - Add authentication middleware if needed (before controller)
   - Add route-specific middleware if needed
   - Export router as default
   - Document route with JSDoc comments

   ```typescript
   // ✅ GOOD - Route pattern
   /**
    * Create appointment
    * POST /appointments
    */
   router.post(
     '/appointments',
     authenticateToken,
     createAppointmentController
   );
   ```

10. **Mount Routes:**
    - Import route in `routes/index.ts`
    - Mount at appropriate path
    - Follow API versioning pattern (`/api/v1/...`)
    - Update routes/index.ts aggregation

11. **Middleware Order (CRITICAL - MUST FOLLOW):**
    ```
    1. dotenv.config()
    2. Type setup import (if needed)
    3. express.json() / express.urlencoded()
    4. sanitizeInput (after body parsing)
    5. compression
    6. helmet (security headers)
    7. cors
    8. trust proxy (if needed - **Enable only when behind reverse proxy (Render/NGINX/Cloudflare) so `req.ip` is correct**)
    9. correlationId
    10. requestTiming
    11. requestLogger
    12. requestTimeout
    13. rateLimit
    14. routes
    15. 404 handler
    16. errorMiddleware (LAST - must be last)
    ```

---

## ✅ Post-Coding Checklist

After writing code, verify:

### Code Quality
- [ ] Type-check passes: `npm run type-check` (no errors)
- [ ] Linting passes: `npm run lint` (only pre-existing warnings acceptable)
- [ ] Formatting applied: `npm run format`
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] No new linting warnings introduced

### Standards Compliance
- [ ] All inputs validated with Zod (req.body, req.query, req.params)
- [ ] All async handlers use `asyncHandler` wrapper
- [ ] All errors extend `AppError` (no raw Error throws)
- [ ] Response format standardized (using successResponse/errorResponse)
- [ ] Layer boundaries respected (no cross-layer violations)
- [ ] Services framework-agnostic (no Express imports)
- [ ] Environment variables accessed through `env.ts` only
- [ ] No raw `process.env` access (except in env.ts)

### Testing
- [ ] Manual testing completed
- [ ] All endpoints return expected format
- [ ] Success cases work correctly
- [ ] Error cases handled correctly (validation errors, not found, etc.)
- [ ] Edge cases considered (null, undefined, empty strings, etc.)
- [ ] Database errors handled (connection issues, query failures)
- [ ] Response headers verified (X-Correlation-ID, etc.)

### Documentation
- [ ] JSDoc comments on exported functions (description, parameters, return)
- [ ] Task file updated with completion status
- [ ] Issues encountered documented in task file
- [ ] Any new patterns documented (if applicable)
- [ ] Code comments added where logic is complex

---

## 🤖 AI Pre-Commit Checklist (MANDATORY)

**If you are an AI coding assistant, you MUST verify these before generating any code:**

### Pre-Generation Verification
- [ ] Zod validation schema exists or is created
- [ ] Error types are AppError subclasses (not raw Error)
- [ ] No raw `process.env` access (only through `config/env.ts`)
- [ ] No PII logging (no patient names, phones, DOBs in logs)
- [ ] Service does not import Express (Request/Response/NextFunction)
- [ ] Controller uses `asyncHandler` wrapper (not try-catch)
- [ ] Response format uses `successResponse` helper
- [ ] Layer boundaries respected (controller → service → database)
- [ ] Middleware order correct (see STANDARDS.md; ARCHITECTURE.md explains why)
- [ ] Error response format matches canonical shape (no extra fields)

### Pattern Verification
- [ ] Recipe from RECIPES.md used (if applicable)
- [ ] Recipe followed exactly (not modified)
- [ ] Naming conventions match existing code (kebab-case for files)
- [ ] No new patterns invented (existing patterns used)

### Compliance Verification
- [ ] No compliance violations (see COMPLIANCE.md)
- [ ] No PII in logs or error messages
- [ ] Authentication/authorization checks in place (if needed)
- [ ] Audit logging enabled (if required)

**If any item is unchecked, STOP and fix it before proceeding.**

---

## 🔍 Pattern Matching Rules

### Before Writing Code, Check:

1. **Similar Feature Exists?**
   - Search codebase for similar functionality
   - Find similar controller/service pattern
   - Copy structure and adapt
   - Maintain consistency with existing code

2. **Validation Pattern:**
   ```typescript
   // ✅ FOLLOW THIS PATTERN
   import { z } from 'zod';
   
   const createSchema = z.object({
     field: z.string().min(1, 'Field is required'),
     email: z.string().email('Invalid email'),
   });
   
   export const createController = asyncHandler(async (req: Request, res: Response) => {
     const validated = createSchema.parse(req.body);
     // Use validated data
   });
   ```

3. **Controller Pattern:**
   ```typescript
   // ✅ FOLLOW THIS PATTERN
   import { Request, Response } from 'express';
   import { asyncHandler } from '../utils/async-handler';
   import { successResponse } from '../utils/response';
   import { z } from 'zod';
   import { myService } from '../services/my-service';
   
   const schema = z.object({ ... });
   
   /**
    * Description of what controller does
    * HTTP_METHOD /path
    */
   export const myController = asyncHandler(async (req: Request, res: Response) => {
     const validated = schema.parse(req.body);
     const result = await myService(validated);
     return res.status(201).json(successResponse(result, req));
   });
   ```

4. **Service Pattern:**
   ```typescript
   // ✅ FOLLOW THIS PATTERN (framework-agnostic)
   import { AppointmentData, Appointment } from '../types';
   import { supabase } from '../config/database';
   import { NotFoundError, InternalError } from '../utils/errors';
   
   /**
    * Description of what service does
    */
   export async function myService(data: AppointmentData): Promise<Appointment> {
     // Business logic only - no HTTP knowledge
     const { data: result, error } = await supabase
       .from('appointments')
       .insert(data)
       .select()
       .single();
     
     if (error) {
       throw new InternalError(`Database error: ${error.message}`);
     }
     
     if (!result) {
       throw new NotFoundError('Appointment not created');
     }
     
     return result;
   }
   ```

5. **Error Pattern:**
   ```typescript
   // ✅ FOLLOW THIS PATTERN
   import { NotFoundError, ValidationError, UnauthorizedError } from '../utils/errors';
   
   if (!found) {
     throw new NotFoundError('Resource not found');
   }
   
   if (!authorized) {
     throw new UnauthorizedError('Not authorized');
   }
   ```

6. **Route Pattern:**
   ```typescript
   // ✅ FOLLOW THIS PATTERN
   import { Router } from 'express';
   import { createController, getController } from '../controllers/my-controller';
   import { authenticateToken } from '../middleware/auth';
   
   const router = Router();
   
   /**
    * Create resource
    * POST /resources
    */
   router.post('/resources', authenticateToken, createController);
   
   /**
    * Get resource by ID
    * GET /resources/:id
    */
   router.get('/resources/:id', authenticateToken, getController);
   
   export default router;
   ```

---

## 🚫 Common Pitfalls to Avoid

### ❌ NEVER:
1. **Import Express in services** - Services must be framework-agnostic
2. **Use raw `process.env`** - Always use `env.ts` config (except in env.ts itself)
3. **Use `try-catch` in controllers** - Use `asyncHandler` instead
4. **Return raw errors** - Always throw typed `AppError` subclasses
5. **Skip input validation** - ALWAYS validate with Zod before processing
6. **Write business logic in controllers** - Put in services
7. **Access database in controllers** - Only in services
8. **Reassign `req.query` or `req.params`** - They're read-only in Express (sanitize in place)
9. **Ignore layer boundaries** - Follow ARCHITECTURE.md strictly
10. **Create new patterns without checking existing** - Always match existing code style
11. **Forget to update routes/index.ts** - Always mount new routes
12. **Mount middleware in wrong order** - Follow middleware order strictly
13. **Use `any` type** - Always use proper TypeScript types
14. **Forget error handling** - All errors must go through error middleware
15. **Hardcode values** - Use constants or configuration

### ✅ ALWAYS:
1. **Check existing patterns first** - Search codebase before writing
2. **Follow naming conventions** - Match existing code style exactly
3. **Use existing utilities** - Don't duplicate code
4. **Validate all inputs** - Never trust external data
5. **Handle errors properly** - Use typed errors, asyncHandler
6. **Test after changes** - Run type-check, lint, manual tests
7. **Update task file** - Mark completed items with dates
8. **Document issues** - Note problems and solutions in task file
9. **Follow layer boundaries** - Respect ARCHITECTURE.md rules
10. **Use standardized responses** - Always use successResponse/errorResponse
11. **Check middleware order** - Verify against STANDARDS.md (ARCHITECTURE.md explains why)
12. **Run type-check before committing** - Ensure no TypeScript errors
13. **Review similar code** - Check how similar features are implemented
14. **Document complex logic** - Add comments where needed
15. **Verify dependencies** - Check if packages are installed

---

## 🔄 Iterative Refinement Process

### When Code Doesn't Work:

1. **Check Error Message:**
   - TypeScript error? → Check types, imports, type definitions
   - Runtime error? → Check middleware order, dependencies, server logs
   - Logic error? → Review business logic, test cases, edge cases
   - Import error? → Check file paths, exports, circular dependencies

2. **Verify Standards:**
   - Re-read relevant section in STANDARDS.md
   - Check ARCHITECTURE.md for layer violations
   - Review RECIPES.md for pattern examples
   - Check this file for workflow steps missed

3. **Check Existing Code:**
   - Find similar working code
   - Compare structure and implementation
   - Identify differences and fix
   - Copy working patterns

4. **Test Incrementally:**
   - Test one piece at a time
   - Verify each layer works independently
   - Add logging for debugging (logger.info/debug)
   - Use console.log temporarily if needed (remove before commit)

5. **Common Issues & Fixes:**
   - **"Cannot find module"** → Check package.json, run `npm install`
   - **"Property does not exist on type"** → Check type definitions, add to types/express.ts if needed
   - **"Type error"** → Review types, check Zod schemas match types
   - **"Middleware not working"** → Check middleware order, verify mounting
   - **"Error not caught"** → Verify asyncHandler is used, check error middleware is last

---

## 📚 Quick Reference

### File Creation Order:
```
1. types/index.ts (if new types needed)
2. config/env.ts (if new env vars needed - add to Zod schema)
3. utils/*.ts (if new utilities needed)
4. services/*.ts (business logic - framework-agnostic)
5. controllers/*.ts (HTTP handlers - use services)
6. routes/*.ts (route definitions - mount controllers)
7. Update routes/index.ts (mount new routes)
8. Test everything
```

### Import Pattern:
```typescript
// 1. Type setup (if needed - for Express type extensions)
import '../types/setup';

// 2. External dependencies
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// 3. Internal utilities
import { asyncHandler } from '../utils/async-handler';
import { ValidationError, NotFoundError } from '../utils/errors';
import { successResponse } from '../utils/response';

// 4. Services
import { myService } from '../services/my-service';

// 5. Types
import { MyType, MyResult } from '../types';
```

### Controller Template:
```typescript
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { myService } from '../services/my-service';
import { NotFoundError } from '../utils/errors';

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

/**
 * Create resource controller
 * POST /resources
 * 
 * Creates a new resource with validated input.
 */
export const createResource = asyncHandler(async (req: Request, res: Response) => {
  const validated = createSchema.parse(req.body);
  const result = await myService(validated);
  return successResponse(res, result, 201);
});

/**
 * Get resource by ID controller
 * GET /resources/:id
 * 
 * Retrieves a resource by its ID.
 */
export const getResource = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await myService.getById(id);
  
  if (!result) {
    throw new NotFoundError('Resource not found');
  }
  
  return res.status(200).json(successResponse(result, req));
});
```

### Service Template:
```typescript
import { ResourceData, Resource } from '../types';
import { supabase } from '../config/database';
import { NotFoundError, InternalError } from '../utils/errors';

/**
 * Create a new resource
 * 
 * @param data - Resource data to create
 * @returns Created resource
 * @throws InternalError if database operation fails
 */
export async function createResource(data: ResourceData): Promise<Resource> {
  const { data: result, error } = await supabase
    .from('resources')
    .insert(data)
    .select()
    .single();
  
  if (error) {
    throw new InternalError(`Failed to create resource: ${error.message}`);
  }
  
  if (!result) {
    throw new InternalError('Resource creation returned no data');
  }
  
  return result;
}

/**
 * Get resource by ID
 * 
 * @param id - Resource ID
 * @returns Resource if found
 * @throws NotFoundError if resource not found
 */
export async function getResourceById(id: string): Promise<Resource> {
  const { data: result, error } = await supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !result) {
    throw new NotFoundError('Resource not found');
  }
  
  return result;
}
```

### Route Template:
```typescript
import { Router } from 'express';
import { 
  createResourceController,
  getResourceController,
  listResourcesController 
} from '../controllers/resource-controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Create resource
 * POST /resources
 */
router.post('/resources', authenticateToken, createResourceController);

/**
 * Get resource by ID
 * GET /resources/:id
 */
router.get('/resources/:id', authenticateToken, getResourceController);

/**
 * List resources
 * GET /resources
 */
router.get('/resources', authenticateToken, listResourcesController);

export default router;
```

---

## 🎓 Learning from Mistakes

### After Each Implementation:

1. **Review What Worked:**
   - Which patterns were helpful?
   - What made implementation smooth?
   - What shortcuts saved time?
   - What documentation was most useful?

2. **Review What Didn't:**
   - What errors occurred?
   - What caused drift from standards?
   - What patterns were misunderstood?
   - How can we prevent it next time?

3. **Update This File:**
   - Add new pitfalls discovered
   - Add new patterns found
   - Update workflow if needed
   - Document solutions to new problems

4. **Update Reference Files:**
   - Add new patterns to RECIPES.md if reusable
   - Update STANDARDS.md if new rules needed
   - Document in task file for future reference

---

## 🔗 Related Files

- [STANDARDS.md](./STANDARDS.md) - MUST/SHOULD rules (source of truth)
- [API_DESIGN.md](./API_DESIGN.md) - API design principles and conventions
- [TESTING.md](./TESTING.md) - Testing strategy and patterns
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Structure and boundaries
- [RECIPES.md](./RECIPES.md) - Copy-pastable patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - Regulatory requirements
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) - External service integration patterns

---

## 📝 Usage Instructions

**For AI Agents:**
1. **Read this file BEFORE starting any coding task**
2. **Complete Pre-Coding Checklist** - Don't skip steps
3. **Follow Code Writing Process step-by-step** - Phase by phase
4. **Complete Post-Coding Checklist** - Verify everything
5. **Reference this file when stuck or uncertain**
6. **Update task file with progress and issues**

**For Humans:**
1. Use this as a review checklist before code reviews
2. Reference before starting new features
3. Update when new patterns emerge
4. Share with team members
5. Use as onboarding material for new developers

---

## 🎯 Key Principles

1. **Consistency Over Creativity** - Match existing patterns, don't invent new ones
2. **Standards First** - Always check STANDARDS.md before making decisions
3. **Test Early** - Run type-check and lint frequently, not just at the end
4. **Incremental Development** - Build and test one piece at a time
5. **Document Issues** - Note problems and solutions for future reference
6. **Review Similar Code** - Learn from existing implementations
7. **Follow the Workflow** - Don't skip checklist steps

---

---

## ✅ PR/Change-Set Completion Checklist (MANDATORY)

**AI agents MUST verify ALL items before submitting PR/change-set:**

### Core Requirements
- [ ] **Contract respected** - All responses use canonical format (CONTRACTS.md)
- [ ] **Zod validation added** - All external inputs validated (STANDARDS.md)
- [ ] **Typed errors used** - All errors use error classes (ERROR_CATALOG.md)
- [ ] **Tests added** - Unit + integration as applicable (TESTING.md)
- [ ] **Logs have correlationId** - All logs include correlationId (OBSERVABILITY.md)
- [ ] **No PII in logs** - No PHI/PII in logs, test data, or responses (COMPLIANCE.md)

### Quality Gates
- [ ] TypeScript errors resolved
- [ ] ESLint passes (no warnings/errors)
- [ ] All tests pass
- [ ] Code formatted (Prettier)

### Documentation
- [ ] RECIPES.md updated (if new pattern added)
- [ ] STANDARDS.md updated (if rule changed)
- [ ] CONTRACTS.md updated (if contract changed - requires approval)
- [ ] DB_SCHEMA.md updated (if schema changed)

**AI Agents:** If ANY item is missing, feature is NOT ready for PR. Do not skip items "for speed."

**See:** [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md) for complete feature completion criteria.

---

**Last Updated:** 2026-01-17  
**Version:** 1.0.0  
**Status:** Active  
**Maintained By:** Development Team
