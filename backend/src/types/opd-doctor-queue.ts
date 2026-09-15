/**
 * Doctor-only OPD queue session row (oq-01).
 */

import type { OpdQueueEntryStatus } from './database';
import type { SlotTag } from './opd-slot-session';

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
  /** Desk or lobby arrival stamp (RQ6). Null when not yet arrived. */
  patientCheckedInAt: string | null;

  /** Lobby presence tags (crc-02). Subset of SlotTag. */
  tags: SlotTag[];
}
