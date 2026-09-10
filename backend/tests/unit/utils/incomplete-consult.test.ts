import {
  consultationSessionStarted,
  isIncompleteConsult,
} from '../../../src/utils/incomplete-consult';

describe('incomplete-consult', () => {
  it('detects started via live / timestamps', () => {
    expect(consultationSessionStarted({ status: 'live' })).toBe(true);
    expect(
      consultationSessionStarted({ status: 'ended', actual_started_at: '2026-01-01T00:00:00Z' })
    ).toBe(true);
    expect(
      consultationSessionStarted({ status: 'ended', doctor_joined_at: '2026-01-01T00:00:00Z' })
    ).toBe(true);
    expect(consultationSessionStarted({ status: 'scheduled' })).toBe(false);
  });

  it('incomplete when started and appointment not completed', () => {
    expect(
      isIncompleteConsult({
        session: { status: 'live' },
        appointmentStatus: 'confirmed',
      })
    ).toBe(true);
    expect(
      isIncompleteConsult({
        session: { status: 'ended', actual_started_at: '2026-01-01T00:00:00Z' },
        appointmentStatus: 'pending',
      })
    ).toBe(true);
  });

  it('excludes never-started and completed appointments', () => {
    expect(
      isIncompleteConsult({
        session: { status: 'scheduled' },
        appointmentStatus: 'confirmed',
      })
    ).toBe(false);
    expect(
      isIncompleteConsult({
        session: { status: 'ended', actual_started_at: '2026-01-01T00:00:00Z' },
        appointmentStatus: 'completed',
      })
    ).toBe(false);
  });
});
