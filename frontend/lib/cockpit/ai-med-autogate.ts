/**
 * Autogate AI result policy for medicine capture.
 * Empty → commit typed (handled by callers). Single same-name hit → accept
 * without a second Enter (matches investigations empty fail-soft spirit).
 */

export function shouldAutoAcceptSingleAiMed(
  trigger: "refine" | "autogate",
  found: ReadonlyArray<{ name?: string | null }>,
  fallbackName: string | null | undefined,
): boolean {
  if (trigger !== "autogate" || found.length !== 1) return false;
  const ai = found[0]?.name?.trim().toLowerCase();
  const fb = fallbackName?.trim().toLowerCase();
  return Boolean(ai && fb && ai === fb);
}
