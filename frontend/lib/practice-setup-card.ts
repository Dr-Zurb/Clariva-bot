/**
 * Plan 03 · Task 13 — Pure helper for the Practice Setup landing "Services" card.
 *
 * Keeps the branching logic out of the React component so it's trivially
 * testable and can't drift from the three well-defined mode states. The
 * component calls this once per render with the fetched `doctorSettings`
 * and maps the returned shape onto its JSX.
 *
 * States (mirrors Task 12's mode-branching shell):
 *   - `null` / `undefined`   → doctor hasn't picked a mode yet.
 *   - `'single_fee'`         → flat fee + enabled modalities summary.
 *   - `'multi_service'`      → count of configured services + optional
 *                              health-issue count from deterministic
 *                              client-side checks.
 *
 * No server calls; no I/O; no randomness — pure function over
 * {@link DoctorSettings}. `runLocalCatalogChecks` is cheap (O(n) over the
 * draft list, no async) so callers can compute this synchronously on every
 * render without memoization.
 */

import type { DoctorSettings } from "@/types/doctor-settings";
import type { CatalogMode } from "@/types/doctor-settings";
import {
  parseConsultationTypesToModalities,
  type AllowedModalities,
  type ModalityKey,
} from "@/lib/consultation-types-modalities";
import {
  catalogToServiceDrafts,
} from "@/lib/service-catalog-drafts";
import { runLocalCatalogChecks } from "@/lib/catalog-quality-local";

/** Deterministic landing-card summary for the Services catalog section. */
export interface ServicesCardState {
  /** Effective mode for rendering: `null` means "undecided". */
  mode: CatalogMode | null;
  /** One-line human copy shown under the card title. */
  subtitle: string;
  /** Action label for the footer affordance ("Set up services", "Edit fee", "Manage services"). */
  cta: string;
  /**
   * Deterministic count of client-side catalog issues. Always `0` for
   * `single_fee` / `null`; only `multi_service` can have a non-zero value.
   * When non-zero the card should render the small health badge.
   */
  healthCount: number;
  /** Extra hint for a11y / debugging — the catalog shape the helper saw. */
  serviceCount: number;
}

/** Format a minor-unit amount for the card subtitle. Mirrors `/app/book/page.tsx#formatMoneyMinor`. */
function formatMoneyMinor(minor: number, currency: string | null): string {
  const main = minor / 100;
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") {
    return `₹${main.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  // Matches the symbol map on the SingleFeeCatalogEditor preview.
  if (code === "USD") return `$${main.toFixed(2)}`;
  if (code === "EUR") return `€${main.toFixed(2)}`;
  if (code === "GBP") return `£${main.toFixed(2)}`;
  return `${main.toFixed(2)} ${code}`;
}

/** Short humanized modality list e.g. "Text + Video" / "Text, Voice, Video". */
function summarizeModalities(m: AllowedModalities): string {
  const active: ModalityKey[] = [];
  if (m.text) active.push("text");
  if (m.voice) active.push("voice");
  if (m.video) active.push("video");
  if (active.length === 0) return "No modalities";
  const pretty = active.map((k) => (k === "text" ? "Text" : k === "voice" ? "Voice" : "Video"));
  if (pretty.length === 1) return pretty[0];
  if (pretty.length === 2) return `${pretty[0]} + ${pretty[1]}`;
  return pretty.join(", ");
}

/**
 * Derive the render state for the landing Services card from the (nullable)
 * `doctorSettings`. Accepts `null` for the brief moment before the settings
 * fetch resolves — returns an "undecided" state that matches `null` mode so
 * the card doesn't flash multi-service copy on first paint.
 */
export function describeServicesCardState(
  settings: DoctorSettings | null
): ServicesCardState {
  // Pre-fetch placeholder: same shape as "null mode" so the card copy is
  // stable across loading → loaded for a fresh doctor (which is the most
  // common first-paint case post-migration).
  if (!settings) {
    return {
      mode: null,
      subtitle: "Loading your services setup…",
      cta: "Set up services",
      healthCount: 0,
      serviceCount: 0,
    };
  }

  const mode: CatalogMode | null = settings.catalog_mode ?? null;

  if (mode === "single_fee") {
    const feeMinor = settings.appointment_fee_minor;
    const modalities = parseConsultationTypesToModalities(settings.consultation_types);
    const modalitySummary = summarizeModalities(modalities);

    if (feeMinor == null || feeMinor <= 0) {
      return {
        mode,
        subtitle: `Fee not set · ${modalitySummary}`,
        cta: "Edit fee",
        healthCount: 0,
        serviceCount: 1,
      };
    }

    const money = formatMoneyMinor(feeMinor, settings.appointment_fee_currency);
    return {
      mode,
      subtitle: `Single fee: ${money} · ${modalitySummary}`,
      cta: "Edit fee",
      healthCount: 0,
      serviceCount: 1,
    };
  }

  if (mode === "multi_service") {
    const catalog = settings.service_offerings_json ?? null;
    const drafts = catalogToServiceDrafts(catalog);
    const serviceCount = drafts.length;

    if (serviceCount === 0) {
      return {
        mode,
        subtitle: "No services yet — add your first service",
        cta: "Manage services",
        healthCount: 0,
        serviceCount: 0,
      };
    }

    const issues = runLocalCatalogChecks(drafts);
    const healthCount = issues.length;

    const countLabel = `${serviceCount} service${serviceCount === 1 ? "" : "s"} configured`;
    const subtitle =
      healthCount > 0
        ? `${countLabel} · ${healthCount} need${healthCount === 1 ? "s" : ""} attention`
        : countLabel;

    return {
      mode,
      subtitle,
      cta: "Manage services",
      healthCount,
      serviceCount,
    };
  }

  // mode === null (undecided post-migration).
  return {
    mode: null,
    subtitle: "Choose how you charge for consultations",
    cta: "Set up services",
    healthCount: 0,
    serviceCount: 0,
  };
}
