// Load environment variables FIRST, before any other imports
// This ensures .env file is loaded before database.ts tries to read env vars
import dotenv from 'dotenv';
dotenv.config();

// Import type setup FIRST to ensure Express type extensions are loaded
// This ensures correlationId and startTime are available on Request
// This is required for ts-node to recognize the type extensions
import './types/setup';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import compression from 'compression';
import { ZodError } from 'zod';
import routes from './routes';
import { initializeDatabase } from './config/database';
import { closeQueue } from './config/queue';
import { AppError, formatError, ValidationError, NotFoundError, TooManyRequestsError } from './utils/errors';
import { env } from './config/env';
import { startWebhookWorker, stopWebhookWorker } from './workers/webhook-worker';
import { correlationId } from './middleware/correlation-id';
import { requestTiming } from './middleware/request-timing';
import { requestLogger } from './middleware/request-logger';
import { requestTimeout } from './middleware/request-timeout';
import { sanitizeInput } from './middleware/sanitize-input';
import { logger, createLogContext } from './config/logger';
import { errorResponse } from './utils/response';
import { logSecurityEvent } from './utils/audit-logger';

// Create Express application
const app = express();
const PORT = env.PORT;

// Trust Proxy Configuration (MUST for production and development with ngrok)
// In production, API is typically behind a reverse proxy (nginx, load balancer, CDN)
// In development, ngrok sends X-Forwarded-For headers, so we need to trust proxy
// Without trust proxy, req.ip returns proxy IP instead of client IP
// Critical for accurate rate limiting per client
// Use 1 instead of true to trust only the first proxy (more secure than trusting all proxies)
app.set('trust proxy', 1); // Trust only first proxy (ngrok = 1 hop, production load balancer = 1 hop)

// Disable X-Powered-By header (security best practice)
// Express sends "X-Powered-By: Express" header by default
// Exposes server technology stack (security risk)
// Attackers can target known Express vulnerabilities
app.disable('x-powered-by');

// Body size limit constant (10mb - prevents DoS attacks)
const BODY_SIZE_LIMIT = '10mb';

// CORS configuration - Production (explicit, strict)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://clariva.com',
      'https://www.clariva.com',
      'https://app.clariva.com',
      'https://clariva-bot.vercel.app',
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies/credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID', 'Location'], // Location needed for Instagram connect redirect
  maxAge: 86400, // Cache preflight for 24 hours
};

// CORS configuration - Development (explicit, permissive)
const corsOptionsDev: cors.CorsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID', 'Location'],
  maxAge: 86400,
};

// General API rate limiter (applies to all routes by default)
// MUST: Use canonical error format via handler (not message) per RECIPES.md R-RATE-LIMIT-001
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 1000, // 100 requests (prod) or 1000 (dev) per 15 minutes
  handler: (req: Request, res: Response) => {
    const error = new TooManyRequestsError('Too many requests from this IP, please try again later.');
    // errorResponse returns object with canonical format: { success: false, error: {...}, meta: {...} }
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Strict rate limiter for authentication endpoints (future use)
// MUST: Use canonical error format via handler (not message) per RECIPES.md R-RATE-LIMIT-001
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes (prevents brute force)
  handler: (req: Request, res: Response) => {
    const error = new TooManyRequestsError('Too many authentication attempts, please try again later.');
    // errorResponse returns object with canonical format: { success: false, error: {...}, meta: {...} }
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed auth attempts
});

// Note: webhookLimiter has been moved to middleware/rate-limiters.ts
// to avoid circular dependency (routes import from index.ts, index.ts imports routes)

// User-based rate limiter for authenticated routes
// MUST: Use canonical error format via handler (not message) per RECIPES.md R-RATE-LIMIT-001
// MUST: Mount after auth middleware on protected routes (user must be authenticated)
// MUST: Audit log rate limit violations per COMPLIANCE.md
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes per user
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, fallback to IP using ipKeyGenerator for IPv6 support
    if (req.user?.id) {
      return req.user.id;
    }
    // Use ipKeyGenerator helper to properly handle IPv6 addresses
    const ip = ipKeyGenerator(req as any);
    return ip || 'unknown';
  },
  handler: async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // Audit log rate limit violation (fire and forget - don't block response)
    // Note: Audit logging failures should not prevent rate limit response
    logSecurityEvent(
      correlationId,
      userId,
      'rate_limit_exceeded',
      'medium', // Medium severity - rate limit violations are security events
      ipAddress,
      'Rate limit exceeded for user'
    ).catch((error) => {
      // Log audit failure but don't throw (audit logging shouldn't break main flow)
      logger.error(
        { error, correlationId, userId, ipAddress },
        'Failed to audit log rate limit violation'
      );
    });

    const error = new TooManyRequestsError('Too many requests, please try again later.');
    // errorResponse returns object with canonical format: { success: false, error: {...}, meta: {...} }
    res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Middleware (process requests BEFORE routes)
