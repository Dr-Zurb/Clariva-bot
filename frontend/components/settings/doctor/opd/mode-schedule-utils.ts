import type { ModeSchedule, OpdPoliciesShape } from '@/types/doctor-settings';

export function modeScheduleFromPolicies(
  policies: Record<string, unknown> | null | undefined
): ModeSchedule {
  if (!policies || typeof policies !== 'object') return {};
  const schedule = (policies as OpdPoliciesShape).mode_schedule;
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    return {};
  }
  return { ...schedule };
}
