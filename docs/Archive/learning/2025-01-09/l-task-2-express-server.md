# Learning Topics - Express Server Setup
## Task #2: Express Server & HTTP Basics

---

## 📚 What Are We Learning Today?

Today we're learning about **Express.js** - the web server framework that makes our bot work! Think of it like a **receptionist at a clinic** who handles all incoming visitors, directs them to the right place, and responds to their requests.

We'll learn about:
1. **What is Express.js?** - The web server framework
2. **HTTP Methods (GET, POST)** - How computers talk to each other
3. **Routes & Endpoints** - Different "doors" for different requests
4. **Middleware** - Helpers that process requests before they reach your code
5. **Request & Response** - What comes in, what goes out
6. **Error Handling** - What to do when things go wrong

---

## 🎓 Topic 1: What is Express.js?

### What is Express.js?

**Express.js** is a **web framework** for Node.js. It makes building web servers MUCH easier.

**Think of it like:**
- **Node.js** = The building (basic structure)
- **Express.js** = The organized floor plan and systems (makes it useful)

### Real-World Analogy

Imagine you're setting up a **new clinic**:

1. **Raw Node.js** = Just an empty building
   - You'd have to build EVERYTHING from scratch
   - Handle every detail manually
   - Very time-consuming!

2. **Express.js** = Pre-built clinic with systems
   - Reception desk already set up
   - Room numbers already assigned
   - Phone system installed
   - Much faster to use!

### What Express Does for Us

```typescript
// Without Express (raw Node.js) - TOO COMPLICATED!
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }
  // ... 100 more lines for basic features
});

// With Express - SIMPLE!
import express from 'express';
const app = express();
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

**See the difference?** Express makes it **10x simpler**!

---

## 🎓 Topic 2: HTTP Methods (GET, POST)

### What is HTTP?

**HTTP** (HyperText Transfer Protocol) is how **computers talk to each other** over the internet.

**Think of it like:**
- **HTTP** = The language computers speak
- **GET** = Asking a question ("What's the status?")
- **POST** = Sending something ("Here's a message for you")

### Common HTTP Methods

| Method | What It Does | Real-World Analogy | Example |
|--------|--------------|-------------------|---------|
| **GET** | **Read** information | Asking a question | "What's my appointment time?" |
| **POST** | **Create** something | Submitting a form | "Book me an appointment" |
| **PUT** | **Update** something | Editing a record | "Change my appointment time" |
| **DELETE** | **Remove** something | Canceling | "Cancel my appointment" |

### GET vs POST (The Difference)

**GET Request:**
- Asks for information
- Data sent in URL (visible)
- Safe to refresh
- Example: `GET /health` (check if server is working)

**POST Request:**
- Sends data to server
- Data sent in body (hidden)
- Can't refresh (might duplicate)
- Example: `POST /webhooks/facebook` (receive a message)

### In Our Project

```typescript
// GET - Just reading/checking something
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });  // Just return status
});

// POST - Receiving data (like a message from Facebook)
app.post('/webhooks/facebook', (req, res) => {
  const message = req.body;  // Get the message data
  // Process the message...
  res.json({ received: true });
});
```

---

## 🎓 Topic 3: Routes & Endpoints

### What is a Route?

A **route** is a **path** that tells Express: "When someone visits THIS URL, do THIS thing."

**Think of it like:**
- **Route** = A room number in your clinic
- `/health` = Room 101 (Health Check Room)
- `/webhooks/facebook` = Room 201 (Facebook Messages Room)

### What is an Endpoint?

An **endpoint** = Route + HTTP Method

**Example:**
- `GET /health` = Endpoint for checking server health
- `POST /webhooks/facebook` = Endpoint for receiving Facebook messages

### Route Structure Explained

```typescript
// Pattern: app.METHOD('PATH', HANDLER_FUNCTION)

app.get('/health', (req, res) => {
  //  ↑    ↑         ↑         ↑
  //  |    |         |         └─ What to do (function)
  //  |    |         └─ Path/URL (/health)
  //  |    └─ HTTP Method (GET)
  //  └─ Express app
});
```

### Real Example: Our Server

```typescript
// Route 1: Root endpoint ("home page")
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Clariva Bot API' });
});

// Route 2: Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Route 3: Facebook webhook (receives messages)
app.post('/webhooks/facebook', (req, res) => {
  // Handle incoming Facebook message
  res.json({ received: true });
});
```

### Nested Routes (Organizing)

```typescript
// Instead of this (messy):
app.post('/webhooks/facebook', ...);
app.post('/webhooks/whatsapp', ...);
app.post('/webhooks/instagram', ...);

// We do this (organized):
import webhookRoutes from './routes/webhooks';
app.use('/webhooks', webhookRoutes);  // All webhook routes together
```

**Benefits:**
- Organized code
- Easier to find things
- Better structure

---

## 🎓 Topic 4: Middleware

### What is Middleware?

**Middleware** is code that runs **BETWEEN** receiving a request and sending a response.

**Think of it like:**
- **Request** comes in
- **Middleware 1** checks: "Is this allowed?" (CORS)
- **Middleware 2** checks: "Can I read this?" (JSON parser)
- **Your code** processes it
- **Response** goes out

### Visual Flow

```
Request arrives
    ↓
