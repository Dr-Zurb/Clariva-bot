# Daily, Weekly & Monthly Habits for Success

**Purpose:** Consistent habits that turn a beginner into a successful founder-developer. Follow these to build Clariva Care into a thriving business.

**Philosophy:** Small daily actions compound. A 1% improvement daily = 37x improvement in a year.

---

## ☀️ Daily Habits (Every Coding Day)

### Morning Ritual (15-30 min before coding)

**1. Review yesterday's work (5 min)**
```
- What did I complete?
- What's still pending?
- Any blockers?
```

**2. Set today's goal (5 min)**
```
- ONE main thing I will finish today
- Write it down (sticky note, Notion, or task file)
- Be specific: "Complete payment webhook handler" not "work on payments"
```

**3. Check task file (5 min)**
```
- Open today's task file (docs/Development/Daily-plans/YYYY-MM-DD/)
- Review subtasks
- Identify dependencies (do I need anything from external services?)
```

---

### During Coding Sessions

**4. Code in focused blocks (Pomodoro: 25 min work, 5 min break)**

Why: Your brain works better in sprints, not marathons.

```
Session 1: [25 min] Implement feature
Break: [5 min] Stand, stretch, water
Session 2: [25 min] Continue implementing
Break: [5 min] Quick walk
Session 3: [25 min] Write tests
Break: [15 min] Longer break

Repeat 2-3 cycles per day
```

**5. Commit early, commit often**

Rule: Commit after every logical unit of work (not at end of day).

```bash
# Good commit rhythm
git add src/services/payment-service.ts
git commit -m "feat(payments): add gateway routing by country"

git add src/adapters/razorpay-adapter.ts
git commit -m "feat(payments): implement razorpay adapter"

git add tests/unit/services/payment-service.test.ts
git commit -m "test(payments): add gateway routing tests"
```

Why:
- Small commits are easy to review
- Easy to revert if something breaks
- Shows progress (motivating!)
- Protects your work (if laptop dies, code is safe)

**6. Push to GitHub at least once per day**

```bash
# Before ending your coding session
git push origin main
```

Why:
- Backup in the cloud
- Can continue from another device
- Shows activity (future investors/employers see your commit history)

---

### End of Day Ritual (15 min)

**7. Review your code (5 min)**

Before pushing, read your own diff:
```bash
git diff HEAD~3  # See last 3 commits
```

Check for:
- [ ] Any `console.log` left in?
- [ ] Any hardcoded secrets?
- [ ] Any PHI that might be logged?
- [ ] Any `any` types without good reason?

**8. Update task file (5 min)**

Mark what's done:
```markdown
- [x] 1.1 Implement gateway routing ✅ 2026-02-01
- [x] 1.2 Add Razorpay adapter ✅ 2026-02-01
- [ ] 1.3 Add PayPal adapter (in progress)
```

**9. Write tomorrow's plan (5 min)**

Before closing laptop:
```
Tomorrow I will:
1. Finish PayPal adapter
2. Write webhook handler tests
3. Test with ngrok
```

Why: Your brain works on problems while you sleep. Give it clear instructions.

**10. Push final changes**

```bash
git add .
git commit -m "wip: paypal adapter in progress"
git push origin main
```

---

## 📆 Weekly Habits (Every Sunday or Monday)

### Weekly Planning (30-60 min)

**1. Review last week (15 min)**

Answer these questions:
```
✅ What did I complete?
   - List actual deliverables (features, tests, docs)

❌ What didn't I complete? Why?
   - Was it too ambitious?
   - Did I get blocked?
   - Did priorities change?

📚 What did I learn?
   - New technical concept
   - Mistake I won't repeat
   - Pattern that worked well

🚧 What blocked me?
   - External dependencies (waiting for API access?)
   - Knowledge gaps (need to learn X?)
   - Motivation/energy?
```

**2. Plan next week (15 min)**

```
This week's theme: [e.g., "Payment Integration"]

Must complete (top 3):
1. ________________________
2. ________________________
3. ________________________

Nice to have:
- ________________________
- ________________________

Learning goal:
- ________________________ (e.g., "Understand webhook idempotency")
```

**3. Check dependencies (10 min)**

