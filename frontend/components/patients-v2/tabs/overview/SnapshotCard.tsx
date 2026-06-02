import type { PatientOverviewSnapshot } from "@/types/patient";
import { OverviewCardFrame } from "./OverviewCardFrame";
import { displayValue } from "./overview-utils";

interface SnapshotCardProps {
  snapshot: PatientOverviewSnapshot | undefined;
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function SnapshotCard({ snapshot }: SnapshotCardProps) {
  const s = snapshot ?? {
    blood_group: null,
    height_cm: null,
    weight_kg: null,
    bmi: null,
    preferred_language: null,
  };

  return (
    <OverviewCardFrame title="Snapshot">
      <div className="space-y-2">
        <SnapshotRow label="Blood group" value={displayValue(s.blood_group)} />
        <SnapshotRow
          label="Height"
          value={s.height_cm != null ? `${s.height_cm} cm` : "—"}
        />
        <SnapshotRow
          label="Weight"
          value={s.weight_kg != null ? `${s.weight_kg} kg` : "—"}
        />
        <SnapshotRow
          label="BMI"
          value={s.bmi != null ? s.bmi.toFixed(1) : "—"}
        />
        <SnapshotRow label="Preferred language" value={displayValue(s.preferred_language)} />
      </div>
    </OverviewCardFrame>
  );
}
