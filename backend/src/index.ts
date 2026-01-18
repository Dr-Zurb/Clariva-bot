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
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { ZodError } from 'zod';
import routes from './routes';
import { initializeDatabase } from './config/database';
import { AppError, formatError, ValidationError, NotFoundError } from './utils/errors';
import { env } from './config/env';
import { correlationId } from './middleware/correlation-id';
import { requestTiming } from './middleware/request-timing';
import { requestLogger } from './middleware/request-logger';
import { requestTimeout } from './middleware/request-timeout';
import { logger, createLogContext } from './config/logger';

// Create Express application
const app = express();
const PORT = env.PORT;

// Body size limit constant (10mb - prevents DoS attacks)
const BODY_SIZE_LIMIT = '10mb';

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = env.NODE_ENV === 'production'
      ? [
          'https://clariva.com',
          'https://www.clariva.com',
          'https://app.clariva.com',
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
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
  exposedHeaders: ['X-Correlation-ID'], // Expose custom headers
  maxAge: 86400, // Cache preflight for 24 hours
};

// General API rate limiter (applies to all routes by default)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 1000, // 100 requests (prod) or 1000 (dev) per 15 minutes
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many requests from this IP, please try again later.',
    status: 429,
  },
  skipSuccessfulRequests: false,
});

// Strict rate limiter for authentication endpoints (future use)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes (prevents brute force)
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many authentication attempts, please try again later.',
    status: 429,
  },
  skipSuccessfulRequests: true, // Only count failed auth attempts
});

// Middleware (process requests BEFORE routes)
// Order matters: correlation ID first, then timing, then logging, then security, then parsers, then routes, finally error handlers
// MUST: Mount correlation-id and request-timing early - see RECIPES.md sections 8-9
// MUST: Follow middleware order per ARCHITECTURE.md
app.use(correlationId);            // First - generates correlation ID for request tracing
app.use(requestTiming);             // Second - sets req.startTime for duration calculation
app.use(requestLogger);             // Third - logs all requests with standard fields (correlationId, path, method, statusCode, durationMs)

// Security middleware (after logging, before body parsers)
app.use(cors(env.NODE_ENV === 'production' ? corsOptions : {})); // CORS - production: restricted origins, dev: all origins
app.use(helmet({                    // Security headers (Helmet)
  contentSecurityPolicy: env.NODE_ENV === 'production',
}));

// Body parsing middleware (with size limits to prevent DoS attacks)
app.use(express.json({ limit: BODY_SIZE_LIMIT })); // Parse JSON bodies (max 10mb)
app.use(express.urlencoded({        // Parse form data (max 10mb)
  extended: true,
  limit: BODY_SIZE_LIMIT,
}));

// Compression middleware (reduce response size)
app.use(compression({
  threshold: 1024, // Only compress responses larger than 1KB
  level: 6, // Compression level (1-9, 6 is good balance)
}));

// Request timeout middleware (before routes, prevents hanging requests)
app.use(requestTimeout(30000)); // 30 seconds timeout

// Rate limiting (before routes, applies to all routes by default)
app.use(apiLimiter);

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
app.use((err: Error | AppError | ZodError, req: Request, res: Response, _next: NextFunction): void => {
  // Handle payload too large errors (413)
  if ((err as any).type === 'entity.too.large') {
    res.status(413).json({
      error: 'PayloadTooLargeError',
      message: `Request entity too large. Maximum size is ${BODY_SIZE_LIMIT}.`,
    });
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
  res.status(formatted.statusCode || 500).json({
    error: formatted.error,
    message: formatted.message,
    ...(env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : {}),
  });
});

// Store server instance for graceful shutdown
let server: ReturnType<typeof app.listen>;

// Initialize database and start server
// Database connection must succeed before server starts accepting requests
initializeDatabase()
  .then(() => {
    // Database connected successfully, start server
    server = app.listen(PORT, () => {
      logger.info({
        port: PORT,
        environment: env.NODE_ENV,
      }, `🚀 Server is running on http://localhost:${PORT}`);
      logger.info({
        path: '/health',
      }, `📊 Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error: Error) => {
    // Database connection failed, stop server
    logger.error({
      error: error.message,
      stack: error.stack,
    }, '❌ Failed to start server');
    logger.error('Please check your database configuration in .env file');
    process.exit(1); // Exit with error code
  });

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new requests (but finish existing ones)
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections if needed
      // Note: Supabase client doesn't need explicit disconnect
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force close after 10 seconds (if server doesn't close cleanly)
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout...');
      process.exit(1);
    }, 10000);
  } else {
    // Server not started yet
    process.exit(0);
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/K8s sends this
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C sends this

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }, 'Unhandled Promise Rejection');
  
  // In production, exit on unhandled rejections (process is unstable)
  // In development, warn but continue (easier debugging)
  if (env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error({
    error: error.message,
    stack: error.stack,
  }, 'Uncaught Exception');
  
  // Always exit on uncaught exceptions (process is unstable)
  process.exit(1);
});

// Export app for testing (useful for integration tests)
export default app;
