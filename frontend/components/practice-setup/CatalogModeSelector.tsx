"use client";

/**
 * Plan 03 · Task 12: first-class single-fee vs multi-service choice.
 *
 * Rendered by the services-catalog page when `catalog_mode === null`
 * (fresh onboarding, no legacy `appointment_fee_minor` to infer from —
 * migration 048 maps legacy single-fee doctors to `'single_fee'` already,
 * so this selector only appears for genuinely-undecided accounts).
 *
 * Design constraints:
 *   - Two large, obviously-different cards. Doctors choose once; the whole
 *     catalog editor behind this selector is mode-specific, so we want the
 *     choice to feel consequential rather than an afterthought.
 *   - Loading is shown ON the selected card only. The unselected card is
 *     disabled during the PATCH so a second click does not fight the first.
 *   - Never destructive: the PATCH sets a previously-null field. Backend
 *     Task 09 handles catalog materialization, so the page will refetch
 *     and re-branch automatically.
 */

import type { CatalogMode } from "@/types/doctor-settings";

type Props = {
  onSelect: (mode: CatalogMode) => void;
  /** When the parent PATCH is in flight. Locks both cards. */
  isSaving: boolean;
  /** Which mode the parent last dispatched. Used to show the spinner on the right card. */
  pendingMode?: CatalogMode | null;
};

export function CatalogModeSelector({
  onSelect,
  isSaving,
  pendingMode = null,
}: Props) {
  return (
    <section
      aria-labelledby="catalog-mode-selector-heading"
      data-testid="catalog-mode-selector"
      className="rounded-lg border border-blue-200 bg-blue-50 p-5"
    >
      <h2
        id="catalog-mode-selector-heading"
        className="text-lg font-semibold text-blue-900"
      >
        How do you charge for consultations?
      </h2>
      <p className="mt-1 text-sm text-blue-900/80">
        Pick one. You can switch later; we&rsquo;ll keep your current setup around
        so the change isn&rsquo;t destructive.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ModeCard
          mode="single_fee"
          title="One flat fee for any consultation"
          blurb="Best if you charge the same price regardless of complaint. We'll set up a 'Consultation' entry for you automatically."
          onSelect={onSelect}
          disabled={isSaving}
          loading={isSaving && pendingMode === "single_fee"}
          testId="catalog-mode-card-single-fee"
        />
        <ModeCard
          mode="multi_service"
          title="Different fees per service"
          blurb="Best if you offer distinct services (e.g. consultation + diagnostic tests) with different prices."
          onSelect={onSelect}
          disabled={isSaving}
          loading={isSaving && pendingMode === "multi_service"}
          testId="catalog-mode-card-multi-service"
        />
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  title,
  blurb,
  onSelect,
  disabled,
  loading,
  testId,
}: {
  mode: CatalogMode;
  title: string;
  blurb: string;
  onSelect: (mode: CatalogMode) => void;
  disabled: boolean;
  loading: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onSelect(mode)}
      disabled={disabled}
      aria-busy={loading}
      className="group relative flex flex-col rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-gray-200 disabled:hover:shadow-sm"
    >
      <span className="text-sm font-semibold text-gray-900">{title}</span>
      <span className="mt-1 text-sm text-gray-600">{blurb}</span>
      {loading && (
        <span
          role="status"
          aria-live="polite"
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-blue-700"
        >
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Saving…
        </span>
      )}
    </button>
  );
}
