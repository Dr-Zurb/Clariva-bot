"use client";

/**
 * Investigations orders — immediate panel baskets + expand-to-edit (INV-D9/D11).
 * Controlled via flat `value` / `onChange`; baskets encode as `Title: a, b, c`
 * when customized so PDF/SMS stay in the TEXT column (INV-D8).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  ChartCatalogCombobox,
  type ChartCatalogOption,
} from "@/components/ehr/chart/ChartCatalogCombobox";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { InvestigationPanelChecklist } from "@/components/cockpit/rx/inputs/InvestigationPanelChecklist";
import { ManageInvestigationCustomOrdersMenu } from "@/components/cockpit/rx/inputs/ManageInvestigationCustomOrdersMenu";
import {
  InvestigationSuggestPanel,
  type InvestigationSuggestStatus,
} from "@/components/cockpit/rx/inputs/InvestigationSuggestPanel";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  addMemberToBasket,
  createCustomBasket,
  createImagingBasket,
  createPanelBasket,
  doctorCustomOrdersToCatalogEntries,
  filterInvestigationOrderCatalog,
  findOrderCatalogEntryByLabel,
  findOrderCatalogEntryByValue,
  imagingViewOptions,
  INVESTIGATION_ORDER_CATALOG,
  INVESTIGATION_QUICK_PICK_ENTRIES,
  isBasketCustomized,
  mapResolvedTermsToCatalog,
  occupiedKeysFromOrders,
  panelMemberOptions,
  parseInvestigationOrdersFromFlat,
  resolveInvestigationOrderCatalog,
  serializeInvestigationOrdersToFlat,
  suggestInvestigationOrders,
  type InvestigationOrderCatalogEntry,
} from "@/lib/cockpit/investigation-order-catalog";
import {
  fetchInvestigationCustomOrders,
  isInvestigationCustomOrderSaved,
  pinInvestigationCustomOrder,
  recordInvestigationCustomOrderUse,
  removeInvestigationCustomOrder,
  renameInvestigationCustomOrder,
  saveInvestigationCustomOrders,
  visibleInvestigationCustomOrders,
  type DoctorInvestigationCustomOrder,
} from "@/lib/cockpit/investigations-custom-orders";
import {
  getImagingOrderById,
  getImagingViewById,
  getLabPanelById,
  imagingOrderHasViews,
  imagingOrderIsExpandable,
  imagingRelatedOptions,
  IMAGING_VIEWS,
  lookupImagingViewByAlias,
} from "@/lib/cockpit/lab-test-library";
import { resolveInvestigationWithAI } from "@/lib/api/investigation-parse";
import type { InvestigationOrder } from "@/types/prescription";
import { cn } from "@/lib/utils";

const MAX_ORDERS = 40;

function isExpandableOrder(order: InvestigationOrder): boolean {
  if (order.kind === "panel" || order.kind === "custom") return true;
  if (order.kind !== "imaging") return false;
  return imagingOrderIsExpandable(
    getImagingOrderById(order.sourcePanelId ?? order.id),
  );
}

export interface InvestigationsChipRowProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  showQuickPicks?: boolean;
  token?: string;
}

export function InvestigationsChipRow({
  value,
  onChange,
  disabled = false,
  hideLabel = false,
  showQuickPicks = true,
  token,
}: InvestigationsChipRowProps): JSX.Element {
  const inputId = useId();
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [suggestTyped, setSuggestTyped] = useState<string | null>(null);
  const [suggestRows, setSuggestRows] = useState<InvestigationOrderCatalogEntry[]>(
    [],
  );
  const [suggestStatus, setSuggestStatus] =
    useState<InvestigationSuggestStatus>("ready");
  const aiAbortRef = useRef<AbortController | null>(null);
  const [doctorCustoms, setDoctorCustoms] = useState<
    DoctorInvestigationCustomOrder[]
  >([]);
  const doctorCustomsRef = useRef(doctorCustoms);
  doctorCustomsRef.current = doctorCustoms;
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const persistInFlightRef = useRef<Promise<void> | null>(null);

  const orders = useMemo(
    () => parseInvestigationOrdersFromFlat(value),
    [value],
  );
  const occupiedKeys = useMemo(() => occupiedKeysFromOrders(orders), [orders]);

  const visibleCustoms = useMemo(
    () => visibleInvestigationCustomOrders(doctorCustoms),
    [doctorCustoms],
  );
  const doctorCatalogEntries = useMemo(
    () => doctorCustomOrdersToCatalogEntries(visibleCustoms),
    [visibleCustoms],
  );

  const editingOrder =
    orders.find((o) => o.id === editingOrderId && isExpandableOrder(o)) ?? null;
  const editingPanel =
    editingOrder?.kind === "panel"
      ? getLabPanelById(editingOrder.sourcePanelId ?? editingOrder.id)
      : null;
  const editingImaging =
    editingOrder?.kind === "imaging"
      ? getImagingOrderById(editingOrder.sourcePanelId ?? editingOrder.id)
      : null;
  const editingTemplateMembers =
    editingOrder?.kind === "panel" && editingPanel
      ? panelMemberOptions(editingPanel)
      : editingOrder?.kind === "imaging" && editingImaging
        ? imagingOrderHasViews(editingImaging)
          ? imagingViewOptions(editingImaging)
          : imagingRelatedOptions(editingImaging)
        : [];
  const editingCatalogName =
    editingPanel?.name ?? editingImaging?.name ?? null;
  const editingImagingMemberNoun =
    editingOrder?.kind === "imaging" && editingImaging
      ? imagingOrderHasViews(editingImaging)
        ? ("view" as const)
        : (editingImaging.relatedIds?.length ?? 0) > 0
          ? ("related" as const)
          : ("test" as const)
      : ("test" as const);
  const editingShowRequisition =
    editingOrder?.kind === "imaging" &&
    editingImaging?.requiresRequisition === true;

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!token) {
      setDoctorCustoms([]);
      return;
    }
    let cancelled = false;
    fetchInvestigationCustomOrders(token)
      .then((rows) => {
        if (!cancelled) setDoctorCustoms(rows);
      })
      .catch(() => {
        if (!cancelled) setDoctorCustoms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!saveNotice) return;
    const t = window.setTimeout(() => setSaveNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [saveNotice]);

  const persistCustoms = useCallback(
    async (next: DoctorInvestigationCustomOrder[]) => {
      setDoctorCustoms(next);
      doctorCustomsRef.current = next;
      if (!token) return;
      const run = async () => {
        try {
          const saved = await saveInvestigationCustomOrders(token, next);
          setDoctorCustoms(saved);
          doctorCustomsRef.current = saved;
        } catch {
          // Keep optimistic local state; next successful save reconciles.
        }
      };
      const pending = persistInFlightRef.current?.then(run, run) ?? run();
      persistInFlightRef.current = pending;
      await pending;
    },
    [token],
  );

  const trackCustomOrderUse = useCallback(
    (order: InvestigationOrder) => {
      if (order.kind !== "custom") return;
      const result = recordInvestigationCustomOrderUse(
        doctorCustomsRef.current,
        order,
      );
      void persistCustoms(result.orders);
      if (result.autoPromoted) {
        setSaveNotice(`Saved “${result.order.label}” to your orders`);
      }
    },
    [persistCustoms],
  );

  const handleSaveCustomOrder = useCallback(
    async (order: InvestigationOrder) => {
      if (order.kind !== "custom" || !token) return;
      setSavingOrderId(order.id);
      try {
        const next = pinInvestigationCustomOrder(
          doctorCustomsRef.current,
          order,
        );
        await persistCustoms(next);
        setSaveNotice(`Saved “${order.label}” to your orders`);
      } finally {
        setSavingOrderId(null);
      }
    },
    [persistCustoms, token],
  );

  const commitOrders = useCallback(
    (next: InvestigationOrder[]) => {
      onChange(serializeInvestigationOrdersToFlat(next.slice(0, MAX_ORDERS)));
    },
    [onChange],
  );

  const handleRenameCustomOrder = useCallback(
    (orderId: string, nextLabel: string) => {
      const trimmed = nextLabel.trim();
      const next = renameInvestigationCustomOrder(
        doctorCustomsRef.current,
        orderId,
        trimmed,
      );
      void persistCustoms(next);
      // Keep the visit row label in sync when that basket is already on the Rx.
      const idx = orders.findIndex(
        (o) => o.kind === "custom" && o.id === orderId,
      );
      if (idx >= 0 && trimmed) {
        const copy = [...orders];
        const current = copy[idx]!;
        copy[idx] = { ...current, label: trimmed };
        commitOrders(copy);
      }
      if (trimmed) setSaveNotice(`Renamed to “${trimmed}”`);
    },
    [commitOrders, orders, persistCustoms],
  );

  const handleDeleteCustomOrder = useCallback(
    (orderId: string) => {
      const removed = doctorCustomsRef.current.find((o) => o.id === orderId);
      const next = removeInvestigationCustomOrder(
        doctorCustomsRef.current,
        orderId,
      );
      void persistCustoms(next);
      if (removed) {
        setSaveNotice(`Removed “${removed.label}” from your orders`);
      }
    },
    [persistCustoms],
  );

  const clearSuggest = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setSuggestTyped(null);
    setSuggestRows([]);
    setSuggestStatus("ready");
  }, []);

  const upsertOrder = useCallback(
    (order: InvestigationOrder) => {
      const without = orders.filter(
        (o) => !(o.kind === order.kind && o.id === order.id),
      );
      // Drop singles covered by a new panel basket's template members.
      let next = without;
      if (order.kind === "panel") {
        const memberKeys = new Set(
          (order.members ?? []).map((m) => `${m.kind}:${m.id}`),
        );
        next = without.filter((o) => {
          if (o.kind === "panel") return true;
          return !memberKeys.has(`${o.kind}:${o.id}`);
        });
      }
      commitOrders([...next, order]);
      trackCustomOrderUse(order);
    },
    [commitOrders, orders, trackCustomOrderUse],
  );

  const removeOrderAt = useCallback(
    (index: number) => {
      if (disabled) return;
      const removed = orders[index];
      if (removed?.id === editingOrderId) setEditingOrderId(null);
      commitOrders(orders.filter((_, i) => i !== index));
    },
    [commitOrders, disabled, editingOrderId, orders],
  );

  const commitCatalogEntry = useCallback(
    (entry: InvestigationOrderCatalogEntry) => {
      clearSuggest();
      if (entry.kind === "panel") {
        const basket = createPanelBasket(entry.id);
        if (!basket) return;
        upsertOrder(basket);
        return;
      }
      if (entry.kind === "imaging") {
        const basket = createImagingBasket(entry.id);
        if (!basket) return;
        upsertOrder(basket);
        return;
      }
      if (entry.kind === "custom") {
        const saved = doctorCustomsRef.current.find(
          (c) => c.id === entry.value || c.id === `custom:${entry.id}`,
        );
        upsertOrder({
          id: entry.value,
          label: entry.label,
          kind: "custom",
          members: (saved?.members ?? []).map((m) => ({ ...m })),
        });
        return;
      }
      upsertOrder({ id: entry.id, label: entry.label, kind: entry.kind });
    },
    [clearSuggest, upsertOrder],
  );

  const keepSuggestAsTyped = useCallback(() => {
    const typed = suggestTyped;
    clearSuggest();
    if (!typed?.trim()) return;
    upsertOrder(createCustomBasket(typed));
  }, [clearSuggest, suggestTyped, upsertOrder]);

  const confirmSuggestDefault = useCallback(() => {
    if (suggestStatus === "ready" && suggestRows.length > 0) {
      commitCatalogEntry(suggestRows[0]!);
      return;
    }
    // Loading / error / empty → keep typed text as custom (Enter = safe default).
    keepSuggestAsTyped();
  }, [commitCatalogEntry, keepSuggestAsTyped, suggestRows, suggestStatus]);

  const dismissSuggest = useCallback(() => {
    clearSuggest();
  }, [clearSuggest]);

  const openOrAddFromCatalogValue = useCallback(
    (catalogValue: string) => {
      const entry = findOrderCatalogEntryByValue(
        catalogValue,
        doctorCatalogEntries,
      );
      if (!entry) return;
      commitCatalogEntry(entry);
    },
    [commitCatalogEntry, doctorCatalogEntries],
  );

  const handleQuickAddLabel = useCallback(
    (label: string) => {
      const entry = findOrderCatalogEntryByLabel(label, doctorCatalogEntries);
      if (entry) {
        commitCatalogEntry(entry);
        return;
      }
      clearSuggest();
      upsertOrder(createCustomBasket(label));
    },
    [clearSuggest, commitCatalogEntry, doctorCatalogEntries, upsertOrder],
  );

  const runAiResolve = useCallback(
    (trimmed: string) => {
      if (!token) {
        upsertOrder(createCustomBasket(trimmed));
        return;
      }

      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setSuggestTyped(trimmed);
      setSuggestRows([]);
      setSuggestStatus("loading");

      /** Empty / error → commit as custom (medications autogate fail-soft). */
      const degradeToTyped = () => {
        aiAbortRef.current = null;
        setSuggestTyped(null);
        setSuggestRows([]);
        setSuggestStatus("ready");
        upsertOrder(createCustomBasket(trimmed));
      };

      resolveInvestigationWithAI(token, {
        text: trimmed,
        tier: "default",
        signal: controller.signal,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          const terms = res.data.candidates.map((c) => c.term);
          const mapped = mapResolvedTermsToCatalog(terms, occupiedKeys);
          if (mapped.length === 0) {
            degradeToTyped();
            return;
          }
          setSuggestRows(mapped);
          setSuggestStatus("ready");
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          degradeToTyped();
        });
    },
    [occupiedKeys, token, upsertOrder],
  );

  const handleCustomCommit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || disabled) return;

      const exact = resolveInvestigationOrderCatalog(
        trimmed,
        doctorCatalogEntries,
      );
      if (exact) {
        openOrAddFromCatalogValue(exact);
        return;
      }

      const suggestions = suggestInvestigationOrders(
        trimmed,
        occupiedKeys,
        5,
        doctorCatalogEntries,
      );
      if (suggestions.length > 0) {
        setSuggestTyped(trimmed);
        setSuggestRows(suggestions);
        setSuggestStatus("ready");
        return;
      }

      runAiResolve(trimmed);
    },
    [
      disabled,
      doctorCatalogEntries,
      occupiedKeys,
      openOrAddFromCatalogValue,
      runAiResolve,
    ],
  );

  const catalogOptions = useMemo((): ChartCatalogOption[] => {
    const merged = [...doctorCatalogEntries, ...INVESTIGATION_ORDER_CATALOG];
    return merged
      .filter((entry) => {
        if (entry.kind === "panel") {
          return !occupiedKeys.has(`panel:${entry.id}`);
        }
        if (entry.kind === "analyte") {
          return !occupiedKeys.has(`analyte:${entry.id}`);
        }
        if (entry.kind === "custom") {
          return (
            !occupiedKeys.has(entry.value) &&
            !occupiedKeys.has(`custom:${entry.id}`)
          );
        }
        return !occupiedKeys.has(`imaging:${entry.id}`);
      })
      .map((entry) => ({
        value: entry.value,
        label:
          entry.kind === "custom" ? `${entry.label} (my order)` : entry.label,
      }));
  }, [doctorCatalogEntries, occupiedKeys]);

  /** Inside a lab panel basket, allow any catalog hit. */
  const memberCatalogOptions = useMemo(
    (): ChartCatalogOption[] =>
      [...doctorCatalogEntries, ...INVESTIGATION_ORDER_CATALOG].map((entry) => ({
        value: entry.value,
        label:
          entry.kind === "custom" ? `${entry.label} (my order)` : entry.label,
      })),
    [doctorCatalogEntries],
  );

  /** Inside an imaging study, offer the shared view vocabulary. */
  const viewCatalogOptions = useMemo(
    (): ChartCatalogOption[] =>
      IMAGING_VIEWS.map((view) => ({
        value: `view:${view.id}`,
        label: view.name,
      })),
    [],
  );

  const filterMemberCatalogWithExtras = useCallback(
    (options: readonly ChartCatalogOption[], query: string) =>
      filterInvestigationOrderCatalog(options, query, doctorCatalogEntries),
    [doctorCatalogEntries],
  );

  const resolveMemberCatalogWithExtras = useCallback(
    (query: string) =>
      resolveInvestigationOrderCatalog(query, doctorCatalogEntries),
    [doctorCatalogEntries],
  );

  const filterViewCatalog = useCallback(
    (options: readonly ChartCatalogOption[], query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return [...options];
      return options.filter((opt) => opt.label.toLowerCase().includes(q));
    },
    [],
  );

  const resolveViewCatalog = useCallback((query: string) => {
    const view = lookupImagingViewByAlias(query);
    return view ? `view:${view.id}` : undefined;
  }, []);

  const quickAddLabels = useMemo(
    () =>
      INVESTIGATION_QUICK_PICK_ENTRIES.filter((entry) => {
        if (entry.kind === "panel") {
          return !occupiedKeys.has(`panel:${entry.id}`);
        }
        return !occupiedKeys.has(`${entry.kind}:${entry.id}`);
      }).map((entry) => entry.label),
    [occupiedKeys],
  );

  const atCapacity = orders.length >= MAX_ORDERS;

  const replaceEditingOrder = useCallback(
    (next: InvestigationOrder) => {
      const idx = orders.findIndex((o) => o.id === editingOrderId);
      if (idx < 0) return;
      const copy = [...orders];
      copy[idx] = next;
      commitOrders(copy);
      // Persist member snapshot for already-saved customs without bumping use.
      if (
        next.kind === "custom" &&
        isInvestigationCustomOrderSaved(doctorCustomsRef.current, next.id)
      ) {
        const pinned = pinInvestigationCustomOrder(
          doctorCustomsRef.current,
          next,
        );
        void persistCustoms(pinned);
      }
    },
    [commitOrders, editingOrderId, orders, persistCustoms],
  );

  const editingIsSavedCustom =
    editingOrder?.kind === "custom" &&
    isInvestigationCustomOrderSaved(doctorCustoms, editingOrder.id);

  return (
    <div
      id="rx-investigations"
      className="space-y-2"
      data-testid="investigations-chip-row"
    >
      {!hideLabel ? (
        <label htmlFor={inputId} className={RX_FIELD_LABEL_CLASS}>
          Investigations
        </label>
      ) : null}

      <div className="space-y-2">
        {!disabled && !atCapacity ? (
          <div className="space-y-1.5">
            <ChartCatalogCombobox
              inputId={inputId}
              testId="investigations-combobox"
              ariaLabel="Investigation name"
              placeholder="Search panel, test, or imaging…"
              disabled={atCapacity}
              catalogOptions={catalogOptions}
              filterCatalog={(opts, q) =>
                filterInvestigationOrderCatalog(opts, q, doctorCatalogEntries)
              }
              resolveCatalog={(q) =>
                resolveInvestigationOrderCatalog(q, doctorCatalogEntries)
              }
              customLabel={(text) => `Add "${text}"`}
              suggestOverlayActive={suggestTyped !== null}
              onSuggestEnter={confirmSuggestDefault}
              onSuggestEscape={() => {
                if (suggestStatus === "ready" && suggestRows.length > 0) {
                  keepSuggestAsTyped();
                  return;
                }
                dismissSuggest();
              }}
              onCommit={(payload) => {
                if (payload.kind === "catalog") {
                  openOrAddFromCatalogValue(payload.value);
                  return;
                }
                handleCustomCommit(payload.text);
              }}
            />
            {saveNotice ? (
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="investigations-custom-save-notice"
                role="status"
              >
                {saveNotice}
              </p>
            ) : null}
            {suggestTyped !== null ? (
              <InvestigationSuggestPanel
                suggestions={suggestRows}
                typedText={suggestTyped}
                status={suggestStatus}
                onAccept={(entry) => {
                  commitCatalogEntry(entry);
                }}
                onKeepAsTyped={keepSuggestAsTyped}
                onDismiss={dismissSuggest}
              />
            ) : null}
            {showQuickPicks ? (
              <ChartQuickAddChips
                labels={quickAddLabels}
                disabled={atCapacity}
                groupLabel="Common orders"
                testId="plan-investigation-quick-picks"
                onAdd={handleQuickAddLabel}
              />
            ) : null}
          </div>
        ) : null}

        {token && visibleCustoms.length > 0 && !disabled ? (
          <div
            className="flex items-center gap-2"
            data-testid="investigations-my-orders-strip"
          >
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              My orders — saved custom packages
            </p>
            <ManageInvestigationCustomOrdersMenu
              orders={visibleCustoms}
              disabled={false}
              onRename={handleRenameCustomOrder}
              onDelete={handleDeleteCustomOrder}
            />
          </div>
        ) : null}

        {orders.length > 0 ? (
          <ul
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-1.5"
            data-testid="investigations-chip-list"
          >
            {orders.map((order, index) => {
              const expandable = isExpandableOrder(order);
              const isExpanded = expandable && order.id === editingOrderId;
              const memberCount = order.members?.length ?? 0;
              const customized = isBasketCustomized(order);
              return (
                <li
                  key={`${order.kind}:${order.id}:${index}`}
                  className={cn(
                    "group flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1",
                    "border-border/70 bg-muted/25",
                    "hover:border-border hover:bg-muted/45",
                    isExpanded &&
                      "border-primary/35 bg-primary/[0.06] hover:bg-primary/[0.08]",
                  )}
                >
                  {expandable && !disabled ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-foreground"
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Collapse ${order.label} members`
                          : `Expand ${order.label} members`
                      }
                      data-testid={`investigation-panel-expand-${order.id}`}
                      onClick={() =>
                        setEditingOrderId(isExpanded ? null : order.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown
                          size={14}
                          className="shrink-0 text-muted-foreground"
                        />
                      ) : (
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="min-w-0 truncate font-medium">
                        {order.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums",
                          "bg-background/80 text-muted-foreground ring-1 ring-border/60",
                        )}
                      >
                        {memberCount}
                        {customized ? " · custom" : ""}
                      </span>
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate pl-5 text-sm font-medium text-foreground">
                      {order.label}
                    </span>
                  )}
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => removeOrderAt(index)}
                      aria-label={`Remove ${order.label}`}
                      className={cn(
                        "shrink-0 rounded-md p-1 text-muted-foreground",
                        "opacity-70 hover:bg-background hover:text-foreground hover:opacity-100",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      )}
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {editingOrder && !disabled ? (
          <InvestigationPanelChecklist
            order={editingOrder}
            catalogName={editingCatalogName}
            templateMembers={editingTemplateMembers}
            templateMemberKind={
              editingOrder.kind === "imaging" ? "custom" : "analyte"
            }
            memberNoun={
              editingOrder.kind === "imaging"
                ? editingImagingMemberNoun
                : "test"
            }
            showRequisition={editingShowRequisition}
            disabled={false}
            onChange={replaceEditingOrder}
            onClose={() => setEditingOrderId(null)}
            memberCatalogOptions={
              editingOrder.kind === "imaging" &&
              editingImagingMemberNoun === "view"
                ? viewCatalogOptions
                : memberCatalogOptions
            }
            filterMemberCatalog={
              editingOrder.kind === "imaging" &&
              editingImagingMemberNoun === "view"
                ? filterViewCatalog
                : filterMemberCatalogWithExtras
            }
            resolveMemberCatalog={
              editingOrder.kind === "imaging" &&
              editingImagingMemberNoun === "view"
                ? resolveViewCatalog
                : resolveMemberCatalogWithExtras
            }
            showSaveToMyOrders={
              editingOrder.kind === "custom" && Boolean(token)
            }
            saveToMyOrdersSaved={editingIsSavedCustom}
            saveToMyOrdersBusy={savingOrderId === editingOrder.id}
            onSaveToMyOrders={() => {
              void handleSaveCustomOrder(editingOrder);
            }}
            onAddMember={(payload) => {
              if (payload.kind === "catalog") {
                if (
                  editingOrder.kind === "imaging" &&
                  editingImagingMemberNoun === "view"
                ) {
                  const viewId = payload.value.startsWith("view:")
                    ? payload.value.slice("view:".length)
                    : payload.value;
                  const view =
                    getImagingViewById(viewId) ??
                    lookupImagingViewByAlias(viewId);
                  if (!view) return;
                  replaceEditingOrder(
                    addMemberToBasket(editingOrder, {
                      id: view.id,
                      label: view.name,
                      kind: "custom",
                    }),
                  );
                  return;
                }
                const entry = findOrderCatalogEntryByValue(
                  payload.value,
                  doctorCatalogEntries,
                );
                if (!entry) return;
                replaceEditingOrder(
                  addMemberToBasket(editingOrder, {
                    id: entry.kind === "custom" ? entry.value : entry.id,
                    label: entry.label,
                    kind: entry.kind === "analyte" ? "analyte" : "custom",
                  }),
                );
                return;
              }
              const text = payload.text.trim();
              if (!text) return;
              if (
                editingOrder.kind === "imaging" &&
                editingImagingMemberNoun === "view"
              ) {
                const view = lookupImagingViewByAlias(text);
                replaceEditingOrder(
                  addMemberToBasket(editingOrder, {
                    id: view?.id ?? `custom:${text.toLowerCase()}`,
                    label: view?.name ?? text,
                    kind: "custom",
                  }),
                );
                return;
              }
              replaceEditingOrder(
                addMemberToBasket(editingOrder, {
                  id: `custom:${text.toLowerCase()}`,
                  label: text,
                  kind: "custom",
                }),
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
