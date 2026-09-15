"use client";

import { DeskDocumentsStrip } from "@/components/desk/DeskDocumentsStrip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeskLabUploadDialog({
  open,
  onOpenChange,
  token,
  appointmentId,
  patientName,
  visitDate,
  mrn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  appointmentId: string;
  patientName: string;
  visitDate: string;
  mrn?: string | null;
}) {
  const subtitle = [visitDate, mrn].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        data-testid="desk-lab-upload-dialog"
      >
        <DialogHeader>
          <DialogTitle>{patientName}</DialogTitle>
          <DialogDescription>
            {subtitle || "Upload reports for this visit."}
          </DialogDescription>
        </DialogHeader>
        {appointmentId ? (
          <DeskDocumentsStrip
            token={token}
            appointmentId={appointmentId}
            mode="internal_labs"
            open
            onFinished={() => onOpenChange(false)}
            finishLabel="Done"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