// ============================================================================
// MUST: Mount middleware in exact order per STANDARDS.md "Non-Negotiable Middleware Order"
// Order matters: correlation ID first, then timing, then body parsers, then security, then logging, then routes, finally error handlers
// Critical dependencies:
// - correlationId MUST be FIRST (before body parsers) - ensures correlation ID exists even if body parsing fails
// - requestTiming MUST be SECOND (after correlationId) - needs correlation ID for logging
// - body parsers MUST be THIRD (after correlationId) - if parsing fails, correlation ID already exists for error logging
// - requestLogger MUST be EIGHTH (after cors, needs timing + correlationId)
// - errorMiddleware MUST be LAST (catches all errors)

// 1. Correlation ID middleware (FIRST - before body parsers)
// Generates correlation ID for request tracing
// MUST: Come before body parsers so correlation ID exists even if body parsing fails
app.use(correlationId);

// 2. Request timing middleware (SECOND - after correlationId)
// Sets req.startTime for duration calculation
// MUST: Come after correlationId (needs correlation ID for logging)
app.use(requestTiming);

// 3. Body parsing middleware (THIRD - after correlationId)
// Parse JSON and URL-encoded bodies with size limits to prevent DoS attacks
// MUST: Come after correlationId - if parsing fails, correlation ID already exists for error logging
// CRITICAL: Capture raw body for webhook signature verification (required for security)
app.use(express.json({
  limit: BODY_SIZE_LIMIT,
  verify: (req: Request, _res: Response, buf: Buffer) => {
    // Store raw body for webhook signature verification
    // Signature verification requires exact raw bytes, not parsed JSON
    (req as any).rawBody = buf;
  },
})); // Parse JSON bodies (max 10mb)
app.use(
  express.urlencoded({
    // Parse form data (max 10mb)
    extended: true,
    limit: BODY_SIZE_LIMIT,
  })
);

// 4. Input sanitization middleware (FOURTH - after body parsers)
// Removes HTML/script tags to prevent XSS attacks
// MUST: Come after body parsers (needs parsed body)
// MUST: Preserve legitimate data (emails, URLs, JSON structure)
app.use(sanitizeInput);

// 5. Compression middleware (FIFTH)
// Reduce response size for better performance
app.use(
  compression({
    threshold: 1024, // Only compress responses larger than 1KB
    level: 6, // Compression level (1-9, 6 is good balance)
  })
);

// 6. Security headers middleware (SIXTH - Helmet)
// Sets security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(
  helmet({
    // Security headers (Helmet)
    contentSecurityPolicy: env.NODE_ENV === 'production',
  })
);

// 7. CORS middleware (SEVENTH)
// Configure Cross-Origin Resource Sharing
// MUST: Use explicit corsOptionsDev (not cors({})) per RECIPES.md R-CORS-001
app.use(cors(env.NODE_ENV === 'production' ? corsOptions : corsOptionsDev));

// 8. Request logging middleware (EIGHTH - after cors, needs timing + correlationId)
// Logs all requests with standard fields (correlationId, path, method, statusCode, durationMs)
// MUST: Come after requestTiming (needs req.startTime) and after correlationId (needs req.correlationId)
// MUST: Come after cors (for proper logging)
app.use(requestLogger);

// 9. Request timeout middleware (NINTH - after requestLogger, before rateLimit)
// Prevents hanging requests by timing out after 30 seconds
app.use(requestTimeout(30000)); // 30 seconds timeout

// 10. Rate limiting middleware (TENTH - after requestLogger, before routes)
// Applies IP-based rate limiting to all routes by default
// For authenticated routes, use userLimiter after auth middleware (see routes)
app.use(apiLimiter);

// ETag Support (HTTP conditional requests for better caching)
// Enables HTTP conditional requests (If-None-Match)
// Reduces bandwidth (304 Not Modified responses)
// Improves caching behavior for clients
app.set('etag', 'strong'); // 'strong' validates exact content match (safer, more validation)
// Alternative: 'weak' allows semantic equivalence (faster, less validation)