Middleware 1: CORS (allows cross-origin requests)
    ↓
Middleware 2: JSON Parser (converts JSON to object)
    ↓
Middleware 3: URL Parser (converts form data)
    ↓
Your route handler (processes the request)
    ↓
Response sent
```

### Common Middleware in Our Project

#### 1. CORS (Cross-Origin Resource Sharing)

```typescript
app.use(cors());
```

**What it does:** Allows requests from different websites (like your frontend dashboard)

**Think of it like:** Security guard who checks IDs but allows approved visitors

**Why we need it:** Your frontend (Next.js) and backend (Express) are on different URLs

#### 2. JSON Parser

```typescript
app.use(express.json());
```

**What it does:** Converts JSON strings to JavaScript objects automatically

**Example:**
```typescript
// Without middleware:
const data = JSON.parse(req.body);  // Manual parsing

// With middleware:
const data = req.body;  // Already parsed! 🎉
```

**Think of it like:** Translator who automatically converts languages

#### 3. URL Encoded Parser

```typescript
app.use(express.urlencoded({ extended: true }));
```

**What it does:** Parses form data (like from HTML forms)

**Why we need it:** Facebook/Instagram sometimes send data this way

### Middleware Order Matters!

```typescript
// ❌ WRONG ORDER - CORS should be first!
app.use(express.json());
app.use(cors());  // Too late! Request already parsed

// ✅ CORRECT ORDER - CORS first, then parsers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

**Why?** Middleware runs **in order**, so put security/permissions first!

---

## 🎓 Topic 5: Request & Response

### What is a Request?

A **request** is what **comes in** - someone asking for something.

**Request Object (`req`):**
- Contains information about the request
- Headers, body, URL, method, etc.

### What is a Response?

A **response** is what **goes out** - your answer back to them.

**Response Object (`res`):**
- Used to send data back
- Can send JSON, text, status codes, etc.

### Request Object Explained

```typescript
app.get('/health', (req, res) => {
  // req (request) contains:
  console.log(req.method);  // GET, POST, etc.
  console.log(req.url);     // /health
  console.log(req.headers); // Request headers
  console.log(req.query);   // URL parameters (?name=John)
  console.log(req.params);  // Route parameters (:id)
  console.log(req.body);    // Request body (for POST)
});
```

**Real Example:**
```typescript
// GET /health?doctor_id=123
app.get('/health', (req, res) => {
  const doctorId = req.query.doctor_id;  // Gets "123"
  // ... use doctorId
});
```

### Response Object Explained

```typescript
app.get('/health', (req, res) => {
  // res (response) methods:
  
  // Send JSON response (most common)
  res.json({ status: 'ok' });
  
  // Send text response
  res.send('Hello World');
  
  // Send status code only
  res.status(200).send('OK');
  
  // Send error
  res.status(404).json({ error: 'Not found' });
  
  // Set header
  res.setHeader('Content-Type', 'application/json');
  
  // End response (stops processing)
  res.end();
});
```

### Common Response Patterns

#### 1. Success Response
```typescript
res.status(200).json({ 
  status: 'success',
  data: { message: 'Appointment booked' }
});
```

#### 2. Error Response
```typescript
res.status(400).json({ 
  status: 'error',
  message: 'Invalid date format'
});
```

#### 3. Not Found Response
```typescript
res.status(404).json({ 
  error: 'Appointment not found'
});
```

---

## 🎓 Topic 6: Error Handling

### Why Error Handling?

**Things WILL go wrong!** Your code needs to handle errors gracefully.

**Without error handling:**
- Server crashes
- Users see ugly error messages
- Bad experience!

**With error handling:**
- Errors are caught
- Friendly messages sent
- Server keeps running

### Try-Catch Block

```typescript
app.post('/webhooks/facebook', async (req, res) => {
  try {
    // Try to do something
    const message = req.body;
    await processMessage(message);  // Might fail!
    res.json({ success: true });
  } catch (error) {
    // If it fails, handle it here
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Something went wrong',
      message: error.message 
    });
  }
});
```

**Think of it like:**
- **Try** = "Attempt to do this"
- **Catch** = "If it fails, do this instead"

### Error Handling Middleware

```typescript
// Error handling middleware (goes LAST, after all routes)
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' 
      ? err.message  // Show details in development
      : 'Something went wrong'  // Hide details in production
  });
});
```

**Why LAST?** It catches errors from ALL routes!

### Custom Error Classes

```typescript
// Create custom error
class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

// Use it
if (!email) {
  throw new ValidationError('Email is required');
}

// Handle it
catch (error) {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
  } else {
    res.status(500).json({ error: 'Server error' });
  }
}
```

---

## 🎓 Topic 7: Server Lifecycle

