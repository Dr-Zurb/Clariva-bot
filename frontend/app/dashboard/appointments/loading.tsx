/**
 * Loading state for appointments list. Per F4.
 */
export default function AppointmentsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    </div>
  );
}
