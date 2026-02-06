# Definition of Done
## Prevent Half-Finished Features

**⚠️ CRITICAL: A feature is NOT complete until ALL of these criteria are met.**

---

## 🎯 Purpose

This file defines what must exist for a feature to be considered complete.

**This file owns:**
- Required tests (unit, integration, E2E)
- Required audit logs
- Required documentation updates
- Required verification steps
- Final gatekeeper checklist

**This file MUST NOT contain:**
- Implementation details (see RECIPES.md)
- Testing patterns (see TESTING.md)
- Coding rules (see STANDARDS.md)

---

## 📋 Related Files

- [TESTING.md](./TESTING.md) - Testing strategies and patterns
- [STANDARDS.md](./STANDARDS.md) - Coding requirements
- [COMPLIANCE.md](./COMPLIANCE.md) - Audit logging requirements
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Development process

---

## ✅ Feature Completion Checklist (MANDATORY)

**AI agents MUST verify ALL items before marking feature complete:**

### 1. Code Implementation
- [ ] Code follows STANDARDS.md rules
- [ ] Uses patterns from RECIPES.md (if applicable)
- [ ] Follows ARCHITECTURE.md layer boundaries
- [ ] No violations of COMPLIANCE.md requirements
- [ ] All TypeScript errors resolved
- [ ] ESLint passes (no warnings/errors)
- [ ] Prettier formatting applied

### 2. Input Validation
- [ ] All external inputs validated with Zod
- [ ] Validation schemas defined for all endpoints
- [ ] Error messages are user-friendly
- [ ] Validation errors return canonical error format

### 3. Error Handling
- [ ] All errors use typed error classes (ERROR_CATALOG.md)
- [ ] Error middleware handles all error types
- [ ] Errors return canonical error format (CONTRACTS.md)
- [ ] No unhandled promise rejections
- [ ] No raw Error objects thrown

### 4. Logging
- [ ] All business events logged with standard fields
- [ ] Correlation IDs included in all logs
- [ ] No PII/PHI in logs (STANDARDS.md)
- [ ] Log levels appropriate (ERROR/WARN/INFO)
- [ ] Structured logging used (not console.log)

### 5. API Contract Compliance
- [ ] Success responses use `successResponse()` helper
- [ ] Error responses use canonical format
- [ ] All responses include `meta.timestamp` and `meta.requestId`
- [ ] DELETE endpoints return 200 (not 204)
- [ ] Headers match CONTRACTS.md requirements

### 6. Security
- [ ] Authentication required (if applicable)
- [ ] Authorization checks implemented (if applicable)
- [ ] Input sanitization applied (if user input)
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Rate limiting configured (if applicable)

### 7. Database
- [ ] Database schema matches DB_SCHEMA.md
- [ ] RLS policies match RLS_POLICIES.md
- [ ] No direct database access from controllers
- [ ] Service layer handles all database operations
- [ ] Foreign key relationships defined

### 8. Testing
- [ ] Unit tests for all service functions (80%+ coverage)
- [ ] Integration tests for all API endpoints (Supertest)
- [ ] E2E tests for critical workflows (if applicable)
- [ ] All tests use fake PHI placeholders (TESTING.md)
- [ ] All tests assert canonical response format
- [ ] Error cases tested (validation, not found, etc.)
- [ ] Edge cases tested (null, undefined, empty strings)

### 9. Audit Logging
- [ ] All business actions logged to audit_logs table
- [ ] Audit logs include correlationId, userId, action, resourceId
- [ ] Audit logs include success/failure status
- [ ] No PHI in audit log metadata
- [ ] Audit logs immutable (no updates/deletes)

### 10. Documentation
- [ ] API endpoints documented (if new endpoints)
- [ ] Request/response examples provided
- [ ] Error responses documented
- [ ] Required permissions documented (if applicable)
- [ ] Breaking changes documented (if applicable)

### 11. Verification Steps
- [ ] Feature works in development environment
- [ ] All tests pass locally
- [ ] Type checking passes (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] No console errors/warnings
- [ ] Manual testing completed (if applicable)

