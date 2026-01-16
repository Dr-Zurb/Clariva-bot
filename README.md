# Clariva Bot

**Digital infrastructure for doctors operating on social media** (DMs, WhatsApp, Instagram, etc.)

Clariva is a healthcare SaaS platform that helps doctors manage patient interactions, appointments, and administrative workflows through social media channels.

## 🏗️ Project Structure

```
clariva-bot/
├── backend/          # Express.js + TypeScript backend API
├── frontend/         # Frontend application (to be implemented)
└── docs/             # Project documentation
    ├── Reference/    # Coding standards, architecture, recipes, compliance
    ├── Development/  # Development plans and task tracking
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

### Environment Variables

Required environment variables (see `.env.example`):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## 📚 Documentation

### Reference Documentation
- **[STANDARDS.md](docs/Reference/STANDARDS.md)** - Coding standards and requirements
- **[ARCHITECTURE.md](docs/Reference/ARCHITECTURE.md)** - Project architecture and structure
- **[RECIPES.md](docs/Reference/RECIPES.md)** - Implementation patterns and recipes
- **[COMPLIANCE.md](docs/Reference/COMPLIANCE.md)** - Compliance and governance guide

### Development Plans
- **[Monthly Plan](docs/Development/Monthly-plans/2025-01-09_1month_dev_plan.md)** - Current development roadmap
- **[Daily Tasks](docs/Development/Daily-plans/)** - Daily task breakdowns

### Task Management
- **[Task Management Guide](docs/task-management/TASK_MANAGEMENT_GUIDE.md)** - How to create and track tasks
- **[Task Template](docs/task-management/TASK_TEMPLATE.md)** - Template for new tasks

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

### Completed (Tasks 1-5)
- ✅ Project setup and configuration
- ✅ Express server with TypeScript
- ✅ Supabase database integration
- ✅ Project structure (Controller Pattern)
- ✅ Testing and verification

### In Progress
- 🚧 Additional features and endpoints

## 📋 Development Workflow

1. Review [TASK_MANAGEMENT_GUIDE.md](docs/task-management/TASK_MANAGEMENT_GUIDE.md)
2. Create tasks using [TASK_TEMPLATE.md](docs/task-management/TASK_TEMPLATE.md)
3. Follow [STANDARDS.md](docs/Reference/STANDARDS.md) for coding rules
4. Reference [ARCHITECTURE.md](docs/Reference/ARCHITECTURE.md) for structure
5. Use [RECIPES.md](docs/Reference/RECIPES.md) for implementation patterns

## 🔒 Compliance

This project follows healthcare SaaS compliance standards:
- HIPAA-aligned design
- GDPR/DPDPA principles
- Data classification and lifecycle management
- Audit logging
- Access control (RBAC, RLS)
- AI safety and governance

See [COMPLIANCE.md](docs/Reference/COMPLIANCE.md) for details.

## 📝 License

ISC

## 👤 Author

Dr Abhishek Sahil

---

**Repository:** [https://github.com/Dr-Zurb/Clariva-bot](https://github.com/Dr-Zurb/Clariva-bot)
