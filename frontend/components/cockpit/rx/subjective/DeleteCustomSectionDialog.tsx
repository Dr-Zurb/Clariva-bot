"use client";

import { useEffect, useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { LinkedCustomSectionTemplateCounts } from "@/lib/cockpit/custom-section-linked-templates";

export interface DeleteCustomSectionDialogProps {
  open: boolean;
  sectionTitle: string;
  counts: LinkedCustomSectionTemplateCounts | null;
  loading?: boolean;
  busy?: boolean;
  onCancel: () => void;
  /**
   * Confirmed delete. When `archiveCustomBlockTemplateIds` is non-empty the caller
   * archives those `custom_block` templates before removing the section.
   */
  onConfirm: (options: { archiveCustomBlockTemplateIds: string[] }) => void | Promise<void>;
}

function sectionDisplayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled section";
}

export function DeleteCustomSectionDialog({
  open,
  sectionTitle,
  counts,
  loading = false,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteCustomSectionDialogProps) {
  const checkboxId = useId();
  const [archiveLinked, setArchiveLinked] = useState(false);

  useEffect(() => {
    if (!open) setArchiveLinked(false);
  }, [open]);

  const displayTitle = sectionDisplayTitle(sectionTitle);
  const customBlockCount = counts?.customBlockCount ?? 0;
  const subjectiveFullCount = counts?.subjectiveFullCount ?? 0;
  const archiveIds =
    archiveLinked && counts
      ? counts.customBlockTemplates.map((template) => template.id)
      : [];

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent data-testid="delete-custom-section-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove &quot;{displayTitle}&quot;?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>This will permanently remove this section from the current visit.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>All notes and sub-sections entered for this visit will be discarded.</li>
                <li>
                  The section will be removed from your default Subjective layout for future
                  visits.
                </li>
                {loading ? (
                  <li>Checking linked templates…</li>
                ) : (
                  <>
                    <li>
                      {customBlockCount === 0
                        ? "No linked Templates exist for this section."
                        : `${customBlockCount} linked Template${customBlockCount === 1 ? "" : "s"} exist for this section.`}
                    </li>
                    <li>
                      {subjectiveFullCount === 0
                        ? "This section does not appear in any whole-subjective templates."
                        : `This section appears in ${subjectiveFullCount} whole-subjective template${subjectiveFullCount === 1 ? "" : "s"} (those snapshots will be kept untouched).`}
                    </li>
                  </>
                )}
              </ul>
              {!loading && customBlockCount > 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3">
                  <Checkbox
                    id={checkboxId}
                    checked={archiveLinked}
                    disabled={busy}
                    onCheckedChange={(checked) => setArchiveLinked(checked === true)}
                    data-testid="delete-custom-section-archive-checkbox"
                  />
                  <label htmlFor={checkboxId} className="text-sm leading-snug text-foreground">
                    Also archive the {customBlockCount} linked Template
                    {customBlockCount === 1 ? "" : "s"} for this section
                  </label>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="delete-custom-section-confirm"
            onClick={(e) => {
              e.preventDefault();
              void onConfirm({ archiveCustomBlockTemplateIds: archiveIds });
            }}
          >
            {busy ? "Removing…" : "Remove section"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
