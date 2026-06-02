# Decision Rules (Conflict Resolution)

**Canonical home for "which doc wins when they disagree."** Other docs link here instead of restating the hierarchy.

---

## Conflict resolution hierarchy

When two docs conflict, higher priority wins; treat the lower one as stale and fix it (a "Doc Fix" task) so the same confusion doesn't repeat.

1. **[COMPLIANCE.md](../compliance/COMPLIANCE.md)** — legal/ethical, PHI, consent. Overrides everything; refuse non-compliant requests.
2. **[STANDARDS.md](./STANDARDS.md)** — coding rules (single source of truth for code).
3. **[CONTRACTS.md](../architecture/CONTRACTS.md)** — locked API response shapes (frozen; changes need explicit approval).
4. **[ARCHITECTURE.md](../architecture/ARCHITECTURE.md)** — system structure (explanatory).
5. **[RECIPES.md](./RECIPES.md)** — code patterns (must match STANDARDS).
6. **[API_DESIGN.md](../architecture/API_DESIGN.md)** — design guidance.

For receptionist/DM LLM-vs-deterministic trade-offs, see [AI_BOT_BUILDING_PHILOSOPHY.md](../../product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md).

---

## Tie-break rules

- **More restrictive wins.** A `MUST`/`MUST NOT` beats softer guidance regardless of file order (e.g. STANDARDS "log only IDs" beats OBSERVABILITY "log metadata" → log only IDs).
- **Explicit beats implicit.** An explicit rule overrides a "consider…" suggestion.
- **Same tier?** The later file in the hierarchy wins — but this rarely applies given the order above.

---

## Project-specific examples (where intuition can mislead)

- **Compliance over debugging convenience:** "Log all request bodies for debugging" is refused — request bodies may contain PHI ([COMPLIANCE.md](../compliance/COMPLIANCE.md)). Suggest a compliant alternative (log IDs only).
- **Contracts are frozen:** if API_DESIGN suggests `204 No Content` for DELETE but CONTRACTS says DELETE returns `200` canonical → CONTRACTS wins.
- **Middleware order:** `correlationId` MUST come first (before body parsers) even if an ARCHITECTURE example shows otherwise → STANDARDS wins, fix the example.

---

## See also

- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) — agent contract (links here for the hierarchy)
- [STANDARDS.md](./STANDARDS.md) — coding rules
- [COMPLIANCE.md](../compliance/COMPLIANCE.md) — override rules

**Last updated:** 2026-05-31
