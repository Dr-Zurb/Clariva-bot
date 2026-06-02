> **Canonical reference library.** For active execution see [`Work/`](../../Work/README.md); for onboarding see [`Onboarding/`](../../Onboarding/README.md); superseded material in [`Archive/`](../../Archive/README.md).

| Folder | For | Contents |
|---|---|---|
| [`business/`](./business/) | Founders, GTM, compliance ops | Market strategy, regulatory launch map, launch checklist, brand |
| [`engineering/`](./engineering/) | Engineers, AI agents | How to build, secure, deploy, and operate the platform |
| [`product/`](./product/) | Product + eng | Domain behaviour — cockpit, bot, booking, patients, learning |

---

## Business (`business/`)

Strategy and launch — not code rules.

| Doc | Purpose |
|---|---|
| [GO_TO_MARKET_STRATEGY.md](./business/GO_TO_MARKET_STRATEGY.md) | India-first → Gulf → US sequencing |
| [REGULATORY_AND_LAUNCH_STRATEGY.md](./business/REGULATORY_AND_LAUNCH_STRATEGY.md) | DPDP, telemedicine, ABDM, global expansion |
| [LAUNCH_READINESS_CHECKLIST.md](./business/LAUNCH_READINESS_CHECKLIST.md) | P0/P1 gate before first paying customer |
| [BRAND.md](./business/BRAND.md) | Palette, voice, do/don't |

---

## Engineering (`engineering/`)

### Compliance & security — [`engineering/compliance/`](./engineering/compliance/)

| Doc | Purpose |
|---|---|
| [COMPLIANCE.md](./engineering/compliance/COMPLIANCE.md) | **System constraints** — PHI, consent, audit (agents must follow) |
| [PRIVACY_BY_DESIGN.md](./engineering/compliance/PRIVACY_BY_DESIGN.md) | Privacy patterns per feature |
| [SECURITY.md](./engineering/compliance/SECURITY.md) | Data protection, auth |
| [RLS_POLICIES.md](./engineering/compliance/RLS_POLICIES.md) | Supabase row-level security |
| [DATA_RETENTION.md](./engineering/compliance/DATA_RETENTION.md) | Retention & deletion |
| [WEBHOOK_SECURITY.md](./engineering/compliance/WEBHOOK_SECURITY.md) | Webhook threat model |
| [FRONTEND_COMPLIANCE.md](./engineering/compliance/FRONTEND_COMPLIANCE.md) | Frontend PHI rules |

### Architecture — [`engineering/architecture/`](./engineering/architecture/)

| Doc | Purpose |
|---|---|
| [ARCHITECTURE.md](./engineering/architecture/ARCHITECTURE.md) | Backend structure & patterns |
| [FRONTEND_ARCHITECTURE.md](./engineering/architecture/FRONTEND_ARCHITECTURE.md) | Frontend structure |
| [DB_SCHEMA.md](./engineering/architecture/DB_SCHEMA.md) | Database schema |
| [API_DESIGN.md](./engineering/architecture/API_DESIGN.md) | API conventions |
| [CONTRACTS.md](./engineering/architecture/CONTRACTS.md) | API contracts & payloads |

### Development — [`engineering/development/`](./engineering/development/)

| Doc | Purpose |
|---|---|
| [STANDARDS.md](./engineering/development/STANDARDS.md) | **Coding standards** (canonical contracts) |
| [RECIPES.md](./engineering/development/RECIPES.md) | Backend implementation patterns |
| [FRONTEND_STANDARDS.md](./engineering/development/FRONTEND_STANDARDS.md) | Frontend coding rules |
| [FRONTEND_RECIPES.md](./engineering/development/FRONTEND_RECIPES.md) | Frontend patterns |
| [TESTING.md](./engineering/development/TESTING.md) | Backend testing |
| [FRONTEND_TESTING.md](./engineering/development/FRONTEND_TESTING.md) | Frontend / E2E testing |
| [DEFINITION_OF_DONE.md](./engineering/development/DEFINITION_OF_DONE.md) | Ship criteria (backend) |
| [DEFINITION_OF_DONE_FRONTEND.md](./engineering/development/DEFINITION_OF_DONE_FRONTEND.md) | Ship criteria (frontend) |
| [AI_AGENT_RULES.md](./engineering/development/AI_AGENT_RULES.md) | Rules for AI agents |
| [CODING_WORKFLOW.md](./engineering/development/CODING_WORKFLOW.md) | Dev workflow |
| [CODE_REVIEW.md](./engineering/development/CODE_REVIEW.md) | Review checklist |
| [CODE_QUALITY.md](./engineering/development/CODE_QUALITY.md) | Quality bar |
| [DECISION_RULES.md](./engineering/development/DECISION_RULES.md) | When to lock decisions |
| [CURSOR_MODEL_SELECTION.md](./engineering/development/CURSOR_MODEL_SELECTION.md) | Model selection guide |
| [MIGRATIONS_AND_CHANGE.md](./engineering/development/MIGRATIONS_AND_CHANGE.md) | DB migrations |
| [VERSIONING.md](./engineering/development/VERSIONING.md) | Version policy |
| [SAFE_DEFAULTS.md](./engineering/development/SAFE_DEFAULTS.md) | Timeouts, retries |
| [ERROR_CATALOG.md](./engineering/development/ERROR_CATALOG.md) | Error codes |
| [PAGINATION.md](./engineering/development/PAGINATION.md) | Pagination patterns |
| [FILTERING_AND_SORTING.md](./engineering/development/FILTERING_AND_SORTING.md) | List UI patterns |
| [PERFORMANCE.md](./engineering/development/PERFORMANCE.md) | Performance guide |
| [RATE_LIMITING.md](./engineering/development/RATE_LIMITING.md) | Rate limits |

