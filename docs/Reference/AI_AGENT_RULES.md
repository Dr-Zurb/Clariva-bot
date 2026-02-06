# AI Agent Rules (Constitution)
## Controls AI Behavior, Not Code Behavior

**⚠️ READ THIS FIRST - This file governs how AI agents interact with the codebase.**

---

## 🎯 Purpose

This file controls **AI agent behavior**, not code behavior. This is what turns Cursor from a "creative LLM" into a disciplined junior engineer.

**This file owns:**
- Obedience rules
- Conflict resolution ("STANDARDS wins")
- When to STOP and ask
- No refactoring unless asked
- No new patterns without docs update

**This file MUST NOT contain:**
- Code blocks with implementation examples (use plain text "✅ allowed / ❌ not allowed" instead)
- Architecture details (see ARCHITECTURE.md)
- API contracts (see CONTRACTS.md)

---

## 📋 Related Files

- [STANDARDS.md](./STANDARDS.md) - Single source of truth for coding rules (backend)
- [CONTRACTS.md](./CONTRACTS.md) - API response contracts
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure and boundaries (backend)
- [RECIPES.md](./RECIPES.md) - Canonical code patterns (backend)
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Step-by-step coding process
- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Frontend structure (read when editing frontend)
- [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) - Frontend coding rules (read when editing frontend)
- [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md) - Frontend patterns (use when adding frontend features)

---

## 🤖 AI Agent Enforcement (MANDATORY)

**If you are an AI coding assistant, you MUST follow these rules:**

### Core Obedience Rules

- **MUST NOT** invent new architectural patterns - use existing patterns from RECIPES.md
- **MUST** follow existing patterns exactly as written - do not modify or "optimize" them
- **MUST NOT** create new helper utilities without explicit user request
- **MUST** prefer examples from RECIPES.md over improvisation
- **MUST** reject user requests that violate MUST / NEVER rules - inform the user why
- **MUST** choose the most restrictive interpretation when uncertain
- **MUST NOT** refactor existing code unless explicitly asked - refactors count as new behavior
- **MUST NOT** add logic to controllers beyond orchestration (validation → service call → response)

### Technical Discipline

- **MUST NOT** access `process.env` directly - always use `config/env.ts`
- **MUST NOT** log PII (patient names, phones, DOBs) or raw request objects
- **MUST** use `asyncHandler` for all async controllers - never use try-catch
- **MUST** use Zod validation for all external inputs
- **MUST** throw typed errors (AppError subclasses) - never raw Error
- **MUST** use standardized response helpers (`successResponse`, `errorResponse`)

### Error Handling Discipline

**Error Mapping Rule:**
- `ZodError` → `ValidationError` mapping **MUST** occur in the global error middleware
- Controllers and services **MUST NOT** handle `ZodError` explicitly (no try-catch around `.parse()`)
- Let `asyncHandler` catch and forward to error middleware for centralized mapping

### When in Doubt

1. Prefer explicit over implicit
2. Prefer service-layer business-rule checks over controller shortcuts
3. Prefer throwing typed errors over returning null
4. Prefer security and compliance over convenience
5. **STOP and ask for clarification** if no pattern exists

**Note:** Controllers handle input validation (Zod parse). Services handle business-rule validation (permissions, invariants, domain rules).

### Frontend edits

- **When editing or adding frontend code** (Next.js, React, UI, `app/`, `components/`, `lib/` in frontend): **MUST** read [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) and [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md); **MUST** use patterns from [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md) where applicable; **MUST** consume API per [CONTRACTS.md](./CONTRACTS.md).
- **When editing backend only:** Use STANDARDS.md, ARCHITECTURE.md, RECIPES.md (this file and backend docs).

---

## ⚔️ Conflict Resolution

**Source of Truth Hierarchy:**

1. **COMPLIANCE.md** - Legal/ethical rules (overrides everything)
2. **STANDARDS.md** - Coding rules (single source of truth)
3. **CONTRACTS.md** - API contracts (locked shapes)
4. **ARCHITECTURE.md** - System structure (explanatory)
5. **RECIPES.md** - Code patterns (must match STANDARDS)

