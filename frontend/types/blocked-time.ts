/**
 * Blocked time types aligned with backend API.
 * @see backend/src/types/database.ts, e-task-3
 */

export interface BlockedTime {
  id: string;
  doctor_id: string;
  start_time: string; // ISO 8601
  end_time: string;
  reason?: string | null;
  created_at: string;
}
