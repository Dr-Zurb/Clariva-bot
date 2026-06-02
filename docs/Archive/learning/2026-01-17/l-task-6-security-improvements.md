# Learning Topics - Security & Reliability Improvements
## Task #6: Hardening Your API

---

## 📚 What Are We Learning Today?

Today we're learning about **Security & Reliability** - how to protect your API from attacks and make it robust for production. Think of it like **adding security systems and safety features to your hospital** - you need locks, cameras, fire alarms, and emergency protocols!

We'll learn about:
1. **Security Headers (Helmet)** - Protecting against common web attacks
2. **CORS Configuration** - Controlling who can access your API
3. **Rate Limiting** - Preventing abuse and DDoS attacks
4. **Body Size Limits** - Preventing DoS attacks via large payloads
5. **Graceful Shutdown** - Properly closing server on deployment
6. **Enhanced Health Checks** - Better monitoring of server status
7. **Request Timeouts** (Optional) - Preventing hanging requests
8. **Compression** (Optional) - Optimizing response sizes

---

## 🎓 Topic 1: Security Headers (Helmet)

### What Are Security Headers?

**Security headers** are special HTTP headers that tell browsers how to behave when interacting with your API. They protect against common web attacks.

**Think of it like:**
- **Security cameras** - Watch for suspicious behavior
- **Locks on doors** - Prevent unauthorized access
- **Warning signs** - Tell browsers what's safe and what's not

### What is Helmet?

**Helmet** is a middleware that automatically sets security headers for your Express app. It's like a **security guard** that adds protective headers to every response.

### What Attackers Can Do Without Helmet

**Without security headers:**
```typescript
// ❌ DANGEROUS - No protection
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
// Attacker can inject malicious scripts, steal data, etc.
```

**With Helmet:**
```typescript
// ✅ SAFE - Protected
app.use(helmet());
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
// Browser automatically blocks dangerous behavior
```

### How Helmet Protects You

| Security Header | What It Does | Real-World Analogy |
|----------------|--------------|-------------------|
| `X-Content-Type-Options: nosniff` | Prevents browsers from guessing file types | "Only accept documents with official stamps" |
| `X-Frame-Options: SAMEORIGIN` | Prevents clickjacking attacks | "Only display in our own frame, not embedded elsewhere" |
| `X-XSS-Protection: 0` | Disables old XSS protection (modern browsers handle it) | "Modern security system replaces old one" |
| `Content-Security-Policy` | Controls which resources can be loaded | "Only allow approved resources, block everything else" |

### Understanding Clickjacking Attack

**What is clickjacking?**
- Attacker embeds your site in an invisible frame
- User thinks they're clicking on your site
- Actually clicking on attacker's malicious button

**Example:**
```html
<!-- Attacker's malicious page -->
<iframe src="https://your-api.com/login" style="opacity:0"></iframe>
<!-- User clicks "Login" but actually clicks attacker's button! -->
```

**Helmet prevents this:**
```http
X-Frame-Options: SAMEORIGIN
```
This tells browser: "Only show this page if it's from the same origin, don't allow embedding!"

### Helmet Configuration

```typescript
import helmet from 'helmet';
import { env } from './config/env';

app.use(helmet({
  // In production: Enable Content Security Policy (stricter security)
  contentSecurityPolicy: env.NODE_ENV === 'production',
  
  // Disable Cross-Origin Embedder Policy (can break APIs)
  crossOriginEmbedderPolicy: false,
  
  // Allow cross-origin resources (needed for APIs)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
```

**Why disable CSP in development?**
- CSP can be very strict
- Might block legitimate development tools
- Production needs strict security
- Development needs flexibility

---

## 🎓 Topic 2: CORS Configuration

### What is CORS?

**CORS** (Cross-Origin Resource Sharing) controls **which websites can make requests to your API**.

**Think of it like:**
- **Building access control** - Only authorized visitors can enter
- **Guest list** - Only approved people can attend
- **Country borders** - Control who can enter your territory

### Why CORS Matters

**Without CORS restrictions:**
```typescript
// ❌ DANGEROUS - Anyone can access your API
app.use(cors()); // Allows ALL origins (development only!)
```

