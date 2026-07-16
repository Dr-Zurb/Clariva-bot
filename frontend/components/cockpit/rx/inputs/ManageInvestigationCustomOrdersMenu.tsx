"use client";

/**
 * Manage doctor-saved custom investigation orders (rename / delete).
 * Vocabulary lives in doctor_settings.investigations_custom_orders — config,
 * not PHI. Distinct from full-list rx templates.
 */
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DoctorInvestigationCustomOrder } from "@/lib/cockpit/investigations-custom-orders";
import { INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX } from "@/lib/cockpit/investigations-custom-orders";
import { cn } from "@/lib/utils";

export interface ManageInvestigationCustomOrdersMenuProps {
  orders: readonly DoctorInvestigationCustomOrder[];
  disabled?: boolean;
  onRename: (orderId: string, nextLabel: string) => void;
  onDelete: (orderId: string) => void;
}

export function ManageInvestigationCustomOrdersMenu({
  orders,
  disabled = false,
  onRename,
  onDelete,
}: ManageInvestigationCustomOrdersMenuProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraftLabel("");
    }
  }, [open]);

  if (orders.length === 0) return null;

  const startEdit = (order: DoctorInvestigationCustomOrder) => {
    setEditingId(order.id);
    setDraftLabel(order.label);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = draftLabel.trim();
    if (trimmed) onRename(editingId, trimmed);
    setEditingId(null);
    setDraftLabel("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          data-testid="investigations-manage-my-orders"
        >
          Manage
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="investigations-manage-my-orders-panel"
      >
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium text-foreground">My orders</p>
          <p className="text-[11px] text-muted-foreground">
            Rename or remove saved custom packages
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto p-1.5" role="list">
          {orders.map((order) => {
            const isEditing = editingId === order.id;
            const memberCount = order.members.length;
            return (
              <li
                key={order.id}
                className="rounded-md px-1.5 py-1.5 hover:bg-muted/50"
                data-testid={`investigations-manage-row-${order.id}`}
              >
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={draftLabel}
                      maxLength={INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX}
                      disabled={disabled}
                      aria-label={`Rename ${order.label}`}
                      data-testid={`investigations-manage-rename-input-${order.id}`}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingId(null);
                          setDraftLabel("");
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(null);
                          setDraftLabel("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !draftLabel.trim()}
                        className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40"
                        data-testid={`investigations-manage-rename-save-${order.id}`}
                        onClick={commitEdit}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {order.label}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {memberCount === 0
                          ? "No tests yet"
                          : `${memberCount} test${memberCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        "text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      )}
                      aria-label={`Rename ${order.label}`}
                      data-testid={`investigations-manage-rename-${order.id}`}
                      onClick={() => startEdit(order)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      )}
                      aria-label={`Delete ${order.label}`}
                      data-testid={`investigations-manage-delete-${order.id}`}
                      onClick={() => onDelete(order.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
