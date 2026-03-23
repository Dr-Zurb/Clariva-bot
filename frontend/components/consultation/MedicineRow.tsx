"use client";

interface MedicineRowProps {
  index: number;
  value: {
    medicineName: string;
    dosage: string;
    route: string;
    frequency: string;
    duration: string;
    instructions: string;
  };
  onChange: (
    index: number,
    field: string,
    value: string
  ) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

/**
 * Single medicine row for prescription form.
 * @see e-task-4
 */
export default function MedicineRow({
  index,
  value,
  onChange,
  onRemove,
  disabled,
}: MedicineRowProps) {
  return (
    <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor={`med-name-${index}`} className="sr-only">
          Medicine name
        </label>
        <input
          id={`med-name-${index}`}
          type="text"
          value={value.medicineName}
          onChange={(e) => onChange(index, "medicineName", e.target.value)}
          placeholder="Medicine name"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={200}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor={`med-dosage-${index}`} className="sr-only">
          Dosage
        </label>
        <input
          id={`med-dosage-${index}`}
          type="text"
          value={value.dosage}
          onChange={(e) => onChange(index, "dosage", e.target.value)}
          placeholder="Dosage"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={100}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor={`med-route-${index}`} className="sr-only">
          Route
        </label>
        <input
          id={`med-route-${index}`}
          type="text"
          value={value.route}
          onChange={(e) => onChange(index, "route", e.target.value)}
          placeholder="e.g. Oral"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={100}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor={`med-frequency-${index}`} className="sr-only">
          Frequency
        </label>
        <input
          id={`med-frequency-${index}`}
          type="text"
          value={value.frequency}
          onChange={(e) => onChange(index, "frequency", e.target.value)}
          placeholder="e.g. BD, TDS"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={100}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor={`med-duration-${index}`} className="sr-only">
          Duration
        </label>
        <input
          id={`med-duration-${index}`}
          type="text"
          value={value.duration}
          onChange={(e) => onChange(index, "duration", e.target.value)}
          placeholder="e.g. 5 days"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={100}
          disabled={disabled}
        />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <input
          id={`med-instructions-${index}`}
          type="text"
          value={value.instructions}
          onChange={(e) => onChange(index, "instructions", e.target.value)}
          placeholder="Instructions"
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          maxLength={100}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="rounded p-1.5 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
          aria-label={`Remove medicine ${index + 1}`}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  );
}
