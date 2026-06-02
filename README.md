# Clariva Bot

**Digital infrastructure for doctors operating on social media** (DMs, WhatsApp, Instagram, etc.)

Clariva is a healthcare SaaS platform that helps doctors manage patient interactions, appointments, and administrative workflows through social media channels.

## 🏗️ Project Structure

```
clariva-bot/
├── backend/          # Express.js + TypeScript backend API
├── frontend/         # Next.js Doctor Dashboard (TypeScript, Tailwind)
└── docs/             # Project documentation
    ├── README.md     # Start here
    ├── Reference/    # Canonical truth (business, engineering, product)
    ├── Work/         # Daily plans, product plans, capture, process
    ├── Onboarding/   # New developer guides
    └── Archive/      # Superseded docs (read-only)
    └── task-management/ # Task management system
```

## 🚀 Quick Start

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

### Frontend Setup

The Doctor Dashboard runs as a separate app in `frontend/`:

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_* (see frontend/README.md)
npm run dev
```

Frontend dev server: [http://localhost:3000](http://localhost:3000). Backend runs separately (e.g. port 3001); see `frontend/README.md` for env vars and run instructions.

### Environment Variables

Required environment variables (see `backend/.env.example`):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

**For AI features (intent detection, response generation):**
- `OPENAI_API_KEY` - OpenAI API key (required for AI features)

**For webhook queue (async processing):**
- `REDIS_URL` - Redis connection URL (e.g. `redis://localhost:6379`); omit to use placeholder queue

**For full conversation flow (e-task-3):**
- `DEFAULT_DOCTOR_ID` - UUID of the doctor for MVP single-tenant; omit to send fallback reply only

**For dead letter queue (failed webhook storage):**
- `ENCRYPTION_KEY` - Base64-encoded 32-byte key for payload encryption at rest

## 📚 Documentation

### Reference Documentation
- **[STANDARDS.md](docs/Reference/engineering/development/STANDARDS.md)** - Coding standards and requirements
- **[ARCHITECTURE.md](docs/Reference/engineering/architecture/ARCHITECTURE.md)** - Project architecture and structure
- **[RECIPES.md](docs/Reference/engineering/development/RECIPES.md)** - Implementation patterns and recipes
- **[COMPLIANCE.md](docs/Reference/engineering/compliance/COMPLIANCE.md)** - Compliance and governance guide

### Development Plans
- **[Docs index](docs/README.md)** — full map
- **[Daily plans](docs/Work/Daily-plans/)** — active execution batches
- **[Product plans](docs/Work/Product%20plans/)** — multi-phase product plans
- **[Capture inbox](docs/Work/capture/inbox.md)** — park ideas for triage

### Task Management
- **[Task Management Guide](docs/Work/process/TASK_MANAGEMENT_GUIDE.md)** - How to create and track tasks
- **[Task Template](docs/Work/process/TASK_TEMPLATE.md)** - Template for new tasks

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Logging:** Pino
- **Validation:** Zod
- **Error Handling:** Custom AppError classes

### Architecture
- **Pattern:** Controller Pattern (routes → controllers → services)
- **Middleware:** Correlation ID, request timing
- **Error Handling:** Centralized error middleware
- **Logging:** Structured logging with correlation IDs

## ✅ Current Status

### Completed (Tasks 1-6, Week 2)
- ✅ Project setup and configuration
- ✅ Express server with TypeScript
- ✅ Supabase database integration
- ✅ Project structure (Controller Pattern)
- ✅ Instagram webhook integration
- ✅ AI intent detection and conversation flow
- ✅ Patient information collection (Zod validation)
- ✅ Consent and patient storage (consent before PHI persist, revocation)
- ✅ Testing and verification (102 unit tests)

## 📋 Development Workflow

1. Review [TASK_MANAGEMENT_GUIDE.md](docs/Work/process/TASK_MANAGEMENT_GUIDE.md)
2. Create tasks using [TASK_TEMPLATE.md](docs/Work/process/TASK_TEMPLATE.md)
3. Follow [STANDARDS.md](docs/Reference/engineering/development/STANDARDS.md) for coding rules
4. Reference [ARCHITECTURE.md](docs/Reference/engineering/architecture/ARCHITECTURE.md) for structure
5. Use [RECIPES.md](docs/Reference/engineering/development/RECIPES.md) for implementation patterns

## 🔒 Compliance

This project follows healthcare SaaS compliance standards:
- HIPAA-aligned design
- GDPR/DPDPA principles
- Data classification and lifecycle management
- Audit logging
- Access control (RBAC, RLS)
- AI safety and governance

See [COMPLIANCE.md](docs/Reference/engineering/compliance/COMPLIANCE.md) for details.

## 📝 License

ISC

## 👤 Author

Dr Abhishek Sahil

---

**Repository:** [https://github.com/Dr-Zurb/Clariva-bot](https://github.com/Dr-Zurb/Clariva-bot)
