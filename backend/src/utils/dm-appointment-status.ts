/** User sent acknowledgment after booking (ok, thanks, all set, etc.). */
const ACKNOWLEDGMENT_REGEX =
  /^(ok|all\s+set|thanks|thank\s+you|confirmed|done|got\s+it|ok\s+thanks|thanks\s+ok|ok\s+thank\s+you)[\s!?.]*$/i;

export function isPostBookingAcknowledgment(
  text: string,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  const trimmed = (text ?? '').trim();
  if (trimmed.length > 30) return false;
  if (!ACKNOWLEDGMENT_REGEX.test(trimmed)) return false;
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type === 'system') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        (c.includes('appointment') && (c.includes('confirmed') || c.includes('booked') || c.includes('pay'))) ||
        c.includes('please pay here')
      );
    }
  }
  return false;
}

/** Format appointment status: "Tue, 14 Mar 2026, 2:00 PM (pending)" — uses locale-neutral ordering. */
export function formatAppointmentStatusLine(
  isoDate: string,
  status: string,
  timezone: string = 'Asia/Kolkata',
  tokenNumber?: string | number | null
): string {
  const d = new Date(isoDate);
  const dateTimeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  let line = `${dateTimeStr} (${status})`;
  if (tokenNumber != null) {
    line += ` — Token: #${tokenNumber}`;
  }
  return line;
}
