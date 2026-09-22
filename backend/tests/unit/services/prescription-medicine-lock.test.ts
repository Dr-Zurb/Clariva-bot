import { describe, expect, it } from '@jest/globals';
import { withPrescriptionMedicinesLock } from '../../../src/services/prescription-medicine-lock';

describe('withPrescriptionMedicinesLock', () => {
  it('runs a print read only after the in-flight save finishes', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const save = withPrescriptionMedicinesLock('rx-1', async () => {
      order.push('save-start');
      await gate;
      order.push('save-end');
    });
    const print = withPrescriptionMedicinesLock('rx-1', async () => {
      order.push('print');
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(['save-start']);

    release();
    await Promise.all([save, print]);
    expect(order).toEqual(['save-start', 'save-end', 'print']);
  });
});
