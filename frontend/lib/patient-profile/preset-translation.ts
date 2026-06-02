import type { PatientProfileLayout } from "./types";
import { validateLayout } from "./useShellLayout";

/**
 * Translate a legacy v1-shape preset payload to v2. The legacy shape is
 * the `cockpit-layout` snapshot stored in
 * `doctor_settings.cockpit_layout_presets` JSONB rows shipped by cc-08.
 *
 * Returns null on unrecognised shapes — caller falls back to skipping the
 * preset (UI shows a "Preset corrupt" toast at most once per session;
 * never drops the doctor's data, just refuses to apply it).
 *
 * Version discrimination:
 *   - `version: 5` present → treat as v5 (current), validate and return as-is.
 *   - `version: 4` present → migrate to v5 via validateLayout.
 *   - `version: 2` or `3` present → migrate forward via validateLayout.
 *   - No version tag → treat as v1 (slots + widths + collapsed shape), translate to v3.
 *   - Anything else → return null.
 *
 * The legacy `middleCollapseSide` field is dropped unconditionally (DL-6
 * uniform collapse). Translation ignores it.
 */
export function translateLegacyPreset(raw: unknown): PatientProfileLayout | null {
  if (!raw || typeof raw !== "object") return null;

  // v2–v5 tagged row: pass through validateLayout (migrated to v5 on read).
  const version = (raw as { version?: unknown }).version;
  if (version === 2 || version === 3 || version === 4 || version === 5) {
    return validateLayout(raw);
  }

  // v1-shape row: translate slots + widths + collapsed → v2 paneState.
  const r = raw as Record<string, unknown>;
  const slots = r.slots;
  const widths = r.widths;
  const collapsed = r.collapsed as Record<string, boolean> | undefined;

  if (!Array.isArray(slots) || !Array.isArray(widths) || !collapsed) return null;
  if (typeof collapsed !== "object" || collapsed === null) return null;
  if (slots.length !== widths.length) return null;
  if (slots.length === 0) return null;

  const paneOrder = slots.map((s) => String(s));

  // Guard duplicate pane ids (same defensive check as validateLayout).
  if (new Set(paneOrder).size !== paneOrder.length) return null;

  const paneState: Record<string, { sizePct: number; hidden: boolean }> = {};

  for (let i = 0; i < slots.length; i++) {
    const id = String(slots[i]);
    const rawWidth = widths[i];
    const sizePct =
      typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth >= 0
        ? rawWidth
        : 0;
    paneState[id] = {
      sizePct,
      hidden: typeof collapsed[id] === "boolean" ? collapsed[id] : false,
    };
  }

  return validateLayout({ version: 3, paneOrder, paneState });
}
