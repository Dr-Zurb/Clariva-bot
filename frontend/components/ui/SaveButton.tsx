"use client";

/**
 * Consistent save UX: confirmation message, disabled when not dirty.
 * Use across settings pages for a uniform save experience.
 */
export function SaveButton({
  isDirty,
  saving,
  saveSuccess,
  /** When set and form is dirty, Save stays disabled and this explains why */
  disableReason,
}: {
  isDirty: boolean;
  saving: boolean;
  saveSuccess: boolean;
  disableReason?: string | null;
}) {
  const blocked = Boolean(disableReason);
  const disabled = saving || !isDirty || (isDirty && blocked);
  const showSuccess = saveSuccess && !saving;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            disabled && !saving
              ? "cursor-not-allowed bg-gray-300 text-gray-500"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {showSuccess && (
          <span
            className="text-sm font-medium text-green-600"
            role="status"
            aria-live="polite"
          >
            Saved
          </span>
        )}
      </div>
      {isDirty && disableReason ? (
        <p className="max-w-xl text-sm text-amber-900" role="status">
          {disableReason}
        </p>
      ) : null}
    </div>
  );
}
