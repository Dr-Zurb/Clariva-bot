/**
 * Desk capabilities on clinic_staff (235, 237).
 * The row is authoritative; JWT role stays a /desk routing hint (RQ2).
 *
 * Payments stay inside registration. Leftover `billing` folds into `front_desk`.
 * Leftover `previsit` folds into vitals + history + internal_labs + papers.
 */

import { ValidationError } from '../utils/errors';

export const STAFF_CAPABILITIES = [
  'front_desk',
  'vitals',
  'history',
  'internal_labs',
  'papers',
] as const;
export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

export const SEAT_CAPABILITIES = STAFF_CAPABILITIES;
export type SeatCapability = StaffCapability;

export const PREP_CAPABILITIES = [
  'vitals',
  'history',
  'internal_labs',
  'papers',
] as const;
export type PrepCapability = (typeof PREP_CAPABILITIES)[number];

export const DEFAULT_STAFF_CAPABILITIES: StaffCapability[] = [...STAFF_CAPABILITIES];

const PREVISIT_FOLD: readonly StaffCapability[] = [
  'vitals',
  'history',
  'internal_labs',
  'papers',
];

export function isStaffCapability(value: unknown): value is StaffCapability {
  return (
    typeof value === 'string' &&
    (STAFF_CAPABILITIES as readonly string[]).includes(value)
  );
}

function foldCapabilityList(input: readonly unknown[]): StaffCapability[] {
  const held = new Set<StaffCapability>();
  for (const raw of input) {
    if (raw === 'front_desk' || raw === 'billing') {
      held.add('front_desk');
      continue;
    }
    if (raw === 'previsit') {
      for (const cap of PREVISIT_FOLD) held.add(cap);
      continue;
    }
    if (isStaffCapability(raw)) held.add(raw);
  }
  return STAFF_CAPABILITIES.filter((cap) => held.has(cap));
}

export function normalizeStaffCapabilities(input?: unknown): StaffCapability[] {
  if (input === undefined || input === null) {
    return [...DEFAULT_STAFF_CAPABILITIES];
  }
  if (!Array.isArray(input)) {
    throw new ValidationError('Choose at least one capability');
  }
  const next = foldCapabilityList(input);
  if (next.length === 0) {
    throw new ValidationError('Choose at least one capability');
  }
  return next;
}

export function roleForCapabilities(
  capabilities: readonly string[]
): 'receptionist' | 'assistant' {
  return capabilities.includes('front_desk') || capabilities.includes('billing')
    ? 'receptionist'
    : 'assistant';
}

export function seatCapabilitiesOf(
  capabilities: readonly string[]
): SeatCapability[] {
  return foldCapabilityList(capabilities);
}

export function seatsOverlap(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const seats = seatCapabilitiesOf(left);
  const other = seatCapabilitiesOf(right);
  return seats.some((cap) => other.includes(cap));
}

export function hasAnyStaffCapability(
  have: readonly string[] | undefined,
  need: readonly StaffCapability[]
): boolean {
  if (!have || have.length === 0) return false;
  const held = foldCapabilityList(have);
  return need.some((cap) => held.includes(cap));
}

export function isInternalLabDocument(
  documentType: string,
  orderedBy: string
): boolean {
  return documentType === 'lab_report' && orderedBy === 'us';
}

/** Undefined `have` = doctor (unrestricted). Empty list is no seats. */
export function canWriteVisitDocumentKind(
  have: readonly string[] | undefined,
  documentType: string,
  orderedBy: string
): boolean {
  if (have === undefined) return true;
  const held = foldCapabilityList(have);
  if (isInternalLabDocument(documentType, orderedBy)) {
    return held.includes('internal_labs');
  }
  return held.includes('papers');
}
