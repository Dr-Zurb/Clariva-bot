# Fast-iteration dev environment — local + Cloudflare Tunnel

**Created:** 2026-04-23  \
**Owner:** Dr Abhishek Sahil (solo dev)  \
**Purpose:** Cut the edit-to-see-change loop from **2–5 min** (push → Render rebuild → test) down to **1–2 seconds** (save → hot reload) while still keeping IG DM / Twilio / Razorpay webhooks reachable from the public internet.

---

## Why this matters

### Current pain (what you described)

1. Make a code change in Cursor.
2. `git push` — 5–15 s.
3. Render picks up the webhook — 10–30 s.
4. `npm install` in fresh container — 30–90 s.
5. `tsc` build — 30–60 s.
6. Container boot + first-request cold start — 15–35 s.
7. Test the change.
8. Usually: realize something small is off, back to step 1.

Total per iteration: **~2–4 min**, often more on Render free tier (the `hibernate` suffix in your service hostname = free-tier sleep → cold wake adds 30–60 s).

### What this doc delivers

- **Two terminals in Cursor running `npm run dev`** — backend restarts in ~1 s on save; frontend React Fast-Refresh in <500 ms with component state preserved.
- **Cloudflare Tunnel** exposing `localhost:3001` to the public internet so Meta, Twilio, and Razorpay can still deliver webhooks to your laptop.
- **Working pattern for env vars** — local `.env` overrides, production stays untouched on Render/Vercel.
- **Rule for when you still need to push** (migrations, env changes, prod smoke-test).

---

## Architecture at a glance

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  Your laptop (Windows)                                          │
 │                                                                 │
 │  ┌──────────────────┐       ┌──────────────────────────────┐   │
 │  │ Next.js frontend │──────▶│  Backend (Express + TS)      │   │
 │  │ localhost:3000   │ http  │  localhost:3001              │   │
 │  └──────────────────┘       │  ↑                            │   │
 │                             │  │  (express routes,          │   │
 │                             │  │   pino logs in terminal)   │   │
 │                             └──┼───────────────────────────┘   │
 │                                │                               │
 │                                │  requests from outside world  │
 │                                │                               │
 │                       ┌────────┴────────┐                      │
 │                       │ cloudflared     │ (tunnel binary)      │
 │                       └────────┬────────┘                      │
 │                                │                               │
 └────────────────────────────────┼───────────────────────────────┘
                                  │ persistent outbound conn to
                                  │ Cloudflare edge
                                  ▼
            https://<random>.trycloudflare.com   ◀───── Instagram webhook
                                                 ◀───── Twilio status callback
                                                 ◀───── Razorpay payment webhook
```

- Outbound only — no port forwarding, no firewall changes, no public IP needed.
- Supabase + Razorpay + Twilio + Meta are **the same cloud services** you're hitting from Render; you just point a different origin at them for dev.

---

## Prerequisites (verify once)

- [ ] **Node.js 20.x or 22.x** installed — check with `node -v` (backend `engines.node: "18.x || 20.x || 22.x"`, frontend same).
- [ ] **Cursor / VS Code terminal opens PowerShell** (confirm the prompt shows `PS D:\...>` when you open a new terminal).
- [ ] **`winget` available** — ships with Windows 10 (build 1809+) and Windows 11. Check: `winget --version`.
- [ ] **You can reach `https://clariva-bot.onrender.com`** (i.e. your prod backend boots) — if not, fix that first; a broken deploy is not a local-dev problem.

---

## Part 1 — Install Cloudflare Tunnel (one-time, 2 min)

### 1.1 Install the binary

```powershell
winget install --id Cloudflare.cloudflared
```

If `winget` refuses (corporate laptop, etc.), fallback:

