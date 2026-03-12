"use client";

/**
 * Field label with optional info icon and tooltip.
 * Use for form fields where hoverable (i) explains the field meaning.
 */
export function FieldLabel({
  htmlFor,
  children,
  tooltip,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}
      {tooltip && (
        <span
          className="ml-1.5 inline-flex cursor-help align-middle text-gray-400 transition-colors hover:text-gray-600"
          title={tooltip}
          aria-label={tooltip}
        >
          <span className="text-xs font-normal" aria-hidden>(i)</span>
        </span>
      )}
    </label>
  );
}
