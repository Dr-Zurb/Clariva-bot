/**
 * Type Setup File
 *
 * This file ensures Express type extensions are loaded by importing the type definitions.
 * It's imported early in the application to ensure types are available.
 *
 * This is a workaround for ts-node not automatically picking up .d.ts files with declare global.
 */

// This import ensures express.ts is processed by TypeScript
// The file itself doesn't export anything, but the declare global inside it extends Express.Request
import './express';

// Export empty object to make this a valid module
export {};
