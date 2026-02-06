/**
 * Loading state for patient detail page. Per FRONTEND_RECIPES F4.
 */
export default function PatientDetailLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-32 rounded bg-gray-200" />
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
      </div>
    </div>
  );
}
