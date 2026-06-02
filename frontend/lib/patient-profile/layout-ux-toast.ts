/**
 * Lightweight toast surface for R-LAYOUT-UX until a global toast lib ships.
 */

export const layoutUxToast = {
  error(message: string): void {
    if (typeof console !== "undefined") {
      console.warn("[layout-ux]", message);
    }
  },
};
