"use client";

/**
 * Expand-to-edit named basket for a panel or viewable imaging order (INV-D6/D11).
 * Title is editable; members can be catalog/custom entries (tests or views).
 * Soft rename nudge when the basket leaves the catalog template but still uses
 * the template name.
 */
import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import {
  ChartCatalogCombobox,
  type ChartCatalogOption,
} from "@/components/ehr/chart/ChartCatalogCombobox";
import {
  isBasketCustomized,
  isBasketMembershipCustomized,
} from "@/lib/cockpit/investigation-order-catalog";
import type {
  InvestigationImagingContrast,
  InvestigationImagingUrgency,
  InvestigationOrder,
  InvestigationOrderKind,
  InvestigationOrderMember,
} from "@/types/prescription";
import { cn } from "@/lib/utils";

export interface InvestigationPanelChecklistProps {
  order: InvestigationOrder;
  /** Catalog template display name (panel / imaging study). */
  catalogName?: string | null;
  /** Seed checklist rows (analytes or views). */
  templateMembers?: readonly { id: string; label: string }[];
  /** Kind written when toggling a template row on. */
  templateMemberKind?: InvestigationOrderKind;
  /** UI noun for microcopy ("test" | "view" | "related"). */
  memberNoun?: "test" | "view" | "related";
  /** Show CT/MRI requisition fields (contrast / site / indication / urgency). */
  showRequisition?: boolean;
  disabled?: boolean;
  onChange: (next: InvestigationOrder) => void;
  onClose: () => void;
  memberCatalogOptions?: readonly ChartCatalogOption[];
  filterMemberCatalog?: (
    options: readonly ChartCatalogOption[],
    query: string,
  ) => ChartCatalogOption[];
  resolveMemberCatalog?: (query: string) => string | undefined;
  onAddMember?: (
    payload:
      | { kind: "catalog"; value: string; label: string }
      | { kind: "custom"; text: string },
  ) => void;
  /** Custom baskets: pin into doctor_settings.investigations_custom_orders. */
  showSaveToMyOrders?: boolean;
  saveToMyOrdersSaved?: boolean;
  saveToMyOrdersBusy?: boolean;
  onSaveToMyOrders?: () => void;
}

