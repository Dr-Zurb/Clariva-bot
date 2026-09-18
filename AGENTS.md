# Clariva Bot — Codex operating contract

This file governs Codex work across this repository. Keep it short: the linked canonical documents own the detailed rules.

## Mission

Build Halo Aid through a continuous product loop:

1. Observe the running product in the browser.
2. Exercise the relevant workflow with a dedicated test doctor and dummy patients.
3. Identify the smallest real defect or usability gap.
4. Inspect the existing implementation and canonical docs.
5. Fix the issue directly in this repository.
6. Run focused automated checks.
7. Retest the same workflow in the browser.
8. Record status and continue until the agreed acceptance gate is satisfied.

Prefer completing this loop directly in Codex. Use another agent only when the user explicitly asks for delegation or the work is intentionally parallel.

## Safety boundary

- Never use real patient records for product testing. Use clearly identified dummy data.
- Never log or expose PII/PHI, raw requests, secrets, tokens, or webhook payloads.
- Do not send PHI to an external AI or service without the consent and minimization required by the compliance docs.
- Do not perform destructive production actions, irreversible data changes, or real clinical actions as part of testing.
- The product supports the clinician; it does not replace clinical judgment.

For PHI, consent, external AI, logging, data retention, deletion, or webhooks, read `docs/Reference/engineering/compliance/COMPLIANCE.md` first. Compliance wins over feature convenience.

## Canonical order

When documents disagree, follow:

1. `docs/Reference/engineering/compliance/COMPLIANCE.md`
2. `docs/Reference/engineering/development/STANDARDS.md` or `FRONTEND_STANDARDS.md`
3. `docs/Reference/engineering/architecture/CONTRACTS.md`
4. Architecture documents
5. Recipes and process guides

Always read `docs/Reference/engineering/development/AI_AGENT_RULES.md` before substantive code changes.

For frontend work, also read:

- `docs/Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md`
- `docs/Reference/engineering/development/FRONTEND_STANDARDS.md`
- `docs/Reference/engineering/development/FRONTEND_RECIPES.md`

For backend work, follow `docs/Reference/engineering/development/CODING_WORKFLOW.md` and existing patterns.

## Model routing

Match the model to the judgment required by the next bounded task.

Detailed Codex routing: `docs/Reference/engineering/development/CODEX_MODEL_SELECTION.md`.

- **Terra, medium:** default for implementing a clear task, focused bug fixes, routine tests, and bounded UI work.
- **Astra, high:** ambiguous debugging, product-flow analysis, task planning, and multi-file design decisions.
- **Astra, xhigh:** cross-layer product design, architecture tradeoffs, or difficult planning with several interacting systems.
- **Astra, max:** RLS, auth boundaries, PHI fields, audit logging, payments, migrations, external-AI consent, and close-gate review.
- Use the lowest tier that can safely complete the task. Increase effort when ambiguity or blast radius increases.

A running turn cannot silently change its own model. At a clean checkpoint, continue in a task configured for the required model and effort when the app supports routing. Do not interrupt safe, routine work solely to change models.

## Product-testing loop

Detailed operating loop: `docs/Work/process/CODEX_PRODUCT_ENGINEERING_LOOP.md`.

- Start with one named flow and one expected outcome.
- Test the happy path, then empty, loading, validation, failure, refresh, back-navigation, and narrow-screen states that matter to that flow.
- Treat visual polish as part of product quality: hierarchy, copy, focus, spacing, keyboard use, contrast, feedback, and recovery must make sense to a busy clinician.
- Capture concrete evidence: route, trigger, observed result, expected result, and reproducible steps. Never include patient-identifying data.
- Fix one coherent issue at a time. Reproduce before editing and retest after editing.
- Prefer browser verification plus focused tests over broad speculative refactors.
- If a test exposes a larger product decision, stop implementation at a clean checkpoint, document the decision, and route the planning step appropriately.

## Code rules

- Validate all external input with Zod in controllers before services.
- Controllers orchestrate only; business rules and database access belong in services.
- Use `asyncHandler`, typed `AppError` subclasses, and canonical response helpers.
- Never read `process.env` outside validated config.
- Consume API shapes from `CONTRACTS.md`; do not invent response shapes.
- Keep changes tightly scoped. Follow existing architecture and recipes before introducing a new pattern.
- Update the matching canonical document when behavior, schema, contracts, or a reusable pattern changes.
- Do not claim repository-wide health from focused tests. Report exactly what ran and any residuals.

## Planning and task files

Use the existing System T process when work needs a durable plan:

- `docs/Work/process/IMPLEMENTATION-TRIAGE-PROMPT.md`
- `docs/Work/process/TASK_MANAGEMENT_GUIDE.md`
- `docs/Work/process/PHASED-PLANS-GUIDE.md`
- `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`

Cursor-specific model names inside older process documents are historical guidance for Cursor. For Codex work, this file and `CODEX_MODEL_SELECTION.md` own model routing.

Task files define what, acceptance criteria, and verification. They do not contain implementation code or invented schemas. Before creating a task, inspect the current code and mark what already exists. Record completion dates and honest residuals.

Use a direct fix for a small, understood issue. Use a single batch for self-contained work with one acceptance gate. Use phased planning for multi-gate work, roughly ten or more tasks, or work spanning more than a week.

## Completion standard

A change is complete when the relevant browser flow works, focused checks pass, affected docs are synchronized, and remaining risks are stated plainly. Follow `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` for a full ship gate.
