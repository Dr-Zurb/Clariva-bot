"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCommands } from "@/lib/patient-profile/command-registry";

export default function KeyboardHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const commands = useCommands();
  const withHint = commands.filter((c) => c.shortcutHint);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        {withHint.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shortcuts registered for this page yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {withHint.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4">
                <span>{c.label}</span>
                <kbd className="shrink-0 rounded border px-2 py-0.5 text-xs">
                  {c.shortcutHint}
                </kbd>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
