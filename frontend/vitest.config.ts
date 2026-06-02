import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vitest configuration for the Clariva frontend.
 *
 * Key concerns solved here:
 *   - `"jsx": "preserve"` in tsconfig.json is required by Next.js but
 *     breaks Vitest/Rolldown JSX parsing. `@vitejs/plugin-react` handles
 *     the JSX transform so test files don't need to go through the Next.js
 *     webpack pipeline.
 *   - The `@/*` tsconfig alias must be replicated here so imports resolve
 *     the same way in tests as they do at build time.
 *   - `jsdom` provides a browser-like DOM environment for RTL tests.
 *   - `setupFiles` imports `@testing-library/jest-dom` matchers globally
 *     so each test file doesn't need to import it explicitly (though some
 *     do; the double-import is harmless).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
