/**
 * Per-prescription mutex for medicine row swaps and prescription PDF reads.
 *
 * A save used to delete every medicine row and then insert the new list.
 * Print could read in that gap and render an empty slip, or render the
 * list from the save before the last medicine landed. Writers and the
 * print snapshot share this lock so a reader never observes a half-written
 * list on this process.
 */

const tails = new Map<string, Promise<void>>();

export function withPrescriptionMedicinesLock<T>(
  prescriptionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = tails.get(prescriptionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate, () => gate);
  tails.set(prescriptionId, tail);

  return prev.then(fn, fn).finally(() => {
    release();
    if (tails.get(prescriptionId) === tail) {
      tails.delete(prescriptionId);
    }
  });
}