**Attacker's malicious website:**
```javascript
// Attacker can make requests from their evil site
fetch('https://your-api.com/appointments', {
  method: 'POST',
  body: JSON.stringify({ /* malicious data */ })
});
// 😱 Your API accepts it!
```

**With proper CORS:**
```typescript
// ✅ SAFE - Only approved origins can access
const corsOptions = {
  origin: ['https://clariva.com', 'https://app.clariva.com'], // Only these!
  credentials: true, // Allow cookies
};
app.use(cors(corsOptions));
```

**Attacker tries again:**
```javascript
// Attacker's malicious website
fetch('https://your-api.com/appointments', {
  method: 'POST',
  body: JSON.stringify({ /* malicious data */ })
});
// 🚫 BLOCKED! Not in allowed origins list
```

### Understanding Origins

**Origin = Protocol + Domain + Port**

| URL | Origin | Same Origin? |
|-----|--------|--------------|
| `https://clariva.com/api` | `https://clariva.com` | ✅ Same |
| `https://www.clariva.com/api` | `https://www.clariva.com` | ❌ Different (www vs non-www) |
| `http://clariva.com/api` | `http://clariva.com` | ❌ Different (http vs https) |
| `https://clariva.com:3000/api` | `https://clariva.com:3000` | ❌ Different (port) |

### CORS Preflight Requests

**What is a preflight request?**

Before making certain requests (POST, PUT, DELETE), browsers send an **OPTIONS request** to check if the actual request is allowed. This is called a "preflight" request.

**Example flow:**
```
1. Browser: "Can I POST to your API?" (OPTIONS request)
   ↓
2. Server: "Yes, you're allowed!" (CORS headers in response)
   ↓
3. Browser: "Okay, here's my POST request" (Actual request)
   ↓
4. Server: Processes request normally
```

**CORS middleware handles this automatically!**

### CORS Configuration Explained

```typescript
const corsOptions = {
  // Which origins are allowed?
  origin: (origin, callback) => {
    const allowedOrigins = env.NODE_ENV === 'production'
      ? [
          'https://clariva.com',        // Production domains
          'https://www.clariva.com',
          'https://app.clariva.com',
        ]
      : [
          'http://localhost:3000',      // Development (local)
          'http://localhost:3001',
          'http://127.0.0.1:3000',
        ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true); // ✅ Allowed
    } else {
      callback(new Error('Not allowed by CORS')); // ❌ Blocked
    }
  },
  
  credentials: true, // Allow cookies/authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'], // Allowed headers
  exposedHeaders: ['X-Correlation-ID'], // Headers client can read
  maxAge: 86400, // Cache preflight response for 24 hours
};

app.use(cors(env.NODE_ENV === 'production' ? corsOptions : {}));
```

---

## 🎓 Topic 3: Rate Limiting

### What is Rate Limiting?

**Rate limiting** prevents users (or attackers) from making **too many requests too quickly**. It's like a **speed limit on a road** - prevents crashes and keeps traffic flowing.

**Think of it like:**
- **Elevator capacity** - Only so many people can use it at once
- **Store hours** - Can't access outside business hours
- **API quota** - You get X requests per time period

### Why Rate Limiting Matters

**Without rate limiting:**
```typescript
// ❌ DANGEROUS - No limits
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

**Attacker's script:**
```javascript
// Attacker sends 10,000 requests per second!
for (let i = 0; i < 10000; i++) {
  fetch('https://your-api.com/health');
}
// 😱 Server crashes! DDoS attack successful!
```

**With rate limiting:**
```typescript
// ✅ SAFE - Limited requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requests per window
});

