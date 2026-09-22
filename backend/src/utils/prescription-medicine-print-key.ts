/**
 * Ordered fingerprint of named medicines. The doctor print path sends
 * this with the PDF request and refuses to render when the stored rows
 * do not match the list on screen.
 *
 * Keep in lockstep with frontend `rxPdfWarmMedicineKey`.
 */
export function prescriptionMedicinePrintKey(
  names: Array<string | null | undefined>,
): string {
  return names
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name.length > 0)
    .join('\u0001');
}
