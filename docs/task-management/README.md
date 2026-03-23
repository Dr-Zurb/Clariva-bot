# Task Management

This folder contains task management documentation and templates.

**Purpose:** Standardize task creation, tracking, and completion across the project.

---

## 📚 Documentation

### Core Documents

1. **[TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)** - Complete guide for task management
   - Rules and requirements
   - Task lifecycle
   - Best practices
   - Tracking guidelines

2. **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** - Template for creating new tasks
   - Standard structure
   - Required sections
   - Format guidelines

3. **[CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)** - Rules for tasks that **change** existing code
   - When to use: any task that updates, refactors, or removes existing behavior (not only new feature addition)
   - Audit current implementation → map impact → implement → remove obsolete code → update tests and docs
   - Use in addition to the guide when the task is "Update existing"

---

## 🎯 Quick Start

### Before Creating a Task

1. **MANDATORY:** Check existing codebase first
   - Search for related files, functions, patterns
   - Identify what's already implemented
   - Document existing code status
2. **Read** [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)
3. **Use** [TASK_TEMPLATE.md](./TASK_TEMPLATE.md) as starting point
4. **Review** reference documentation:
   - [STANDARDS.md](../Reference/STANDARDS.md)
   - [ARCHITECTURE.md](../Reference/ARCHITECTURE.md)
   - [RECIPES.md](../Reference/RECIPES.md)
   - [COMPLIANCE.md](../Reference/COMPLIANCE.md)

### Key Rules

1. **MUST:** Check existing codebase before creating task files
2. **MUST:** Add completion date when marking tasks complete
3. **MUST:** Use hierarchical numbering (1.1, 1.1.1, 1.2, etc.) for task breakdown
4. **MUST:** Update task status when state changes
5. **MUST:** Use template when creating new tasks
6. **MUST:** Reference standards before implementation
7. **MUST:** Document existing code status in "Current State" section
8. **When a task updates existing code:** MUST follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) (audit, impact, remove obsolete, tests, docs)
9. **When creating a migration:** MUST read all previous migrations (in order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../Reference/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) §4

### Task Structure

- **Each major task = Separate file** (e.g., `e-task-1-project-setup.md`)
- **Inside each file = Hierarchical subtasks** with numbered breakdown:
  - Level 1: Main categories (1, 2, 3, etc.)
  - Level 2: Subtasks (1.1, 1.2, 2.1, etc.)
  - Level 3: Detailed steps (1.1.1, 1.1.2, 1.2.1, etc.)

---

## 📁 Task Locations

- **Daily Tasks:** `docs/Development/Daily-plans/YYYY-MM-DD/`
- **Monthly Plans:** `docs/Development/Monthly-plans/`
- **Learning Tasks:** `docs/Learning/YYYY-MM-DD/`
- **Deferred Tasks:** `docs/Development/deferred/` — postponed work with notes to resume later

### Current active plan: MVP completion (2026-02-06)

Detailed implementation tasks for the two MVP must-haves (Connect Instagram + Doctor Setup) live in:

- **Daily plan:** [docs/Development/Daily-plans/2026-02-06/README.md](../Development/Daily-plans/2026-02-06/README.md)
- **Scope and acceptance criteria:** [docs/Development/Future Planning/MVP completion planning.md](../Development/Future%20Planning/MVP%20completion%20planning.md)

Tasks: e-task-1 through e-task-6 (Connect Instagram), e-task-7 through e-task-12 (Doctor Setup). Use [TASK_TEMPLATE.md](./TASK_TEMPLATE.md) and [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md) when executing them.

### Doctor Settings Feature (2026-03-09)

Phased rollout for per-doctor practice settings, availability, and bot integration:

- **Reference:** [DOCTOR_SETTINGS_PHASES.md](../Reference/DOCTOR_SETTINGS_PHASES.md), [PRACTICE_SETUP_UI.md](../Reference/PRACTICE_SETUP_UI.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-09/README.md](../Development/Daily-plans/March%202026/2026-03-09/README.md)

