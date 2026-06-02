"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  bulkResolveOpdSessionOverrun,
  type OverrunAction,
  type OverrunRow,
  type PerRowResult,
} from "@/lib/api";
import {
  buildSessionOverrunOverridesPayload,
  type RowOverrideState,
} from "./sessionOverrunResolvePayload";

export interface SessionOverrunBulkResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  date: string;
  rows: OverrunRow[];
  onResolved: () => void;
}

export function SessionOverrunBulkResolveDialog({
  open,
  onOpenChange,
  token,
  date,
  rows,
  onResolved,
}: SessionOverrunBulkResolveDialogProps) {
  const [bulkAction, setBulkAction] = useState<OverrunAction>("reschedule_all");
  const [perRowOverrides, setPerRowOverrides] = useState<
    Record<string, RowOverrideState>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialResults, setPartialResults] = useState<PerRowResult[] | null>(
    null
  );

  const effectiveAction = useCallback(
    (rowId: string): OverrunAction =>
      perRowOverrides[rowId]?.action ?? bulkAction,
    [perRowOverrides, bulkAction]
  );

  const handleRowActionChange = (rowId: string, action: OverrunAction) => {
    setPerRowOverrides((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        action,
        rescheduleTo: prev[rowId]?.rescheduleTo ?? "",
      },
    }));
  };

  const handleRowRescheduleToChange = (rowId: string, value: string) => {
    setPerRowOverrides((prev) => ({
      ...prev,
      [rowId]: {
        action: prev[rowId]?.action ?? bulkAction,
        rescheduleTo: value,
      },
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setPartialResults(null);
    try {
        const overridesPayload = buildSessionOverrunOverridesPayload(
          rows,
          bulkAction,
          perRowOverrides,
          effectiveAction
        );

      const { data } = await bulkResolveOpdSessionOverrun(token, {
        date,
        action: bulkAction,
        perRowOverrides:
          overridesPayload.length > 0 ? overridesPayload : undefined,
      });

      const failed = data.results.filter((r) => r.status !== "success");
      if (failed.length > 0 && data.resolved > 0) {
        setPartialResults(data.results);
        onResolved();
        return;
      }

      if (failed.length > 0 && data.resolved === 0) {
        setError(`No rows could be resolved. ${failed[0]?.message ?? ""}`);
        return;
      }

      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Resolve {rows.length} overrun patient
            {rows.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Choose a bulk action below. You can override the action per row in
            the grid if needed.
          </DialogDescription>
        </DialogHeader>

        <section className="mb-4">
          <Label className="text-sm font-semibold">Bulk action</Label>
          <RadioGroup
            value={bulkAction}
            onValueChange={(v) => setBulkAction(v as OverrunAction)}
            className="mt-2 space-y-1.5"
          >
            <RadioRow
              id="reschedule_all"
              label="Reschedule all to next available"
              description="Same doctor, same modality, same service. Patients are notified."
            />
            <RadioRow
              id="reschedule_per_patient"
              label="Reschedule per patient"
              description="Choose a specific time per row in the grid below."
            />
            <RadioRow
              id="mark_completed"
              label="Mark as completed (saw briefly)"
              description="Status = completed. No reschedule, no refund."
            />
            <RadioRow
              id="cancel_refund"
              label="Cancel with refund"
              description="Patients are refunded and notified."
            />
            <RadioRow
              id="mark_no_show"
              label="Mark as no-show"
              description="Status = no_show. No refund, no reschedule."
            />
          </RadioGroup>
        </section>

        <section className="mb-4 max-h-[400px] overflow-x-auto overflow-y-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Patient</th>
                <th className="px-2 py-1.5 text-left font-semibold">Service</th>
                <th className="px-2 py-1.5 text-left font-semibold">Action</th>
                <th className="px-2 py-1.5 text-left font-semibold">
                  Reschedule to (if applicable)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const action = effectiveAction(row.id);
                const failure = partialResults?.find(
                  (r) =>
                    r.appointmentId === row.id && r.status !== "success"
                );
                return (
                  <tr
                    key={row.id}
                    className={failure ? "bg-destructive/10" : undefined}
                  >
                    <td className="px-2 py-1.5">
                      {row.patients.first_name} {row.patients.last_name}
                    </td>
                    <td className="px-2 py-1.5">{row.services.name}</td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={action}
                        onValueChange={(a) =>
                          handleRowActionChange(row.id, a as OverrunAction)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reschedule_all">
                            Reschedule
                          </SelectItem>
                          <SelectItem value="reschedule_per_patient">
                            Reschedule to…
                          </SelectItem>
                          <SelectItem value="mark_completed">
                            Completed
                          </SelectItem>
                          <SelectItem value="cancel_refund">
                            Cancel + refund
                          </SelectItem>
                          <SelectItem value="mark_no_show">No-show</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      {action === "reschedule_per_patient" ? (
                        <Input
                          type="datetime-local"
                          value={perRowOverrides[row.id]?.rescheduleTo ?? ""}
                          onChange={(e) =>
                            handleRowRescheduleToChange(row.id, e.target.value)
                          }
                          className="h-7 w-48 text-xs"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {failure && (
                        <p className="mt-0.5 text-xs text-destructive">
                          {failure.message ?? failure.status}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {partialResults && (
          <Alert className="mb-3">
            <AlertDescription>
              {
                partialResults.filter((r) => r.status === "success").length
              }{" "}
              of {partialResults.length} resolved. The rows highlighted in red
              couldn&apos;t be resolved — review and retry.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting
              ? "Resolving…"
              : `Resolve ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadioRow({
  id,
  label,
  description,
}: {
  id: OverrunAction;
  label: string;
  description: string;
}) {
  const descId = `${id}-desc`;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border p-2">
      <RadioGroupItem
        value={id}
        id={id}
        className="mt-1"
        aria-describedby={descId}
      />
      <Label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="font-medium">{label}</span>
        <span id={descId} className="block text-xs text-muted-foreground">
          {description}
        </span>
      </Label>
    </div>
  );
}
