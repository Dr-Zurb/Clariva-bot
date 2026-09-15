/**
 * Front-desk history (desk-visit-prep P2).
 *
 * Desk upsert writes the sidecar and the mapped chart tables (allergies,
 * NKDA, medicines, conditions) using the acting doctor id — same trust as
 * desk vitals. Why-today is optional and never seeds prescriptions.cc.
 * Accept remains for older unapplied sidecars. No PHI in logs (ids only).
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import {
  createAllergy,
  createChronicCondition,
  createMedication,
  getAllergySectionNotes,
  listAllergies,
  listChronicConditions,
  listMedications,
  upsertAllergySectionNotes,
} from './patient-chart-service';
import type {
  AcceptHistorySubmissionInput,
  AcceptHistorySubmissionResult,
  HistoryAcceptOutcome,
  HistoryAllergiesPayload,
  HistoryAllergyItem,
  HistoryChartSnapshot,
  HistoryConditionItem,
  HistoryConditionsPayload,
  HistoryMedicineItem,
  HistoryMedicinesPayload,
  HistoryNoneOrList,
  HistorySubmissionView,
  PatientHistorySubmission,
  UpsertHistorySubmissionInput,
} from '../types/patient-history-submissions';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

type DeskAppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  status: string;
  patient_checked_in_at: string | null;
  episode_id?: string | null;
};

export const WHY_TODAY_CC_MAX = 120;
const PRESCRIPTION_CC_MAX = 500;
const PRESCRIPTION_HOPI_MAX = 2000;

type SubmissionRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string;
  source: PatientHistorySubmission['source'];
  actor_id: string;
  why_today: string;
  allergies: HistoryAllergiesPayload;
  medicines: HistoryMedicinesPayload;
  conditions: HistoryConditionsPayload;
  notice_version: string | null;
  submitted_at: string;
  updated_at: string;
};

function admin(): Admin {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

function publicSubmission(row: SubmissionRow): PatientHistorySubmission {
  const allergies = row.allergies ?? { none: false, items: [] };
  return {
    id: row.id,
    doctor_id: row.doctor_id,
    patient_id: row.patient_id,
    appointment_id: row.appointment_id,
    source: row.source,
    actor_id: row.actor_id,
    why_today: row.why_today,
    why_today_accepted_at: allergies.why_today_accepted_at ?? null,
    why_today_accepted_by: allergies.why_today_accepted_by ?? null,
    allergies,
    medicines: row.medicines,
    conditions: row.conditions,
    notice_version: row.notice_version,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
  };
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function splitWhyToday(text: string): { cc: string; hopi: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { cc: '', hopi: null };

  const newline = trimmed.search(/\r?\n/);
  const firstLine = newline === -1 ? trimmed : trimmed.slice(0, newline);
  const cc = firstLine.slice(0, WHY_TODAY_CC_MAX);
  let rest = '';
  if (firstLine.length > WHY_TODAY_CC_MAX) {
    rest = firstLine.slice(WHY_TODAY_CC_MAX).trim();
    if (newline !== -1) {
      const afterLine = trimmed.slice(newline).replace(/^\r?\n/, '').trim();
      rest = [rest, afterLine].filter(Boolean).join('\n');
    }
  } else if (newline !== -1) {
    rest = trimmed.slice(newline).replace(/^\r?\n/, '').trim();
  }

  return {
    cc: cc.slice(0, PRESCRIPTION_CC_MAX),
    hopi: rest.length > 0 ? rest.slice(0, PRESCRIPTION_HOPI_MAX) : null,
  };
}

function stampItem<T extends { accepted_at?: string | null; accepted_by?: string | null }>(
  item: T,
  doctorId: string,
  at: string
): T {
  return { ...item, accepted_at: at, accepted_by: doctorId };
}

function preserveItemStamps<T extends { name: string; accepted_at?: string | null; accepted_by?: string | null }>(
  previous: T[] | undefined,
  next: T[]
): T[] {
  const prev = previous ?? [];
  return next.map((item, index) => {
    const prior = prev[index];
    if (prior?.accepted_at && namesEqual(prior.name, item.name)) {
      return {
        ...item,
        accepted_at: prior.accepted_at,
        accepted_by: prior.accepted_by ?? null,
      };
    }
    return item;
  });
}

function preserveListStamps<T extends { name: string; accepted_at?: string | null; accepted_by?: string | null }>(
  previous: HistoryNoneOrList<T> | undefined,
  next: HistoryNoneOrList<T>
): HistoryNoneOrList<T> {
  const merged: HistoryNoneOrList<T> = {
    ...next,
    items: preserveItemStamps(previous?.items, next.items),
  };
  if (previous?.none && next.none && previous.none_accepted_at) {
    merged.none_accepted_at = previous.none_accepted_at;
    merged.none_accepted_by = previous.none_accepted_by ?? null;
  }
  return merged;
}

function stampUnstampedList<T extends { accepted_at?: string | null; accepted_by?: string | null }>(
  list: HistoryNoneOrList<T>,
  doctorId: string,
  at: string
): HistoryNoneOrList<T> {
  if (list.none) {
    return {
      ...list,
      items: [],
      none_accepted_at: list.none_accepted_at ?? at,
      none_accepted_by: list.none_accepted_by ?? doctorId,
    };
  }
  return {
    ...list,
    items: list.items.map((item) => (item.accepted_at ? item : stampItem(item, doctorId, at))),
  };
}

async function applyDeskHistoryToChart(
  patientId: string,
  doctorId: string,
  input: UpsertHistorySubmissionInput,
  correlationId: string
): Promise<void> {
  if (input.allergies.none) {
    const existing = await listAllergies(patientId, correlationId, doctorId);
    if (existing.length === 0) {
      await upsertAllergySectionNotes(
        patientId,
        { noKnownAllergies: true },
        correlationId,
        doctorId
      );
    }
  } else {
    const existing = [...(await listAllergies(patientId, correlationId, doctorId))];
    for (const item of input.allergies.items) {
      if (existing.some((row) => namesEqual(row.allergen, item.name))) continue;
      await createAllergy(
        patientId,
        {
          allergen: item.name,
          reaction: item.reaction ?? null,
          severity: 'unknown',
        },
        correlationId,
        doctorId
      );
      existing.push({ allergen: item.name } as (typeof existing)[number]);
    }
  }

  if (!input.medicines.none) {
    const existing = [...(await listMedications(patientId, correlationId, doctorId))];
    for (const item of input.medicines.items) {
      if (existing.some((row) => namesEqual(row.drug_name, item.name))) continue;
      await createMedication(
        patientId,
        {
          drugName: item.name,
          dose: item.dose ?? null,
          status: 'active',
          source: 'self',
        },
        correlationId,
        doctorId
      );
      existing.push({ drug_name: item.name } as (typeof existing)[number]);
    }
  }

  if (!input.conditions.none) {
    const existing = [...(await listChronicConditions(patientId, correlationId, doctorId))];
    for (const item of input.conditions.items) {
      if (existing.some((row) => namesEqual(row.condition, item.name))) continue;
      await createChronicCondition(
        patientId,
        {
          condition: item.name,
          ...(item.code ? { code: item.code } : {}),
          ...(item.codeTitle || item.code ? { codeTitle: item.codeTitle ?? item.name } : {}),
        },
        correlationId,
        doctorId
      );
      existing.push({ condition: item.name } as (typeof existing)[number]);
    }
  }
}

async function loadChartSnapshot(
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<HistoryChartSnapshot> {
  const [allergies, section, conditions, medications] = await Promise.all([
    listAllergies(patientId, correlationId, doctorId),
    getAllergySectionNotes(patientId, correlationId, doctorId),
    listChronicConditions(patientId, correlationId, doctorId),
    listMedications(patientId, correlationId, doctorId),
  ]);
  return {
    allergies: allergies.map((row) => ({
      allergen: row.allergen,
      reaction: row.reaction ?? null,
    })),
    noKnownAllergies: section.noKnownAllergies,
    conditions: conditions.map((row) => ({
      condition: row.condition,
      code: row.code ?? null,
    })),
    medications: medications
      .filter((row) => row.status === 'active')
      .map((row) => ({
        drug_name: row.drug_name,
        dose: row.dose ?? null,
      })),
  };
}

async function loadOwnedAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const { data, error } = await admin()
    .from('appointments')
    .select('id, doctor_id, patient_id, status, patient_checked_in_at, episode_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data || data.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }
  return data as DeskAppointmentRow;
}

async function loadWritableAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);

  if (appointment.status === 'cancelled') {
    throw new ValidationError('Cannot save history on a cancelled appointment');
  }
  if (!appointment.patient_checked_in_at) {
    throw new ValidationError('Save history after check-in');
  }
  if (!appointment.patient_id) {
    throw new ValidationError('Appointment has no patient');
  }
  return appointment;
}

async function prescriptionExistsForAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<boolean> {
  const { data, error } = await admin()
    .from('prescriptions')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('doctor_id', doctorId)
    .limit(1)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  return Boolean(data);
}

async function loadSubmissionRow(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<SubmissionRow | null> {
  const { data, error } = await admin()
    .from('patient_history_submissions')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  return (data as SubmissionRow | null) ?? null;
}

async function assertStaffMayWrite(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorIsStaff: boolean
): Promise<void> {
  if (!actorIsStaff) return;
  if (await prescriptionExistsForAppointment(appointmentId, doctorId, correlationId)) {
    throw new ForbiddenError('The doctor has opened this visit. Ask them to change the history.');
  }
}

export async function getHistorySubmission(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<PatientHistorySubmission | null> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const row = await loadSubmissionRow(appointmentId, doctorId, correlationId);
  await logDataAccess(
    correlationId,
    actorId,
    'patient_history_submission',
    appointment.patient_id ?? appointmentId
  );
  return row ? publicSubmission(row) : null;
}

export async function getHistorySubmissionView(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<HistorySubmissionView> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const row = await loadSubmissionRow(appointmentId, doctorId, correlationId);
  await logDataAccess(
    correlationId,
    actorId,
    'patient_history_submission',
    appointment.patient_id ?? appointmentId
  );
  const chart = appointment.patient_id
    ? await loadChartSnapshot(appointment.patient_id, doctorId, correlationId)
    : null;
  return {
    submission: row ? publicSubmission(row) : null,
    chart,
  };
}

export async function upsertHistorySubmission(
  appointmentId: string,
  doctorId: string,
  input: UpsertHistorySubmissionInput,
  correlationId: string,
  actorId: string,
  actorIsStaff: boolean
): Promise<PatientHistorySubmission> {
  const appointment = await loadWritableAppointment(appointmentId, doctorId, correlationId);
  await assertStaffMayWrite(appointmentId, doctorId, correlationId, actorIsStaff);

  const existing = await loadSubmissionRow(appointmentId, doctorId, correlationId);
  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await applyDeskHistoryToChart(
    appointment.patient_id as string,
    doctorId,
    input,
    correlationId
  );

  const at = new Date().toISOString();
  const allergies = stampUnstampedList(
    preserveListStamps(existing?.allergies, input.allergies),
    doctorId,
    at
  ) as HistoryAllergiesPayload;
  if (existing && existing.why_today === input.whyToday) {
    allergies.why_today_accepted_at = existing.allergies.why_today_accepted_at ?? null;
    allergies.why_today_accepted_by = existing.allergies.why_today_accepted_by ?? null;
  }
  const payload = {
    why_today: input.whyToday,
    allergies,
    medicines: stampUnstampedList(
      preserveListStamps(existing?.medicines, input.medicines),
      doctorId,
      at
    ),
    conditions: stampUnstampedList(
      preserveListStamps(existing?.conditions, input.conditions),
      doctorId,
      at
    ),
    notice_version: input.noticeVersion ?? null,
    actor_id: actorId,
    source: input.source ?? 'front_desk',
  };

  if (existing) {
    const { data, error } = await admin()
      .from('patient_history_submissions')
      .update(payload)
      .eq('id', existing.id)
      .eq('doctor_id', doctorId)
      .select('*')
      .single();

    if (error || !data) handleSupabaseError(error, correlationId);
    await logDataModification(
      correlationId,
      actorId,
      'update',
      'patient_history_submission',
      existing.id,
      Object.keys(payload),
      onBehalf
    );
    return publicSubmission(data as SubmissionRow);
  }

  const { data, error } = await admin()
    .from('patient_history_submissions')
    .insert({
      doctor_id: doctorId,
      patient_id: appointment.patient_id,
      appointment_id: appointmentId,
      ...payload,
    })
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as SubmissionRow;
  await logDataModification(
    correlationId,
    actorId,
    'create',
    'patient_history_submission',
    row.id,
    undefined,
    onBehalf
  );
  return publicSubmission(row);
}

async function persistSubmissionPayload(
  row: SubmissionRow,
  doctorId: string,
  patch: {
    allergies?: HistoryAllergiesPayload;
    medicines?: HistoryMedicinesPayload;
    conditions?: HistoryConditionsPayload;
  },
  correlationId: string,
  actorId: string
): Promise<SubmissionRow> {
  const { data, error } = await admin()
    .from('patient_history_submissions')
    .update(patch)
    .eq('id', row.id)
    .eq('doctor_id', doctorId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  await logDataModification(
    correlationId,
    actorId,
    'update',
    'patient_history_submission',
    row.id,
    ['accept']
  );
  return data as SubmissionRow;
}

async function seedWhyTodayOnPrescription(
  appointment: DeskAppointmentRow,
  doctorId: string,
  whyToday: string,
  correlationId: string
): Promise<{ cc: string; hopi: string | null }> {
  const seeded = splitWhyToday(whyToday);
  const { data: existing, error } = await admin()
    .from('prescriptions')
    .select('id, cc, hopi')
    .eq('appointment_id', appointment.id)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!String(existing.cc ?? '').trim()) patch.cc = seeded.cc;
    if (seeded.hopi && !String(existing.hopi ?? '').trim()) patch.hopi = seeded.hopi;
    if (Object.keys(patch).length === 0) return seeded;

    const { error: updateError } = await admin()
      .from('prescriptions')
      .update(patch)
      .eq('id', existing.id)
      .eq('doctor_id', doctorId);
    if (updateError) handleSupabaseError(updateError, correlationId);
    return seeded;
  }

  const { error: insertError } = await admin()
    .from('prescriptions')
    .insert({
      appointment_id: appointment.id,
      episode_id: appointment.episode_id ?? null,
      patient_id: appointment.patient_id,
      doctor_id: doctorId,
      type: 'structured',
      cc: seeded.cc,
      hopi: seeded.hopi,
    });
  if (insertError) handleSupabaseError(insertError, correlationId);
  return seeded;
}

async function acceptWhyToday(
  appointment: DeskAppointmentRow,
  row: SubmissionRow,
  doctorId: string,
  correlationId: string,
  at: string
): Promise<AcceptHistorySubmissionResult> {
  if (row.allergies.why_today_accepted_at) {
    return { submission: publicSubmission(row), outcome: 'already_accepted' };
  }
  const seeded = await seedWhyTodayOnPrescription(
    appointment,
    doctorId,
    row.why_today,
    correlationId
  );
  const allergies: HistoryAllergiesPayload = {
    ...row.allergies,
    why_today_accepted_at: at,
    why_today_accepted_by: doctorId,
  };
  const saved = await persistSubmissionPayload(row, doctorId, { allergies }, correlationId, doctorId);
  return { submission: publicSubmission(saved), outcome: 'seeded', seeded };
}

async function acceptAllergyNone(
  appointment: DeskAppointmentRow,
  row: SubmissionRow,
  doctorId: string,
  correlationId: string,
  at: string
): Promise<AcceptHistorySubmissionResult> {
  if (!row.allergies.none) {
    throw new ValidationError('This visit reported named allergies, not none');
  }
  if (row.allergies.none_accepted_at) {
    return { submission: publicSubmission(row), outcome: 'already_accepted' };
  }
  const existing = await listAllergies(appointment.patient_id as string, correlationId, doctorId);
  if (existing.length > 0) {
    throw new ConflictError('This patient already has recorded allergies');
  }
  await upsertAllergySectionNotes(
    appointment.patient_id as string,
    { noKnownAllergies: true },
    correlationId,
    doctorId
  );
  const allergies: HistoryAllergiesPayload = {
    ...row.allergies,
    none_accepted_at: at,
    none_accepted_by: doctorId,
  };
  const saved = await persistSubmissionPayload(row, doctorId, { allergies }, correlationId, doctorId);
  return { submission: publicSubmission(saved), outcome: 'nkda' };
}

async function acceptAllergyItem(
  appointment: DeskAppointmentRow,
  row: SubmissionRow,
  index: number,
  doctorId: string,
  correlationId: string,
  at: string
): Promise<AcceptHistorySubmissionResult> {
  if (row.allergies.none) {
    throw new ValidationError('Accept none to record no known allergies');
  }
  const item = row.allergies.items[index] as HistoryAllergyItem | undefined;
  if (!item) throw new ValidationError('Allergy item not found');
  if (item.accepted_at) {
    return { submission: publicSubmission(row), outcome: 'already_accepted' };
  }

  const existing = await listAllergies(appointment.patient_id as string, correlationId, doctorId);
  const match = existing.find((rowAllergy) => namesEqual(rowAllergy.allergen, item.name));
  let outcome: HistoryAcceptOutcome = 'merged';
  if (!match) {
    await createAllergy(
      appointment.patient_id as string,
      {
        allergen: item.name,
        reaction: item.reaction ?? null,
        severity: 'unknown',
      },
      correlationId,
      doctorId
    );
    outcome = 'created';
  }

  const items = row.allergies.items.map((entry, i) =>
    i === index ? stampItem(entry, doctorId, at) : entry
  );
  const saved = await persistSubmissionPayload(
    row,
    doctorId,
    { allergies: { ...row.allergies, items } },
    correlationId,
    doctorId
  );
  return { submission: publicSubmission(saved), outcome };
}

async function acceptMedicineItem(
  appointment: DeskAppointmentRow,
  row: SubmissionRow,
  index: number,
  doctorId: string,
  correlationId: string,
  at: string
): Promise<AcceptHistorySubmissionResult> {
  if (row.medicines.none) {
    throw new ValidationError('Nothing to add to the chart');
  }
  const item = row.medicines.items[index] as HistoryMedicineItem | undefined;
  if (!item) throw new ValidationError('Medicine item not found');
  if (item.accepted_at) {
    return { submission: publicSubmission(row), outcome: 'already_accepted' };
  }

  const existing = await listMedications(appointment.patient_id as string, correlationId, doctorId);
  const match = existing.find((rowMed) => namesEqual(rowMed.drug_name, item.name));
  let outcome: HistoryAcceptOutcome = 'merged';
  if (!match) {
    await createMedication(
      appointment.patient_id as string,
      {
        drugName: item.name,
        dose: item.dose ?? null,
        status: 'active',
        source: 'self',
      },
      correlationId,
      doctorId
    );
    outcome = 'created';
  }

  const items = row.medicines.items.map((entry, i) =>
    i === index ? stampItem(entry, doctorId, at) : entry
  );
  const saved = await persistSubmissionPayload(
    row,
    doctorId,
    { medicines: { ...row.medicines, items } },
    correlationId,
    doctorId
  );
  return { submission: publicSubmission(saved), outcome };
}

async function acceptConditionItem(
  appointment: DeskAppointmentRow,
  row: SubmissionRow,
  index: number,
  doctorId: string,
  correlationId: string,
  at: string
): Promise<AcceptHistorySubmissionResult> {
  if (row.conditions.none) {
    throw new ValidationError('Nothing to add to the chart');
  }
  const item = row.conditions.items[index] as HistoryConditionItem | undefined;
  if (!item) throw new ValidationError('Condition item not found');
  if (item.accepted_at) {
    return { submission: publicSubmission(row), outcome: 'already_accepted' };
  }

  const existing = await listChronicConditions(
    appointment.patient_id as string,
    correlationId,
    doctorId
  );
  const match = existing.find((rowCondition) => namesEqual(rowCondition.condition, item.name));
  let outcome: HistoryAcceptOutcome = 'merged';
  if (!match) {
    await createChronicCondition(
      appointment.patient_id as string,
      { condition: item.name },
      correlationId,
      doctorId
    );
    outcome = 'created';
  }

  const items = row.conditions.items.map((entry, i) =>
    i === index ? stampItem(entry, doctorId, at) : entry
  );
  const saved = await persistSubmissionPayload(
    row,
    doctorId,
    { conditions: { ...row.conditions, items } },
    correlationId,
    doctorId
  );
  return { submission: publicSubmission(saved), outcome };
}

export async function acceptHistorySubmissionItem(
  appointmentId: string,
  doctorId: string,
  input: AcceptHistorySubmissionInput,
  correlationId: string
): Promise<AcceptHistorySubmissionResult> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  if (!appointment.patient_id) {
    throw new ValidationError('Appointment has no patient');
  }
  const row = await loadSubmissionRow(appointmentId, doctorId, correlationId);
  if (!row) {
    throw new NotFoundError('History submission not found');
  }

  const at = new Date().toISOString();
  if (input.field === 'why_today') {
    return acceptWhyToday(appointment, row, doctorId, correlationId, at);
  }
  if (input.field === 'allergies') {
    if (input.index === undefined) {
      return acceptAllergyNone(appointment, row, doctorId, correlationId, at);
    }
    return acceptAllergyItem(appointment, row, input.index, doctorId, correlationId, at);
  }
  if (input.field === 'medicines') {
    if (input.index === undefined) {
      throw new ValidationError('Nothing to add to the chart');
    }
    return acceptMedicineItem(appointment, row, input.index, doctorId, correlationId, at);
  }
  if (input.index === undefined) {
    throw new ValidationError('Nothing to add to the chart');
  }
  return acceptConditionItem(appointment, row, input.index, doctorId, correlationId, at);
}
