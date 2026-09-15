/**
 * Visit command-bar telemetry — counts-only, no PHI (rfec-03).
 *
 * Own prefix (`[ehr:rxcmd]`), not `[ehr:cmdk]`. Payloads are length / kind
 * only. Signatures must not accept the raw command, a vital value, or
 * `rxFocus`.
 *
 *   - `opened`                         once per `/` open
 *   - `searched` `{ queryLen }`        once per typed query (length only)
 *   - `selected` `{ kind }`            jump | unhide | set
 */

const PREFIX = "[ehr:rxcmd]";

export type RxCommandBarKind = "jump" | "unhide" | "set";

function emit(event: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    // eslint-disable-next-line no-console
    console.debug(PREFIX, event, payload ?? {});
  } catch {
    // Telemetry must never break the bar.
  }
}

/** Command bar opened (`/` when focus is not editable). */
export function rxCommandBarOpened(): void {
  emit("opened");
}

/** Typed query cycle. Length only — never the command string. */
export function rxCommandBarSearched(queryLen: number): void {
  emit("searched", { queryLen });
}

/** A result was accepted. Kind only — never the command or value. */
export function rxCommandBarSelected(kind: RxCommandBarKind): void {
  emit("selected", { kind });
}
