"use client";

import { useState } from "react";

/**
 * Field label with optional info icon and tooltip.
 * Modern tooltip: circular info icon, appears on hover/focus.
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
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
      {children}
      {tooltip && (
        <span
          className="group relative ml-1.5 inline-flex cursor-help align-middle"
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          onFocus={() => setVisible(true)}
          onBlur={() => setVisible(false)}
          tabIndex={0}
          role="button"
          aria-label={tooltip}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-blue-100 hover:text-blue-600 group-hover:bg-blue-100 group-hover:text-blue-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3 w-3"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM8 7a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          {visible && (
            <div
              role="tooltip"
              className="absolute left-1/2 top-full z-50 mt-2 min-w-[240px] max-w-sm -translate-x-1/2 rounded-lg border border-gray-200 bg-gray-900 px-3 py-2 text-sm font-normal leading-snug text-white shadow-xl"
            >
              {tooltip}
            </div>
          )}
        </span>
      )}
    </label>
  );
}
