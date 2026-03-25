/**
 * Doctor OPD queue session row (e-task-opd-06). Backend returns initials only.
 */

export interface DoctorQueueSessionRow {
  entryId: string;
  appointmentId: string;
  tokenNumber: number;
  position: number;
  queueStatus: string;
  sessionDate: string;
  appointmentStatus: string;
  appointmentDate: string;
  patientLabel: string;
}
