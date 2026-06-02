# Developer Cheat Sheet

**Keep this open while coding. Quick reference for daily actions.**

---

## 🔥 Git Commands You'll Use Daily

```bash
# Start of day - get latest
git pull origin main

# See what you changed
git status
git diff

# Save your work (do this often!)
git add .
git commit -m "feat(scope): description"

# Push to GitHub (at least once per day!)
git push origin main

# See recent commits
git log --oneline -10

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard changes to a file
git checkout -- filename.ts
```

---

## 📝 Commit Message Format

```
type(scope): description

Types:
- feat     → New feature
- fix      → Bug fix
- test     → Adding tests
- docs     → Documentation
- refactor → Code change (no new feature)
- chore    → Maintenance

Examples:
git commit -m "feat(payments): add razorpay adapter"
git commit -m "fix(webhook): handle duplicate events"
git commit -m "test(payments): add gateway routing tests"
git commit -m "docs(readme): update setup instructions"
```

---

## 🏃 NPM Commands

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run tests
npm test
npm run test:watch    # Watch mode
npm run test:coverage # With coverage

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix      # Auto-fix issues

# Build for production
npm run build
```

---

## 🔍 Where to Find Things

| I need to... | Look in... |
|--------------|------------|
| Add API endpoint | `src/routes/api/v1/` |
| Handle request | `src/controllers/` |
| Business logic | `src/services/` |
| Database query | `src/services/` (uses Supabase) |
| Add validation | `src/utils/validation.ts` |
| Define types | `src/types/` |
| Add env var | `src/config/env.ts` + `.env` |
| Handle webhook | `src/controllers/webhook-controller.ts` |
| Process queue job | `src/workers/webhook-worker.ts` |

---

## ✅ Before Every Commit

```
[ ] No console.log (use logger instead)
[ ] No hardcoded secrets
[ ] No PHI in logs
[ ] Types are correct (no any without reason)
[ ] Tests pass: npm test
[ ] Types pass: npm run type-check
```

---

## ✅ Before Every Push

```
[ ] All commits have good messages
[ ] Task file updated with progress
[ ] No sensitive files in commit
[ ] Tests pass locally
```

---

## ✅ End of Day

```
[ ] Code committed
[ ] Pushed to GitHub
[ ] Task file updated
[ ] Tomorrow's plan written
```

---

## 🚨 Common Errors & Fixes

### "Cannot find module"
```bash
npm install  # Install dependencies
```

### "Type error: X is not assignable to Y"
```typescript
// Check your types match
// Use correct interface
// Add type assertion if needed: value as Type
```

### "Supabase error: supabaseUrl required"
```bash
# Check .env has SUPABASE_URL set
# Restart dev server after .env change
```

### "Jest test timeout"
```typescript
// Increase timeout for slow tests
it('slow test', async () => { ... }, 30000);
```

### "Git push rejected"
```bash
git pull origin main  # Get remote changes first
git push origin main  # Then push
```

---

## 🧪 Quick Test Patterns

```typescript
// Basic test
it('does something', () => {
  const result = myFunction(input);
  expect(result).toBe(expected);
});

// Async test
it('does async thing', async () => {
  const result = await myAsyncFunction();
  expect(result).toBeDefined();
});

// Test error thrown
it('throws on invalid input', () => {
  expect(() => myFunction(badInput)).toThrow(ValidationError);
});

// Test async error
it('throws async error', async () => {
  await expect(myAsyncFunction(badInput)).rejects.toThrow();
});
```

---

## 📊 Supabase Quick Reference

```typescript
// Select
const { data } = await supabase
  .from('appointments')
  .select('*')
  .eq('doctor_id', doctorId);

// Insert
const { data } = await supabase
  .from('appointments')
  .insert({ patient_name, doctor_id })
  .select()
  .single();

// Update
const { data } = await supabase
  .from('appointments')
  .update({ status: 'confirmed' })
  .eq('id', appointmentId)
  .select()
  .single();

// Delete
const { error } = await supabase
  .from('appointments')
  .delete()
  .eq('id', appointmentId);
```

---

## 🛡️ Security Quick Check

**NEVER:**
- Log patient names, phones, DOB
- Hardcode API keys or secrets
- Trust webhook without signature check
- Skip RLS or ownership checks
- Use `any` without good reason

**ALWAYS:**
- Use env vars for secrets
- Validate input with Zod
- Verify webhook signatures
- Check user owns the resource
- Use asyncHandler for routes

---

## 🔗 Quick Links

| Document | Use When... |
|----------|-------------|
| [HOW_TO_WORK_WITH_AI](./HOW_TO_WORK_WITH_AI.md) | Asking AI for code — context, prompts, review |
| [PATTERNS_I_NEED_TO_KNOW](./PATTERNS_I_NEED_TO_KNOW.md) | Building a feature |
| [COMMON_MISTAKES](./COMMON_MISTAKES.md) | Reviewing code |
| [CONCEPTS_GLOSSARY](./CONCEPTS_GLOSSARY.md) | Unknown term |
| [HOW_TO_READ_CODEBASE](./HOW_TO_READ_CODEBASE.md) | Lost in code |
| [DAILY_HABITS](./DAILY_HABITS.md) | Planning day/week |

---

## 🎯 Today's Checklist

```
Date: _______________

Goal: ________________________________

Morning:
[ ] Reviewed yesterday
[ ] Set today's goal
[ ] Checked task file

Coding:
[ ] ________________________________
[ ] ________________________________
[ ] ________________________________

Evening:
[ ] Code committed
[ ] Pushed to GitHub
[ ] Task file updated
[ ] Tomorrow's plan: ________________
```

---

**Print this or keep it open in a tab!**
