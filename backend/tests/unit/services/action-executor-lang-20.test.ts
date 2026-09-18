/**
 * lang-20: action executor uses shared builders + queue-mode reschedule link.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAppointment = jest.fn();
const mockCancel = jest.fn();
const mockNotify = jest.fn();
const mockBuildUrl = jest.fn();

jest.mock('../../../src/services/appointment-service', () => ({
  getAppointmentByIdForWorker: (...args: unknown[]) => mockGetAppointment(...args),
  cancelAppointmentForPatient: (...args: unknown[]) => mockCancel(...args),
}));

jest.mock('../../../src/services/notification-service', () => ({
  sendAppointmentCancelledToDoctor: (...args: unknown[]) => mockNotify(...args),
}));

jest.mock('../../../src/services/slot-selection-service', () => ({
  buildReschedulePageUrl: (...args: unknown[]) => mockBuildUrl(...args),
}));

import { executeAction } from '../../../src/services/action-executor-service';
import type { ActionContext } from '../../../src/types/system-actions';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

function baseCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    conversationId: 'conv-1',
    doctorId: 'doc-1',
    conversation: {
      id: 'conv-1',
      patient_id: 'pat-1',
      doctor_id: 'doc-1',
      platform: 'instagram',
      platform_conversation_id: 'ig-1',
    },
    state: {
      step: 'awaiting_reschedule_choice',
      collectedFields: [],
      updatedAt: new Date().toISOString(),
      reschedule: { pendingAppointmentIds: ['appt-1'] },
    },
    correlationId: 'corr-1',
    timezone: 'Asia/Kolkata',
    language: 'en',
    doctorSettings: { opd_mode: 'slot' } as DoctorSettingsRow,
    ...overrides,
  };
}

describe('action-executor lang-20', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildUrl.mockReturnValue('https://book.example/r?t=1');
    mockNotify.mockReturnValue(Promise.resolve());
    mockCancel.mockReturnValue(Promise.resolve());
  });

  it('pick_appointment cancel confirm uses shared builder', async () => {
    mockGetAppointment.mockReturnValue(
      Promise.resolve({
        id: 'appt-1',
        doctor_id: 'doc-1',
        patient_id: 'pat-1',
        appointment_date: '2026-04-29T11:00:00.000Z',
      })
    );
    const result = await executeAction(
      { type: 'pick_appointment', index: 1 },
      baseCtx({
        state: {
          step: 'awaiting_cancel_choice',
          collectedFields: [],
          updatedAt: new Date().toISOString(),
          cancel: { pendingAppointmentIds: ['appt-1'] },
        },
      })
    );
    expect(result.success).toBe(true);
    expect(result.replyOverride).toMatch(
      /^Cancel appointment on .+\? Reply \*\*Yes\*\* or \*\*No\*\*\.$/
    );
  });

  it('§3.4 reschedule pick uses formatRescheduleChoiceLinkDm (queue)', async () => {
    mockGetAppointment.mockReturnValue(
      Promise.resolve({
        id: 'appt-1',
        doctor_id: 'doc-1',
        patient_id: 'pat-1',
        appointment_date: '2026-04-29T11:00:00.000Z',
      })
    );
    const result = await executeAction(
      { type: 'pick_appointment', index: 1 },
      baseCtx({
        doctorSettings: { opd_mode: 'queue' } as DoctorSettingsRow,
      })
    );
    expect(result.replyOverride).toBe(
      'Pick a new day for your visit: [Choose new day](https://book.example/r?t=1)'
    );
  });

  it('confirm_cancel declined uses shared builder', async () => {
    const result = await executeAction(
      { type: 'confirm_cancel', confirm: false },
      baseCtx({
        state: {
          step: 'awaiting_cancel_confirmation',
          collectedFields: [],
          updatedAt: new Date().toISOString(),
          cancel: { appointmentId: 'appt-1' },
        },
      })
    );
    expect(result.replyOverride).toBe(
      'No problem. Your appointment is still scheduled.'
    );
  });
});