app.use(limiter);
```

**Attacker tries again:**
```javascript
// Attacker sends 10,000 requests
for (let i = 0; i < 10000; i++) {
  fetch('https://your-api.com/health');
}
// After 100 requests: 🚫 "429 Too Many Requests" - BLOCKED!
```

### Understanding Rate Limit Windows

**Window = Time period for counting requests**

| Window | Max Requests | Meaning |
|--------|--------------|---------|
| 15 minutes, 100 requests | 100 | Can make 100 requests every 15 minutes |
| 1 hour, 1000 requests | 1000 | Can make 1000 requests every hour |
| 1 minute, 10 requests | 10 | Can make 10 requests every minute |

**Example:**
```
Time 0:00 - Make 50 requests ✅
Time 0:05 - Make 50 more requests ✅
Time 0:10 - Try to make 1 more request ❌ "429 Too Many Requests"
Time 0:15 - Window resets, can make 100 more requests ✅
```

### General vs Strict Rate Limiting

**General API Limiter:**
```typescript
// Normal endpoints (health, data, etc.)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes (production)
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many requests, please try again later.',
  },
});
// Applies to ALL routes by default
app.use(apiLimiter);
```

**Strict Auth Limiter:**
```typescript
// Authentication endpoints (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes (prevents brute force!)
  skipSuccessfulRequests: true, // Only count failures
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many authentication attempts, please try again later.',
  },
});
// Use on login/register routes only
router.post('/login', authLimiter, loginController);
```

**Why strict on auth?**
- **Brute force attacks** - Attacker tries thousands of password combinations
- **5 attempts per 15 minutes** - Makes brute force impractical
- **Skip successful requests** - Legitimate users aren't blocked

### Rate Limit Headers

When rate limiting is active, the response includes headers:

```http
RateLimit-Limit: 100          # Maximum requests allowed
RateLimit-Remaining: 45       # Requests remaining in window
RateLimit-Reset: 1640995200   # When window resets (timestamp)
```

**Client can use these headers to show progress to users!**

---

## 🎓 Topic 4: Request Body Size Limits

### What Are Body Size Limits?

**Body size limits** restrict how **large request payloads can be**. This prevents attackers from sending huge payloads that crash your server (DoS attack).

**Think of it like:**
- **Package size limits** - Postal service won't accept packages over certain weight
- **File upload limits** - Can't upload 100GB file to email
- **Memory protection** - Prevents server from running out of memory

### Why Body Size Limits Matter

**Without body size limits:**
```typescript
// ❌ DANGEROUS - No size limit
app.use(express.json()); // Default is 100kb, but can be increased
```

**Attacker's attack:**
```javascript
// Attacker sends 1GB of data in one request!
const hugePayload = 'x'.repeat(1024 * 1024 * 1024); // 1GB string
fetch('https://your-api.com/appointments', {
  method: 'POST',
  body: JSON.stringify({ data: hugePayload })
});
// 😱 Server tries to load 1GB into memory - CRASHES!
```

**With body size limits:**
```typescript
// ✅ SAFE - 10mb limit
const BODY_SIZE_LIMIT = '10mb';
app.use(express.json({ limit: BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_SIZE_LIMIT }));
```

**Attacker tries again:**
```javascript
// Attacker sends 1GB of data
const hugePayload = 'x'.repeat(1024 * 1024 * 1024);
fetch('https://your-api.com/appointments', {
  method: 'POST',
  body: JSON.stringify({ data: hugePayload })
});
// 🚫 "413 Payload Too Large" - BLOCKED before processing!
```

### Understanding Size Limits

| Limit | When to Use | Example |
|-------|-------------|---------|
| `1mb` | Strict (minimal data only) | Simple form submissions |
| `10mb` | Standard (most APIs) | File uploads, images |
| `50mb` | Large (file-heavy APIs) | Video uploads, large files |

### Error Handling for Large Payloads

```typescript
// Error handler for payload too large
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PayloadTooLargeError',
      message: 'Request entity too large. Maximum size is 10mb.',
    });
  }
  next(err);
});
```

---

## 🎓 Topic 5: Graceful Shutdown

### What is Graceful Shutdown?

**Graceful shutdown** means **properly closing the server** when it needs to stop. Instead of instantly killing the server, it:
1. Stops accepting new requests
2. Finishes processing existing requests
3. Closes connections cleanly
4. Then exits

**Think of it like:**
- **Airplane landing** - Plan the descent, don't just turn off engines mid-flight
- **Store closing** - Finish serving customers, then lock doors
- **App closing** - Save work, close files, then exit

### Why Graceful Shutdown Matters

**Without graceful shutdown:**
```typescript
// ❌ DANGEROUS - Instant kill
// User makes request
fetch('https://your-api.com/appointments', { method: 'POST', body: data });
// Deployment happens - server instantly kills
// 😱 Request is lost! User's data not saved!
```

**With graceful shutdown:**
```typescript
// ✅ SAFE - Graceful close
// User makes request
fetch('https://your-api.com/appointments', { method: 'POST', body: data });
// Deployment happens - server stops accepting new requests
// ✅ Existing request finishes successfully
// ✅ Then server closes cleanly
```

### Understanding Signals

**Signals = Messages to stop the process**

| Signal | When Sent | Real-World Analogy |
|--------|-----------|-------------------|
| `SIGTERM` | Docker/K8s during deployment | "Please close shop, we're renovating" |
| `SIGINT` | Ctrl+C in terminal | "Close app" button clicked |
| `SIGKILL` | Force kill (cannot be caught) | "Power cut" - instant stop (dangerous!) |

### Implementing Graceful Shutdown

```typescript
// Store server instance
let server: ReturnType<typeof app.listen>;

