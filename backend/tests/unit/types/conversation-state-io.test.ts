import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  applyFinalCatalogServiceSelection,
  applyStaffReviewGateCancellationToConversationState,
  SERVICE_CATALOG_MATCH_REASON_CODES,
} from '../../../src/types/conversation';
import {
  migrateConversationMetadataToNested,
  readConversationState,
  writeConversationState,
} from '../../../src/types/conversation-state-io';

const legacyFixtureDir = join(
  __dirname,
  '../../fixtures/conversation-state/legacy'
);

function expectStableReadWriteRead(fixture: Record<string, unknown>): void {
  const state1 = readConversationState(fixture);
  const nested = writeConversationState(state1);
  const state2 = readConversationState(nested);
  expect(state2).toEqual(state1);
  expect(writeConversationState(state2)).toEqual(nested);
}

describe('conversation-state-io (rcp-14 identity seam)', () => {
  it('readConversationState returns {} for nullish and non-objects', () => {
    expect(readConversationState(null)).toEqual({});
    expect(readConversationState(undefined)).toEqual({});
    expect(readConversationState('')).toEqual({});
    expect(readConversationState([])).toEqual({});
  });

  it.each(readdirSync(legacyFixtureDir).filter((f) => f.endsWith('.json')))(
    'rcp-19: legacy fixture %s migrates to nested on write with stable in-memory state',
    (filename) => {
      const raw = readFileSync(join(legacyFixtureDir, filename), 'utf-8');
      const fixture = JSON.parse(raw) as Record<string, unknown>;
      expectStableReadWriteRead(fixture);
      const nested = migrateConversationMetadataToNested(fixture);
      expect(nested).toEqual(writeConversationState(readConversationState(fixture)));
      expect(readConversationState(nested)).toEqual(readConversationState(fixture));
    }
  );

  it('writeConversationState shallow-copies without dropping keys', () => {
    const input = {
      step: 'responded' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = writeConversationState(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('cancel multi-appointment legacy row nests pending ids on disk', () => {
    const appt1 = '11111111-1111-4111-8111-111111111111';
    const appt2 = '22222222-2222-4222-8222-222222222222';
    const fixture = {
      step: 'awaiting_cancel_choice',
      pendingCancelAppointmentIds: [appt1, appt2],
      updatedAt: '2026-05-28T10:30:00.000Z',
    };
    const state = readConversationState(fixture);
    expect(state.cancel?.pendingAppointmentIds).toEqual([appt1, appt2]);
    expect(state).not.toHaveProperty('pendingCancelAppointmentIds');
    const disk = writeConversationState(state);
    expect(disk.cancel).toEqual({ pendingAppointmentIds: [appt1, appt2] });
    expect(disk).not.toHaveProperty('pendingCancelAppointmentIds');
    expectStableReadWriteRead(fixture);
    expect(state.cancel?.pendingAppointmentIds?.[1]).toBe(appt2);
  });

  it('staff confirm path: finalized state serializes nested serviceMatch for booking page', () => {
    const pending = readConversationState({
      step: 'awaiting_staff_service_confirmation',
      matcherProposedCatalogServiceKey: 'dermatology',
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      serviceCatalogMatchConfidence: 'low',
    });
    const next = applyFinalCatalogServiceSelection(pending, {
      catalogServiceKey: 'dermatology',
      catalogServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      consultationModality: 'video',
      clearProposal: true,
      reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_CONFIRMED_PROPOSAL],
    });
    const disk = writeConversationState(next);
    expect(disk.serviceMatch).toMatchObject({
      catalogServiceKey: 'dermatology',
      serviceSelectionFinalized: true,
      pendingStaffServiceReview: false,
      consultationModality: 'video',
    });
    expect(disk.serviceMatch).not.toHaveProperty('matcherProposedCatalogServiceKey');
    expect(readConversationState(disk).serviceMatch?.consultationModality).toBe('video');
  });

  it('staff cancel / SLA timeout: gate cancellation clears review flags on disk', () => {
    const pending = readConversationState({
      step: 'awaiting_staff_service_confirmation',
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      staffServiceReviewDeadlineAt: '2026-05-28T18:00:00.000Z',
    });
    const next = applyStaffReviewGateCancellationToConversationState(
      pending,
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_TIMED_OUT
    );
    const disk = writeConversationState(next);
    expect(disk.step).toBe('responded');
    const sm = disk.serviceMatch as Record<string, unknown>;
    expect(sm.pendingStaffServiceReview).toBe(false);
    expect(sm.staffServiceReviewRequestId).toBeUndefined();
    expect(sm.staffServiceReviewDeadlineAt).toBeUndefined();
    expect(readConversationState(disk).serviceMatch?.pendingStaffServiceReview).toBe(false);
  });

  it('staff-review-pending legacy fixture migrates to nested on write', () => {
    const raw = readFileSync(
      join(legacyFixtureDir, 'staff-review-pending.json'),
      'utf-8'
    );
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.serviceMatch?.matcherProposedCatalogServiceKey).toBe('dermatology');
    expect(state.serviceMatch?.pendingStaffServiceReview).toBe(true);
    expect(state).not.toHaveProperty('matcherProposedCatalogServiceKey');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-17: recording consent namespace nests on disk', () => {
    const fixture = {
      recordingConsentDecision: true,
      recordingConsentVersion: 'v1.1',
      recordingConsentRePitched: false,
    };
    const state = readConversationState(fixture);
    expect(state.recordingConsent?.recordingConsentDecision).toBe(true);
    expect(state.recordingConsent?.recordingConsentVersion).toBe('v1.1');
    expect(state).not.toHaveProperty('recordingConsentDecision');
    const disk = writeConversationState(state);
    expect(disk.recordingConsent).toEqual({
      recordingConsentDecision: true,
      recordingConsentVersion: 'v1.1',
      recordingConsentRePitched: false,
    });
    expectStableReadWriteRead(fixture);
  });

  it('rcp-17: fee-triage-idle fixture nests triage on read and write', () => {
    const raw = readFileSync(join(legacyFixtureDir, 'fee-triage-idle.json'), 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.triage?.activeFlow).toBe('fee_quote');
    expect(state.triage?.reasonFirstTriagePhase).toBe('ask_more');
    expect(state.triage?.postMedicalConsultFeeAckSent).toBe(true);
    expect(state).not.toHaveProperty('activeFlow');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-17: clarification fixture nests PHI fields on read and write', () => {
    const raw = readFileSync(join(legacyFixtureDir, 'clarification.json'), 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.clarification?.originalReasonForVisit).toBe('Skin rash and knee pain');
    expect(state.clarification?.pendingClarificationConcerns).toEqual([
      'Skin rash',
      'Knee pain',
    ]);
    expect(state).not.toHaveProperty('originalReasonForVisit');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-18: confirm-details fixture nests booking on read and write', () => {
    const raw = readFileSync(join(legacyFixtureDir, 'confirm-details.json'), 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.booking?.reasonForVisit).toBe('Knee pain for two weeks');
    expect(state.booking?.consultationType).toBe('video');
    expect(state).not.toHaveProperty('reasonForVisit');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-18: book-for-other fixture nests bookingForOther on read and write', () => {
    const raw = readFileSync(join(legacyFixtureDir, 'book-for-other.json'), 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.bookingForOther?.bookingForSomeoneElse).toBe(true);
    expect(state.bookingForOther?.relation).toBe('mother');
    expect(state.bookingForOther?.pendingSelfBooking).toBe(true);
    expect(state).not.toHaveProperty('bookingForSomeoneElse');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-18: booking namespace lifts fields used at slot pay / book hand-off', () => {
    const state = readConversationState({
      reasonForVisit: 'Headache',
      extraNotes: 'No aspirin',
      bookingForPatientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(state.booking?.reasonForVisit).toBe('Headache');
    expect(state.booking?.extraNotes).toBe('No aspirin');
    expect(state.bookingForOther?.bookingForPatientId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(state).not.toHaveProperty('reasonForVisit');
  });

  it('rcp-18: slot-selection fixture preserves slotToConfirm under booking on disk', () => {
    const raw = readFileSync(join(legacyFixtureDir, 'slot-selection.json'), 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, unknown>;
    const state = readConversationState(fixture);
    expect(state.booking?.slotToConfirm).toEqual({
      start: '2026-05-30T09:00:00.000Z',
      end: '2026-05-30T09:30:00.000Z',
      dateStr: 'May 30, 2026, 2:30 PM',
    });
    expect(state.booking?.lastBookingPatientId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const disk = writeConversationState(state);
    expect((disk.booking as Record<string, unknown>).slotToConfirm).toEqual(fixture.slotToConfirm);
    expect(disk).not.toHaveProperty('slotToConfirm');
    expectStableReadWriteRead(fixture);
  });

  it('rcp-19: deprecated slot steps normalize on read and persist nested', () => {
    const fixture = {
      step: 'confirming_slot',
      slotToConfirm: { start: '2026-05-30T09:00:00.000Z', end: '2026-05-30T09:30:00.000Z' },
    };
    const state = readConversationState(fixture);
    expect(state.step).toBe('awaiting_slot_selection');
    expect(state.booking?.slotToConfirm).toBeUndefined();
    expect(writeConversationState(state).step).toBe('awaiting_slot_selection');
    expectStableReadWriteRead(fixture);
  });

  it('nested cancel/reschedule on disk round-trips without flattening', () => {
    const nested = {
      step: 'awaiting_cancel_confirmation',
      cancel: { appointmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      reschedule: { appointmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    };
    const disk = writeConversationState(readConversationState(nested));
    expect(disk).toEqual({
      step: 'awaiting_cancel_confirmation',
      cancel: { appointmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      reschedule: { appointmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(readConversationState(disk)).toEqual(readConversationState(nested));
  });
});
