/**
 * rcp-24: PHI-safe audit events for returning-patient memory (enum/opaque metadata only).
 */

import { logAuditEvent } from '../../utils/audit-logger';
import type { ReturningPatientProfile } from '../../types/returning-patient';
import type { PatientCollectionField } from '../../utils/validation';

export async function auditReturningPatientRecognized(
  correlationId: string,
  doctorId: string,
  patientId: string,
  profile: ReturningPatientProfile
): Promise<void> {
  await logAuditEvent({
    correlationId,
    action: 'returning_patient_recognized',
    resourceType: 'patient',
    resourceId: patientId,
    status: 'success',
    metadata: {
      doctorId,
      redactionApplied: true,
      attendedCount: profile.priorVisits.attendedCount,
      recencyBucket: profile.priorVisits.recencyBucket ?? null,
      recalledServiceKey: profile.priorVisits.lastServiceKey ?? null,
      knownFieldKeyCount: profile.knownFieldKeys.length,
    },
  });
}

export async function auditCollectionSkipped(
  correlationId: string,
  doctorId: string,
  patientId: string,
  skippedFieldKeys: PatientCollectionField[]
): Promise<void> {
  await logAuditEvent({
    correlationId,
    action: 'collection_skipped',
    resourceType: 'patient',
    resourceId: patientId,
    status: 'success',
    metadata: {
      doctorId,
      redactionApplied: true,
      skippedFieldKeys,
    },
  });
}
