/**
 * Appointment-detail cockpit route — not the list, not nested subpages.
 * `/dashboard/appointments/:id` → true
 * `/dashboard/appointments` → false
 * `/dashboard/appointments/:id/chat-history` → false
 */
export function isCockpitAppointmentPath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  return /^\/dashboard\/appointments\/[^/]+$/.test(pathname);
}
