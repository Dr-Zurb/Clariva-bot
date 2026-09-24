/**
 * Availability types aligned with backend API.
 * @see backend/src/types/database.ts, e-task-3
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AvailabilityVisitFlags {
  in_clinic: boolean;
  video: boolean;
  voice: boolean;
  text: boolean;
}

export interface Availability {
  id: string;
  doctor_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;
  is_available: boolean;
  in_clinic?: boolean;
  video?: boolean;
  voice?: boolean;
  text?: boolean;
  created_at: string;
  updated_at: string;
}

/** Slot for PUT availability (replace entire schedule) */
export interface AvailabilitySlot extends AvailabilityVisitFlags {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
}

export const ALL_VISIT_FLAGS: AvailabilityVisitFlags = {
  in_clinic: true,
  video: true,
  voice: true,
  text: true,
};
