# Daily plans — 16 April 2026

## Service catalog: matching accuracy, AI assistance, and mode architecture

Three interconnected plans to make the bot's service routing accurate, the catalog setup effortless, and the single-fee / multi-service distinction a proper first-class choice.

---

## Plans

| # | Plan | Summary | Tasks | Priority |
|---|------|---------|-------|----------|
| 01 | [Service matching accuracy](./plan-01-service-matching-accuracy.md) | Fix LLM prompt bias, deterministic over-matching, add learning loop, scope mode, and patient clarification | 5 tasks (A–D phases) | Critical — addresses the NCD incident |
| 02 | [AI-assisted catalog setup](./plan-02-ai-catalog-setup.md) | AI auto-fill for service cards (single-card, starter catalog, catalog review) + quality checks and guided onboarding | 2 tasks | High — prevents future NCD-type incidents by ensuring cards are well-configured |
| 03 | [Single-fee vs multi-service mode](./plan-03-single-fee-vs-multi-service-mode.md) | Replace implicit "legacy fee vs catalog" with explicit `catalog_mode` choice; auto-generate single-service catalog; unified code path | 6 tasks | High — architectural prerequisite for clean mode separation |

---

## Dependency graph

```
Plan 03 (catalog_mode)          Plan 01 (matching accuracy)
  Task 01: DB migration           Task 01: LLM prompt strictness     ←── Emergency
  Task 02: Auto single catalog    Task 02: Deterministic fix          ←── Emergency
  Task 03: Mode-aware skip        Task 03: Hint learning
  Task 04: Legacy deprecation     Task 04: Scope mode
  Task 05: Frontend mode select   Task 05: Patient clarification
  Task 06: Practice setup UI
                                Plan 02 (AI catalog setup)
                                  Task 01: AI auto-fill endpoint
                                  Task 02: Catalog quality checks
```

**Recommended execution order:**

1. **Plan 01, Tasks 01+02** (emergency patch — immediate impact, can ship independently)
2. **Plan 03, Tasks 01–03** (catalog_mode foundation — enables clean mode separation)
3. **Plan 02, Tasks 01+02** (AI assistance — prevention layer, in parallel with Plan 03 T04–06)
4. **Plan 03, Tasks 04–06** (frontend mode selector + legacy cleanup)
5. **Plan 01, Tasks 03–05** (learning loop, scope mode, patient clarification)

Plans 01 Tasks 01+02 are the **quick wins** — prompt and scoring fixes that can ship today. Everything else builds on that foundation.

---

## Origin: the NCD incident

A doctor set up a "Non Communicable Diseases" service for HTN, DMT2, and Hypothyroidism. A patient said *"hypertension, diabetes, cough, sneezing, stomach pain, headache."* The bot routed all complaints under NCD — including cough, sneezing, stomach pain, and headache, which clearly don't belong.

**Root causes:**
1. LLM prompt too generous ("prefer non-other")
2. Empty `matcher_hints` = no constraints for the matcher
3. `hasLooseOverlap` bug returns `true` for empty hints
4. No AI assistance for filling service cards (doctors skip configuration)
5. No strictness control per service
6. No explicit single-fee vs multi-service mode (legacy path is tangled)

Each plan addresses a subset of these root causes. Together, they create a system where:
- The matcher is strict by default and respects doctor's intent
- Service cards are well-configured because AI does the heavy lifting
- Doctors who want one fee for everything have a clean, proper path
- The bot improves from every doctor correction

---

## References

- **Previous daily plan:** [15 Apr 2026](../15-04-2026/README.md)
- **Deferred tasks:** [../../deferred/README.md](../../../deferred/README.md)
- **Task template:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
- **Code change rules:** [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md)

**Last updated:** 2026-04-16
