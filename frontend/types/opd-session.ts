/**
 * Patient OPD session snapshot — mirrors backend CONTRACTS (e-task-opd-04).
 */

export type OpdMode = "slot" | "queue";

export type DoctorBusyWith = "other_patient" | "you";

export type OpdInAppNotificationType =
  | "delay_broadcast"
  | "early_invite"
  | "your_turn_soon"
  | "queue_position_changed";

export interface OpdInAppNotificationHint {
  type: OpdInAppNotificationType;
}

export interface PatientOpdSnapshot {
  appointmentId: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  opdMode: OpdMode;
  suggestedPollSeconds: number;
  delayMinutes?: number | null;
  doctorBusyWith?: DoctorBusyWith;
  slotStart?: string;
  slotEnd?: string;
  earlyInviteAvailable?: boolean;
  earlyInviteExpiresAt?: string | null;
  tokenNumber?: number;
  aheadCount?: number;
  etaMinutes?: number;
  etaRange?: { minMinutes: number; maxMinutes: number };
  /** Polling hints from API (OPD-09) */
  inAppNotifications?: OpdInAppNotificationHint[];
}

export interface OpdSessionSnapshotData {
  snapshot: PatientOpdSnapshot;
}