### How Our Server Starts

```typescript
// Step 1: Load environment variables
dotenv.config();

// Step 2: Create Express app
const app = express();

// Step 3: Set up middleware
app.use(cors());
app.use(express.json());

// Step 4: Set up routes
app.get('/health', (req, res) => { ... });
app.use('/webhooks', webhookRoutes);

// Step 5: Connect to database
initializeDatabase()
  .then(() => {
    console.log('✅ Database connected');
    
    // Step 6: Start listening for requests
    app.listen(3000, () => {
      console.log('🚀 Server running on port 3000');
    });
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error);
    process.exit(1);  // Stop server if DB fails
  });
```

### Port Numbers Explained

```typescript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**What is a Port?**
- Like a **door number** in an apartment building
- **Port 3000** = Door #3000
- **localhost:3000** = This computer, door #3000

**Common Ports:**
- **3000** = Development (default for us)
- **80** = HTTP (web)
- **443** = HTTPS (secure web)
- **5000** = Alternative development

---

## 🎓 Topic 8: Putting It All Together

### Complete Server File Explained

```typescript
// 1. Import required modules
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database';
import webhookRoutes from './routes/webhooks';

// 2. Load environment variables
dotenv.config();

// 3. Create Express application
const app = express();
const PORT = process.env.PORT || 3000;

// 4. Middleware (process requests BEFORE routes)
app.use(cors());                    // Allow cross-origin requests
app.use(express.json());            // Parse JSON bodies
app.use(express.urlencoded({        // Parse form data
  extended: true 
}));

// 5. Routes (handle specific requests)
// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Clariva Bot API is running',
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Clariva Care AI Receptionist Bot API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhooks: '/webhooks',
    },
  });
});

// Webhook routes (organized in separate file)
app.use('/webhooks', webhookRoutes);

// 6. Connect to database, then start server
initializeDatabase()
  .then(() => {
    console.log('✅ Database connected successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);  // Exit if database fails
  });
```

### Flow Diagram

```
1. Request arrives: GET /health
   ↓
2. CORS middleware: "Allow this request"
   ↓
3. JSON middleware: "Parse if JSON" (not needed for GET)
   ↓
4. Route matcher: "This matches /health route"
   ↓
5. Route handler: res.json({ status: 'ok' })
   ↓
6. Response sent: { status: 'ok' }
```

---

## 🧪 Practice Exercises

### Exercise 1: Understanding HTTP Methods

What HTTP method would you use for:
1. Checking if server is running? → **GET**
2. Receiving a message from Facebook? → **POST**
3. Getting list of appointments? → **GET**
4. Creating a new appointment? → **POST**

### Exercise 2: Understanding Routes

Match the route to its purpose:
- `GET /health` → Check server status
- `POST /webhooks/facebook` → Receive Facebook messages
- `GET /appointments` → List appointments
- `POST /appointments` → Create appointment

### Exercise 3: Understanding Middleware

Put these in correct order:
1. CORS middleware
2. JSON parser
3. Route handlers
4. Error handler

**Answer:** 1 → 2 → 3 → 4

---

## ✅ Checklist: Do I Understand?

Before moving forward to build the Express server, make sure you understand:

- [x] ✅ Express.js is a web framework that makes building servers easier
- [x] ✅ HTTP methods (GET, POST) - GET reads, POST sends data
- [x] ✅ Routes define paths (like `/health`) that handle requests
- [x] ✅ Endpoints = Route + HTTP Method (like `GET /health`)
- [x] ✅ Middleware processes requests before routes (CORS, JSON parser)
- [x] ✅ Request (`req`) contains incoming data
- [x] ✅ Response (`res`) sends data back to client
- [x] ✅ Error handling prevents server crashes (try-catch)
- [x] ✅ Server lifecycle: Setup → Middleware → Routes → Listen
- [x] ✅ Port numbers are like door numbers (3000 for development)

**Status:** ✅ **COMPLETED** - January 9, 2025

---

## 🚀 Next Steps

Once you understand all these concepts, you're ready to:

1. ✅ Create `src/index.ts` - Main server file
2. ✅ Set up Express app with middleware
3. ✅ Create health check endpoint
4. ✅ Set up error handling
5. ✅ Test server runs on `localhost:3000`
6. ✅ Verify health check endpoint works

**Then move to:** Development Task 2 in `docs/development/daily-plans/2025-01-09/e-task-2-express-server.md`

---

## 📖 Additional Resources

- **Express.js Guide**: https://expressjs.com/en/guide/routing.html
- **HTTP Methods**: https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
- **Node.js Documentation**: https://nodejs.org/docs/

---

## 🎯 Quick Reference

### Essential Express Patterns

```typescript
// Import Express
import express, { Request, Response } from 'express';

// Create app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/path', (req, res) => {
  res.json({ message: 'Hello' });
});

// Start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

**Status:** ✅ **COMPLETED** - January 9, 2025  
**Date:** January 9, 2025  
**Next:** Build the Express server (Task 2 in development folder)
