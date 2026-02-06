# Developer Learning Guide

**Your personal roadmap from beginner to expert-level founder-developer.**

---

## 📚 What's in This Guide?

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[LEARNING_PATH.md](./LEARNING_PATH.md)** | 16-week curriculum | Start here. Follow the phases. |
| **[CONCEPTS_GLOSSARY.md](./CONCEPTS_GLOSSARY.md)** | 50+ terms explained | When you encounter unknown terms |
| **[PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md)** | Top 10 code patterns | When building any feature |
| **[COMMON_MISTAKES.md](./COMMON_MISTAKES.md)** | 13 mistakes to avoid | Before committing code |
| **[HOW_TO_READ_CODEBASE.md](./HOW_TO_READ_CODEBASE.md)** | Project map + navigation | When lost or exploring |
| **[DECISION_JOURNAL.md](./DECISION_JOURNAL.md)** | Why we made choices | When curious "why this way?" |
| **[RESOURCES.md](./RESOURCES.md)** | External learning links | When going deeper |
| **[DAILY_HABITS.md](./DAILY_HABITS.md)** | Daily/weekly/monthly habits | Every day — build consistency |
| **[HOW_TO_WORK_WITH_AI.md](./HOW_TO_WORK_WITH_AI.md)** | How to work with AI for elite code | Every time you ask AI for code |
| **[CHEAT_SHEET.md](./CHEAT_SHEET.md)** | Quick reference | Keep open while coding |

---

## 🚀 Quick Start

### Day 1: Setup
1. Read [LEARNING_PATH.md](./LEARNING_PATH.md) — understand the journey
2. Read [HOW_TO_READ_CODEBASE.md](./HOW_TO_READ_CODEBASE.md) — know the project structure
3. Bookmark [CHEAT_SHEET.md](./CHEAT_SHEET.md) — keep it handy

### Daily Routine
1. Follow [DAILY_HABITS.md](./DAILY_HABITS.md) — morning, coding, evening rituals
2. Use [HOW_TO_WORK_WITH_AI.md](./HOW_TO_WORK_WITH_AI.md) — when asking AI for code (context, prompts, review)
3. Reference [PATTERNS_I_NEED_TO_KNOW.md](./PATTERNS_I_NEED_TO_KNOW.md) — when building features
4. Check [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — before committing

### When Stuck
1. Check [CONCEPTS_GLOSSARY.md](./CONCEPTS_GLOSSARY.md) — understand the term
2. Check [HOW_TO_READ_CODEBASE.md](./HOW_TO_READ_CODEBASE.md) — find the relevant code
3. Check [RESOURCES.md](./RESOURCES.md) — learn more about the topic

---

## 🎯 Your Learning Journey

```
Week 1-4:   Foundations (TypeScript, Express)
            ↓
Week 5-8:   Database & Async (Supabase, Promises)
            ↓
Week 9-12:  Quality & Security (Testing, HIPAA)
            ↓
Week 13-16: Production (Performance, Deployment)
            ↓
Ongoing:    Expert Areas (Payments, AI, Compliance)
```

---

## 📊 How This Fits Together

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR LEARNING SYSTEM                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ LEARNING_    │    │ PATTERNS &   │    │ DAILY_    │  │
│  │ PATH.md      │───▶│ GLOSSARY     │───▶│ HABITS.md │  │
│  │ (What to     │    │ (How to      │    │ (When to  │  │
│  │  learn)      │    │  code)       │    │  do it)   │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│         │                   │                   │        │
│         ▼                   ▼                   ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ RESOURCES.md │    │ COMMON_      │    │ CHEAT_    │  │
│  │ (Deep        │    │ MISTAKES.md  │    │ SHEET.md  │  │
│  │  learning)   │    │ (Avoid       │    │ (Quick    │  │
│  │              │    │  these)      │    │  reference)│  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│                                                          │
│         ┌──────────────────────────────┐                │
│         │  HOW_TO_READ_CODEBASE.md     │                │
│         │  (Navigate the project)       │                │
│         └──────────────────────────────┘                │
│                                                          │
│         ┌──────────────────────────────┐                │
│         │  DECISION_JOURNAL.md         │                │
│         │  (Understand past decisions)  │                │
│         └──────────────────────────────┘                │
│                                                          │
└─────────────────────────────────────────────────────────┘

        ┌─────────────────────────────────────────┐
        │         docs/Reference/*                │
        │  (AI agent reference — detailed rules)  │
        └─────────────────────────────────────────┘
```

---

## ✅ Checklist: Are You Following the System?

### Daily
- [ ] Set morning goal
- [ ] Code in focused blocks
- [ ] Commit after each logical unit
- [ ] Push to GitHub before bed
- [ ] Update task file

### Weekly
- [ ] Review last week
- [ ] Plan next week
- [ ] Check your code quality
- [ ] Create one piece of content

### Monthly
- [ ] Run full test suite
- [ ] Review metrics
- [ ] Update documentation
- [ ] Set next month's goal

---

## 🤖 Working With AI for Elite Code

When you ask Cursor (or any AI) for code:

1. **Read [HOW_TO_WORK_WITH_AI.md](./HOW_TO_WORK_WITH_AI.md)** — how to give context (@ task, @ Reference, @ files), how to phrase prompts, and how to review.
2. **@-mention** the task file, the relevant Reference doc (e.g. STANDARDS.md, TESTING.md), and the file(s) to change.
3. **Review every suggestion** — run `npm run type-check`, `npm test`, and check for PHI/secrets before committing.

Elite/global code comes from **you** setting the bar and giving the AI the right context and instructions.

---

## 💡 Pro Tips

### 1. Don't Read Everything at Once
Use documents as reference, not textbook. Read when you need.

### 2. CHEAT_SHEET is Your Best Friend
Keep it open in a tab. Refer to it constantly.

### 3. Commit Messages Tell a Story
Future you reads `git log`. Make it useful.

### 4. Habits > Motivation
Motivation fades. Habits compound. Follow DAILY_HABITS.md.

### 5. Ask AI "Why?"
When you see code you don't understand, ask "explain this code to me". Learn, don't just copy.

---

## 🔗 Related Documentation

| Folder | Purpose |
|--------|---------|
| `docs/Reference/` | AI agent reference (detailed rules, patterns, compliance) |
| `docs/task-management/` | Task creation and tracking |
| `docs/Development/` | Daily and monthly plans |
| `docs/Business files/` | Business plan, pricing |

---

**Built for:** Solo founders learning to code while building real products.

**Philosophy:** Learn what you need, when you need it. Small daily actions compound.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