// Routes
// All routes are aggregated in routes/index.ts and mounted here
app.use('/', routes);

// 404 Handler - Must be AFTER all routes but BEFORE error handler
// Catches all unmatched routes and returns proper JSON 404 response
// MUST: Use NotFoundError (typed error class) per STANDARDS.md
app.use((req: Request, _res: Response, next: NextFunction) => {
  const notFoundError = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(notFoundError); // Pass to error handler middleware
});

// Error handling middleware (goes LAST, after all routes)
// This catches any errors thrown in route handlers
// MUST: Use NextFunction type, not Function
// MUST: Include standard log fields (correlationId, path, method, statusCode, durationMs) - see STANDARDS.md
// MUST: Map ZodError to ValidationError (400) - see STANDARDS.md
app.use(
  (err: Error | AppError | ZodError, req: Request, res: Response, _next: NextFunction): void => {
    // Handle payload too large errors (413)
    // MUST: Use errorResponse helper per CONTRACTS.md
    if ((err as any).type === 'entity.too.large') {
      res.status(413).json(errorResponse({
        code: 'PayloadTooLargeError',
        message: `Request entity too large. Maximum size is ${BODY_SIZE_LIMIT}.`,
        statusCode: 413,
      }, req));
      return;
    }

    // Map ZodError to ValidationError (MUST per STANDARDS.md)
    if (err instanceof ZodError) {
      const validationError = new ValidationError(
        `Validation failed: ${err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
      err = validationError;
    }

    // Format error for response (includes status code from AppError)
    const formatted = formatError(err, env.NODE_ENV === 'development');

    // Log error with standard fields (MUST per STANDARDS.md)
    const logContext = createLogContext(req, {
      statusCode: formatted.statusCode,
      error: formatted.error,
      message: formatted.message,
      ...(env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : {}),
    });

    logger.error(logContext, 'Error occurred');

    // Send error response
    // MUST: Use errorResponse helper per CONTRACTS.md
    res.status(formatted.statusCode || 500).json(errorResponse({
      code: formatted.error,
      message: formatted.message,
      statusCode: formatted.statusCode || 500,
    }, req, env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : undefined));
  }
);

// Store server instance for graceful shutdown
let server: ReturnType<typeof app.listen>;

// Initialize database and start server
// Database connection must succeed before server starts accepting requests
initializeDatabase()
  .then(() => {
    // Database connected successfully, start server
    server = app.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
          environment: env.NODE_ENV,
        },
        `🚀 Server is running on http://localhost:${PORT}`
      );
      logger.info(
        {
          path: '/health',
        },
        `📊 Health check: http://localhost:${PORT}/health`
      );
      // Start webhook worker when REDIS_URL is set (async, non-blocking)
      startWebhookWorker();
    });

    // Server Keep-Alive Configuration
    // Controls HTTP connection reuse
    // Prevents hanging connections
    // Optimizes performance
    if (server && typeof server.keepAliveTimeout === 'number') {
      server.keepAliveTimeout = 65000; // 65 seconds (slightly higher than default)
      server.headersTimeout = 66000; // 66 seconds (must be > keepAliveTimeout)
    }
  })
  .catch((error: Error) => {
    // Database connection failed, stop server
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      '❌ Failed to start server'
    );
    logger.error('Please check your database configuration in .env file');
    process.exit(1); // Exit with error code
  });

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  const finishShutdown = (): void => {
    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  const shutdownAsync = async (): Promise<void> => {
    try {
      await stopWebhookWorker();
      await closeQueue();
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Error closing queue/worker during shutdown'
      );
    }
    finishShutdown();
  };

  // Stop accepting new requests (but finish existing ones)
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      shutdownAsync();
    });

    // Force close after 10 seconds (if server doesn't close cleanly)
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout...');
      process.exit(1);
    }, 10000);
  } else {
    shutdownAsync();
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/K8s sends this
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C sends this

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error(
    {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    },
    'Unhandled Promise Rejection'
  );

  // In production, exit on unhandled rejections (process is unstable)
  // In development, warn but continue (easier debugging)
  if (env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error(
    {
      error: error.message,
      stack: error.stack,
    },
    'Uncaught Exception'
  );

  // Always exit on uncaught exceptions (process is unstable)
  process.exit(1);
});

// Export app for testing (useful for integration tests)
export default app;