```
Do I need:
- [ ] API keys from external services?
- [ ] Design decisions made?
- [ ] Clarification on requirements?
- [ ] Help from anyone?

If yes, request/schedule NOW (don't wait until you're blocked)
```

**4. Update monthly plan (5 min)**

Check `docs/Development/Monthly-plans/` — are you on track?

---

### Weekly Code Review (30 min)

**Review your own week's code:**

```bash
# See all commits this week
git log --since="1 week ago" --oneline

# See all changed files
git diff HEAD~20 --stat  # Adjust number based on commits
```

**Check for:**
- [ ] Any patterns I'm repeating that should be extracted?
- [ ] Any tests missing for critical code?
- [ ] Any TODOs I forgot about?
- [ ] Code I wrote Monday that I'd write differently now?

**Update if needed** — it's cheaper to fix now than later.

---

### Weekly GitHub Hygiene (15 min)

**1. Check your branches**
```bash
git branch  # See local branches
git branch -d feature/old-branch  # Delete merged branches
```

**2. Check your repository**
- Is README up to date?
- Is .env.example current?
- Any sensitive files accidentally committed?

**3. Check GitHub Issues (if using)**
- Close completed issues
- Add new issues for discovered bugs/tasks

---

## 📅 Monthly Habits (First Weekend of Month)

### Monthly Retrospective (1-2 hours)

**1. Metrics Review (15 min)**

Track these numbers:
```
Code Metrics:
- Commits this month: ___
- Features completed: ___
- Tests written: ___
- Bugs fixed: ___

Time Metrics:
- Hours coded: ___
- Hours learning: ___
- Hours stuck/blocked: ___

Quality Metrics:
- Production incidents: ___
- Rollbacks needed: ___
```

**2. Goal Review (15 min)**

```
Monthly goal was: ________________________
Did I achieve it? Yes / Partially / No

If not, why?



- ________________________
- ________________________

What would I do differently?
- ________________________
```

**3. Learning Review (15 min)**

```
This month I learned:
1. ________________________
2. ________________________
3. ________________________

This month I struggled with:
1. ________________________
2. ________________________

Next month I want to learn:
1. ________________________
```

**4. Codebase Health Check (30 min)**

```bash
# Run all tests
npm test

# Check for type errors
npm run type-check

# Check for lint errors
npm run lint

# Check for outdated dependencies
npm outdated

# Check for security vulnerabilities
npm audit
```

Fix any issues found.

**5. Documentation Update (15 min)**

