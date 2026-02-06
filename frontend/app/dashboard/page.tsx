/**
 * Dashboard home. Layout provides header, nav, and main wrapper.
 * @see e-task-3
 */
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Welcome. Use the sidebar to go to Appointments or Patients.
      </p>
    </div>
  );
}
