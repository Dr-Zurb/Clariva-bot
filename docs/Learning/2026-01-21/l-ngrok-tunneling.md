# Learning Topics - Ngrok: Secure Tunneling for Local Development
## Webhook Development & Testing Tool

---

## 📚 What Are We Learning Today?

Today we're learning about **Ngrok** - a powerful tool that creates secure tunnels from the internet to your local development server. Think of it like **a secure phone line that connects your home office to the outside world** - when you're developing webhooks locally, external services (like Instagram/Facebook) can't reach your `localhost:3000` directly. Ngrok creates a public HTTPS URL that tunnels all traffic to your local server, making it accessible from anywhere on the internet!

We'll learn about:
1. **What Ngrok Is** - Understanding the tunneling concept
2. **Why We Need Ngrok** - Local development challenges
3. **Installation & Setup** - Getting started with ngrok
4. **Basic Usage** - Creating tunnels for your backend
5. **Webhook Development** - Testing Instagram/Facebook webhooks locally
6. **Ngrok Dashboard** - Monitoring requests and inspecting traffic
7. **Security Considerations** - Protecting your local development
8. **Advanced Features** - Static domains, authentication, and more
9. **Alternatives to Ngrok** - Other tunneling solutions
10. **Best Practices** - Safe and efficient usage

---

## 🎓 Topic 1: What is Ngrok?

### What is Ngrok?

**Ngrok** is a reverse proxy tool that creates secure tunnels from public URLs to your local development server. It's like a **secure bridge** that connects the internet to your local machine.

**Think of it like:**
- **Your local server** = Your home address (private, not accessible from outside)
- **Ngrok tunnel** = A secure delivery service that gives you a public address
- **Public URL** = A temporary address that forwards all mail to your home

### How Does It Work?

```
Internet → Ngrok Cloud → Ngrok Tunnel → Your Local Server (localhost:3000)
```

**The Process:**
1. You start ngrok: `ngrok http 3000`
2. Ngrok creates a public URL: `https://abc123.ngrok.io`
3. All requests to `https://abc123.ngrok.io` are forwarded to `localhost:3000`
4. Your local server receives the requests as if they came directly

**Think of it like:**
- **Post Office Box** = Ngrok URL (public address)
- **Your Home** = Local server (private address)
- **Mail Forwarding** = Ngrok tunnel (forwards all mail to your home)

### Key Features

**✅ Free Tier Includes:**
- HTTPS URLs (required for webhooks)
- Request inspection dashboard
- Basic tunneling
- Random URLs (changes each restart)

**✅ Paid Tier Includes:**
- Static domains (same URL every time)
- Custom domains
- Reserved IP addresses
- More concurrent tunnels
- Advanced authentication

---

## 🎓 Topic 2: Why Do We Need Ngrok?

### The Problem: Local Development vs. Webhooks

**The Challenge:**
- Your backend runs on `localhost:3000` (only accessible on your machine)
- Instagram/Facebook webhooks need a **public HTTPS URL**
- Webhooks can't reach `localhost` from the internet

**Think of it like:**
- **Localhost** = Your private phone number (only works in your house)
- **Webhook** = Someone trying to call you from another country
- **Ngrok** = A phone forwarding service that gives you a public number

### Real-World Scenarios

**Scenario 1: Instagram Webhook Testing**
```
Without Ngrok:
Instagram → ❌ Can't reach localhost:3000/webhooks/instagram
Your Server → Never receives webhook events

With Ngrok:
Instagram → ✅ https://abc123.ngrok.io/webhooks/instagram
Ngrok → Forwards to localhost:3000/webhooks/instagram
Your Server → ✅ Receives webhook events!
```

**Scenario 2: Payment Webhook Testing**
- Stripe, PayPal, etc. need to send webhooks to your server
- They can't reach `localhost`
- Ngrok provides the public URL they need

**Scenario 3: OAuth Callbacks**
- OAuth providers redirect to your callback URL
- They can't redirect to `localhost`
- Ngrok provides a public callback URL

---

## 🎓 Topic 3: Installation & Setup

### Installation Methods

