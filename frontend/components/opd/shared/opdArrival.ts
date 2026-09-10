/**
 * Desk / doctor arrival (receptionist-portal RQ6).
 * Same `patient_checked_in_at` stamp the desk writes.
 */

export function hasArrivedStamp(entry: {
  patientCheckedInAt?: string | null;
}): boolean {
  return Boolean(entry.patientCheckedInAt);
}

export function canMarkArrived(entry: {
  patientCheckedInAt?: string | null;
  appointmentStatus: string;
}): boolean {
  if (hasArrivedStamp(entry)) return false;
  return (
    entry.appointmentStatus === "pending" ||
    entry.appointmentStatus === "confirmed"
  );
}

/** Arrived chip — hide when lobby Waiting / Stepped away already explain it. */
export function showArrivedChip(entry: {
  patientCheckedInAt?: string | null;
  tags?: ReadonlyArray<string>;
}): boolean {
  if (!hasArrivedStamp(entry)) return false;
  const tags = entry.tags ?? [];
  return (
    !tags.includes("patient_waiting") && !tags.includes("patient_stepped_away")
  );
}