1. Go to <https://github.com/cloudflare/cloudflared/releases/latest>.
2. Download `cloudflared-windows-amd64.exe`.
3. Rename to `cloudflared.exe`, put it in a folder on your `PATH` (e.g. `C:\Users\<you>\bin\`).

### 1.2 Verify

```powershell
cloudflared --version
```

Expect output like `cloudflared version 2026.X.X (built 2026-XX-XX)`.

### 1.3 First test tunnel (no signup needed)

```powershell
cloudflared tunnel --url http://localhost:3001
```

Output includes:

```
2026-04-23T… INF +--------------------------------------------------------------------------------------------+
2026-04-23T… INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-04-23T… INF |  https://apparent-snapshot-colour-guidelines.trycloudflare.com                             |
2026-04-23T… INF +--------------------------------------------------------------------------------------------+
```

Copy that `https://…trycloudflare.com` URL — that's your public origin for this session. Kill with **Ctrl+C** when you're done testing.

> **Note:** URL changes every run. For a stable URL see [Part 6 — named tunnel (optional)](#part-6--named-tunnel-optional).

---

## Part 2 — Backend on a dedicated port (one-time config)

Backend default `PORT=3000` **conflicts with Next.js** which also defaults to 3000. Move backend to 3001.

### 2.1 Update `backend/.env`

Open `backend/.env` (the file already has your creds from Render copied in). Add or change:

```diff
- PORT=3000
+ PORT=3001
  NODE_ENV=development
  LOG_LEVEL=debug
```

### 2.2 Add the text-consult URL for local

The text-consult fan-out needs `APP_BASE_URL` (see `backend/src/services/text-session-supabase.ts`). For local dev:

```env
APP_BASE_URL=http://localhost:3000
```

Yes, this is the **frontend** origin, not the backend — because the join URL the patient opens (`/c/text/<sessionId>?t=<jwt>`) is served by Next.js, not Express. When testing patient-join locally in your own browser, `localhost:3000` works. When an IG patient opens it on their phone, localhost won't — see [Part 4.3](#43-testing-webhook-flows-end-to-end) for that case.

### 2.3 Webhook base URL (paste the tunnel URL)

After running `cloudflared tunnel --url http://localhost:3001` in Part 1.3, copy the `https://…trycloudflare.com` URL and add to `backend/.env`:

```env
WEBHOOK_BASE_URL=https://<your-random-words>.trycloudflare.com
```

This is what Twilio room-status callbacks will use to reach your local backend.

### 2.4 Verify backend boots locally

```powershell
cd backend
npm install
npm run dev
```

Expect logs like:

```
[2026-04-23 14:30:12.345] INFO: Server started {port:3001, env:"development"}
[2026-04-23 14:30:12.346] INFO: Database connected
[2026-04-23 14:30:12.390] INFO: Webhook worker started (Redis OK)
```

Test:

```powershell
# in a 3rd terminal
curl http://localhost:3001/health
```

Expect `{"status":"ok",...}` or similar 200 response.

Leave this terminal running. **Every time you save a `.ts` file under `backend/src/`, nodemon restarts the server in ~1 s.**

---

## Part 3 — Frontend env wiring (one-time)

### 3.1 Create `frontend/.env.local`

```env
# ─── Points the Next.js dashboard at the local Express backend ──────
NEXT_PUBLIC_API_URL=http://localhost:3001

# ─── Supabase (same project; reads+writes same DB as prod) ──────────
NEXT_PUBLIC_SUPABASE_URL=https://kqrktfhudeickmdbvavk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste SUPABASE_ANON_KEY from backend/.env>

# ─── Razorpay test key (browser-side) ───────────────────────────────
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_SXs8Tdk4KKZdIR
```

Everything else the frontend needs (Supabase session auth, API routes) resolves through `NEXT_PUBLIC_API_URL`.

### 3.2 Verify frontend boots locally

```powershell
# in a 2nd terminal
cd frontend
npm install
npm run dev
```

Expect:

```
▲ Next.js 14.2.35
- Local:        http://localhost:3000
- Environments: .env.local

✓ Ready in 2.1s
```

Open `http://localhost:3000/dashboard` in your browser → Supabase login → dashboard should load with data from your live Supabase project.

> **Heads up:** this connects to your **production Supabase**. Reads are safe; writes (e.g. creating a test appointment) create real rows. See [Part 5 — data isolation](#part-5--choose-your-data-isolation-pattern) if this worries you.

---

## Part 4 — The daily loop (every coding session)

### 4.1 Start order

Open **three terminals** in Cursor (`Ctrl+Shift+``):

| Terminal | Command | Keep running |
|---|---|---|
| **1 — Backend** | `cd backend; npm run dev` | Yes — restarts on save |
| **2 — Frontend** | `cd frontend; npm run dev` | Yes — Fast Refresh on save |
| **3 — Tunnel** | `cloudflared tunnel --url http://localhost:3001` | Yes — Ctrl+C to stop |

> **Cursor tip:** Name the terminals via the right-click menu ("Rename…" → "backend" / "frontend" / "tunnel") so you can tell them apart at a glance.

### 4.2 Fast iteration — pure code change (no webhook involved)

This is the 80% case (editing components, controllers, services, utils):

1. Edit a `.ts` / `.tsx` file in Cursor.
2. Save (Ctrl+S).
3. Look at the relevant terminal:
   - **Backend change**: nodemon log `[nodemon] restarting due to changes...` → `Server started {port:3001,...}` (~1 s).
   - **Frontend change**: browser auto-reloads the component in place (~300 ms). Component state is **preserved** unless you changed hooks.
4. Refresh / interact with the page. Verify.

No git push. No Render wait. No browser hard-reload. This is the win.

### 4.3 Testing webhook flows end-to-end

When you need an **actual Instagram DM → bot → response** round-trip, or **Twilio room status** callback, or a **Razorpay payment** flow:

1. Make sure **terminal 3 (tunnel) is running** and you've copied the `https://…trycloudflare.com` URL.
2. **Point the third-party webhooks at the tunnel URL** (see [Part 5 — webhook endpoints table](#52-webhook-endpoints-where-to-paste-the-tunnel-url)).
3. **Update `backend/.env`** `WEBHOOK_BASE_URL` if you changed tunnels (Twilio reads this from your backend, not from Twilio Console). Nodemon will pick the change up when you save.
4. Trigger the real event (DM yourself on the connected IG account; run a Razorpay test payment; join a Twilio room).
5. Watch terminal 1 — the full request arrives with pino logs, you can set breakpoints in Cursor and inspect in real time.

---

## Part 5 — Choose your data-isolation pattern

### 5.1 Pattern A — "Share everything with prod" (recommended for you, today)

**What:** local backend talks to your **one** Supabase project, **one** IG app, **one** Twilio sandbox, **one** Razorpay test account. Same creds as Render.

**Pros:**

- Zero extra setup.
- See real data while coding (useful for UI debugging — the empty list is usually a bug you don't notice on fresh Supabase).
- No "my local seed data is stale" problem.

**Cons:**

- A careless write mutates real rows your demo doctor has.
- If you run a migration locally against prod Supabase, it's production migration — no undo.

**Mitigation:**

- Only mutate rows under a clearly-fake dev user account (e.g. an IG account + patient record you created for testing only).
- Never run migrations from a local terminal against prod — apply via the Supabase SQL editor with clear awareness.
- Set `LOG_LEVEL=debug` locally (already in `.env`) so you notice destructive operations.

### 5.2 Pattern B — Separate dev project (safer, more setup)

**When to move to B:** once you onboard a real doctor and their data matters. Not needed for you this week.

**How (sketch):**

1. Create a second Supabase project (free tier: 500 MB DB, plenty for dev).
2. Run every migration in `backend/migrations/*.sql` against it **in order** via the SQL editor.
3. Create a `backend/.env.local` with the dev Supabase URL + keys.
4. Swap: `npm run dev -- --env-file=.env.local` (or use `dotenv-cli`).
5. Same pattern for a separate IG test app (Meta's "Test App" feature).
6. Razorpay + Twilio sandboxes are already test-scoped; keep the same keys.

**Stay on Pattern A until data safety becomes a real concern.**

### 5.3 Webhook endpoints — where to paste the tunnel URL

For Pattern A you need to decide: when the tunnel URL is registered in Meta/Twilio/Razorpay, **both** prod and dev webhooks land at your laptop. That means you can't receive prod DMs while dev is running with the tunnel pointing at localhost.

Fix: have **two separate apps** on each provider — one for dev (points at tunnel), one for prod (points at `https://clariva-bot.onrender.com`). Only connect your dev IG test account to the dev app.

| Provider | Endpoint path | Where to paste |
|---|---|---|
| **Meta / Instagram** | `POST /webhooks/instagram` (+ `GET /webhooks/instagram` for verify) | Meta App Dashboard → Webhooks → Instagram → Callback URL = `https://<tunnel>/webhooks/instagram`, Verify Token = `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` from `.env` |
| **Razorpay** | `POST /webhooks/razorpay` | Razorpay Dashboard → Settings → Webhooks → Add → URL = `https://<tunnel>/webhooks/razorpay`, Secret = `RAZORPAY_WEBHOOK_SECRET` |
| **Twilio Video** | `POST /webhooks/twilio/room-status` | Set via Twilio SDK when creating rooms — the backend passes `WEBHOOK_BASE_URL` as the callback. Once `WEBHOOK_BASE_URL` in `.env` is the tunnel, this auto-routes. No console change needed. |
| **PayPal** (if enabled) | `POST /webhooks/paypal` | PayPal Developer Dashboard → Webhooks → Add → URL = `https://<tunnel>/webhooks/paypal` |

Actual routes defined in `backend/src/routes/webhooks.ts`.

---

## Part 6 — Named tunnel (optional, upgrade when ready)

Once you're tired of re-pasting `https://apparent-snapshot-…trycloudflare.com` into four dashboards every morning (typically after ~1 week of daily use), upgrade to a named tunnel with a stable subdomain.

### What you need

- A domain name you own (Namecheap / Cloudflare Registrar / anywhere — $8–12/year).
  - If you already have a Cloudflare account + any domain on Cloudflare, skip registration.
- 10 minutes.

### One-time setup

```powershell
# 1. Authenticate with Cloudflare (opens browser)
cloudflared tunnel login

# 2. Create a named tunnel
cloudflared tunnel create clariva-dev

# 3. Route a subdomain to this tunnel
cloudflared tunnel route dns clariva-dev dev.yourdomain.com

# 4. Create config file at C:\Users\<you>\.cloudflared\config.yml
```

`config.yml` contents:

```yaml
tunnel: clariva-dev
credentials-file: C:\Users\<you>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: dev.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

### Daily use after setup

```powershell
cloudflared tunnel run clariva-dev
```

Public URL is now **always** `https://dev.yourdomain.com`. Paste it in Meta/Twilio/Razorpay **once, forever**. Delete the old `trycloudflare.com` URLs from those dashboards.

---

## Troubleshooting

### "Port 3001 is already in use"

```powershell
# find what's using it
Get-NetTCPConnection -LocalPort 3001 -State Listen
# kill by PID (replace 12345)
Stop-Process -Id 12345 -Force
```

Often an orphaned nodemon from a prior session. Safe to kill.

### Frontend boots but API calls return `ECONNREFUSED`

- Check `frontend/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001` (not `3000` — 3000 is itself).
- Restart `npm run dev` for the frontend after changing `.env.local` (Next.js doesn't hot-reload env vars).
- Confirm backend terminal shows `Server started {port:3001,...}` — if it shows 3000, fix `PORT=3001` in `backend/.env`.

### Cloudflare tunnel drops / IG webhook stops arriving

- Check tunnel terminal for `Connection failed` or `reconnecting` logs. Restart with Ctrl+C → re-run.
- The free quick-tunnel has no SLA; occasional drops (~once a day) are normal. Named tunnel (Part 6) is materially more stable.

### Webhooks work once, then stop

IG / Twilio may disable a webhook after N consecutive 5xx responses. If a local code change made the backend throw, fix the bug, then go to the provider dashboard and **re-enable the webhook** (Meta: "Toggle Active off/on"; Razorpay: "Test" button).

### Supabase session auth fails locally

Likely cause: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` mismatch with the browser cookies from prod. Fix: open an incognito tab → log in fresh on `localhost:3000/dashboard`.

### `npm install` installs both dev and prod locally, then later Render complains

Prod install uses `NODE_ENV=production` which skips `devDependencies`. If you add something to `dependencies` that's actually only dev-needed (e.g. a Jest matcher), prod will ship it. Keep the split clean; read the `package.json` section if a build fails in Render.

### "Changes to `.env` don't seem to take effect"

- Backend nodemon watches `.ts` files by default, not `.env`. After changing `.env`, **Ctrl+C** + restart `npm run dev`.
- Frontend Next.js also doesn't hot-reload `.env.local` — restart `npm run dev`.

---

## When you still need to push to Render / Vercel

Local dev doesn't help for these four cases — push as usual:

1. **Database migrations.** Apply to Supabase via the SQL editor (not via local app). The schema change is shared by local + Render + Vercel the moment it's applied in Supabase.
2. **Env var changes on the deployed service.** If you add a new `process.env.FOO`, it must also be added to Render (backend) / Vercel (frontend) env panels before the next deploy.
3. **Build-time config changes.** `next.config.js`, `tsconfig.json` paths, new npm deps. Test locally, then push.
4. **Pre-demo / pre-ship smoke test.** Always do a Render-hosted smoke test before showing a live user — there are prod-only env vars (`WEBHOOK_BASE_URL`, Twilio room subdomain, etc.) that only resolve correctly on the deployed surface.

---

## Speed-ups for the (remaining) Render push cycle

When you **do** push, these save minutes:

1. **Keep Render awake** — free tier hibernates. Add a free UptimeRobot monitor hitting `https://clariva-bot.onrender.com/health` every 5 min. Saves 30–60 s cold start per deploy.
2. **`npm ci` instead of `npm install`** in Render's build command. Uses `package-lock.json` exactly, ~30% faster on fresh containers. Render Dashboard → Service → Settings → Build Command → `npm ci && npm run build`.
3. **Render Build Filter** — Settings → Build Filter → `backend/**` + `package.json` + `package-lock.json`. Doc-only and frontend-only commits skip the backend rebuild.
4. **Log tailing** — `render logs --service clariva-bot-backend --tail` (install Render CLI once) so you don't keep opening the dashboard.

---

## Daily checklist (keep this next to your keyboard for the first week)

**Session start (~30 s):**

- [ ] Open Cursor, 3 terminals.
- [ ] Terminal 1 — `cd backend; npm run dev` → wait for "Server started {port:3001}".
- [ ] Terminal 2 — `cd frontend; npm run dev` → wait for "Ready in …s".
- [ ] Terminal 3 — `cloudflared tunnel --url http://localhost:3001` → copy the `https://…trycloudflare.com` URL (only needed if you'll test webhooks this session).
- [ ] If tunnel URL changed, update: Meta webhook URL, `WEBHOOK_BASE_URL` in `backend/.env`, Razorpay webhook URL.
- [ ] Open `http://localhost:3000/dashboard` — confirm login works.

**During coding:**

- Edit → save → see change (1–2 s). No git.
- For webhook flows: trigger the real event (DM yourself, Razorpay test payment, Twilio room join) and watch terminal 1.

**Session end:**

- [ ] Ctrl+C the three terminals (in any order).
- [ ] `git status` — review what you actually changed.
- [ ] Commit + push only when a feature is complete and you want prod validation.

---

## When to revisit / improve this setup

- **Week 1**: use quick-tunnel (`trycloudflare.com`), see how often URL rotation annoys you.
- **Week 2+**: if daily re-paste pain > 2 min/day, do Part 6 (named tunnel on a domain).
- **Month 2+**: if you're onboarding real doctors, move from Pattern A (shared prod data) to Pattern B (dev Supabase project) to eliminate accidental-mutation risk.
- **If cold-start on Render still annoys you after all this**: upgrade to Render's paid plan ($7/mo) — service stays warm, deploys are ~30 s faster. Often worth it once you're past hobby phase.

---

## Local Redis (for webhook queue)

**Required** for any local webhook testing (Razorpay, Instagram, Twilio). Without `REDIS_URL` set, the BullMQ queue falls back to a placeholder that **logs and silently drops** every webhook job — your handlers never run, no DMs/emails fire, and you'll waste hours wondering why nothing happens. Confirmed by reading `backend/src/config/queue.ts` (`placeholderQueue.add` only logs) and `backend/src/workers/webhook-worker.ts` (`startWebhookWorker` early-returns null if `REDIS_URL` is unset).

### Choice made: Memurai Developer (Windows-native)

We use **Memurai Developer 4.1.2**, a current Redis-7-compatible server packaged as a native Windows service. NOT the abandoned 2016 Microsoft Redis 3.0 port.

```powershell
# One-time install (in elevated PowerShell):
winget install --id Memurai.MemuraiDeveloper --accept-source-agreements --accept-package-agreements

# Verify:
Get-Service Memurai          # Status: Running
& 'C:\Program Files\Memurai\memurai-cli.exe' ping   # PONG
```

Memurai installs as a Windows service set to auto-start on boot — **set-and-forget**. After install, every reboot brings Redis back automatically.

`backend/.env` should contain:

```
REDIS_URL=redis://localhost:6379
```

After setting, restart the backend (`npm run dev`) and look for log line `Webhook worker started` — that confirms BullMQ connected to Memurai. If you instead see `Webhook worker skipped (REDIS_URL not set)`, the env var didn't load.

### Why not Docker / Redis-in-a-container? (decision log, 2026-04-25)

Originally planned: Docker Desktop + `docker compose up redis` for prod parity. Walked through every install path on this Windows 10 Pro 19045 machine — **all blocked by component-store rot** (`error 0x800f0900`):

| Attempt | Result |
|---|---|
| `wsl --install` (legacy) | `0x800f0900` — Microsoft-Windows-Subsystem-Linux feature install fails |
| `winget install Microsoft.WSL` (Store) | Installs ✓ but legacy optional component still required and still fails |
| `DISM /Online /Cleanup-Image /RestoreHealth` + `sfc /scannow` + direct DISM enable | Same `0x800f0900` — RestoreHealth could not repair the damage |
| Hyper-V backend (Docker's escape hatch on Pro/Enterprise) | Same `0x800f0900` — Hyper-V feature also blocked |

**Root cause:** Windows 10 component store is damaged. The proper fix is an **in-place repair install of Windows** (download Win10 ISO, mount, run setup.exe, choose "keep apps and files" — ~1–2 hours, no data loss). Schedule for a weekend.

**Until that repair happens:** Memurai is fully sufficient. It's Redis 7.x compatible, used in production by real shops, and BullMQ has no idea it's not "real" Redis. Zero behavioural difference for our use case.

**After the Windows repair:** if you want to migrate to Docker, the steps will be: `winget install Docker.DockerDesktop` → launch GUI once → `winget uninstall Memurai.MemuraiDeveloper` → add a `docker-compose.dev.yml` with a Redis service → `docker compose up -d`. The `REDIS_URL` value stays the same (`redis://localhost:6379`).

---

## Tailscale Funnel — single public origin for both frontend & backend

**Replaces** the older "Cloudflare Tunnel for backend only + raw localhost frontend" pattern in Parts 1–4 above. Adopted 2026-04-26 after hitting the `*.ts.net` HSTS preload wall trying to use plain HTTP for phone access.

### Why this exists

Two real problems converged:

1. **Patient join links are `localhost`** when generated by a backend running on the laptop. A patient on their phone can't open them; same problem for self-testing on your phone.
2. **`*.ts.net` is on the HSTS preload list** of every modern browser. So `http://clariva-dev.tail363099.ts.net:3000` is silently upgraded to `https://...:3000` and fails with `ERR_SSL_PROTOCOL_ERROR` because Next.js dev only speaks plain HTTP. You **cannot** plain-HTTP your way around this for any device with Chrome/Safari/Edge/Firefox.

### Solution: one Tailscale Funnel hostname, path-routed

Tailscale Funnel terminates HTTPS at the edge with a real Let's Encrypt cert (zero cert work for you), and Tailscale `serve --set-path` lets multiple local services share the one public hostname:

```
https://clariva-dev.tail363099.ts.net  (Funnel on)
├── /            → http://127.0.0.1:3000          (Next.js frontend)
├── /api/v1      → http://127.0.0.1:3001/api/v1   (Express backend)
├── /webhooks    → http://127.0.0.1:3001/webhooks (Express backend)
└── /cron        → http://127.0.0.1:3001/cron     (Express backend)
```

Same origin for browser → no CORS overhead for normal page loads, real HTTPS, **no Tailscale required on the patient's phone** (Funnel = public internet, not just tailnet).

### One-time setup

```powershell
# Wipe any prior serve/funnel config so we start clean
tailscale serve reset
tailscale funnel reset

# Path-routed mounts (note: target URL MUST include the path segment so
# Tailscale forwards e.g. /webhooks/instagram to localhost:3001/webhooks/instagram —
# without it, the prefix is stripped and you'll see weird 404s on the backend).
tailscale funnel --bg --set-path=/api/v1   http://127.0.0.1:3001/api/v1
tailscale funnel --bg --set-path=/webhooks http://127.0.0.1:3001/webhooks
tailscale funnel --bg --set-path=/cron     http://127.0.0.1:3001/cron
tailscale funnel --bg                       http://127.0.0.1:3000   # / → frontend

# Verify
tailscale funnel status
```

This survives reboots — the config is persisted by `tailscaled` and re-applied on service start.

### Env vars (single source of truth)

```ini
# backend/.env
APP_BASE_URL=https://clariva-dev.tail363099.ts.net
WEBHOOK_BASE_URL=https://clariva-dev.tail363099.ts.net
INSTAGRAM_REDIRECT_URI=https://clariva-dev.tail363099.ts.net/api/v1/settings/instagram/callback
INSTAGRAM_FRONTEND_REDIRECT_URI=https://clariva-dev.tail363099.ts.net/dashboard/settings
```

```ini
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://clariva-dev.tail363099.ts.net
```

The frontend appends `/api/v1/...` itself (`requireApiBaseUrl()` in `frontend/lib/api-base.ts`), so `NEXT_PUBLIC_API_URL` should NOT include `/api/v1`.

### CORS

`backend/src/index.ts` `corsOptionsDev.origin` includes `https://clariva-dev.tail363099.ts.net`. With the path-routed setup, browser requests are usually same-origin and CORS doesn't fire — the entry exists for the laptop-only fallback case where the frontend runs on `localhost:3000` but `NEXT_PUBLIC_API_URL` still points at the Funnel.

### Switching back to laptop-only (no phone, no Funnel needed)

Flip these four env values:

```ini
# backend/.env
APP_BASE_URL=http://localhost:3000
WEBHOOK_BASE_URL=https://clariva-dev.tail363099.ts.net   # leave for webhooks
INSTAGRAM_REDIRECT_URI=https://clariva-dev.tail363099.ts.net/api/v1/settings/instagram/callback
INSTAGRAM_FRONTEND_REDIRECT_URI=http://localhost:3000/dashboard/settings
```

```ini
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Restart frontend dev server (Next.js inlines `NEXT_PUBLIC_*` at server-start time).

### Gotchas (battle-tested, 2026-04-26)

1. **`tailscale funnel` CLI changed.** Old `tailscale funnel 443 on` is gone. New CLI mirrors `tailscale serve` — you mount targets directly with `tailscale funnel --bg <target>`.
2. **Target URL must include the path segment** (e.g. `http://127.0.0.1:3001/webhooks`, not just `http://127.0.0.1:3001`). Tailscale strips the `--set-path` prefix and appends the remainder to the target URL, so you need the prefix back in the target to reach the right Express route.
3. **Frontend dev server must be restarted** when `NEXT_PUBLIC_*` changes — Next.js inlines these at compile time. The "Reload env" log line you see is necessary but not always sufficient.
4. **The `/api/v1/health` endpoint returns the API root welcome**, not a versioned health response. That's a backend-routing quirk (`backend/src/routes/health.ts` declares `GET /` which collides under the `/api/v1/health` mount). The actually-versioned health is `GET /api/v1/health/health`. Don't mistake that for a Funnel routing bug.
5. **Funnel has node + tailnet quotas.** Each tailnet member can have at most 3 Funnel'd ports per node. We use one (`443`) — plenty of headroom.

### When this becomes obsolete

When you ship to prod (Vercel for frontend, Render for backend), patient join links use `https://clariva-bot.vercel.app/...` and webhook targets use `https://clariva-bot.onrender.com/...`. The Funnel setup is purely local-dev ergonomics; nothing in app code knows or cares about Tailscale.

---

## References

- Backend server entry: `backend/src/index.ts` (PORT read from `env.PORT`, defaults 3000).
- Env schema: `backend/src/config/env.ts` (Zod, every env var documented).
- Frontend API base resolver: `frontend/lib/api-base.ts` (reads `NEXT_PUBLIC_API_URL`).
- Webhook routes: `backend/src/routes/webhooks.ts`.
- Text-consult join-URL builder: `backend/src/services/text-session-supabase.ts` (requires `APP_BASE_URL`).
- Cloudflare Tunnel docs: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>.
- Previous chat that produced this plan: [routing v2 → text consult wiring](2a8b345b-233a-43ab-88a0-522abf3900d9).

---

**Last updated:** 2026-04-26 (added Tailscale Funnel + path-routing section: single public origin for both frontend & backend, replaces Cloudflare Tunnel pattern for local dev)