**Option 1: Download Binary (Recommended)**
1. Go to https://ngrok.com/download
2. Download for your OS (Windows/Mac/Linux)
3. Extract the binary
4. Add to PATH (or use full path)

**Option 2: Package Managers**

**Windows (Chocolatey):**
```powershell
choco install ngrok
```

**Mac (Homebrew):**
```bash
brew install ngrok/ngrok/ngrok
```

**Linux (Snap):**
```bash
sudo snap install ngrok
```

**Option 3: NPM (Global)**
```bash
npm install -g ngrok
```

### Initial Setup

**1. Create Ngrok Account (Free)**
- Go to https://dashboard.ngrok.com/signup
- Sign up with email or GitHub
- Verify your email

**2. Get Your Authtoken**
- After signup, go to https://dashboard.ngrok.com/get-started/your-authtoken
- Copy your authtoken (looks like: `2abc123def456ghi789jkl012mno345pqr678stu`)

**3. Configure Ngrok**
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

**4. Verify Installation**
```bash
ngrok version
# Should show: ngrok version 3.x.x
```

**Think of it like:**
- **Account** = Getting a phone service subscription
- **Authtoken** = Your account PIN (proves you're authorized)
- **Config** = Registering your PIN with the phone service

---

## 🎓 Topic 4: Basic Usage

### Starting a Tunnel

**Basic Command:**
```bash
ngrok http 3000
```

**What This Does:**
- Creates a tunnel to `localhost:3000`
- Generates a random public URL
- Shows connection status and request logs

**Example Output:**
```
Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                      45ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Key Information:**
- **Forwarding URL**: `https://abc123.ngrok.io` (use this for webhooks)
- **Web Interface**: `http://127.0.0.1:4040` (inspect requests here)
- **Status**: `online` (tunnel is active)

### Using the Tunnel

**1. Start Your Backend:**
```bash
cd clariva-bot/backend
npm run dev
# Server running on http://localhost:3000
```

**2. Start Ngrok (in another terminal):**
```bash
ngrok http 3000
```

**3. Use the Ngrok URL:**
- Copy the `Forwarding` URL: `https://abc123.ngrok.io`
- Use it in Facebook Console: `https://abc123.ngrok.io/webhooks/instagram`
- All requests to this URL will reach your local server!

**Think of it like:**
- **Backend** = Your restaurant (serving food on localhost:3000)
- **Ngrok** = A delivery service (accepts orders at public URL)
- **Webhook** = Customer placing order (sends to public URL)
- **Your Server** = Receives the order (via ngrok tunnel)

### Stopping the Tunnel

**Press `Ctrl+C` in the ngrok terminal:**
- Tunnel closes immediately
- URL becomes invalid
- All pending requests are dropped

**Important:** The URL changes every time you restart ngrok (on free tier).

---

## 🎓 Topic 5: Webhook Development with Ngrok

### Setting Up Instagram Webhook

**Step 1: Start Your Backend**
```bash
cd clariva-bot/backend
npm run dev
# Server running on http://localhost:3000
```

**Step 2: Start Ngrok**
```bash
ngrok http 3000
```

**Step 3: Copy the Forwarding URL**
```
Forwarding    https://abc123.ngrok.io -> http://localhost:3000
```
Copy: `https://abc123.ngrok.io`

**Step 4: Configure in Facebook Console**
1. Go to Facebook App → Instagram Product → Webhooks
2. Callback URL: `https://abc123.ngrok.io/webhooks/instagram`
3. Verify Token: `[your-generated-token]`
4. Click "Verify and Save"

**Step 5: Test Webhook**
- Facebook will send a verification request (GET)
- Your server should respond with the challenge
- If successful, webhook is verified!

### Inspecting Webhook Requests

**Ngrok Web Interface:**
- Open: `http://127.0.0.1:4040` (shown in ngrok output)
- See all incoming requests in real-time
- Inspect headers, body, and responses
- Replay requests for testing

**Useful for:**
- Debugging webhook payloads
- Understanding request structure
- Testing error scenarios
- Verifying signature verification

**Think of it like:**
- **Web Interface** = Security camera footage (see all visitors)
- **Request Inspection** = See exactly what Instagram sent
- **Replay** = Test the same request again

### Handling URL Changes

**Problem:** Free ngrok URLs change on restart

**Solutions:**

**Option 1: Keep Ngrok Running**
- Don't restart ngrok during development
- Keep the same URL for your session

**Option 2: Update Facebook Console**
- When URL changes, update in Facebook Console
- Quick but requires manual updates

**Option 3: Use Static Domain (Paid)**
- Reserve a static domain: `ngrok config add-domain your-app.ngrok.io`
- URL stays the same: `https://your-app.ngrok.io`
- Requires paid plan

---

## 🎓 Topic 6: Ngrok Dashboard & Monitoring

### Web Interface Features

**Access:** `http://127.0.0.1:4040` (when ngrok is running)

**Features:**

**1. Request Inspector**
- See all HTTP requests in real-time
- View request method, URL, headers, body
- View response status, headers, body
- Filter by path, status code, etc.

**2. Request Details**
- Click any request to see full details
- Headers (including webhook signatures)
- Request body (JSON, form data, etc.)
- Response details

**3. Replay Requests**
- Click "Replay" to send the same request again
- Useful for testing webhook handlers
- Modify request before replaying

**4. Export Requests**
- Export as cURL command
- Export as HTTP file
- Share with team for debugging

**Think of it like:**
- **Request Inspector** = Call log (see all incoming calls)
- **Request Details** = Call recording (hear the full conversation)
- **Replay** = Call back button (redial the same number)

### Monitoring Traffic

**Real-Time Monitoring:**
- See requests as they arrive
- Monitor response times
- Track error rates
- View connection statistics

**Useful Metrics:**
- Total requests
- Success rate
- Average response time
- Peak traffic times

---

## 🎓 Topic 7: Security Considerations

### Protecting Your Local Development

**⚠️ Security Risks:**

**1. Public Access**
- Your ngrok URL is publicly accessible
- Anyone with the URL can access your local server
- No authentication by default

**2. Sensitive Data Exposure**
- Local development may have test data
- Credentials might be logged
- PHI/PII could be exposed

**3. Webhook Spoofing**
- Malicious actors could send fake webhooks
- Always verify webhook signatures!

**Think of it like:**
- **Public URL** = Leaving your front door unlocked
- **Anyone can access** = Strangers can walk in
- **Security measures** = Lock the door, verify visitors

### Security Best Practices

**1. Use Webhook Signature Verification**
```typescript
// Always verify webhook signatures
const signature = req.headers['x-hub-signature-256'];
const isValid = verifyWebhookSignature(payload, signature, appSecret);
if (!isValid) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

**2. Restrict Access (Ngrok Paid Feature)**
```bash
# Require basic authentication
ngrok http 3000 --basic-auth="username:password"
```

**3. Use IP Whitelisting (Ngrok Paid Feature)**
- Only allow specific IPs to access your tunnel
- Facebook/Instagram IPs can be whitelisted

**4. Don't Expose Sensitive Endpoints**
- Only expose webhook endpoints
- Don't expose admin panels, database connections, etc.

**5. Use Environment-Specific Credentials**
- Use test credentials in development
- Never use production credentials locally

**6. Monitor Request Logs**
- Check ngrok web interface regularly
- Look for suspicious requests
- Block malicious IPs if needed

**Think of it like:**
- **Signature Verification** = Checking ID at the door
- **Authentication** = Requiring a password
- **IP Whitelisting** = Only allowing known visitors
- **Monitoring** = Security camera watching for threats

---

## 🎓 Topic 8: Advanced Features

### Static Domains (Paid Feature)

**Problem:** Free URLs change on restart

**Solution:** Reserve a static domain

```bash
# Reserve a static domain (requires paid plan)
ngrok config add-domain your-app.ngrok.io

# Use the static domain
ngrok http 3000 --domain=your-app.ngrok.io
```

**Benefits:**
- Same URL every time: `https://your-app.ngrok.io`
- No need to update Facebook Console
- Professional appearance
- Better for team collaboration

### Custom Domains (Paid Feature)

**Use Your Own Domain:**
```bash
ngrok http 3000 --hostname=webhooks.yourdomain.com
```

**Benefits:**
- Use your own domain
- More professional
- Better branding

### Multiple Tunnels

**Run Multiple Services:**
```bash
# Terminal 1: Backend API
ngrok http 3000

# Terminal 2: Frontend
ngrok http 3001

# Terminal 3: Admin Panel
ngrok http 3002
```

**Each gets its own URL:**
- Backend: `https://abc123.ngrok.io`
- Frontend: `https://def456.ngrok.io`
- Admin: `https://ghi789.ngrok.io`

### Request Rewriting

**Modify Requests Before Forwarding:**
```bash
# Add custom headers
ngrok http 3000 --request-header-add "X-Custom-Header: value"

# Rewrite paths
ngrok http 3000 --host-header="rewrite"
```

### TCP Tunneling

**Tunnel Non-HTTP Services:**
```bash
# Tunnel database connection
ngrok tcp 5432

# Tunnel SSH
ngrok tcp 22
```

---

## 🎓 Topic 9: Alternatives to Ngrok

### Other Tunneling Solutions

**1. Cloudflare Tunnel (cloudflared)**
- Free, no account required
- Similar to ngrok
- Good performance

```bash
# Install
brew install cloudflare/cloudflare/cloudflared

# Use
cloudflared tunnel --url http://localhost:3000
```

**2. LocalTunnel**
- Free, open source
- NPM package
- Simple setup

```bash
npm install -g localtunnel
lt --port 3000
```

**3. Serveo**
- Free, no installation
- SSH-based
- No account needed

```bash
ssh -R 80:localhost:3000 serveo.net
```

**4. VS Code Port Forwarding**
- Built into VS Code
- Simple for development
- Limited features

**5. Telebit**
- Free tier available
- Custom domains
- Good for production-like testing

### Comparison

| Feature | Ngrok | Cloudflare | LocalTunnel | Serveo |
|---------|-------|-----------|-------------|--------|
| Free Tier | ✅ | ✅ | ✅ | ✅ |
| HTTPS | ✅ | ✅ | ✅ | ❌ |
| Dashboard | ✅ | ✅ | ❌ | ❌ |
| Static Domain | Paid | ✅ | ❌ | ❌ |
| Ease of Use | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

**Recommendation:** Ngrok is the most popular and feature-rich, but Cloudflare Tunnel is a great free alternative.

---

## 🎓 Topic 10: Best Practices

### Development Workflow

**1. Start Backend First**
```bash
# Terminal 1: Start backend
cd clariva-bot/backend
npm run dev
# Wait for "Server is running on http://localhost:3000"
```

**2. Then Start Ngrok**
```bash
# Terminal 2: Start ngrok
ngrok http 3000
# Wait for "Session Status: online"
```

**3. Copy URL and Configure**
- Copy the forwarding URL
- Update Facebook Console
- Test webhook verification

**4. Keep Both Running**
- Don't close either terminal
- Restart both if needed
- Update URL if ngrok restarts

### Error Handling

**Common Issues:**

**Issue 1: "Tunnel session failed"**
- **Cause:** Network issues, ngrok service down
- **Solution:** Wait and retry, check ngrok status page

**Issue 2: "Address already in use"**
- **Cause:** Port 3000 already in use
- **Solution:** Kill process using port, or use different port

**Issue 3: "Webhook verification fails"**
- **Cause:** Server not running, wrong URL, verify token mismatch
- **Solution:** Check server is running, verify URL and token

**Issue 4: "URL changed"**
- **Cause:** Ngrok restarted (free tier)
- **Solution:** Update URL in Facebook Console

### Performance Tips

**1. Keep Tunnel Open**
- Don't restart ngrok unnecessarily
- Keep the same URL for your session

**2. Monitor Traffic**
- Use ngrok dashboard to monitor requests
- Identify performance bottlenecks
- Optimize slow endpoints

**3. Use Static Domain (If Paid)**
- Avoid URL changes
- Faster development workflow
- Better for team collaboration

**4. Close When Not Needed**
- Close ngrok when not developing webhooks
- Saves resources
- Reduces security exposure

### Team Collaboration

**1. Share Ngrok URLs**
- Share the forwarding URL with team
- Use static domain for consistency
- Document in team chat/docs

**2. Coordinate Restarts**
- Notify team before restarting ngrok
- Update shared documentation
- Use static domain to avoid issues

**3. Use Ngrok Dashboard**
- Share request inspection links
- Debug issues together
- Review webhook payloads

---

## 🎓 Topic 11: Real-World Examples

### Example 1: Instagram Webhook Setup

**Complete Workflow:**

```bash
# Step 1: Start backend
cd clariva-bot/backend
npm run dev
# Output: Server is running on http://localhost:3000

# Step 2: Start ngrok (new terminal)
ngrok http 3000
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:3000

# Step 3: Configure in Facebook Console
# Callback URL: https://abc123.ngrok.io/webhooks/instagram
# Verify Token: [your-token-from-env]

# Step 4: Test webhook
# Facebook sends verification request
# Your server responds with challenge
# Webhook verified! ✅
```

### Example 2: Testing Payment Webhooks

```bash
# Start backend
npm run dev

# Start ngrok
ngrok http 3000

# Configure Stripe webhook
# Webhook URL: https://abc123.ngrok.io/webhooks/stripe
# Test events will be forwarded to your local server
```

### Example 3: OAuth Callback Testing

```bash
# Start frontend
npm run dev
# Frontend on http://localhost:3001

# Start ngrok for frontend
ngrok http 3001

# Configure OAuth callback
# Redirect URI: https://def456.ngrok.io/auth/callback
# OAuth provider redirects to your local frontend
```

---

## 🎓 Topic 12: Troubleshooting

### Common Problems & Solutions

**Problem 1: "ngrok: command not found"**
```bash
# Solution: Add ngrok to PATH or use full path
# Windows: Add to System PATH
# Mac/Linux: Move to /usr/local/bin or add to PATH
```

**Problem 2: "Tunnel session failed: Invalid authtoken"**
```bash
# Solution: Re-authenticate
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

**Problem 3: "Address already in use"**
```bash
# Solution: Find and kill process using port
# Windows:
netstat -ano | findstr :3000
taskkill /PID [PID] /F

# Mac/Linux:
lsof -ti:3000 | xargs kill
```

**Problem 4: "Webhook not receiving requests"**
- Check server is running
- Verify ngrok URL is correct
- Check Facebook Console webhook status
- Inspect ngrok dashboard for incoming requests
- Verify webhook endpoint is implemented

**Problem 5: "HTTPS certificate errors"**
- Ngrok provides valid SSL certificates
- If errors occur, check ngrok status
- Try restarting ngrok
- Verify domain is correct

---

## 📝 Summary

### Key Takeaways

1. **Ngrok creates secure tunnels** from public URLs to localhost
2. **Essential for webhook development** - external services can't reach localhost
3. **Free tier is sufficient** for development and testing
4. **Always verify webhook signatures** - ngrok URLs are public
5. **Use dashboard to inspect requests** - invaluable for debugging
6. **Keep tunnel open during development** - avoid unnecessary restarts
7. **Consider static domain** if you need consistent URLs (paid feature)

### When to Use Ngrok

**✅ Use Ngrok When:**
- Developing webhooks (Instagram, Facebook, Stripe, etc.)
- Testing OAuth callbacks
- Sharing local development with team
- Testing webhook integrations
- Debugging API integrations

**❌ Don't Use Ngrok When:**
- Running production services (use proper hosting)
- Handling sensitive production data
- Need guaranteed uptime
- Need custom domain without paid plan

### Next Steps

1. **Install ngrok** and create account
2. **Start using it** for Instagram webhook development
3. **Explore the dashboard** to inspect requests
4. **Practice** with different webhook scenarios
5. **Consider paid plan** if you need static domains

---

**Last Updated:** 2026-01-21  
**Related Topics:** 
- [Instagram Setup Learning](../Learning/2026-01-21/l-task-1-instagram-setup.md)
- [Webhook Security Reference](../../Reference/WEBHOOKS.md)
- [External Services Reference](../../Reference/EXTERNAL_SERVICES.md)

---

**Happy Tunneling! 🚇**
