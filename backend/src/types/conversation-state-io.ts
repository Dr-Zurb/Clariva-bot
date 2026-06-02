/**
 * Conversation metadata read/write seam (rcp-14+).
 *
 * Single entry point for hydrating and serializing `conversations.metadata`.
 * rcp-19: **writes** nested namespaces; **reads** nested plus legacy-flat lift for
 * unmigrated rows (remove flat lift after backfill + rollout window).
 */

import type {
  BookingForOtherState,
  BookingState,
  CancelState,
  ClarificationState,
  ConversationState,
  RecordingConsentState,
  RescheduleState,
  ServiceMatchState,
  TriageState,
} from './conversation';
import {
  BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES,
  BOOKING_LEGACY_FIELD_NAMES,
  CLARIFICATION_LEGACY_FIELD_NAMES,
  normalizePersistedStep,
  RECORDING_CONSENT_LEGACY_FIELD_NAMES,
  SERVICE_MATCH_LEGACY_FIELD_NAMES,
  TRIAGE_LEGACY_FIELD_NAMES,
} from './conversation';

const LEGACY_CANCEL_APPOINTMENT_ID = 'cancelAppointmentId';
const LEGACY_CANCEL_PENDING = 'pendingCancelAppointmentIds';
const LEGACY_RESCHEDULE_APPOINTMENT_ID = 'rescheduleAppointmentId';
const LEGACY_RESCHEDULE_PENDING = 'pendingRescheduleAppointmentIds';

/** All legacy top-level keys stripped on nested write (rcp-19). */
const LEGACY_FLAT_KEYS_TO_STRIP: readonly string[] = [
  LEGACY_CANCEL_APPOINTMENT_ID,
  LEGACY_CANCEL_PENDING,
  LEGACY_RESCHEDULE_APPOINTMENT_ID,
  LEGACY_RESCHEDULE_PENDING,
  ...SERVICE_MATCH_LEGACY_FIELD_NAMES,
  ...RECORDING_CONSENT_LEGACY_FIELD_NAMES,
  ...TRIAGE_LEGACY_FIELD_NAMES,
  ...CLARIFICATION_LEGACY_FIELD_NAMES,
  ...BOOKING_LEGACY_FIELD_NAMES,
  ...BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES,
];

function readCancelSubState(raw: Record<string, unknown>): CancelState | undefined {
  const nested =
    raw.cancel != null && typeof raw.cancel === 'object' && !Array.isArray(raw.cancel)
      ? (raw.cancel as CancelState)
      : {};

  const appointmentId =
    nested.appointmentId ??
    (typeof raw[LEGACY_CANCEL_APPOINTMENT_ID] === 'string'
      ? raw[LEGACY_CANCEL_APPOINTMENT_ID]
      : undefined);
  const pendingAppointmentIds =
    nested.pendingAppointmentIds ??
    (Array.isArray(raw[LEGACY_CANCEL_PENDING])
      ? (raw[LEGACY_CANCEL_PENDING] as string[])
      : undefined);

  if (appointmentId === undefined && pendingAppointmentIds === undefined) {
    return undefined;
  }
  return { appointmentId, pendingAppointmentIds };
}

function readRescheduleSubState(raw: Record<string, unknown>): RescheduleState | undefined {
  const nested =
    raw.reschedule != null && typeof raw.reschedule === 'object' && !Array.isArray(raw.reschedule)
      ? (raw.reschedule as RescheduleState)
      : {};

  const appointmentId =
    nested.appointmentId ??
    (typeof raw[LEGACY_RESCHEDULE_APPOINTMENT_ID] === 'string'
      ? raw[LEGACY_RESCHEDULE_APPOINTMENT_ID]
      : undefined);
  const pendingAppointmentIds =
    nested.pendingAppointmentIds ??
    (Array.isArray(raw[LEGACY_RESCHEDULE_PENDING])
      ? (raw[LEGACY_RESCHEDULE_PENDING] as string[])
      : undefined);

  if (appointmentId === undefined && pendingAppointmentIds === undefined) {
    return undefined;
  }
  return { appointmentId, pendingAppointmentIds };
}

function readServiceMatchSubState(raw: Record<string, unknown>): ServiceMatchState | undefined {
  const nested =
    raw.serviceMatch != null &&
    typeof raw.serviceMatch === 'object' &&
    !Array.isArray(raw.serviceMatch)
      ? (raw.serviceMatch as ServiceMatchState)
      : {};

  const out: ServiceMatchState = { ...nested };
  for (const key of SERVICE_MATCH_LEGACY_FIELD_NAMES) {
    if (out[key] !== undefined) continue;
    const legacy = raw[key];
    if (legacy !== undefined) {
      (out as Record<string, unknown>)[key] = legacy;
    }
  }

  const hasAny = SERVICE_MATCH_LEGACY_FIELD_NAMES.some((k) => out[k] !== undefined);
  return hasAny ? out : undefined;
}

function readNamespaceSubState<NS extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  namespaceKey: string,
  fieldNames: readonly string[]
): NS | undefined {
  const nested =
    raw[namespaceKey] != null &&
    typeof raw[namespaceKey] === 'object' &&
    !Array.isArray(raw[namespaceKey])
      ? (raw[namespaceKey] as NS)
      : {};

  const out = { ...nested } as NS;
  for (const key of fieldNames) {
    if ((out as Record<string, unknown>)[key] !== undefined) continue;
    const legacy = raw[key];
    if (legacy !== undefined) {
      (out as Record<string, unknown>)[key] = legacy;
    }
  }
  const hasAny = fieldNames.some((k) => (out as Record<string, unknown>)[k] !== undefined);
  return hasAny ? out : undefined;
}

