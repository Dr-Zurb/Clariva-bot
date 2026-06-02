/**
 * Doctor drug favorites service — unit tests (rx-polish-favorites · rxf-04).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import {
  createDoctorDrugFavorite,
  deleteDoctorDrugFavorite,
  listDoctorDrugFavorites,
  MAX_DOCTOR_DRUG_FAVORITES,
  updateDoctorDrugFavorite,
} from '../../../src/services/doctor-drug-favorites-service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/utils/errors';
import type { MedicineRowTemplate } from '../../../src/types/doctor-drug-favorite';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-rxf-04';
const doctorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const doctorB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const validTemplate: MedicineRowTemplate = {
  medicineName: 'Paracetamol',
  dosage: '500mg',
  route: 'oral',
  frequency: 'Three times daily',
  duration: '5 days',
  instructions: 'After meals',
  drugMasterId: null,
  frequencyCode: 'TID',
  durationValue: 5,
  durationUnit: 'days',
  routeCode: 'oral',
};

interface FavoriteRow {
  id: string;
  doctor_id: string;
  name: string;
  template: MedicineRowTemplate;
  created_at: string;
  updated_at: string;
}

function buildFavoritesStore() {
  const rows = new Map<string, FavoriteRow>();
  let seq = 0;

  const from = jest.fn((table: string) => {
    if (table !== 'doctor_drug_favorites') {
      throw new Error(`unexpected table ${table}`);
    }

    const filters: Record<string, string> = {};
    let pendingCount = false;

    const chain = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count === 'exact' && opts.head) {
          pendingCount = true;
        }
        return chain;
      },
      eq(col: string, val: string) {
        filters[col] = val;
        return chain;
      },
      order() {
        return chain;
      },
      async maybeSingle() {
        const match = [...rows.values()].find((r) => {
          if (filters.id && r.id !== filters.id) return false;
          if (filters.doctor_id && r.doctor_id !== filters.doctor_id) return false;
          return true;
        });
        return { data: match ?? null, error: null };
      },
      insert(row: Omit<FavoriteRow, 'id' | 'created_at' | 'updated_at'>) {
        return {
          select() {
            return {
              async single() {
                seq += 1;
                const now = new Date().toISOString();
                const created: FavoriteRow = {
                  id: `fav-${seq}`,
                  created_at: now,
                  updated_at: now,
                  ...row,
                };
                rows.set(created.id, created);
                return { data: created, error: null };
              },
            };
          },
        };
      },
      update(patch: Partial<FavoriteRow>) {
        return {
          eq(col: string, val: string) {
            filters[col] = val;
            return {
              eq(col2: string, val2: string) {
                filters[col2] = val2;
                return {
                  select() {
                    return {
                      async single() {
                        const match = [...rows.values()].find((r) => {
                          if (filters.id && r.id !== filters.id) return false;
                          if (filters.doctor_id && r.doctor_id !== filters.doctor_id) return false;
                          return true;
                        });
                        if (!match) return { data: null, error: null };
                        const updated = {
                          ...match,
                          ...patch,
                          updated_at: new Date().toISOString(),
                        };
                        rows.set(match.id, updated);
                        return { data: updated, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      delete() {
        return {
          eq(col: string, val: string) {
            filters[col] = val;
            return {
              eq(col2: string, val2: string) {
                filters[col2] = val2;
                return Promise.resolve({
                  error: null,
                  then(onFulfilled?: (v: { error: null }) => unknown) {
                    const match = [...rows.values()].find((r) => {
                      if (filters.id && r.id !== filters.id) return false;
                      if (filters.doctor_id && r.doctor_id !== filters.doctor_id) return false;
                      return true;
                    });
                    if (match) rows.delete(match.id);
                    return Promise.resolve({ error: null }).then(onFulfilled);
                  },
                });
              },
            };
          },
        };
      },
      async then(onFulfilled?: (v: { data: FavoriteRow[] | null; count?: number; error: null }) => unknown) {
        if (pendingCount) {
          const count = [...rows.values()].filter(
            (r) => !filters.doctor_id || r.doctor_id === filters.doctor_id,
          ).length;
          return Promise.resolve({ data: null, count, error: null }).then(onFulfilled);
        }
        const list = [...rows.values()]
          .filter((r) => !filters.doctor_id || r.doctor_id === filters.doctor_id)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return Promise.resolve({ data: list, error: null }).then(onFulfilled);
      },
    };

    return chain;
  });

  return { from, rows };
}

describe('doctor-drug-favorites-service', () => {
  let store: ReturnType<typeof buildFavoritesStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = buildFavoritesStore();
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: store.from,
    } as never);
  });

  it('creates, lists, updates, and deletes a favorite for the owner', async () => {
    const created = await createDoctorDrugFavorite(
      { name: 'PCM fever', template: validTemplate },
      correlationId,
      doctorA,
    );
    expect(created.name).toBe('PCM fever');
    expect(created.template.medicineName).toBe('Paracetamol');

    const listed = await listDoctorDrugFavorites(correlationId, doctorA);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const updated = await updateDoctorDrugFavorite(
      created.id,
      { name: 'PCM 500 TID' },
      correlationId,
      doctorA,
    );
    expect(updated.name).toBe('PCM 500 TID');

    await deleteDoctorDrugFavorite(created.id, correlationId, doctorA);
    const afterDelete = await listDoctorDrugFavorites(correlationId, doctorA);
    expect(afterDelete).toHaveLength(0);
  });

  it(`rejects the ${MAX_DOCTOR_DRUG_FAVORITES + 1}st favorite with 400`, async () => {
    for (let i = 0; i < MAX_DOCTOR_DRUG_FAVORITES; i += 1) {
      await createDoctorDrugFavorite(
        { name: `fav-${i}`, template: validTemplate },
        correlationId,
        doctorA,
      );
    }

    await expect(
      createDoctorDrugFavorite(
        { name: 'one too many', template: validTemplate },
        correlationId,
        doctorA,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('prevents doctor B from reading doctor A favorites via list filter', async () => {
    await createDoctorDrugFavorite(
      { name: 'PCM fever', template: validTemplate },
      correlationId,
      doctorA,
    );

    const doctorBList = await listDoctorDrugFavorites(correlationId, doctorB);
    expect(doctorBList).toHaveLength(0);
  });

  it('prevents doctor B from updating doctor A favorite', async () => {
    const created = await createDoctorDrugFavorite(
      { name: 'PCM fever', template: validTemplate },
      correlationId,
      doctorA,
    );

    await expect(
      updateDoctorDrugFavorite(created.id, { name: 'stolen' }, correlationId, doctorB),
    ).rejects.toThrow(ForbiddenError);
  });

  it('prevents doctor B from deleting doctor A favorite', async () => {
    const created = await createDoctorDrugFavorite(
      { name: 'PCM fever', template: validTemplate },
      correlationId,
      doctorA,
    );

    await expect(
      deleteDoctorDrugFavorite(created.id, correlationId, doctorB),
    ).rejects.toThrow(ForbiddenError);

    const stillThere = await listDoctorDrugFavorites(correlationId, doctorA);
    expect(stillThere).toHaveLength(1);
  });

  it('rejects malformed template at the validation layer', async () => {
    const { validateCreateDoctorDrugFavoriteBody } = await import(
      '../../../src/utils/validation'
    );
    expect(() =>
      validateCreateDoctorDrugFavoriteBody({
        name: 'bad',
        template: { medicineName: 'x' },
      }),
    ).toThrow(ValidationError);
  });

  it('returns not found when updating a missing favorite', async () => {
    await expect(
      updateDoctorDrugFavorite(
        '11111111-1111-1111-1111-111111111111',
        { name: 'nope' },
        correlationId,
        doctorA,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