### Operations — [`engineering/operations/`](./engineering/operations/)

| Doc | Purpose |
|---|---|
| [ONBOARDING.md](./engineering/operations/ONBOARDING.md) | New developer / agent onboarding |
| [DEPLOYMENT.md](./engineering/operations/DEPLOYMENT.md) | Deploy checklist |
| [DEBUGGING.md](./engineering/operations/DEBUGGING.md) | Troubleshooting |
| [OBSERVABILITY.md](./engineering/operations/OBSERVABILITY.md) | Metrics & logging |
| [EXTERNAL_SERVICES.md](./engineering/operations/EXTERNAL_SERVICES.md) | Third-party integrations |
| [WEBHOOKS.md](./engineering/operations/WEBHOOKS.md) | Webhook patterns |
| [OPD_SUPPORT_RUNBOOK.md](./engineering/operations/OPD_SUPPORT_RUNBOOK.md) | OPD support runbook |

---

## Product (`product/`)

Domain behaviour and product reference — updated batch-by-batch as features ship.

### Cockpit — [`product/cockpit/`](./product/cockpit/)

| Doc | Purpose |
|---|---|
| [COCKPIT.md](./product/cockpit/COCKPIT.md) | Live cockpit architecture (SoT) |

### Receptionist bot — [`product/receptionist-bot/`](./product/receptionist-bot/)

| Doc | Purpose |
|---|---|
| [AI_BOT_BUILDING_PHILOSOPHY.md](./product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md) | Bot design principles |
| [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./product/receptionist-bot/RECEPTIONIST_BOT_CONVERSATION_RULES.md) | Conversation rules |
| [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](./product/receptionist-bot/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md) | DM routing branch order |
| [all-bot-patient-scenarios.md](./product/receptionist-bot/all-bot-patient-scenarios.md) | Patient scenario inventory |

### Booking — [`product/booking/`](./product/booking/)

| Doc | Purpose |
|---|---|
| [APPOINTMENT_BOOKING_FLOW.md](./product/booking/APPOINTMENT_BOOKING_FLOW.md) | Booking flow (v1) |
| [APPOINTMENT_BOOKING_FLOW_V2.md](./product/booking/APPOINTMENT_BOOKING_FLOW_V2.md) | Booking flow (v2) |
| [APPOINTMENT_BOOKING_BOT_FLOW.md](./product/booking/APPOINTMENT_BOOKING_BOT_FLOW.md) | Bot booking flow |
| [APPOINTMENT_REASON_AND_NOTES.md](./product/booking/APPOINTMENT_REASON_AND_NOTES.md) | Reason & notes |
| [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](./product/booking/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) | Booking for others |
| [UNIFIED_SLOT_PAYMENT_FLOW.md](./product/booking/UNIFIED_SLOT_PAYMENT_FLOW.md) | Slot + payment |

### Patients & practice — [`product/patients-and-practice/`](./product/patients-and-practice/)

| Doc | Purpose |
|---|---|
| [PATIENT_REGISTRATION_AND_ROSTER.md](./product/patients-and-practice/PATIENT_REGISTRATION_AND_ROSTER.md) | Patients list vs intake |
| [PRACTICE_SETUP_UI.md](./product/patients-and-practice/PRACTICE_SETUP_UI.md) | Practice setup UI |
| [DOCTOR_SETTINGS_PHASES.md](./product/patients-and-practice/DOCTOR_SETTINGS_PHASES.md) | Doctor settings phases |
| [ANALYTICS_INTAKE_VS_REGISTERED.md](./product/patients-and-practice/ANALYTICS_INTAKE_VS_REGISTERED.md) | Intake vs registered analytics |

### Learning & service match — [`product/learning/`](./product/learning/)

| Doc | Purpose |
|---|---|
| [LEARNING_ASSIST_AND_AUTOBOOK.md](./product/learning/LEARNING_ASSIST_AND_AUTOBOOK.md) | Learning assist & autobook |
| [SERVICE_MATCH_PATTERN_KEY.md](./product/learning/SERVICE_MATCH_PATTERN_KEY.md) | Pattern key contract |
| [SERVICE_MATCH_SHADOW_METRICS.md](./product/learning/SERVICE_MATCH_SHADOW_METRICS.md) | Shadow metrics |
| [STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](./product/learning/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md) | Staff feedback data contract |

---

## Quick paths for agents

- **Building a feature?** → `engineering/development/STANDARDS.md` + `engineering/compliance/COMPLIANCE.md`
- **Touching PHI?** → `engineering/compliance/PRIVACY_BY_DESIGN.md` + `engineering/compliance/RLS_POLICIES.md`
- **Shipping to customers?** → `business/LAUNCH_READINESS_CHECKLIST.md`
- **Cockpit work?** → `product/cockpit/COCKPIT.md`
- **Bot / DM work?** → `product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md`

**Reorganized:** 2026-05-31 — flat `docs/Reference/*.md` moved into `business/`, `engineering/`, and `product/` subfolders.
