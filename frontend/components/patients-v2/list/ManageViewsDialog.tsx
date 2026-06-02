"use client";

import { useCallback, useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PatientSavedView } from "@/types/patient";

export interface ManageViewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: PatientSavedView[];
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
}

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

interface ViewRowProps {
  view: PatientSavedView;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
}

function ViewRow({ view, onRename, onDelete, onSetDefault }: ViewRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(view.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState(false);

  const handleRenameCommit = useCallback(async () => {
    if (!renameValue.trim() || renameValue.trim() === view.name) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    try {
      await onRename(view.id, renameValue.trim());
      setRenaming(false);
    } finally {
      setRenameBusy(false);
    }
  }, [onRename, view.id, view.name, renameValue]);

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleRenameCommit();
    if (e.key === "Escape") {
      setRenameValue(view.name);
      setRenaming(false);
    }
  };

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteBusy(true);
    try {
      await onDelete(view.id);
    } finally {
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  }, [onDelete, view.id]);

  const handleSetDefault = useCallback(async () => {
    if (view.is_default) return;
    setDefaultBusy(true);
    try {
      await onSetDefault(view.id);
    } finally {
      setDefaultBusy(false);
    }
  }, [onSetDefault, view.id, view.is_default]);

  return (
    <div className="flex items-center gap-2 py-2">
      {renaming ? (
        <Input
          className="h-7 flex-1 text-sm"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={() => void handleRenameCommit()}
          autoFocus
          maxLength={60}
          disabled={renameBusy}
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            {view.is_default ? (
              <Star className="mr-1 inline h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
            ) : null}
            {view.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {relativeTime(view.created_at)}
          </span>
        </div>
      )}

      {!renaming && !confirmDelete && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => void handleSetDefault()}
            disabled={defaultBusy || view.is_default}
            aria-label={`Set ${view.name} as default`}
            title="Set as default"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                view.is_default ? "fill-primary text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => {
              setRenameValue(view.name);
              setRenaming(true);
            }}
            aria-label={`Rename view ${view.name}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete view ${view.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </>
      )}

      {confirmDelete && (
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-muted-foreground">Delete?</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteBusy}
          >
            {deleteBusy ? "…" : "Yes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setConfirmDelete(false)}
            disabled={deleteBusy}
          >
            No
          </Button>
        </div>
      )}
    </div>
  );
}

export function ManageViewsDialog({
  open,
  onOpenChange,
  views,
  onRename,
  onDelete,
  onSetDefault,
}: ManageViewsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage saved views</DialogTitle>
        </DialogHeader>

        <div
          className={cn(
            "divide-y divide-border",
            views.length === 0 && "py-4 text-center text-sm text-muted-foreground",
          )}
        >
          {views.length === 0
            ? "No saved views yet."
            : views.map((v) => (
                <ViewRow
                  key={v.id}
                  view={v}
                  onRename={onRename}
                  onDelete={onDelete}
                  onSetDefault={onSetDefault}
                />
              ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
