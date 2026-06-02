/**
 * Cmd-K palette telemetry — counts-only, no PHI.
 *
 * Sub-batch B / task-ui-B4 — the global command palette emits three
 * lifecycle events:
 *
 *   - `cmdk.opened`            once per palette open (keyboard or trigger).
 *   - `cmdk.searched(querylen)` once per debounce cycle. **Length only**, never
 *                                the query string itself.
 *   - `cmdk.selected(source)`  once per selection. Source key (`"patients"`)
 *                                is non-PHI; the selected item id, name,
 *                                phone, etc. are NOT emitted.
 *
 * PHI hygiene
 * -----------
 * The function signatures intentionally have no parameter capable of
 * carrying patient names, phone numbers, query content, or any free-text
 * clinical content. Mirrors the pattern locked in
 * `frontend/lib/ehr/telemetry.ts` (Decision §23 LOCKED 2026-05-03):
 * one place to swap in a production analytics SDK; one auditable invariant.
 *
 * V1 implementation: `console.debug` with a grep-friendly prefix
 * (`[ehr:cmdk]`). QA validates PHI hygiene by filtering the console for
 * this prefix and inspecting payloads.
 *
 * @see frontend/components/layout/GlobalCommandPalette.tsx
 * @see frontend/lib/ehr/telemetry.ts (sibling pattern)
 */

const PREFIX = "[ehr:cmdk]";

/** Source key — non-PHI enum string. Mirrors `Source.key` in the palette. */
export type CmdkSourceKey = "patients" | "appointments" | "drugs" | "settings";

function emit(event: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    // eslint-disable-next-line no-console
    console.debug(PREFIX, event, payload ?? {});
  } catch {
    // Telemetry must never break the palette.
  }
}

/** Palette opened (keyboard shortcut or trigger click). */
export function cmdkOpened(): void {
  emit("opened");
}

/**
 * Debounced search cycle fired. We only emit the query LENGTH so the
 * analytics layer can calibrate "doctors typed N chars before selecting"
 * without ever seeing the query content itself.
 */
export function cmdkSearched(queryLen: number): void {
  emit("searched", { queryLen });
}

/** A result was selected from the given source. */
export function cmdkSelected(source: CmdkSourceKey): void {
  emit("selected", { source });
}
