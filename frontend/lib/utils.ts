import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge and conditionally apply Tailwind CSS classes.
 * Use for combining or overriding classes (e.g. with component variants).
 * @see FRONTEND_RECIPES F5, FRONTEND_ARCHITECTURE
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