- Is docs/Reference/* still accurate?
- Any new patterns that should be documented?
- Update DECISION_JOURNAL.md with any new decisions

**6. Set Next Month's Goal (15 min)**

```
Next month's theme: ________________________

Main goal: ________________________

Stretch goal: ________________________

Key milestones:
- Week 1: ________________________
- Week 2: ________________________
- Week 3: ________________________
- Week 4: ________________________
```

---

## 📊 Business Habits (For Founder Success)

### Daily Business Habits (15 min)

**1. Check metrics (5 min)**
```
- Any new signups? (when you have users)
- Any support requests?
- Any feedback/reviews?
```

**2. One customer touchpoint (10 min)**

Even before launch:
- Post on social media about your progress
- Reply to a comment in a doctor's community
- Send a message to a potential beta tester
- Read what doctors are complaining about online

Why: Building in public creates accountability and early customers.

---

### Weekly Business Habits (1 hour)

**1. Content/Marketing (30 min)**

Create ONE piece of content:
- Tweet thread about what you're building
- LinkedIn post about a problem you solved
- Short video demo of a feature
- Blog post about your journey

Why: Doctors will find you when you're visible.

**2. Customer Research (30 min)**

- Read 5 posts in doctor communities (Reddit, Facebook groups, Twitter)
- Note their pain points
- Look for feature ideas
- Find potential beta testers

---

### Monthly Business Habits (2-3 hours)

**1. Business Metrics Review**

```
Revenue (when launched):
- MRR: ₹_______ / $______
- New customers: ___
- Churned customers: ___
- Net new: ___

Growth:
- Website visitors: ___
- Signups: ___
- Conversion rate: ___%

Support:
- Tickets: ___
- Avg response time: ___
- Common issues: ___
```

**2. Competitive Analysis**

- What are competitors doing?
- Any new features in the market?
- Any new competitors?
- What can I learn from them?

**3. Pricing Review**

- Is pricing right?
- Any feedback on pricing?
- Should I adjust tiers?

**4. Roadmap Review**

- Is the roadmap still right?
- Any features customers are asking for?
- Any features I should deprioritize?

---

## 🗓️ Sample Week Schedule

Here's what a good week looks like:

### Monday
- [ ] Morning: Weekly planning (30 min)
- [ ] Code: Start weekly task
- [ ] Evening: Push code

### Tuesday
- [ ] Morning: Continue coding
- [ ] Code: Implement feature
- [ ] Evening: Push code

### Wednesday
- [ ] Morning: Code review (own code)
- [ ] Code: Write tests
- [ ] Evening: Push code

### Thursday
- [ ] Morning: Continue coding
- [ ] Code: Complete feature
- [ ] Evening: Push code

### Friday
- [ ] Morning: Polish & document
- [ ] Code: Clean up, add comments
- [ ] Evening: Push code, update task file

### Saturday (Optional)
- [ ] Learning: Study one topic from RESOURCES.md
- [ ] Or: Rest (important!)

### Sunday
- [ ] Weekly review (1 hour)
- [ ] Content creation (30 min)
- [ ] Plan next week

---

## ✅ Habit Checklists

### Daily Checklist
```
Morning:
[ ] Review yesterday
[ ] Set today's goal
[ ] Check task file

During:
[ ] Code in focused blocks
[ ] Commit after each unit
[ ] Test as I go

Evening:
[ ] Review my code
[ ] Update task file
[ ] Push to GitHub
[ ] Write tomorrow's plan
```

### Weekly Checklist
```
[ ] Weekly planning session
[ ] Review last week
[ ] Plan next week
[ ] Code review (own code)
[ ] GitHub hygiene
[ ] One piece of content
[ ] Customer research
```

### Monthly Checklist
```
[ ] Monthly retrospective
[ ] Metrics review
[ ] Codebase health check
[ ] Documentation update
[ ] Set next month's goals
[ ] Business metrics review
[ ] Competitive analysis
```

---

## 🎯 The Non-Negotiables

If you're short on time, NEVER skip these:

### Daily (5 min minimum)
1. **Push to GitHub** — protects your work
2. **Update task file** — maintains clarity

### Weekly (30 min minimum)
1. **Weekly review** — prevents drift
2. **GitHub push** — ensures code is safe

### Monthly (1 hour minimum)
1. **Run tests and type-check** — catches issues
2. **Set next month's goal** — maintains direction

---

## 🚫 Anti-Habits (Things to Avoid)

### Don't Do These:

**1. "I'll commit tomorrow"**
- You'll forget what you changed
- Risk losing work
- Commits become huge and confusing

**2. "I'll write tests later"**
- You never will
- Bugs ship to production
- Technical debt accumulates

**3. "I'll document when it's done"**
- You'll forget the reasoning
- Future you will be confused
- AI assistant won't know the context

**4. "I'll refactor after launch"**
- You'll be too busy with customers
- Bad code becomes permanent
- Refactoring becomes scary

**5. "I'll take a break after this feature"**
- Burnout is real
- Take breaks DURING work
- Pomodoro technique works

---

## 📈 Tracking Your Habits

Create a simple habit tracker:

### Weekly Tracker (Example)
```
Week of: 2026-02-03

              Mon Tue Wed Thu Fri Sat Sun
Morning plan   ✓   ✓   ✓   ✓   ✓   -   -
Focused coding ✓   ✓   ✓   ✓   ✓   -   -
Daily commit   ✓   ✓   ✓   ✓   ✓   -   -
Push to GitHub ✓   ✓   ✓   ✓   ✓   -   -
Task file      ✓   ✓   ✓   ✓   ✓   -   -
Weekly review  -   -   -   -   -   -   ✓

Streak: 5 days
```

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — What to learn
- [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — What to avoid
- [../../task-management/TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) — Task workflow

---

**Remember:** Consistency beats intensity. 1 hour daily for 6 months beats 12-hour weekend sprints.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
