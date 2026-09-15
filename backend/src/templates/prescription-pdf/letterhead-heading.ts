/** One letterhead title — practice name wins so Classic is not two doctor names. */
export function letterheadHeading(
  doctorName: string | null | undefined,
  clinicName: string | null | undefined
): string {
  const clinic = clinicName?.trim() || '';
  const doctor = doctorName?.trim() || '';
  return clinic || doctor;
}
