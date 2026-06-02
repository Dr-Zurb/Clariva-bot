import { todayLocalIso } from '@/lib/dates';

export function ModeSchedulePastDateAdvisory() {
  return (
    <p
      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
      role="status"
    >
      This rule starts in the past. Past dates are unaffected (their mode is already a fact); the
      rule applies from {todayLocalIso()} forward.
    </p>
  );
}
