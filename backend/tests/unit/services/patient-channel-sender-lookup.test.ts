/**
 * rcp-27: findPatientByChannelSender doctor-scoped lookup.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { findPatientByChannelSender } from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const senderId = '987654321012345';
const correlationId = 'corr-channel-sender';

describe('findPatientByChannelSender (rcp-27)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('queries by doctor_id, platform, and platform_external_id', async () => {
    const patient = {
      id: 'patient-1',
      doctor_id: doctorId,
      platform: 'instagram',
      platform_external_id: senderId,
      name: 'Placeholder',
      phone: 'placeholder-instagram-x',
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const eq = jest.fn().mockReturnThis();
    const single = jest.fn().mockResolvedValue({ data: patient, error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ eq, single }),
      }),
    } as never);

    const result = await findPatientByChannelSender(
      doctorId,
      'instagram',
      senderId,
      correlationId
    );

    expect(result).toEqual(patient);
    expect(eq).toHaveBeenCalledWith('doctor_id', doctorId);
    expect(eq).toHaveBeenCalledWith('platform', 'instagram');
    expect(eq).toHaveBeenCalledWith('platform_external_id', senderId);
  });
});
