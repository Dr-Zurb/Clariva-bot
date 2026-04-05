# Decision Rules (Conflict Resolution)
## Resolve Ambiguity and Conflicts

**⚠️ CRITICAL: This file resolves conflicts when multiple rules or files apply to the same situation.**

---

## 🎯 Purpose

This file provides explicit conflict resolution rules when multiple reference files apply to the same situation.

**This file owns:**
- Conflict resolution order (explicit examples)
- "If two rules apply, do this"
- "If unsure, choose X over Y"
- "When to STOP and ask instead of coding"

**This file MUST NOT contain:**
- New rules (those belong in STANDARDS.md)
- Implementation patterns (those belong in RECIPES.md)
- Architecture definitions (those belong in ARCHITECTURE.md)

---

## 📋 Related Files

This file resolves conflicts between:
- [STANDARDS.md](./STANDARDS.md) - Coding rules
- [CONTRACTS.md](./CONTRACTS.md) - API contracts
- [COMPLIANCE.md](./COMPLIANCE.md) - Legal/regulatory rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System structure
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [API_DESIGN.md](./API_DESIGN.md) - API design principles
- [AI_BOT_BUILDING_PHILOSOPHY.md](./AI_BOT_BUILDING_PHILOSOPHY.md) - Receptionist/DM: LLM vs deterministic strategy (quality-first defaults)

---

## 🔥 Conflict Resolution Hierarchy (MANDATORY)

**When conflicts arise, apply in this order:**

1. **COMPLIANCE.md** - Legal/ethical rules (overrides everything)
2. **STANDARDS.md** - Coding rules (single source of truth)
3. **CONTRACTS.md** - API contracts (locked shapes)
4. **ARCHITECTURE.md** - System structure (explanatory)
5. **RECIPES.md** - Code patterns (must match STANDARDS)
6. **API_DESIGN.md** - Design principles (guidance)

**Rule:** Higher priority always wins. Lower priority must be updated to match.

**Enforcement:** If a lower-priority file contradicts a higher-priority file, treat the lower file as stale and create a "Doc Fix" task to update it. This prevents the common failure mode: "we followed the right rule but never fixed the doc, so the same confusion repeats."

---

## ⚔️ Common Conflict Scenarios

### Scenario 1: RECIPES vs STANDARDS Conflict

**Situation:**
- RECIPES.md shows a pattern
- STANDARDS.md has a conflicting rule

**Resolution:**
- **STANDARDS.md wins** - Recipe must be updated
- AI agents **MUST NOT** follow the recipe
- AI agents **MUST** inform user of conflict
- AI agents **MUST** suggest updating recipe

**Example:**
```
RECIPES.md: "Return { data: appointment }"
STANDARDS.md: "MUST use successResponse() helper"

→ STANDARDS wins
→ Recipe is wrong
→ Update recipe to use successResponse()
```

---

### Scenario 2: API_DESIGN vs CONTRACTS Conflict

**Situation:**
- API_DESIGN.md suggests a design pattern
- CONTRACTS.md defines locked response format

**Resolution:**
- **CONTRACTS.md wins** - Contracts are frozen
- API_DESIGN.md is guidance, CONTRACTS.md is law
- If API_DESIGN suggests contract change → requires explicit approval

**Example:**
```
API_DESIGN.md: "Consider using 204 No Content for DELETE"
CONTRACTS.md: "DELETE MUST return 200 with canonical format"

→ CONTRACTS wins
→ DELETE must return 200
→ API_DESIGN suggestion is invalid
```

---

### Scenario 3: ARCHITECTURE vs STANDARDS Conflict

**Situation:**
- ARCHITECTURE.md shows an architectural pattern
- STANDARDS.md has a conflicting rule

**Resolution:**
- **STANDARDS.md wins** - Standards are rules, architecture is explanation
- ARCHITECTURE.md should be updated to match STANDARDS.md
- If architecture pattern violates standards → pattern is wrong

**Example:**
```
ARCHITECTURE.md: "Middleware order: cors → body-parser → correlationId"
STANDARDS.md: "correlationId MUST come FIRST (before body parsers)"

→ STANDARDS wins
→ ARCHITECTURE example is wrong
→ Update ARCHITECTURE.md to match
```

---

### Scenario 4: COMPLIANCE vs All Others

**Situation:**
- Any file suggests something
- COMPLIANCE.md prohibits it

**Resolution:**
- **COMPLIANCE.md ALWAYS wins** - Legal/ethical rules override everything
- Feature must be redesigned or dropped
- AI agents **MUST** refuse non-compliant implementations

**Example:**
```
User: "Log all request bodies for debugging"
STANDARDS.md: "Logging is allowed"
COMPLIANCE.md: "NEVER log request bodies (may contain PHI)"

→ COMPLIANCE wins
→ Request must be refused
→ Suggest compliant alternative
```