export function InvestigationPanelChecklist({
  order,
  catalogName = null,
  templateMembers = [],
  templateMemberKind = "analyte",
  memberNoun = "test",
  showRequisition = false,
  disabled = false,
  onChange,
  onClose,
  memberCatalogOptions = [],
  filterMemberCatalog,
  resolveMemberCatalog,
  onAddMember,
  showSaveToMyOrders = false,
  saveToMyOrdersSaved = false,
  saveToMyOrdersBusy = false,
  onSaveToMyOrders,
}: InvestigationPanelChecklistProps): JSX.Element {
  const titleId = useId();
  const memberInputId = useId();
  const indicationId = useId();
  const siteId = useId();
  const members = order.members ?? [];
  const templateIdSet = new Set(templateMembers.map((m) => m.id));
  const selectedIds = new Set(members.map((m) => m.id));
  const extras = members.filter((m) => !templateIdSet.has(m.id));
  const packageLabel =
    memberNoun === "view"
      ? "study"
      : memberNoun === "related"
        ? "study"
        : "package";
  const memberLabel =
    memberNoun === "view"
      ? "view"
      : memberNoun === "related"
        ? "related scan"
        : "test";

  const [titleDraft, setTitleDraft] = useState(order.label);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [indicationDraft, setIndicationDraft] = useState(
    order.requisition?.indication ?? "",
  );
  const [siteDraft, setSiteDraft] = useState(order.requisition?.site ?? "");

  useEffect(() => {
    setTitleDraft(order.label);
  }, [order.id, order.label]);

  useEffect(() => {
    setNudgeDismissed(false);
  }, [order.id]);

  useEffect(() => {
    setIndicationDraft(order.requisition?.indication ?? "");
    setSiteDraft(order.requisition?.site ?? "");
  }, [order.id, order.requisition?.indication, order.requisition?.site]);

  const membershipCustomized = isBasketMembershipCustomized(order);
  const customized = isBasketCustomized(order);
  const showRenameNudge =
    membershipCustomized &&
    !nudgeDismissed &&
    catalogName != null &&
    order.label.trim().toLowerCase() === catalogName.trim().toLowerCase();

  const commitTitle = (raw: string) => {
    const next = raw.trim();
    if (!next || next === order.label) {
      setTitleDraft(order.label);
      return;
    }
    onChange({ ...order, label: next });
  };

  const setMembers = (nextMembers: InvestigationOrderMember[]) => {
    onChange({ ...order, members: nextMembers });
  };

  const patchRequisition = (patch: {
    contrast?: InvestigationImagingContrast | null;
    urgency?: InvestigationImagingUrgency | null;
    site?: string | null;
    indication?: string | null;
  }) => {
    const prev = order.requisition ?? {
      contrast: null,
      site: null,
      indication: null,
      urgency: null,
    };
    onChange({
      ...order,
      requisition: {
        contrast: patch.contrast !== undefined ? patch.contrast : prev.contrast,
        urgency: patch.urgency !== undefined ? patch.urgency : prev.urgency,
        site: patch.site !== undefined ? patch.site : prev.site,
        indication:
          patch.indication !== undefined ? patch.indication : prev.indication,
      },
    });
  };

  const toggleTemplateMember = (member: { id: string; label: string }) => {
    if (selectedIds.has(member.id)) {
      setMembers(members.filter((m) => m.id !== member.id));
      return;
    }
    setMembers([
      ...members,
      { id: member.id, label: member.label, kind: templateMemberKind },
    ]);
  };

  const removeExtra = (memberId: string) => {
    setMembers(members.filter((m) => m.id !== memberId));
  };

  const selectAllTemplate = () => {
    const keptExtras = extras;
    const templateAsMembers: InvestigationOrderMember[] = templateMembers.map(
      (m) => ({ id: m.id, label: m.label, kind: templateMemberKind }),
    );
    setMembers([...templateAsMembers, ...keptExtras]);
  };

  const clearMembers = () => setMembers([]);

  return (
    <div
      className="space-y-2.5 rounded-r-md border-l-2 border-primary/35 bg-muted/25 py-2.5 pl-3 pr-2"
      data-testid="investigation-panel-checklist"
      role="group"
      aria-label={`${order.label} ${packageLabel}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={titleId} className="sr-only">
            {memberNoun === "test" ? "Package name" : "Study name"}
          </label>
          <input
            id={titleId}
            data-testid="investigation-panel-title"
            type="text"
            disabled={disabled}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => commitTitle(titleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle(titleDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-7 w-full min-w-0 rounded-md border border-border/70 bg-background px-2 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/60">
              {members.length}
              {templateMembers.length > 0
                ? " selected"
                : members.length === 1
                  ? ` ${memberLabel}`
                  : ` ${memberLabel}s`}
            </span>
            {customized ? (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Custom {packageLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {templateMembers.length > 0 ? (
            <>
              <button
                type="button"
                disabled={disabled}
                className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={selectAllTemplate}
              >
                Select all
              </button>
              <button
                type="button"
                disabled={disabled || members.length === 0}
                className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={clearMembers}
              >
                Clear
              </button>
            </>
          ) : null}
          {showSaveToMyOrders ? (
            <button
              type="button"
              disabled={disabled || saveToMyOrdersBusy || saveToMyOrdersSaved}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
              data-testid="investigation-save-to-my-orders"
              onClick={() => onSaveToMyOrders?.()}
            >
              {saveToMyOrdersSaved
                ? "Saved to my orders"
                : saveToMyOrdersBusy
                  ? "Saving…"
                  : "Save to my orders"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
            data-testid="investigation-panel-close"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>

      {showRenameNudge ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200"
          data-testid="investigation-panel-rename-nudge"
        >
          <span className="min-w-0 flex-1">
            {memberNoun === "view"
              ? "Views changed — rename so the Rx stays clear?"
              : memberNoun === "related"
                ? "Regions changed — rename so the Rx stays clear?"
                : "Package changed — rename it so the Rx stays clear?"}
          </span>
          <button
            type="button"
            className="font-medium underline-offset-2 hover:underline"
            onClick={() => {
              const input = document.getElementById(titleId) as HTMLInputElement | null;
              input?.focus();
              input?.select();
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setNudgeDismissed(true)}
          >
            Keep name
          </button>
        </div>
      ) : null}

      {showRequisition ? (
        <div
          className="space-y-2 rounded-md border border-border/60 bg-background/60 p-2"
          data-testid="investigation-imaging-requisition"
        >
          <p className="text-[11px] font-medium text-muted-foreground">
            Requisition
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contrast">
            {(
              [
                ["plain", "Plain"],
                ["contrast", "Contrast"],
                ["both", "Both"],
              ] as const
            ).map(([value, label]) => {
              const active = order.requisition?.contrast === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  data-testid={`investigation-requisition-contrast-${value}`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                  onClick={() =>
                    patchRequisition({
                      contrast: active ? null : value,
                    })
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Urgency">
            {(
              [
                ["routine", "Routine"],
                ["urgent", "Urgent"],
              ] as const
            ).map(([value, label]) => {
              const active = order.requisition?.urgency === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  data-testid={`investigation-requisition-urgency-${value}`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                  onClick={() =>
                    patchRequisition({
                      urgency: active ? null : value,
                    })
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor={siteId}
                className="mb-0.5 block text-[10px] font-medium text-muted-foreground"
              >
                Site / laterality
              </label>
              <input
                id={siteId}
                data-testid="investigation-requisition-site"
                type="text"
                disabled={disabled}
                placeholder="e.g. left, bilateral"
                value={siteDraft}
                onChange={(e) => setSiteDraft(e.target.value)}
                onBlur={() =>
                  patchRequisition({ site: siteDraft.trim() || null })
                }
                className="h-7 w-full rounded-md border border-border/70 bg-background px-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor={indicationId}
                className="mb-0.5 block text-[10px] font-medium text-muted-foreground"
              >
                Clinical indication
              </label>
              <input
                id={indicationId}
                data-testid="investigation-requisition-indication"
                type="text"
                disabled={disabled}
                placeholder="e.g. r/o appendicitis"
                value={indicationDraft}
                onChange={(e) => setIndicationDraft(e.target.value)}
                onBlur={() =>
                  patchRequisition({
                    indication: indicationDraft.trim() || null,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    patchRequisition({
                      indication: indicationDraft.trim() || null,
                    });
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="h-7 w-full rounded-md border border-border/70 bg-background px-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      ) : null}

      {templateMembers.length > 0 || extras.length > 0 ? (
        <ul className="grid gap-0.5 sm:grid-cols-2">
          {templateMembers.map((member) => {
            const checked = selectedIds.has(member.id);
            return (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={checked}
                  aria-label={member.label}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                    "hover:bg-background/70 disabled:opacity-50",
                    checked ? "text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => toggleTemplateMember(member)}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                    aria-hidden
                  >
                    {checked ? <Check size={10} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 truncate">{member.label}</span>
                </button>
              </li>
            );
          })}
          {extras.map((member) => (
            <li key={`${member.kind}:${member.id}`}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed
                aria-label={`${member.label} (custom)`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                  "hover:bg-background/70 disabled:opacity-50 text-foreground",
                )}
                onClick={() => removeExtra(member.id)}
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-dashed border-primary bg-primary text-primary-foreground"
                  aria-hidden
                >
                  <Check size={10} strokeWidth={3} />
                </span>
                <span className="min-w-0 truncate">{member.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  custom
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {onAddMember && filterMemberCatalog && resolveMemberCatalog ? (
        <div className="pt-1">
          <ChartCatalogCombobox
            inputId={memberInputId}
            testId="investigation-panel-member-combobox"
            ariaLabel={`Add ${memberNoun} to ${order.label}`}
            placeholder={
              memberNoun === "view"
                ? "Add any view to this study…"
                : memberNoun === "related"
                  ? "Add a related scan…"
                  : "Add any test to this package…"
            }
            disabled={disabled}
            catalogOptions={[...memberCatalogOptions]}
            filterCatalog={filterMemberCatalog}
            resolveCatalog={resolveMemberCatalog}
            customLabel={(text) => `Add "${text}" to ${packageLabel}`}
            onCommit={onAddMember}
          />
        </div>
      ) : null}
    </div>
  );
}
