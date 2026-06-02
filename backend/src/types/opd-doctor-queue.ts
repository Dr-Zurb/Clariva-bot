/**
 * Doctor-only OPD queue session row (oq-01).
 */

import type { OpdQueueEntryStatus } from './database';

export interface DoctorQueueSessionRow {
  entryId: string;
  appointmentId: string;
  tokenNumber: number;
  position: number;
  queueStatus: OpdQueueEntryStatus;
  sessionDate: string;
  queueCreatedAt: string;

  patientName: string;
  medicalRecordNumber: string | null;
  patientPhone: string;

  age: number | null;
  gender: string | null;

  appointmentStatus: string;
  scheduledAt: string;
  reasonForVisit: string | null;
  serviceLabel: string | null;
  catalogServiceKey: string | null;
  consultationType: string | null;

  episodeId: string | null;
  opdEventType: 'standard' | 'return_after_completed' | null;

  patientId: string | null;
  patientNote: string | null;
}
