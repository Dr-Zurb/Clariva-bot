# Reading tasks — full bot review (agent)

Complete in order **or** parallelize by assigning each `rt-*.md` to a separate session. Each file lists:

- **Paths** to read (repo-root relative from `clariva-bot/`)
- **Philosophy hooks** (which § of AI_BOT_BUILDING_PHILOSOPHY.md apply)
- **Review checklist** (what “elite” alignment looks like; note violations)

**Output:** For each task, append findings to `../planning/findings-log.md` (create when starting) or to the planning doc’s “Notes” section.

| ID | File | Focus |
|----|------|--------|
| RT-01 | [rt-01-ai-service-intent-classification.md](./rt-01-ai-service-intent-classification.md) | `ai-service.ts` — intent, extraction, booking classifiers |
| RT-02 | [rt-02-instagram-dm-webhook-handler.md](./rt-02-instagram-dm-webhook-handler.md) | DM orchestration, branch order, state machine |
| RT-03 | [rt-03-collection-consent-patient.md](./rt-03-collection-consent-patient.md) | Collection, consent, patient match, extraction fallback |
| RT-04 | [rt-04-triage-fees-dm-context.md](./rt-04-triage-fees-dm-context.md) | Reason-first triage, fees, `dm-turn-context`, reply composers |
| RT-05 | [rt-05-safety-webhook-worker.md](./rt-05-safety-webhook-worker.md) | Safety messages, webhook worker, delivery |
| RT-06 | [rt-06-catalog-matcher-learning.md](./rt-06-catalog-matcher-learning.md) | Catalog match, learning/autobook, staff review DMs |
| RT-07 | [rt-07-utils-validation-types.md](./rt-07-utils-validation-types.md) | Shared utils, `conversation` types, validation |
| RT-08 | [rt-08-tests-and-corpora.md](./rt-08-tests-and-corpora.md) | Unit tests, golden corpora, characterization tests |
| RT-09 | [rt-09-reference-docs-cross-check.md](./rt-09-reference-docs-cross-check.md) | Docs: conversation rules, compliance, branch inventory |