---

## 🤔 "If Unsure, Choose X Over Y" Rules

### Security vs Convenience
- **Choose:** Security
- **Rule:** Always prefer security and compliance over convenience
- **Example:** Require validation even if it adds code

### Explicit vs Implicit
- **Choose:** Explicit
- **Rule:** Prefer explicit code over implicit behavior
- **Example:** Use `asyncHandler` wrapper, don't rely on implicit error handling

### Service Layer vs Controller
- **Choose:** Service Layer
- **Rule:** When unsure where logic belongs, prefer service layer
- **Example:** Business rule validation in service, not controller

### Throw Error vs Return Null
- **Choose:** Throw Error
- **Rule:** Prefer throwing typed errors over returning null/undefined
- **Example:** `throw new NotFoundError()` not `return null`

### Structured Logging vs Console Log
- **Choose:** Structured Logging
- **Rule:** Always use structured logger, never console.log
- **Example:** `logger.info()` not `console.log()`

### Canonical Format vs Custom Format
- **Choose:** Canonical Format
- **Rule:** Always use canonical response helpers, never manual formatting
- **Example:** `successResponse()` not `res.json({ data })`

### Framework-Agnostic vs Framework-Specific
- **Choose:** Framework-Agnostic
- **Rule:** Services must be framework-agnostic, controllers handle HTTP
- **Example:** Service receives plain objects, not Express Request

---

## 🛑 When to STOP and Ask

**AI agents MUST STOP and ask when:**

### Ambiguity Scenarios

1. **Multiple valid patterns exist**
   - Two different RECIPES.md patterns could apply
   - **Action:** Ask user which pattern to use

2. **Rule is unclear**
   - Rule exists but edge case not covered
   - **Action:** Clarify edge case with user

3. **User request conflicts with rules**
   - User explicitly requests something that violates rules
   - **Action:** Refuse, explain why, suggest alternatives

4. **Pattern doesn't exist**
   - Requested pattern not in RECIPES.md
   - **Action:** STOP, ask if pattern should be created

5. **Scope expansion needed**
   - Implementation requires touching multiple layers
   - **Action:** Ask before expanding scope beyond requested files

### Conflict Scenarios

6. **Two reference files conflict**
   - After checking hierarchy, still unclear
   - **Action:** Report conflict to user, ask for resolution

7. **Example contradicts rule**
   - Code example in doc violates stated rule
   - **Action:** Follow rule, note example needs update

---

## ✅ Explicit "If Two Rules Apply" Decisions

### Rule 1: More Restrictive Wins

**If one rule is more restrictive than another:**
- Choose the more restrictive interpretation
- Prefer security/compliance over convenience
- Prefer explicit over implicit

**Example:**
```
STANDARDS.md: "Log only IDs"
OBSERVABILITY.md: "Log metadata"

→ Log only IDs (more restrictive)
→ Metadata includes IDs, but not full objects
```

---

### Rule 2: Explicit Over Implicit

**If explicit rule exists, ignore implicit guidance:**
- Explicit "MUST NOT" always wins
- Explicit "MUST" always wins
- Implicit suggestions can be ignored if explicit rule exists

**Example:**
```
API_DESIGN.md: "Consider pagination"
STANDARDS.md: "MUST paginate lists > 20 items"

→ STANDARDS explicit rule wins
→ Must implement pagination
```

---

### Rule 3: Later File Wins (Only if Same Priority)

**If two files have same priority level:**
- File listed later in hierarchy wins
- **Clarifier:** Later file wins only if BOTH are same tier AND neither contains MUST/MUST NOT statements that conflict
- If one file has MUST/MUST NOT and other doesn't → MUST/MUST NOT wins regardless of order
- But only if no explicit conflict resolution exists

**Note:** This rarely applies due to clear hierarchy.

---

## 🎯 Decision Matrix

**Use this matrix to resolve conflicts:**

| Scenario | File A | File B | Winner | Rationale |
|----------|--------|--------|--------|-----------|
| Compliance vs Standards | COMPLIANCE.md | STANDARDS.md | COMPLIANCE.md | Legal/ethical override |
| Standards vs Recipes | STANDARDS.md | RECIPES.md | STANDARDS.md | Standards are source of truth |
| Contracts vs API Design | CONTRACTS.md | API_DESIGN.md | CONTRACTS.md | Contracts are frozen |
| Standards vs Architecture | STANDARDS.md | ARCHITECTURE.md | STANDARDS.md | Standards are rules |
| Recipes vs API Design | RECIPES.md | API_DESIGN.md | RECIPES.md | Recipes are canonical patterns |

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) - Conflict hierarchy overview
- [STANDARDS.md](./STANDARDS.md) - Single source of truth
- [COMPLIANCE.md](./COMPLIANCE.md) - Override rules