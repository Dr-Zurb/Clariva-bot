/**
 * Replace a prescription's medicine rows without a window where the
 * table is empty.
 *
 * Insert the new rows first, then delete the previous ids. A failed
 * insert leaves the previous list in place. Callers must hold
 * `withPrescriptionMedicinesLock` so a print snapshot cannot observe
 * the brief old+new overlap.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MedicineInput } from '../types/prescription';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';

export async function swapPrescriptionMedicineRows(
  admin: SupabaseClient,
  id: string,
  medicines: MedicineInput[],
  correlationId: string,
): Promise<void> {
  const { data: existing, error: existingError } = await admin
    .from('prescription_medicines')
    .select('id')
    .eq('prescription_id', id);

  if (existingError) {
    handleSupabaseError(existingError, correlationId);
  }

  const oldIds = ((existing ?? []) as Array<{ id: string }>).map((row) => row.id);

  if (medicines.length === 0) {
    await deleteMedicineIds(admin, oldIds, correlationId);
    return;
  }

  const medicineRows = medicines.map((m, i) => ({
    prescription_id: id,
    medicine_name: m.medicineName,
    dosage: m.dosage ?? null,
    route: m.route ?? null,
    frequency: m.frequency ?? null,
    duration: m.duration ?? null,
    instructions: m.instructions ?? null,
    sort_order: m.sortOrder ?? i,
    drug_master_id: m.drugMasterId ?? null,
    frequency_code: m.frequencyCode ?? null,
    duration_value: m.durationValue ?? null,
    duration_unit: m.durationUnit ?? null,
    route_code: m.routeCode ?? null,
    dose_qty: m.doseQty ?? null,
    dose_unit: m.doseUnit ?? null,
    form: m.form ?? null,
    food_timing: m.foodTiming ?? null,
  }));

  const { data: inserted, error: medError } = await admin
    .from('prescription_medicines')
    .insert(medicineRows)
    .select('id');

  if (medError) {
    handleSupabaseError(medError, correlationId);
  }

  const insertedIds = ((inserted ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (insertedIds.length !== medicineRows.length) {
    if (insertedIds.length > 0) {
      await deleteMedicineIds(admin, insertedIds, correlationId);
    }
    throw new InternalError('Medicine save did not store every row');
  }

  await deleteMedicineIds(admin, oldIds, correlationId);
}

async function deleteMedicineIds(
  admin: SupabaseClient,
  ids: string[],
  correlationId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from('prescription_medicines').delete().in('id', ids);
  if (error) {
    handleSupabaseError(error, correlationId);
  }
}