### 12. Compliance
- [ ] No PHI in logs, responses, or test data
- [ ] Data encryption at rest (if storing PHI)
- [ ] Access control implemented (if applicable)
- [ ] Audit trail complete
- [ ] All compliance requirements met (COMPLIANCE.md)

---

## 🚨 Hard Stops (Feature Cannot Be Complete)

**AI agents MUST NOT mark feature complete if:**

- ❌ Tests are missing or failing
- ❌ TypeScript errors exist
- ❌ ESLint errors exist
- ❌ PII/PHI found in logs or test data
- ❌ Canonical response format violated
- ❌ Input validation missing
- ❌ Error handling incomplete
- ❌ Audit logging missing (for business actions)
- ❌ RLS policies not configured (for database tables)
- ❌ Compliance violations exist

**If any hard stop exists → Feature is INCOMPLETE.**

---

## 📊 Completion Criteria by Feature Type

### New API Endpoint

**Must Have:**
- ✅ Controller with `asyncHandler`
- ✅ Zod validation schema
- ✅ Service function (if business logic)
- ✅ Route definition
- ✅ Integration test (Supertest)
- ✅ Error handling (typed errors)
- ✅ Audit logging (if business action)
- ✅ Canonical response format
- ✅ API documentation

**Should Have:**
- ✅ Unit tests for service
- ✅ E2E test (if critical workflow)

---

### Database Schema Change

**Must Have:**
- ✅ Migration script
- ✅ DB_SCHEMA.md updated
- ✅ RLS policies (if new table)
- ✅ RLS_POLICIES.md updated
- ✅ TypeScript types updated
- ✅ Service functions updated
- ✅ Tests updated

**Should Have:**
- ✅ Backward compatibility considered
- ✅ Migration tested in dev environment

---

### New Service Function

**Must Have:**
- ✅ Function is framework-agnostic
- ✅ Receives plain objects (not Express Request)
- ✅ Returns plain objects
- ✅ Error handling (typed errors)
- ✅ Unit tests (80%+ coverage)
- ✅ Logging (structured, no PII)

**Should Have:**
- ✅ JSDoc comments
- ✅ Type definitions

---

### New Middleware

**Must Have:**
- ✅ Follows middleware order (STANDARDS.md)
- ✅ Adds to STANDARDS.md middleware list (if new)
- ✅ Error handling
- ✅ Logging (structured, no PII)
- ✅ Integration test
- ✅ Documentation in RECIPES.md

---

## 🔍 Verification Checklist

**Before marking feature complete, verify:**

1. **Code Quality**
   - ✅ No TypeScript errors
   - ✅ No ESLint warnings/errors
   - ✅ All files formatted (Prettier)
   - ✅ No console.log statements
   - ✅ No TODO comments (unless documented)

2. **Testing**
   - ✅ All tests pass
   - ✅ Coverage meets minimum (80%+)
   - ✅ Tests use fake PHI placeholders
   - ✅ Tests assert canonical format

3. **Security**
   - ✅ No hardcoded secrets
   - ✅ No PII in code/logs/tests
   - ✅ Input sanitization applied
   - ✅ Authentication/authorization checked

4. **Documentation**
   - ✅ README updated (if applicable)
   - ✅ API docs updated (if new endpoints)
   - ✅ Reference docs updated (if patterns changed)

5. **Compliance**
   - ✅ Audit logging complete
   - ✅ RLS policies configured
   - ✅ Data encryption (if PHI)
   - ✅ All COMPLIANCE.md requirements met

---

## ⚠️ AI Agent Enforcement

**AI agents MUST:**
- Verify ALL checklist items before declaring feature complete
- Refuse to mark feature complete if ANY hard stop exists
- Run all verification steps before completion
- Document any exceptions (with justification)

**AI agents MUST NOT:**
- Mark feature complete with failing tests
- Skip checklist items "for speed"
- Assume something is complete without verification
- Accept "we'll test later" as completion

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [TESTING.md](./TESTING.md) - Testing requirements
- [STANDARDS.md](./STANDARDS.md) - Coding requirements
- [COMPLIANCE.md](./COMPLIANCE.md) - Audit requirements
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Development process