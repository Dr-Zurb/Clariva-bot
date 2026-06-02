"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  trackCockpitV2RRxPolishSideSheetFilterChanged,
  trackCockpitV2RRxPolishSideSheetOpened,
} from "@/lib/patient-profile/telemetry";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePriorRxList } from "@/hooks/usePriorRxList";
import { canEnableChip, type PriorRxChip } from "@/lib/cockpit/prior-rx-filter";
import { listPatientConditions } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import {
  applyMode,
  diffMedicines,
  medicineToRowValue,
  type MedicineDiffRow,
} from "@/lib/cockpit/rx-diff";
import type {
  PrescriptionMedicine,
  PrescriptionWithRelations,
} from "@/types/prescription";

const CHIP_OPTIONS: PriorRxChip[] = [
  "all",
  "last-30-days",
  "same-diagnosis",
  "active-condition",
];

const ROW_HEIGHT_PX = 112;
const VIRTUAL_THRESHOLD = 20;

export interface PreviousRxApplyConfirmPayload {
  priorRx: PrescriptionWithRelations;
  final: MedicineRowValue[];
  mode: "append" | "replace";
}

export interface PreviousRxSideSheetProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  currentDx: string;
  activeConditions: string[];
  currentMedicines: MedicineRowValue[];
  onConfirmApply: (payload: PreviousRxApplyConfirmPayload) => void;
}

function chipLabel(chip: PriorRxChip): string {
  switch (chip) {
    case "all":
      return "All";
    case "last-30-days":
      return "Last 30 days";
    case "same-diagnosis":
      return "Same diagnosis";
    case "active-condition":
      return "Active condition";
  }
}

function chipClass(selected: boolean, enabled: boolean): string {
  return cn(
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    !enabled && "cursor-not-allowed opacity-50",
    enabled && selected && "border-primary bg-primary/10 text-primary",
    enabled &&
      !selected &&
      "border-border bg-background text-muted-foreground hover:bg-muted",
  );
}

function medicinesSummary(medicines: PrescriptionMedicine[] | undefined): string {
  if (!medicines || medicines.length === 0) return "No medicines listed";
  const first2 = medicines
    .slice(0, 2)
    .map((m) => m.medicine_name)
    .join(", ");
  const extra = medicines.length - 2;
  return extra > 0 ? `${first2} +${extra} more` : first2;
}

function PriorRxRow({
  rx,
  onApply,
}: {
  rx: PrescriptionWithRelations;
  onApply: (priorRx: PrescriptionWithRelations) => void;
}) {
  const isSent = Boolean(rx.sent_to_patient_at);
  const dx = rx.provisional_diagnosis?.trim() || "—";

  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{formatDate(rx.created_at)}</span>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                isSent
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning",
              )}
            >
              {isSent ? "Sent" : "Draft"}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{dx}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {medicinesSummary(rx.prescription_medicines)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onApply(rx)}
          aria-label={`Apply prescription from ${formatDate(rx.created_at)}`}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