Tasks: e-task-1 (migration), e-task-2 (settings API), e-task-3 (availability/blocked-times API), e-task-4 (bot integration), e-task-5 (frontend dashboard), e-task-6 (Practice Setup UI consolidation), e-task-7 (Practice Setup UI refinement: cards, nested sidebar, breadcrumb), e-task-8 (Settings UI consistency: flat sidebar, remove back buttons, match integrations cards), e-task-9 (Availability page redesign: weekly calendar, copy to days, blocked times).

### Appointment Booking Flow V2 (2026-03-13)

Complete redesign of the appointment booking flow: "all at once" collection, confirm-details step, external slot picker with proactive messaging, redirect-to-chat for compliance.

- **Reference:** [APPOINTMENT_BOOKING_FLOW_V2.md](../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-13/README.md](../Development/Daily-plans/March%202026/2026-03-13/README.md)

Tasks: e-task-1 (migrations: slot_selections, patients.email), e-task-2 (collection flow redesign: all-at-once, age, email, confirm_details), e-task-3 (slot selection API: token, POST select-slot, proactive send, redirect), e-task-4 (external slot picker page: /book), e-task-5 (webhook flow integration: slot link, reason_for_visit to notes).

### Reason for Visit & Notes Separation (2026-03-16)

Split appointment data into `reason_for_visit` (required, patient's main complaint) and `notes` (optional, patient extras).

- **Reference:** [APPOINTMENT_REASON_AND_NOTES.md](../Reference/APPOINTMENT_REASON_AND_NOTES.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-16/README.md](../Development/Daily-plans/March%202026/2026-03-16/README.md)

Tasks: e-task-1 (add reason_for_visit column + wiring), e-task-2 (collect patient extras into notes).

### Booking for Others & Appointment Limits (2026-03-18)

Handle "book for my mother" (collect for other person, book under their name) and enforce 1 appointment per patient per day.

- **Reference:** [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-18/README.md](../Development/Daily-plans/March%202026/2026-03-18/README.md)

Tasks: e-task-1 (booking for someone else), e-task-2 (appointment limit per person per day).

### Bot Intelligence & Conversation UX (2026-03-25)

Make the receptionist bot context-aware and conversational (ChatGPT/Gemini-like). Hybrid AI-first approach: keep handlers for clear actions; use AI for conversational turns with richer context.

- **Reference:** [BOT_INTELLIGENCE_PLANNING.md](../Development/Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-25/README.md](../Development/Daily-plans/March%202026/2026-03-25/README.md)

Tasks: e-task-1 (AI context enhancement), e-task-2 (AI prompt improvements), e-task-3 (route ambiguous messages to AI), e-task-4 (multi-person booking "me and X"), e-task-5 (conversation history expansion), e-task-6 (hybrid extraction fallback).

### AI Receptionist — Human-Like Bot (2026-03-26)

Transform the bot from regex-heavy to AI-first: understand conversations, store data intelligently, respond like a human receptionist.

- **Reference:** [AI_RECEPTIONIST_PLAN.md](./AI_RECEPTIONIST_PLAN.md)
- **Tasks:** [docs/task-management/tasks/README.md](./tasks/README.md)

Tasks: e-task-1 (AI-first extraction with context), e-task-2 (conversation-aware extraction), e-task-3 (human-like response generation), e-task-4 (simplify regex to fast-path only).

### Teleconsultation (2026-03-21)

In-app video consultations via Twilio Video. Doctor starts call from dashboard; patient joins via link. Platform verifies both participated for payout eligibility.

- **Reference:** [TELECONSULTATION_INITIATIVE.md](./TELECONSULTATION_INITIATIVE.md), [TELECONSULTATION_PLAN.md](../Development/Daily-plans/March%202026/2026-03-21/TELECONSULTATION_PLAN.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-21/README.md](../Development/Daily-plans/March%202026/2026-03-21/README.md)

Tasks: e-task-1 (consultation migration), e-task-2 (Twilio Video service), e-task-3 (Consultation API), e-task-4 (Twilio status webhook), e-task-5 (PATCH appointment), e-task-6 (Frontend appointment + video), e-task-7 (Patient join page), e-task-8 (Send consultation link).

### Patient Identity & Matching (2026-03-27)

Patient identification, matching, deduplication, and Patients tab. Phone search + confirm (no ID required); Patient ID (MRN) as optional shortcut; doctor can merge duplicates.

- **Reference:** [PATIENT_IDENTITY_AND_MATCHING.md](../Development/Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-27/README.md](../Development/Daily-plans/March%202026/2026-03-27/README.md)

Tasks: e-task-1 (MRN column), e-task-2 (patient matching service), e-task-3 (list patients API), e-task-4 (Patients tab UI), e-task-5 (booking match confirmation), e-task-6 (merge patients), e-task-7 (patient ID in confirmation).

### Monetization — Platform Fee (2026-03-22)

Implement Clariva's platform fee: 5% + GST (hybrid: < ₹500 → ₹25 flat + GST). Store platform_fee_minor, gst_minor, doctor_amount_minor for payouts and invoicing.

- **Reference:** [MONETIZATION_INITIATIVE.md](./MONETIZATION_INITIATIVE.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-22/README.md](../Development/Daily-plans/March%202026/2026-03-22/README.md)

Tasks: e-task-1 (migration), e-task-2 (config), e-task-3 (payment service).

### Consultation Verification v2 (2026-03-23)

"Who left first" + 1-minute rule for video consultation payout eligibility. Doctor gets paid if: patient no-show, patient left first, or doctor left first but overlap ≥ 60 sec.

- **Reference:** [CONSULTATION_VERIFICATION_V2.md](./CONSULTATION_VERIFICATION_V2.md), [CONSULTATION_VERIFICATION_STRATEGY.md](./CONSULTATION_VERIFICATION_STRATEGY.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-23/README.md](../Development/Daily-plans/March%202026/2026-03-23/README.md)

Tasks: e-task-1 (migration doctor_left_at, patient_left_at), e-task-2 (env MIN_VERIFIED 60), e-task-3 (participant-disconnected), e-task-4 (tryMarkVerified logic).

### Payout Initiative (2026-03-24)

Doctor payouts with configurable schedule: per appointment, daily, weekly, or monthly. Uses Razorpay Route for India. Pay only after consultation verified.

- **Reference:** [PAYOUT_INITIATIVE.md](./PAYOUT_INITIATIVE.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-24/README.md](../Development/Daily-plans/March%202026/2026-03-24/README.md)

Tasks: e-task-1 (payments payout columns), e-task-2 (doctor payout settings migration), e-task-3 (Razorpay Route adapter), e-task-4 (payout service + trigger on verified), e-task-5 (scheduled batch payouts), e-task-6 (doctor payout settings API).

### Prescription V1 (2026-03-28)

Structured SOAP prescription + photo upload (parchi). Store under patient; send to patient via Instagram DM and email; show previous prescriptions on appointment view.

- **Reference:** [PRESCRIPTION_EHR_PLAN.md](../Development/Daily-plans/March%202026/2026-03-23/PRESCRIPTION_EHR_PLAN.md)
- **Daily plan:** [docs/Development/Daily-plans/March 2026/2026-03-28/README.md](../Development/Daily-plans/March%202026/2026-03-28/README.md)

Tasks: e-task-1 (prescription migration), e-task-2 (prescription service & API), e-task-3 (photo storage), e-task-4 (prescription form UI), e-task-5 (send to patient), e-task-6 (previous prescriptions view), e-task-7 (integration & README).

---

## 🔗 Related Documentation

- [Task Management Guide](./TASK_MANAGEMENT_GUIDE.md)
- [Task Template](./TASK_TEMPLATE.md)
- [Code Change Rules](./CODE_CHANGE_RULES.md) — when changing existing code
- [Coding Standards](../Reference/STANDARDS.md)
- [Architecture Guide](../Reference/ARCHITECTURE.md)
- [Recipes](../Reference/RECIPES.md)
- [Compliance Guide](../Reference/COMPLIANCE.md)

---

**Last Updated:** 2026-03-28  
**Version:** 2.6.0 (Added Prescription V1 initiative)
