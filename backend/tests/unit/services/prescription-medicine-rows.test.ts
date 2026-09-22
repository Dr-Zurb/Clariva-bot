/**
 * Medicine replace must not leave a window where print can read zero rows.
 */

import { describe, expect, it } from '@jest/globals';
import { swapPrescriptionMedicineRows } from '../../../src/services/prescription-medicine-rows';
import type { MedicineInput } from '../../../src/types/prescription';

interface Row {
  id: string;
  medicine_name: string;
}

function memoryAdmin(initial: Row[], replacingWith: number) {
  let table = initial.map((row) => ({ ...row }));
  const calls: string[] = [];
  let exposedEmpty = false;
  let seq = 0;

  const admin = {
    from(tableName: string) {
      if (tableName !== 'prescription_medicines') {
        throw new Error(`unexpected table ${tableName}`);
      }
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({
                data: table.map((row) => ({ id: row.id })),
                error: null,
              });
            },
          };
        },
        insert(rows: Array<{ medicine_name: string }>) {
          return {
            select() {
              calls.push('insert');
              const inserted = rows.map((row) => {
                seq += 1;
                return { id: `new-${seq}`, medicine_name: row.medicine_name };
              });
              table = [...table, ...inserted];
              return Promise.resolve({
                data: inserted.map((row) => ({ id: row.id })),
                error: null,
              });
            },
          };
        },
        delete() {
          return {
            in(_column: string, ids: string[]) {
              calls.push('delete');
              const next = table.filter((row) => !ids.includes(row.id));
              if (replacingWith > 0 && next.length === 0) exposedEmpty = true;
              table = next;
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return {
    admin,
    calls,
    exposedEmpty: () => exposedEmpty,
    names: () => table.map((row) => row.medicine_name),
  };
}

const TWO: MedicineInput[] = [
  { medicineName: 'Telmisartan' },
  { medicineName: 'Levocetirizine' },
];

describe('swapPrescriptionMedicineRows', () => {
  it('inserts the new list before deleting the previous rows', async () => {
    const mem = memoryAdmin([{ id: 'old-1', medicine_name: 'Telmisartan' }], TWO.length);

    await swapPrescriptionMedicineRows(mem.admin as never, 'rx-1', TWO, 'corr');

    expect(mem.calls).toEqual(['insert', 'delete']);
    expect(mem.exposedEmpty()).toBe(false);
    expect(mem.names()).toEqual(['Telmisartan', 'Levocetirizine']);
  });

  it('clears every row only when the save itself has no medicines', async () => {
    const mem = memoryAdmin([{ id: 'old-1', medicine_name: 'Telmisartan' }], 0);

    await swapPrescriptionMedicineRows(mem.admin as never, 'rx-1', [], 'corr');

    expect(mem.calls).toEqual(['delete']);
    expect(mem.names()).toEqual([]);
  });
});
