/**
 * Persist the Rx review "Also print" checkbox across patients.
 */

export const RX_ALSO_PRINT_STORAGE_KEY = "rx/also-print";

export function readAlsoPrintPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RX_ALSO_PRINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAlsoPrintPreference(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RX_ALSO_PRINT_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}