function applyLegacySlotStepBookingCleanup(
  rawStep: unknown,
  booking: BookingState | undefined
): BookingState | undefined {
  if (!booking) return undefined;
  if (rawStep === 'selecting_slot') {
    const { slotSelectionDate: _drop, ...rest } = booking;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  if (rawStep === 'confirming_slot') {
    const { slotToConfirm: _drop, ...rest } = booking;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return booking;
}

function stripLegacyFlatKeys(out: Record<string, unknown>): void {
  for (const key of LEGACY_FLAT_KEYS_TO_STRIP) {
    delete out[key];
  }
  delete out.cancel;
  delete out.reschedule;
  delete out.serviceMatch;
  delete out.recordingConsent;
  delete out.triage;
  delete out.clarification;
  delete out.booking;
  delete out.bookingForOther;
}

function attachNamespaceIfNonempty(
  out: Record<string, unknown>,
  key: string,
  sub: Record<string, unknown> | undefined
): void {
  if (!sub || Object.keys(sub).length === 0) return;
  out[key] = sub;
}

/**
 * Hydrate in-memory conversation state from persisted metadata.
 */
export function readConversationState(metadata: unknown): ConversationState {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const raw = { ...(metadata as Record<string, unknown>) };
  const rawStep = raw.step;

  const cancel = readCancelSubState(raw);
  const reschedule = readRescheduleSubState(raw);
  const serviceMatch = readServiceMatchSubState(raw);
  const recordingConsent = readNamespaceSubState<RecordingConsentState>(
    raw,
    'recordingConsent',
    RECORDING_CONSENT_LEGACY_FIELD_NAMES
  );
  const triage = readNamespaceSubState<TriageState>(raw, 'triage', TRIAGE_LEGACY_FIELD_NAMES);
  const clarification = readNamespaceSubState<ClarificationState>(
    raw,
    'clarification',
    CLARIFICATION_LEGACY_FIELD_NAMES
  );
  let booking = readNamespaceSubState<BookingState>(raw, 'booking', BOOKING_LEGACY_FIELD_NAMES);
  booking = applyLegacySlotStepBookingCleanup(rawStep, booking);
  const bookingForOther = readNamespaceSubState<BookingForOtherState>(
    raw,
    'bookingForOther',
    BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES
  );

  delete raw[LEGACY_CANCEL_APPOINTMENT_ID];
  delete raw[LEGACY_CANCEL_PENDING];
  delete raw[LEGACY_RESCHEDULE_APPOINTMENT_ID];
  delete raw[LEGACY_RESCHEDULE_PENDING];
  delete raw.cancel;
  delete raw.reschedule;
  delete raw.serviceMatch;
  delete raw.recordingConsent;
  delete raw.triage;
  delete raw.clarification;
  delete raw.booking;
  delete raw.bookingForOther;
  for (const key of SERVICE_MATCH_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }
  for (const key of RECORDING_CONSENT_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }
  for (const key of TRIAGE_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }
  for (const key of CLARIFICATION_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }
  for (const key of BOOKING_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }
  for (const key of BOOKING_FOR_OTHER_LEGACY_FIELD_NAMES) {
    delete raw[key];
  }

  const state = raw as ConversationState;
  if (cancel) state.cancel = cancel;
  if (reschedule) state.reschedule = reschedule;
  if (serviceMatch) state.serviceMatch = serviceMatch;
  if (recordingConsent) state.recordingConsent = recordingConsent;
  if (triage) state.triage = triage;
  if (clarification) state.clarification = clarification;
  if (booking) state.booking = booking;
  if (bookingForOther) state.bookingForOther = bookingForOther;

  const normalizedStep = normalizePersistedStep(rawStep ?? state.step);
  if (normalizedStep !== undefined) {
    state.step = normalizedStep;
  } else {
    delete state.step;
  }

  return state;
}

/**
 * Serialize in-memory state to the metadata column shape (nested namespaces, rcp-19).
 *
 * Callers stamp `updatedAt` outside this function (see `updateConversationState`).
 */
export function writeConversationState(state: ConversationState): Record<string, unknown> {
  const {
    cancel,
    reschedule,
    serviceMatch,
    recordingConsent,
    triage,
    clarification,
    booking,
    bookingForOther,
    ...rest
  } = state;
  const out: Record<string, unknown> = { ...rest };
  stripLegacyFlatKeys(out);
  attachNamespaceIfNonempty(out, 'cancel', cancel);
  attachNamespaceIfNonempty(out, 'reschedule', reschedule);
  attachNamespaceIfNonempty(out, 'serviceMatch', serviceMatch);
  attachNamespaceIfNonempty(out, 'recordingConsent', recordingConsent);
  attachNamespaceIfNonempty(out, 'triage', triage);
  attachNamespaceIfNonempty(out, 'clarification', clarification);
  attachNamespaceIfNonempty(out, 'booking', booking);
  attachNamespaceIfNonempty(out, 'bookingForOther', bookingForOther);
  return out;
}

/**
 * Idempotent migration: legacy-flat or mixed metadata → nested canonical shape.
 * Used by upgrade-on-write paths and the backfill script.
 */
export function migrateConversationMetadataToNested(metadata: unknown): Record<string, unknown> {
  return writeConversationState(readConversationState(metadata));
}