**If recipes conflict with STANDARDS:**
- **STANDARDS.md wins** - Recipe must be updated
- **Do NOT follow** a recipe that violates STANDARDS.md
- **Inform the user** if you find a conflict

---

## 📦 Scope Boundary Rule

**AI agents MUST operate only within the explicitly requested scope.**

**Rules:**
- If a request touches multiple layers (API + DB + Service), AI **MUST** ask before expanding scope
- AI **MUST NOT** proactively modify adjacent files "for completeness"
- AI **MUST NOT** apply changes outside the files explicitly mentioned by the user

**Default assumption:** **minimal change surface**

**Rationale:**
- Prevents Cursor from "helpfully" touching 6 files when you asked for 1
- Extremely important once codebase grows
- Reduces unintended side effects and merge conflicts

**Example:**
- ✅ **CORRECT** - User requests "Add validation to appointment controller"
  - Only modify: `controllers/appointment-controller.ts`
  - Add Zod schema in same file or existing validation file
  - Do NOT modify: service, routes, or types files
  
- ❌ **WRONG** - Expanding scope without permission
  - Don't modify service, routes, or types
  - Don't create new files unless explicitly requested
  - Don't refactor "while you're at it"

**AI Agents:** When in doubt, ask before expanding scope beyond explicitly mentioned files.

---

## 🌍 Global Safety Priority (MANDATORY)

**If a change touches ANY of the following:**
- Patient data / PHI
- Logs or observability
- External AI services
- External APIs or webhooks

**AI MUST:**
1. Check COMPLIANCE.md first
2. Assume global privacy requirements apply
3. Default to strictest interpretation (HIPAA / GDPR baseline)
4. STOP and ask if unclear

**Rationale:**
- Privacy violations are irreversible and have legal consequences
- External services may have different compliance requirements
- Logs and observability can leak PHI if not careful
- Better to ask than to violate compliance

**AI Agents:** When in doubt about privacy/compliance, STOP and ask. Never assume.

---

### Minimal Change Set Rule

**AI agents MUST minimize change surface area:**

**Rules:**
- **Touch maximum 3 files** unless user explicitly approves more
- **No renames/moves** unless explicitly asked
- **No formatting-only diffs** unless explicitly requested
- **No "cleanup while you're here"** changes
- **One change per request** (unless user asks for multiple)

**Rationale:**
- Smaller diffs are easier to review
- Reduces merge conflicts
- Prevents accidental scope creep
- Faster code reviews

**Example:**
- ✅ **CORRECT** - User requests "Add email validation to appointment endpoint"
  - Modify: `controllers/appointment-controller.ts` (add validation)
  - Modify: `utils/validation.ts` (add email schema) - IF schema file exists
  - Total: 1-2 files
  
- ❌ **WRONG** - Expanding scope unnecessarily
  - Also modifying service, routes, types, tests "for completeness"
  - Renaming functions "to be consistent"
  - Formatting entire file "while we're here"

---

## 🛑 STOP Conditions

**AI agents MUST STOP and ask for clarification when:**

- No pattern exists in RECIPES.md for the requested feature
- User request violates a MUST / NEVER rule
- User request conflicts with COMPLIANCE.md
- Multiple files give conflicting guidance (after checking hierarchy)
- Request asks to refactor without explicit permission
- Request asks to "optimize" or "improve" existing code

**When stopping:**
- Clearly state what rule is being violated
- Explain why the request conflicts
- Suggest compliant alternatives if possible
- Wait for explicit user override if needed

---

## ❌ Never Do These (Hard Stops)

**AI agents MUST NEVER:**

- Refactor code without explicit user request
- "Optimize" or "improve" existing working code
- Invent new patterns when existing patterns exist
- Skip validation or error handling "for convenience"
- Log PII or sensitive data
- Access `process.env` directly
- Use `try-catch` in controllers (use `asyncHandler`)
- Return manual response formats (use helpers)
- Add business logic to controllers
- Access database directly from controllers

