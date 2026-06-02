/** Human-readable modifier hint — cross-platform label for tooltips / palette badges. */
export function modShortcutHint(
  key: string,
  opts: { shift?: boolean; alt?: boolean } = {},
): string {
  const parts = ["Ctrl/Cmd"];
  if (opts.shift) parts.push("Shift");
  if (opts.alt) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}
