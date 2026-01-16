/**
 * TypeScript Type Definitions
 * 
 * This file contains common TypeScript interfaces and types used throughout the application.
 * 
 * Structure:
 * - API Request/Response types
 * - Database model types (to be added)
 * - Service types
 * - Utility types
 * 
 * IMPORTANT: Express type extensions are defined in express.d.ts and should be automatically loaded
 * by TypeScript. If you see type errors, ensure express.d.ts is in the include path.
 */

// ============================================================================
// API Types
// ============================================================================

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

/**
 * Health check response type
 */
export interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}

/**
 * Root endpoint response type
 */
export interface RootResponse {
  message: string;
  version: string;
  endpoints: {
    health: string;
    webhooks: string;
  };
}

// ============================================================================
// Database Types (Placeholder - to be expanded)
// ============================================================================

// Database model types will be added here as we create the schema
// Example:
// export interface Doctor { ... }
// export interface Patient { ... }
// export interface Appointment { ... }

// ============================================================================
// Service Types (Placeholder - to be expanded)
// ============================================================================

// Service-specific types will be added here
// Example:
// export interface AIServiceResponse { ... }
// export interface BookingServiceData { ... }

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic error response type
 */
export interface ErrorResponse {
  error: string;
  message: string;
  timestamp?: string;
}
