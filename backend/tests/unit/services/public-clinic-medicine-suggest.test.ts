import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DrugSearchResult } from '../../../src/types/drug-master';

const searchDrugs = jest.fn<(query: string, limit: number) => Promise<DrugSearchResult[]>>();
const readPatientHistory = jest.fn<(token: string, correlationId: string) => Promise<unknown>>();

jest.mock('../../../src/services/drug-master-service', () => ({
  searchDrugs: (...args: unknown[]) => searchDrugs(...(args as [string, number])),
}));

jest.mock('../../../src/services/public-clinic-history-service', () => ({
  readPatientHistory: (token: string, correlationId: string) =>
    readPatientHistory(token, correlationId),
}));

jest.mock('../../../src/utils/history-form-token', () => ({
  readHistoryFormAppointmentId: () => ({ ok: true, appointmentId: 'appt-1' }),
}));

function drug(partial: Partial<DrugSearchResult>): DrugSearchResult {
  return {
    id: 'drug-1',
    generic_name: 'Telmisartan',
    brand_names: ['Telma'],
    strength: '40 mg',
    form: 'Tablet',
    route_default: 'oral',
    created_at: '2030-01-01T00:00:00.000Z',
    updated_at: '2030-01-01T00:00:00.000Z',
    ...partial,
  };
}

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  return import('../../../src/services/public-clinic-medicine-suggest-service');
}

describe('patient medicine suggestions', () => {
  beforeEach(() => {
    searchDrugs.mockReset();
    readPatientHistory.mockReset();
    readPatientHistory.mockResolvedValue({});
  });

  it('saves the brand and strength, and keeps the generic as a hint', async () => {
    const { toPatientMedicineSuggestion } = await load();
    expect(toPatientMedicineSuggestion(drug({}), 'tel')).toEqual({
      label: 'Telma 40 mg',
      hint: 'Telmisartan',
    });
    expect(
      toPatientMedicineSuggestion(drug({ brand_names: ['Telma 40'] }), 'telma')
    ).toEqual({
      label: 'Telma 40',
      hint: 'Telmisartan',
    });
    expect(
      toPatientMedicineSuggestion(
        drug({ brand_names: [], generic_name: 'Paracetamol', strength: '500 mg' }),
        'para'
      )
    ).toEqual({ label: 'Paracetamol 500 mg', hint: null });
  });

  it('loads the catalog once after the prep token checks out', async () => {
    searchDrugs.mockResolvedValue([drug({})]);
    const { listPublicMedicineCatalog } = await load();
    const result = await listPublicMedicineCatalog('history-token', 'corr');
    expect(readPatientHistory).toHaveBeenCalledWith('history-token', 'corr');
    expect(searchDrugs).toHaveBeenCalledWith('');
    expect(result.drugs).toEqual([
      {
        id: 'drug-1',
        genericName: 'Telmisartan',
        brandNames: ['Telma'],
        strength: '40 mg',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('created_at');
  });

  it('does not list the catalog for a one-letter query', async () => {
    const { suggestPublicMedicines } = await load();
    const result = await suggestPublicMedicines('history-token', 't', 'corr');
    expect(result).toEqual({ suggestions: [] });
    expect(searchDrugs).not.toHaveBeenCalled();
    expect(readPatientHistory).not.toHaveBeenCalled();
  });

  it('verifies the prep token and returns brand rows without a drug id', async () => {
    searchDrugs.mockResolvedValue([drug({})]);
    const { suggestPublicMedicines } = await load();
    const result = await suggestPublicMedicines('history-token', 'tel', 'corr');
    expect(readPatientHistory).toHaveBeenCalledWith('history-token', 'corr');
    expect(searchDrugs).toHaveBeenCalledWith('tel', 8, { preferBrands: true });
    expect(result.suggestions).toEqual([{ label: 'Telma 40 mg', hint: 'Telmisartan' }]);
    expect(JSON.stringify(result)).not.toContain('drug-1');
  });
});
