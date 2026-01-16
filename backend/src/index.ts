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
import { ZodError } from 'zod';
import routes from './routes';
import { initializeDatabase } from './config/database';
import { AppError, formatError, ValidationError } from './utils/errors';
import { env } from './config/env';
import { correlationId } from './middleware/correlation-id';
import { requestTiming } from './middleware/request-timing';
import { logger, createLogContext } from './config/logger';

// Create Express application
const app = express();
const PORT = env.PORT;

// Middleware (process requests BEFORE routes)
// Order matters: correlation ID first, then timing, then security, then parsers, then routes, finally error handlers
// MUST: Mount correlation-id and request-timing early - see RECIPES.md sections 8-9
app.use(correlationId);            // First - generates correlation ID for request tracing
app.use(requestTiming);             // Second - sets req.startTime for duration calculation
app.use(cors());                    // Allow cross-origin requests (security)
app.use(express.json());            // Parse JSON bodies
app.use(express.urlencoded({        // Parse form data
  extended: true
}));

// Routes
// All routes are aggregated in routes/index.ts and mounted here
app.use('/', routes);

// Error handling middleware (goes LAST, after all routes)
// This catches any errors thrown in route handlers
// MUST: Use NextFunction type, not Function
// MUST: Include standard log fields (correlationId, path, method, statusCode, durationMs) - see STANDARDS.md
// MUST: Map ZodError to ValidationError (400) - see STANDARDS.md
app.use((err: Error | AppError | ZodError, req: Request, res: Response, _next: NextFunction) => {
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

// Initialize database and start server
// Database connection must succeed before server starts accepting requests
initializeDatabase()
  .then(() => {
    // Database connected successfully, start server
    app.listen(PORT, () => {
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

// Export app for testing (useful for integration tests)
export default app;
