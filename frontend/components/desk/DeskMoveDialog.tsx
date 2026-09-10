"use client";

import { useState } from "react";

import { DeskMovePanel } from "@/components/desk/DeskMovePanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function DeskMoveDialog({
  token,
  doctorId,
  timezone,
  today,
  appointmentId,
  triggerClassName,
  onMoved,
}: {
  token: string;
  doctorId: string;
  timezone: string;
  today: string;
  appointmentId: string;
  triggerClassName?: string;
  onMoved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-muted-foreground", triggerClassName)}
        >
          Move
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this visit</DialogTitle>
          <DialogDescription>
            Pick another time or another day’s list.
          </DialogDescription>
        </DialogHeader>
        <DeskMovePanel
          token={token}
          doctorId={doctorId}
          timezone={timezone}
          today={today}
          appointmentId={appointmentId}
          onMoved={async () => {
            await onMoved();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
