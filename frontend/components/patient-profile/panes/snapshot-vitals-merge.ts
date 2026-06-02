import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { PatientVitalsReading } from "@/types/patient-chart";

export interface SnapshotVitalsDisplay {
  heightCm: string | null;
  weightKg: string | null;
  bp: string | null;
  hr: string | null;
  tempC: string | null;
  spo2: string | null;
}

export interface SnapshotVitalsDraftFlags {
  heightCm: boolean;
  weightKg: boolean;
  bp: boolean;
  hr: boolean;
  tempC: boolean;
  spo2: boolean;
}

export function isDraftValue<T>(
  draft: T | null | undefined,
  persisted: T | null | undefined,
): boolean {
  return draft != null && draft !== persisted;
}

function formatNum(value: number, decimals = 0): string {
  return decimals > 0 ? value.toFixed(decimals) : String(value);
}

function pickDraftOrPersisted(
  draft: number | null | undefined,
  persisted: number | null | undefined,
): number | null {
  if (draft != null) return draft;
  if (persisted != null) return persisted;
  return null;
}

export function mergeSnapshotVitals(
  persisted: PatientVitalsReading | null,
  draft: RxFormFields | null | undefined,
): {
  displayed: SnapshotVitalsDisplay;
  isDraft: SnapshotVitalsDraftFlags;
  hasAnyData: boolean;
} {
  const heightCm = pickDraftOrPersisted(
    draft?.vitalsHtCm,
    persisted?.height_cm,
  );
  const weightKg = pickDraftOrPersisted(
    draft?.vitalsWtKg,
    persisted?.weight_kg != null ? Number(persisted.weight_kg) : null,
  );
  const hr = pickDraftOrPersisted(draft?.vitalsHr, persisted?.heart_rate);
  const tempC = pickDraftOrPersisted(
    draft?.vitalsTempC,
    persisted?.temperature_c != null ? Number(persisted.temperature_c) : null,
  );
  const spo2 = pickDraftOrPersisted(draft?.vitalsSpo2, persisted?.spo2);

  const draftBpReady =
    draft?.vitalsBpSystolic != null && draft?.vitalsBpDiastolic != null;
  const persistedBpReady =
    persisted?.bp_systolic != null && persisted?.bp_diastolic != null;

  const bp = draftBpReady
    ? `${draft!.vitalsBpSystolic}/${draft!.vitalsBpDiastolic}`
    : persistedBpReady
      ? `${persisted!.bp_systolic}/${persisted!.bp_diastolic}`
      : null;

  const displayed: SnapshotVitalsDisplay = {
    heightCm: heightCm != null ? formatNum(heightCm, 1) : null,
    weightKg: weightKg != null ? formatNum(weightKg, 1) : null,
    bp: bp != null ? `${bp} mmHg` : null,
    hr: hr != null ? `${hr} bpm` : null,
    tempC: tempC != null ? `${formatNum(tempC, 1)}°C` : null,
    spo2: spo2 != null ? `${spo2}%` : null,
  };

  const isDraft: SnapshotVitalsDraftFlags = {
    heightCm: isDraftValue(draft?.vitalsHtCm, persisted?.height_cm),
    weightKg: isDraftValue(
      draft?.vitalsWtKg,
      persisted?.weight_kg != null ? Number(persisted.weight_kg) : null,
    ),
    bp:
      draftBpReady &&
      (!persistedBpReady ||
        draft!.vitalsBpSystolic !== persisted!.bp_systolic ||
        draft!.vitalsBpDiastolic !== persisted!.bp_diastolic),
    hr: isDraftValue(draft?.vitalsHr, persisted?.heart_rate),
    tempC: isDraftValue(
      draft?.vitalsTempC,
      persisted?.temperature_c != null ? Number(persisted.temperature_c) : null,
    ),
    spo2: isDraftValue(draft?.vitalsSpo2, persisted?.spo2),
  };

  const hasAnyData = Object.values(displayed).some((v) => v != null);

  return { displayed, isDraft, hasAnyData };
}
