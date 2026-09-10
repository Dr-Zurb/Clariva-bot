/** Last 10 digits for Indian desk search. No country-code guessing beyond the tail. */
export function digitsLast10(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function isCompleteDeskPhone(phone: string): boolean {
  return digitsLast10(phone).length === 10;
}

/** Last-10 Indian mobile as a single run of digits. */
export function formatDeskPhone(phone: string): string {
  return digitsLast10(phone);
}
