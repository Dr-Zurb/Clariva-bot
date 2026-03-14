# Local Testing Workflow — Test Before Deploy

Use this workflow to validate changes locally **before** pushing to GitHub and deploying. Saves time by catching issues early.

## Quick Pre-Push Checklist (30 seconds)

Run these in `backend/` before every push:

```bash
cd backend
npm run build      # Catches TypeScript errors (what broke your last deploy)
npm test           # Runs unit tests
```

If both pass → safe to push and deploy.

---

## Full Local Dev Setup

### 1. Backend (API + Worker)

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Supabase, OpenAI, Redis, etc.
```

**Run locally:**
```bash
npm run dev        # Starts API + webhook worker (nodemon, auto-reload on save)
```

- API: `http://localhost:3000`
- Worker processes webhook jobs from Redis queue

### 2. Redis (for webhook queue)

Webhook processing needs Redis. Options:

- **Docker:** `docker run -d -p 6379:6379 redis`
- **Windows:** Install Redis via WSL or [Memurai](https://www.memurai.com/) (Redis-compatible)
- **Skip:** Leave `REDIS_URL` unset → placeholder queue (jobs logged, not processed)

For **full booking flow** locally, Redis is required.

### 3. Test Instagram Webhooks Locally (optional)

To test the bot with real Instagram DMs:

1. Run backend: `npm run dev`
2. Expose localhost: [ngrok](https://ngrok.com/) → `ngrok http 3000`
3. In Meta Developer Console, set webhook URL to your ngrok URL (e.g. `https://abc123.ngrok.io/api/v1/webhooks/instagram`)
4. Send DMs to your bot → webhooks hit your local server

---

## Recommended Workflow

| Step | Command | Purpose |
|------|---------|---------|
| 1. Make changes | — | Edit code |
| 2. Build | `npm run build` | Catch TS errors |
| 3. Test | `npm test` | Catch logic bugs |
| 4. Run locally | `npm run dev` | Manual / webhook testing |
| 5. Push | `git push` | Only when 1–4 pass |

---

## One-Liner Before Push

```bash
cd backend && npm run build && npm test
```

If this exits 0 → push. If it fails → fix first.

---

## Optional: Pre-Push Git Hook

To **block** pushes when build or tests fail:

```bash
# backend/.husky/pre-push (if using husky) or .git/hooks/pre-push
#!/bin/sh
cd backend && npm run build && npm test
```

Or add to `package.json`:

```json
"scripts": {
  "prepush": "npm run build && npm test"
}
```

Then run `npm run prepush` before `git push`.