function PriorRxList({
  rxes,
  onApply,
  useVirtual,
}: {
  rxes: PrescriptionWithRelations[];
  onApply: (priorRx: PrescriptionWithRelations) => void;
  useVirtual: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(0);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setListHeight(node.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!useVirtual) {
    return (
      <ul className="divide-y">
        {rxes.map((rx) => (
          <li key={rx.id}>
            <PriorRxRow rx={rx} onApply={onApply} />
          </li>
        ))}
      </ul>
    );
  }

  const Row = ({ index, style }: ListChildComponentProps) => (
    <div style={style as CSSProperties}>
      <PriorRxRow rx={rxes[index]!} onApply={onApply} />
    </div>
  );

  return (
    <div ref={containerRef} className="h-full min-h-0 flex-1" data-testid="prior-rx-virtual-container">
      <FixedSizeList
        height={Math.max(listHeight, 320)}
        width="100%"
        itemCount={rxes.length}
        itemSize={ROW_HEIGHT_PX}
        data-testid="prior-rx-virtual-list"
      >
        {Row}
      </FixedSizeList>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3 px-4 py-3" data-testid="prior-rx-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      {hasAny ? "No matches" : "No prior prescriptions"}
    </div>
  );
}

function diffRowLabel(row: MedicineDiffRow): string {
  const m = row.value;
  const parts = [m.medicineName, m.dosage].filter(Boolean);
  return parts.join(" · ") || "—";
}

function ApplyPreview({
  priorRx,
  current,
  onCancel,
  onConfirm,
}: {
  priorRx: PrescriptionWithRelations;
  current: MedicineRowValue[];
  onCancel: () => void;
  onConfirm: (final: MedicineRowValue[], mode: "append" | "replace") => void;
}) {
  const [mode, setMode] = useState<"append" | "replace">("append");
  const priorMeds = (priorRx.prescription_medicines ?? []).map(medicineToRowValue);
  const final = applyMode(current, priorMeds, mode);
  const rows = diffMedicines(current, final);

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-background"
      data-testid="prior-rx-apply-preview"
      role="dialog"
      aria-label="Apply previous prescription preview"
    >
      <div className="border-b p-4">
        <h3 className="text-base font-semibold">Apply prescription</h3>
        <p className="text-sm text-muted-foreground">
          {formatDate(priorRx.created_at)} · {rows.length} row(s) in preview
        </p>
      </div>

      <div className="flex gap-2 border-b px-4 py-2">
        {(["append", "replace"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={chipClass(mode === m, true)}
            aria-pressed={mode === m}
          >
            {m === "append" ? "Append" : "Replace"}
          </button>
        ))}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {rows.map((row, i) => (
          <li
            key={`${row.status}-${row.value.medicineName}-${row.value.dosage}-${i}`}
            className={cn(
              "border-b py-2 text-sm last:border-b-0",
              row.status === "added" && "text-success",
              row.status === "removed" && "text-destructive line-through",
              row.status === "unchanged" && "text-muted-foreground",
            )}
          >
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide">
              {row.status}
            </span>
            {diffRowLabel(row)}
          </li>
        ))}
      </ul>

      <div className="flex gap-2 border-t p-4">
        <Button type="button" onClick={() => onConfirm(final, mode)}>
          Confirm Apply
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="px-4 py-6 text-center" role="alert">
      <p className="text-sm text-destructive">Couldn&apos;t load prior Rxes</p>
      <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export default function PreviousRxSideSheet({
  patientId,
  token,
  currentDx,
  activeConditions,
  currentMedicines,
  onConfirmApply,
}: PreviousRxSideSheetProps) {
  const [chip, setChip] = useState<PriorRxChip>("all");
  const [search, setSearch] = useState("");
  const [applyTarget, setApplyTarget] = useState<PrescriptionWithRelations | null>(null);

  const { filtered, all, isLoading, error, reload } = usePriorRxList({
    patientId,
    token,
    chip,
    search,
    currentDx,
    activeConditions,
  });

  const skipFilterTelemetryRef = useRef(true);
  const openedTrackedRef = useRef(false);

  useEffect(() => {
    if (isLoading || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackCockpitV2RRxPolishSideSheetOpened({ priorRxCount: all.length });
  }, [isLoading, all.length]);

  useEffect(() => {
    if (skipFilterTelemetryRef.current) {
      skipFilterTelemetryRef.current = false;
      return;
    }
    trackCockpitV2RRxPolishSideSheetFilterChanged({
      chip,
      hasSearch: search.trim().length > 0,
    });
  }, [chip, search]);

  const chipContext = { currentDx, activeConditions };

  const handleApplyClick = (priorRx: PrescriptionWithRelations) => {
    setApplyTarget(priorRx);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {applyTarget ? (
        <ApplyPreview
          priorRx={applyTarget}
          current={currentMedicines}
          onCancel={() => setApplyTarget(null)}
          onConfirm={(final, mode) => {
            onConfirmApply({ priorRx: applyTarget, final, mode });
            setApplyTarget(null);
          }}
        />
      ) : null}

      <header className="border-b p-4">
        <h2 className="text-lg font-semibold">Previous prescriptions</h2>
        <p className="text-sm text-muted-foreground">
          {all.length} total · {filtered.length} shown
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b px-4 py-2">
        {CHIP_OPTIONS.map((c) => {
          const enabled = canEnableChip(c, chipContext);
          return (
            <button
              key={c}
              type="button"
              disabled={!enabled}
              onClick={() => setChip(c)}
              className={chipClass(c === chip, enabled)}
              aria-pressed={c === chip}
            >
              {chipLabel(c)}
            </button>
          );
        })}
      </div>

      <div className="border-b px-4 py-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by medicine name…"
          aria-label="Search by medicine name"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading && <SkeletonList />}
        {error && !isLoading && <ErrorState error={error} onRetry={reload} />}
        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState hasAny={all.length > 0} />
        )}
        {!isLoading && !error && filtered.length > 0 && (
          <PriorRxList
            rxes={filtered}
            onApply={handleApplyClick}
            useVirtual={filtered.length > VIRTUAL_THRESHOLD}
          />
        )}
      </div>
    </div>
  );
}

export interface PreviousRxSideSheetAnchorProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  onConfirmApply: (payload: PreviousRxApplyConfirmPayload) => void;
}

/**
 * Registers the previous-Rx side sheet with the shell anchor registry (rxss-02).
 * Mount once inside the cockpit Rx zone (e.g. `<RxWorkspace>`).
 */
export function PreviousRxSideSheetAnchor({
  appointmentId,
  patientId,
  token,
  onConfirmApply,
}: PreviousRxSideSheetAnchorProps) {
  const sideSheet = useSideSheet();
  const rxForm = useOptionalRxForm();
  const currentDx = rxForm?.state.fields.provisionalDiagnosis ?? "";
  const currentMedicines = rxForm?.state.fields.medicines ?? [];
  const [activeConditions, setActiveConditions] = useState<string[]>([]);

  useEffect(() => {
    if (!patientId) {
      setActiveConditions([]);
      return;
    }
    let cancelled = false;
    void listPatientConditions(token, patientId)
      .then((res) => {
        if (cancelled) return;
        const names = (res.data.conditions ?? [])
          .filter((row) => !row.archived_at)
          .map((row) => row.condition)
          .filter(Boolean);
        setActiveConditions(names);
      })
      .catch(() => {
        if (!cancelled) setActiveConditions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  useEffect(() => {
    if (!patientId) return undefined;
    const unregister = sideSheet.register({
      id: "previous-rx",
      title: "Previous Rx",
      widthPct: 35,
      render: () => (
        <PreviousRxSideSheet
          appointmentId={appointmentId}
          patientId={patientId}
          token={token}
          currentDx={currentDx}
          activeConditions={activeConditions}
          currentMedicines={currentMedicines}
          onConfirmApply={onConfirmApply}
        />
      ),
    });
    return unregister;
  }, [
    appointmentId,
    patientId,
    token,
    currentDx,
    activeConditions,
    currentMedicines,
    onConfirmApply,
    sideSheet,
  ]);

  return null;
}