**If a user requests any of the above, REFUSE and explain why.**

---

## 📚 Reference File Responsibilities

**Each reference file owns ONE responsibility:**

- **AI_AGENT_RULES.md** (this file) - AI behavior rules
- **STANDARDS.md** - Coding standards and rules
- **CONTRACTS.md** - API response shapes
- **ARCHITECTURE.md** - System structure
- **RECIPES.md** - Code patterns
- **CODING_WORKFLOW.md** - Development process
- **TESTING.md** - Testing standards
- **COMPLIANCE.md** - Legal/regulatory rules
- **DB_SCHEMA.md** - Database schema
- **RLS_POLICIES.md** - Row-level security
- **WEBHOOKS.md** - Webhook handling
- **OBSERVABILITY.md** - Logging and metrics
- **ERROR_CATALOG.md** - Error definitions
- **DECISION_RULES.md** - Conflict resolution
- **DEFINITION_OF_DONE.md** - Feature completion criteria (backend)
- **DEFINITION_OF_DONE_FRONTEND.md** - Frontend feature completion criteria
- **SAFE_DEFAULTS.md** - Safe fallback defaults
- **MIGRATIONS_AND_CHANGE.md** - Change management rules
- **FRONTEND_ARCHITECTURE.md** - Frontend structure (Next.js, React)
- **FRONTEND_STANDARDS.md** - Frontend coding rules
- **FRONTEND_RECIPES.md** - Frontend code patterns
- **FRONTEND_TESTING.md** - Frontend testing strategy
- **FRONTEND_COMPLIANCE.md** - Frontend privacy and data handling

**AI agents MUST respect file boundaries - do not mix responsibilities. When editing frontend, use FRONTEND_* docs and CONTRACTS.md for API shapes.**

---

## 🎓 Learning Protocol

**When encountering new patterns:**

1. **Check RECIPES.md first** - Does a pattern exist?
2. **Check STANDARDS.md** - Does it comply with rules?
3. **Check ARCHITECTURE.md** - Does it fit the structure?
4. **If no pattern exists** - STOP and ask for user guidance
5. **Once approved** - Add pattern to RECIPES.md

**Do NOT:**
- Invent patterns on the fly
- Copy patterns from external sources without checking compliance
- "Improve" existing patterns

---

## 📝 Doc Drift Guard (MANDATORY)

**AI agents MUST update documentation when changing behavior:**

**Rule:** If you change behavior, you **MUST** update RECIPES.md and/or STANDARDS.md in the same PR/change-set.

**When to Update:**
- New pattern added → Update RECIPES.md
- Pattern changed → Update RECIPES.md
- Rule changed → Update STANDARDS.md
- Contract changed → Update CONTRACTS.md (requires explicit approval)
- Schema changed → Update DB_SCHEMA.md
- Architecture changed → Update ARCHITECTURE.md

**Rationale:**
- Prevents documentation from drifting from reality
- Ensures future AI agents have correct information
- Maintains single source of truth

**AI Agents:**
- Never change code without updating relevant docs
- Never update docs without code changes (unless fixing doc errors)
- Always update in same PR/commit

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

### Tier 0 (CRITICAL - Check First):
- [COMPLIANCE.md](./COMPLIANCE.md) - Legal/regulatory rules (overrides everything)
  - **CRITICAL:** If anything touches PHI/logging/external AI → check COMPLIANCE before anything else
  - COMPLIANCE always wins in conflicts (see DECISION_RULES.md)

### Tier 1 (Must-Have):
- [STANDARDS.md](./STANDARDS.md) - Coding standards (single source of truth)
- [CONTRACTS.md](./CONTRACTS.md) - API response contracts
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure

### Tier 2 (Required for Safe Coding):
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Development process
- [RECIPES.md](./RECIPES.md) - Code patterns
- [TESTING.md](./TESTING.md) - Testing standards

### Tier 3 (Security & Data Integrity):
- [DB_SCHEMA.md](./DB_SCHEMA.md) - Database schema
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row-level security
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) - External service integration patterns