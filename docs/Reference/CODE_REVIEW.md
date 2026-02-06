# Code Review Guide

**Purpose:** Code review checklist and best practices for the Clariva bot. Use this when reviewing code (AI self-review, peer review, or before merging).

**Audience:** AI agents and developers.

**Related:** [CODE_QUALITY.md](./CODE_QUALITY.md) | [STANDARDS.md](./STANDARDS.md) | [SECURITY.md](./SECURITY.md) | [TESTING.md](./TESTING.md)

---

## 🎯 Purpose of Code Review

**Why review code:**
- Catch bugs before production
- Ensure compliance (PHI, RLS, audit)
- Maintain code quality and consistency
- Share knowledge (learn patterns)
- Prevent security vulnerabilities

**When to review:**
- Before merging PR (if using PRs)
- Before marking task complete (self-review)
- After implementing complex feature (ask for review)

---

## ✅ Code Review Checklist

### 1. Functionality

- [ ] **Code does what it's supposed to do** (matches task description and acceptance criteria)
- [ ] **Edge cases handled** (null, undefined, empty arrays, invalid input)
- [ ] **Error handling** (uses correct error classes; errors propagate correctly)
- [ ] **No obvious bugs** (off-by-one, logic errors, race conditions)

### 2. Standards & Architecture

- [ ] **Follows STANDARDS.md** (Zod validation, asyncHandler, error handling, response contracts)
- [ ] **Follows ARCHITECTURE.md** (controller → service → DB; no business logic in controllers)
- [ ] **Uses RECIPES.md patterns** (webhook pattern, Zod validation, etc.)
- [ ] **Correct layer** (config, service, controller, middleware, utils)

### 3. Security & Compliance

- [ ] **No hardcoded secrets** (all from env)
- [ ] **No PHI in logs** (patient names, phones, DOBs redacted or not logged)
- [ ] **Input validated** (Zod schemas for all external input)
- [ ] **Text sanitized** (DOMPurify for user-provided text)
- [ ] **Auth/RLS** (protected endpoints use JWT; RLS policies enforced or manual ownership checks)
- [ ] **Webhook signature verified** (for all webhooks)
- [ ] **Rate limiting applied** (for public endpoints)
- [ ] **See [SECURITY.md](./SECURITY.md) and [COMPLIANCE.md](./COMPLIANCE.md)**

### 4. Code Quality

- [ ] **Naming** (files kebab-case; functions camelCase; types PascalCase; DB snake_case)
- [ ] **No dead code** (no commented-out blocks, unused imports, unreachable code)
- [ ] **DRY** (no repeated logic; extracted to utils)
- [ ] **Single responsibility** (each function does one thing)
- [ ] **Comments** (JSDoc for exported functions; inline comments for non-obvious logic)
- [ ] **File length** (<500 lines; split if too long)
- [ ] **See [CODE_QUALITY.md](./CODE_QUALITY.md)**

### 5. TypeScript

- [ ] **No `any`** (without `eslint-disable` and comment explaining why)
- [ ] **Prefer `unknown`** over `any` for external data
- [ ] **Types explicit** (function params, return types)
- [ ] **No type errors** (`npm run type-check` passes)

### 6. Testing

- [ ] **Tests exist** (unit tests for services/utils; integration tests for endpoints)
- [ ] **Tests pass** (`npm test`)
- [ ] **Coverage adequate** (80%+ for services; 100% for critical paths)
- [ ] **Tests use fake placeholders** (PATIENT_TEST, +10000000000; no real PHI)
- [ ] **Error cases tested** (validation failures, not found, auth bypass)
- [ ] **See [TESTING.md](./TESTING.md)**

### 7. Performance

- [ ] **Database queries optimized** (select only needed fields; use indexes for WHERE/ORDER BY)
- [ ] **No N+1 queries** (use JOIN or batch select)
- [ ] **Async operations** (parallel when independent; sequential when dependent)
- [ ] **Timeouts set** (for external API calls)
- [ ] **See [PERFORMANCE.md](./PERFORMANCE.md)**

### 8. Observability

- [ ] **Logs meaningful** (correlation ID, metadata, no PHI)
- [ ] **Errors logged** (with context, correlation ID)
- [ ] **Audit events logged** (create/read/update for sensitive operations)
- [ ] **See [OBSERVABILITY.md](./OBSERVABILITY.md)**

### 9. Documentation

- [ ] **JSDoc for exported functions** (params, returns, description)
- [ ] **.env.example updated** (if new env vars added)
- [ ] **Reference docs updated** (if new patterns or contracts; see "Doc Drift Guard" in AI_AGENT_RULES.md)
- [ ] **Migration files documented** (comments in SQL; entry in DB_SCHEMA.md)

### 10. Deployment Readiness

- [ ] **No breaking changes** (or version bump to MAJOR if breaking)
- [ ] **Migrations backward-compatible** (or plan for downtime)
- [ ] **Feature flags** (if deploying partial feature; hide behind flag until complete)
- [ ] **Rollback plan** (can revert safely if issue in prod)

---

## 🤖 AI Self-Review

**For AI agents:** Before marking task complete, run this self-review:

1. **Re-read the task file** (did you complete all subtasks?)
2. **Check acceptance criteria** (are all items checked?)
3. **Run this code review checklist** (all 10 sections above)
4. **Fix any issues** (before marking task complete)
5. **Update task file** (mark items complete with dates; add notes if issues encountered)

---

## 👥 Peer Review (when team grows)

### As Reviewer

**DO:**
- Be constructive ("Consider using `Promise.all` here for parallel execution" vs "This is wrong")
- Ask questions ("Why did you choose approach X over Y?")
- Suggest improvements ("Extract this to a util function for reusability")
- Verify compliance (PHI, RLS, tests)

**DO NOT:**
- Nitpick style (if linter passes, style is fine)
- Rewrite code in review (suggest changes, let author implement)
- Approve without checking security/compliance
- Block on minor issues (comment "nit:" for optional improvements)

### As Author

**DO:**
- Respond to all comments (explain decisions or acknowledge and fix)
- Test suggestions before applying
- Update code based on feedback
- Thank reviewer

**DO NOT:**
- Take feedback personally
- Ignore compliance-related feedback
- Merge without addressing critical issues

---

## 🚦 Review Outcomes

**Approve:** Code is ready to merge
- All checklist items pass
- No critical issues
- Tests pass; compliance verified

**Request changes:** Code needs fixes before merge
- Critical issues (security, compliance, bugs)
- Missing tests or docs
- Does not meet standards

**Comment:** Code is okay but has optional improvements
- Minor suggestions (nits)
- Performance optimizations (not critical)
- Style preferences

---

## 🔗 Related Documentation

- [CODE_QUALITY.md](./CODE_QUALITY.md) — Naming, TypeScript, organization
- [STANDARDS.md](./STANDARDS.md) — Coding rules
- [SECURITY.md](./SECURITY.md) — Security checklist
- [TESTING.md](./TESTING.md) — Testing requirements
- [COMPLIANCE.md](./COMPLIANCE.md) — Compliance rules

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