// Start server
server = app.listen(PORT, () => {
  logger.info({ port: PORT }, '🚀 Server is running...');
});

// Graceful shutdown function
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new requests (but finish existing ones)
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections if needed
    // await supabase.disconnect();
    
    logger.info('Graceful shutdown complete');
    process.exit(0); // Exit successfully
  });
  
  // Force close after 10 seconds (if server doesn't close cleanly)
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout...');
    process.exit(1); // Exit with error
  }, 10000);
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/K8s
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
```

### Unhandled Rejection Handler

**Unhandled rejection = Promise that failed but wasn't caught**

```typescript
// ❌ DANGEROUS - No handler
const badCode = async () => {
  throw new Error('Something went wrong!');
};
badCode(); // Promise rejected, but no .catch() - UNHANDLED!
// 😱 Process might hang or crash unpredictably
```

**With handler:**
```typescript
// ✅ SAFE - Handle unhandled rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error({
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }, 'Unhandled Promise Rejection');
  
  // In production: Exit (process is unstable)
  // In development: Warn but continue (easier debugging)
  if (env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});
```

### Uncaught Exception Handler

**Uncaught exception = Error that wasn't in try-catch**

```typescript
// ✅ SAFE - Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error({
    error: error.message,
    stack: error.stack,
  }, 'Uncaught Exception');
  
  // Always exit on uncaught exceptions (process is unstable)
  process.exit(1);
});
```

**Why always exit?**
- Uncaught exceptions mean the process is in an unknown state
- Continuing might corrupt data
- Better to crash and restart than continue with bad state

---

## 🎓 Topic 6: Enhanced Health Checks

### What Are Health Checks?

**Health checks** are endpoints that report **if your server is healthy and ready**. Monitoring systems use them to know if your server is working.

**Think of it like:**
- **Vital signs** - Heart rate, blood pressure (is patient healthy?)
- **System status** - Is server running? Database connected?
- **Readiness probe** - Is server ready to handle requests?

### Basic vs Enhanced Health Checks

**Basic health check:**
```typescript
// ❌ BASIC - Just returns "ok"
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
// Problem: Database might be down, but we still return "ok"!
```

**Enhanced health check:**
```typescript
// ✅ ENHANCED - Checks everything
app.get('/health', async (req, res) => {
  const dbConnected = await testDatabaseConnection();
  
  if (!dbConnected) {
    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      database: 'down',
    });
  }
  
  res.status(200).json({
    status: 'ok',
    database: 'connected',
    uptime: process.uptime(), // How long server has been running
    memory: process.memoryUsage(), // Memory usage stats
  });
});
```

### Understanding Status Codes

| Status Code | Meaning | When to Use |
|-------------|---------|-------------|
| `200 OK` | Everything is healthy | All systems operational |
| `503 Service Unavailable` | Service is down | Database disconnected, critical error |

**Why 503 instead of 200?**
- Monitoring systems can detect problems
- Load balancers can route away from unhealthy servers
- Clear signal that server needs attention

### Health Check Implementation

```typescript
export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  // Check database connection
  const dbConnected = await testConnection();
  
  // Get uptime (seconds)
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = `${Math.floor(uptimeSeconds / 60)}m ${Math.floor(uptimeSeconds % 60)}s`;
  
  // Get memory usage
  const memoryUsage = process.memoryUsage();
  
  if (!dbConnected) {
    return res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      database: 'disconnected',
      uptime: uptimeFormatted,
      timestamp: new Date().toISOString(),
    });
  }
  
  res.status(200).json({
    status: 'ok',
    message: 'Clariva Bot API is running',
    database: 'connected',
    uptime: uptimeFormatted,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}mb`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}mb`,
    },
    timestamp: new Date().toISOString(),
  });
});
```

---

## 🎓 Topic 7: Request Timeouts (Optional)

### What Are Request Timeouts?

**Request timeouts** automatically cancel requests that take **too long**. This prevents one slow request from blocking others.

**Think of it like:**
- **Phone call timeout** - If no one answers in 30 seconds, hang up
- **Restaurant order** - If food takes 2 hours, cancel order
- **API request** - If response takes 30 seconds, timeout

### Why Request Timeouts Matter

**Without timeouts:**
```typescript
// ❌ DANGEROUS - No timeout
app.get('/slow-endpoint', async (req, res) => {
  await verySlowOperation(); // Takes 5 minutes!
  res.json({ done: true });
});
// 😱 Request hangs for 5 minutes, blocks other requests!
```

**With timeouts:**
```typescript
// ✅ SAFE - 30 second timeout
app.use(timeout('30s')); // All requests timeout after 30 seconds
app.get('/slow-endpoint', async (req, res) => {
  await verySlowOperation(); // Takes 5 minutes...
  // 🚫 After 30 seconds: "408 Request Timeout" - Request cancelled!
});
```

---

## 🎓 Topic 8: Compression (Optional)

### What is Compression?

**Compression** reduces response size by **compressing data** before sending. This makes responses faster and uses less bandwidth.

**Think of it like:**
- **Zipping files** - 100MB file becomes 10MB zip file
- **Compressed air** - Same air, less space
- **Response compression** - Same data, smaller size

### How Compression Works

**Without compression:**
```http
Content-Length: 1,000,000 bytes (1MB)
{"data": [1, 2, 3, ... 10000 numbers]}
```

**With compression:**
```http
Content-Encoding: gzip
Content-Length: 100,000 bytes (100KB)
[Compressed binary data]
```

**90% smaller! Same data, faster transfer!**

### Compression Implementation

```typescript
import compression from 'compression';

