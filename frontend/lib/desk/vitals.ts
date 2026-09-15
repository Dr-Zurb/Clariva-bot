export const DESK_VITALS_NOTE_MAX = 1000;

export type DeskVitalsFields = {
  bpSystolic: string;
  bpDiastolic: string;
  heartRate: string;
  temperatureC: string;
  spo2: string;
  weightKg: string;
  heightCm: string;
  note: string;
};

export const EMPTY_DESK_VITALS: DeskVitalsFields = {
  bpSystolic: "",
  bpDiastolic: "",
  heartRate: "",
  temperatureC: "",
  spo2: "",
  weightKg: "",
  heightCm: "",
  note: "",
};

export type DeskVitalsPayload = {
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  temperatureC?: number;
  spo2?: number;
  weightKg?: number;
  heightCm?: number;
  note?: string | null;
};

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function deskVitalsFromReading(row: {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  temperature_c: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  note?: string | null;
}): DeskVitalsFields {
  return {
    bpSystolic: row.bp_systolic != null ? String(row.bp_systolic) : "",
    bpDiastolic: row.bp_diastolic != null ? String(row.bp_diastolic) : "",
    heartRate: row.heart_rate != null ? String(row.heart_rate) : "",
    temperatureC: row.temperature_c != null ? String(row.temperature_c) : "",
    spo2: row.spo2 != null ? String(row.spo2) : "",
    weightKg: row.weight_kg != null ? String(row.weight_kg) : "",
    heightCm: row.height_cm != null ? String(row.height_cm) : "",
    note: row.note?.trim() ?? "",
  };
}

export function parseDeskVitalsFields(
  fields: DeskVitalsFields
): { ok: true; payload: DeskVitalsPayload } | { ok: false; error: string } {
  const bpSystolic = parseOptionalNumber(fields.bpSystolic);
  const bpDiastolic = parseOptionalNumber(fields.bpDiastolic);
  const heartRate = parseOptionalNumber(fields.heartRate);
  const temperatureC = parseOptionalNumber(fields.temperatureC);
  const spo2 = parseOptionalNumber(fields.spo2);
  const weightKg = parseOptionalNumber(fields.weightKg);
  const heightCm = parseOptionalNumber(fields.heightCm);

  const parsed = {
    bpSystolic,
    bpDiastolic,
    heartRate,
    temperatureC,
    spo2,
    weightKg,
    heightCm,
  };
  if (Object.values(parsed).some((value) => Number.isNaN(value))) {
    return { ok: false, error: "Enter numbers only" };
  }

  const note = fields.note.trim().slice(0, DESK_VITALS_NOTE_MAX);
  const payload: DeskVitalsPayload = {};
  if (bpSystolic !== undefined) payload.bpSystolic = bpSystolic;
  if (bpDiastolic !== undefined) payload.bpDiastolic = bpDiastolic;
  if (heartRate !== undefined) payload.heartRate = heartRate;
  if (temperatureC !== undefined) payload.temperatureC = temperatureC;
  if (spo2 !== undefined) payload.spo2 = spo2;
  if (weightKg !== undefined) payload.weightKg = weightKg;
  if (heightCm !== undefined) payload.heightCm = heightCm;

  if (Object.keys(payload).length === 0 && !note) {
    return { ok: false, error: "Enter at least one vital" };
  }
  payload.note = note || null;
  if ((payload.bpSystolic == null) !== (payload.bpDiastolic == null)) {
    return { ok: false, error: "Blood pressure needs both numbers" };
  }

  return { ok: true, payload };
}
