/** Shared placeholder patient detection (e-task-3 / rcp-20). */

const PLACEHOLDER_NAME = 'Placeholder';
const PLACEHOLDER_PHONE_PREFIX = 'placeholder-';

export function isPlaceholderPatientName(name: string | null | undefined): boolean {
  return !name?.trim() || name.trim() === PLACEHOLDER_NAME;
}

export function isPlaceholderPatientPhone(phone: string | null | undefined): boolean {
  const trimmed = phone?.trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase().startsWith(PLACEHOLDER_PHONE_PREFIX);
}