app.use(compression({
  // Only compress responses larger than 1KB
  threshold: 1024,
  // Compression level (1-9, 6 is good balance)
  level: 6,
}));
```

**Automatic:** Express automatically compresses JSON, HTML, CSS, JavaScript responses!

---

## ✅ Learning Checklist

Before moving to implementation, make sure you understand:

- [ ] ✅ What security headers are and why Helmet is needed
- [ ] ✅ What CORS is and why we restrict origins in production
- [ ] ✅ What rate limiting is and why we need different limits for different endpoints
- [ ] ✅ What body size limits are and why they prevent DoS attacks
- [ ] ✅ What graceful shutdown is and why it matters for deployment
- [ ] ✅ What enhanced health checks are and why we return 503 for errors
- [ ] ✅ What request timeouts are (optional feature)
- [ ] ✅ What compression is and how it optimizes responses (optional feature)

---

## 🎯 Key Takeaways

1. **Security first:** Always protect your API with headers, CORS, and rate limiting
2. **Production vs Development:** Different configurations for different environments
3. **Graceful shutdown:** Always close servers properly (don't just kill them)
4. **Monitor health:** Enhanced health checks help detect problems early
5. **Prevent abuse:** Rate limiting and body size limits prevent attacks
6. **Optimize when needed:** Compression and timeouts are optional but helpful

---

## 🚀 Next Steps

Once you understand all these concepts:
1. Install security packages (helmet, express-rate-limit, compression)
2. Configure CORS with production origins
3. Set up rate limiting (general + auth limiters)
4. Add body size limits (10mb)
5. Implement graceful shutdown handlers
6. Enhance health check endpoint
7. Test all security features

**Remember:** Security is not optional - it's essential! 🛡️

---

## 🔗 Related Concepts

- **Middleware Order** - Security middleware must be in correct order
- **Error Handling** - How to handle security-related errors (413, 429, etc.)
- **Environment Variables** - Using NODE_ENV for different configurations
- **Logging** - Logging security events (rate limit violations, etc.)

---

**Last Updated:** January 17, 2026  
**Related Task:** Task 6 - Security & Reliability Improvements  
**Status:** 📚 Ready to Learn
