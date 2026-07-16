"use client";

import { Check, ChevronsDown, ChevronsUp, CircleAlert, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

/** Match section template icon buttons (BookmarkPlus / LayoutTemplate). */
export const SOAP_TAB_CHROME_ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

export function SoapTabLayoutSaveStatus({
  saved,
  error,
}: {
  saved: boolean;
  error: boolean;
}): JSX.Element | null {
  if (error) {
    return (
      <IconTooltipGroup>
        <IconTooltip label="Could not save layout">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-destructive"
            role="status"
            aria-label="Could not save layout"
          >
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          </span>
        </IconTooltip>
      </IconTooltipGroup>
    );
  }
  if (saved) {
    return (
      <IconTooltipGroup>
        <IconTooltip label="Layout saved">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground"
            role="status"
            aria-label="Layout saved"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
        </IconTooltip>
      </IconTooltipGroup>
    );
  }
  return null;
}

export function SoapTabExpandCollapseClearButtons({
  expandTestId,
  collapseTestId,
  clearTestId,
  onExpandAll,
  onCollapseAll,
  onClearAll,
  clearDisabled = false,
}: {
  expandTestId: string;
  collapseTestId: string;
  clearTestId: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onClearAll: () => void;
  clearDisabled?: boolean;
}): JSX.Element {
  return (
    <IconTooltipGroup>
      <span className="inline-flex items-center gap-0.5">
        <IconTooltip label="Expand all">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(SOAP_TAB_CHROME_ICON_BTN_CLASS)}
            data-testid={expandTestId}
            aria-label="Expand all"
            onClick={onExpandAll}
          >
            <ChevronsDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </IconTooltip>
        <IconTooltip label="Collapse all">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(SOAP_TAB_CHROME_ICON_BTN_CLASS)}
            data-testid={collapseTestId}
            aria-label="Collapse all"
            onClick={onCollapseAll}
          >
            <ChevronsUp className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </IconTooltip>
        <IconTooltip label="Clear all">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={clearDisabled}
            className={cn(SOAP_TAB_CHROME_ICON_BTN_CLASS)}
            data-testid={clearTestId}
            aria-label="Clear all"
            onClick={onClearAll}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </IconTooltip>
      </span>
    </IconTooltipGroup>
  );
}
