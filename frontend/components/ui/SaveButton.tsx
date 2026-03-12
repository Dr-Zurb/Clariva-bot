"use client";

/**
 * Consistent save UX: confirmation message, disabled when not dirty.
 * Use across settings pages for a uniform save experience.
 */
export function SaveButton({
  isDirty,
  saving,
  saveSuccess,
}: {
  isDirty: boolean;
  saving: boolean;
  saveSuccess: boolean;
}) {
  const disabled = saving || !isDirty;
  const showSuccess = saveSuccess && !saving;

  return (
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
  );
}
