# Execution — phased work (13-04-2026 philosophy audit)

**Planning:** [../planning/plan-philosophy-alignment-audit-2026.md](../planning/plan-philosophy-alignment-audit-2026.md) · **Findings:** [../planning/findings-log.md](../planning/findings-log.md)

**Gate:** RT-01–RT-09 complete ✅ · Change themes T1–T5 in master plan ✅

This folder lists **executable** tasks derived from **`rt-01`–`rt-09`** planning files. Implement in dependency order; each file has checklists and acceptance criteria.

**Epic mapping (`docs/task-management/tasks/tm-bot-audit-*.md`):**

| Phase | Focus | Daily execution files |
|-------|--------|------------------------|
| **E0** | Reading / gate | [tm-bot-audit-00](../../../../../task-management/tasks/tm-bot-audit-00-reading-complete.md) — complete |
| **E1** | Routing, intent, `lastPromptKind`, kin terms | [e-task-phil-01](./e-task-phil-01-ai-service-guardrails-intent-fee.md), [e-task-phil-02](./e-task-phil-02-booking-relation-terms-module.md), [e-task-phil-03](./e-task-phil-03-webhook-lastpromptkind-audit.md), [e-task-phil-05](./e-task-phil-05-conversation-promptkind-extensions.md) |
| **E2** | Extraction, collection, consent metrics | [e-task-phil-04](./e-task-phil-04-collection-seed-extraction-metrics.md) |
| **E3** | Triage, fees, DM context | [e-task-phil-06](./e-task-phil-06-triage-fees-dm-context.md) |
| **E4** | Catalog matcher docs, golden corpus | [e-task-phil-07](./e-task-phil-07-catalog-matcher-learning-doc.md), [e-task-phil-08](./e-task-phil-08-golden-corpus-gaps.md) |
| **E5** | Reference docs, compliance | [e-task-phil-09](./e-task-phil-09-docs-branch-inventory-compliance.md) |
| **E6** | Safety / webhook spot-check | [e-task-phil-10](./e-task-phil-10-safety-webhook-spotcheck.md) |

**Suggested order (parallel where safe):**

1. **e-task-phil-01** (docs + metrics, low risk)  
2. **e-task-phil-02** (kin module — can parallel with 01)  
3. **e-task-phil-03** (audit outbound `lastPromptKind`)  
4. **e-task-phil-04** (collection seed + metrics)  
5. **e-task-phil-05** (types / enum — coordinate after 03)  
6. **e-task-phil-06** (triage / `buildDmTurnContext`)  
7. **e-task-phil-07** + **e-task-phil-08** (docs + tests — parallel)  
8. **e-task-phil-09** (branch inventory — after code stabilizes or doc-only first)  
9. **e-task-phil-10** (when touching safety/webhook)

---

## Links

- Initiative index: [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)
- Task-management epics: [tasks/](../../../../../task-management/tasks/) — `tm-bot-audit-00` … `tm-bot-audit-05`
- Philosophy: [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)
