"use client";

import { useCallback, useState } from "react";
import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import {
  catalogMissingCatchAllOffering,
  catchAllServiceDraft,
  emptyServiceDraft,
  normalizeDraftOrder,
  reorderNamedServiceRelative,
} from "@/lib/service-catalog-drafts";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
} from "@/lib/service-catalog-schema";
import type { ModalityKey } from "./service-catalog-editor-shared";
import {
  formatServiceChannelSummary,
  hasMatcherHints,
  ServiceOfferingDetailDrawer,
} from "./ServiceOfferingDetailDrawer";

type Props = {
  services: ServiceOfferingDraft[];
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
};

export function ServiceCatalogEditor({ services, onServicesChange }: Props) {
  const [priceSyncSourceById, setPriceSyncSourceById] = useState<Record<string, ModalityKey>>({});
  const [followUpSyncSourceById, setFollowUpSyncSourceById] = useState<Record<string, ModalityKey>>(
    {}
  );
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const setPriceSyncSourceForRow = useCallback((rowId: string, next: ModalityKey | null) => {
    setPriceSyncSourceById((prev) => {
      const n = { ...prev };
      if (next === null) delete n[rowId];
      else n[rowId] = next;
      return n;
    });
  }, []);

  const setFollowUpSyncSourceForRow = useCallback((rowId: string, next: ModalityKey | null) => {
    setFollowUpSyncSourceById((prev) => {
      const n = { ...prev };
      if (next === null) delete n[rowId];
      else n[rowId] = next;
      return n;
    });
  }, []);

  const removeService = (id: string) => {
    const row = services.find((s) => s.id === id);
    if (row?.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this service from your catalog?")
    ) {
      return;
    }
    onServicesChange(services.filter((s) => s.id !== id));
    setPriceSyncSourceById((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setFollowUpSyncSourceById((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setExpandedServiceId((cur) => (cur === id ? null : cur));
  };

  const addService = () => {
    const nextRow = catalogMissingCatchAllOffering(services)
      ? catchAllServiceDraft()
      : emptyServiceDraft();
    const isCatchAllNew =
      nextRow.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
    let nextList: ServiceOfferingDraft[];
    if (isCatchAllNew) {
      nextList = normalizeDraftOrder([...services, nextRow]);
    } else {
      const nonOther = services.filter(
        (row) => row.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
      );
      const otherRows = services.filter(
        (row) => row.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
      );
      nextList = [nextRow, ...nonOther, ...otherRows];
    }
    onServicesChange(nextList);
    setExpandedServiceId(nextRow.id);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Services &amp; teleconsult prices</h2>
            <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">
              Per-channel prices and optional follow-up rules. In-clinic uses the booking{" "}
              <span className="font-medium">appointment fee</span>.
            </p>
            <p className="mt-2 text-[11px] leading-snug text-gray-600 sm:text-xs">
              Click a row to edit. Drag the grip (<span className="tabular-nums">⋮⋮</span>) on named services to reorder;{" "}
              <span className="font-medium">{CATALOG_CATCH_ALL_LABEL_DEFAULT}</span> stays last. Save the page to keep
              changes — you&apos;ll be asked before leaving if you haven&apos;t saved.
            </p>
          </div>
          <button
            type="button"
            onClick={addService}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add service
          </button>
        </div>

        <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-gray-50/50">
          {services.map((s, idx) => {
            const isCatchAllRow =
              s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
            const namedBefore = services
              .slice(0, idx)
              .filter(
                (row) =>
                  row.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
              ).length;
            const displayTitle = s.label.trim()
              ? s.label.trim()
              : isCatchAllRow
                ? CATALOG_CATCH_ALL_LABEL_DEFAULT
                : "Untitled service";
            const isExpanded = expandedServiceId === s.id;

            const isDragOver = dragOverId === s.id;
            const isDragging = draggingId === s.id;

            return (
              <li
                key={s.id}
                onDragOver={(e) => {
                  if (!draggingId || draggingId === s.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverId(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  setDragOverId(null);
                  setDraggingId(null);
                  if (!raw || raw === s.id) return;
                  const targetBefore =
                    isCatchAllRow ? null : s.id;
                  onServicesChange(reorderNamedServiceRelative(services, raw, targetBefore));
                }}
                className={`bg-white first:rounded-t-lg last:rounded-b-lg ${
                  isExpanded ? "ring-1 ring-inset ring-blue-200" : ""
                } ${isDragOver ? "bg-blue-50/80 ring-1 ring-inset ring-blue-300" : ""} ${
                  isDragging ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-stretch gap-0 sm:gap-2">
                  {!isCatchAllRow ? (
                    <div
                      draggable
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${displayTitle}`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(s.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      className="flex w-9 shrink-0 cursor-grab touch-none select-none flex-col items-center justify-center border-r border-gray-100 bg-gray-50/80 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
                    >
                      <span className="text-xs leading-none tracking-tighter" aria-hidden>
                        ⋮
                      </span>
                      <span className="text-xs leading-none tracking-tighter" aria-hidden>
                        ⋮
                      </span>
                    </div>
                  ) : (
                    <div
                      className="w-2 shrink-0 border-r border-gray-100 bg-gray-50/30"
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedServiceId(s.id)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-50/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:flex-row sm:items-center sm:gap-4 sm:py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <span
                        className={`shrink-0 text-[10px] font-semibold sm:text-xs ${
                          isCatchAllRow ? "text-amber-900" : "uppercase tracking-wide text-gray-500"
                        }`}
                      >
                        {isCatchAllRow ? (
                          <>
                            Other <span className="font-normal normal-case text-gray-600">(required)</span>
                          </>
                        ) : (
                          <>Svc {namedBefore + 1}</>
                        )}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-900">{displayTitle}</span>
                      {hasMatcherHints(s) && (
                        <span
                          className="shrink-0 rounded bg-violet-100 px-1.5 py-0 text-[10px] font-medium text-violet-800"
                          title="Matching hints filled in"
                        >
                          Hints
                        </span>
                      )}
                    </div>
                    <span
                      className="hidden max-w-[14rem] truncate font-mono text-[11px] text-gray-600 sm:block"
                      title={formatServiceChannelSummary(s)}
                    >
                      {formatServiceChannelSummary(s)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center border-l border-gray-100 px-2">
                    {isCatchAllRow ? (
                      <span className="max-w-[5.5rem] text-right text-[10px] text-gray-500 sm:max-w-none sm:text-xs">
                        Always included
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeService(s.id);
                        }}
                        className="rounded px-1.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:underline focus:outline-none focus:ring-2 focus:ring-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-100 px-3 pb-2 sm:hidden">
                  <p className="font-mono text-[10px] text-gray-600">{formatServiceChannelSummary(s)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ServiceOfferingDetailDrawer
        open={expandedServiceId !== null}
        serviceId={expandedServiceId}
        services={services}
        onServicesChange={onServicesChange}
        onClose={() => setExpandedServiceId(null)}
        onSelectServiceId={(id) => setExpandedServiceId(id)}
        priceSyncSourceById={priceSyncSourceById}
        followUpSyncSourceById={followUpSyncSourceById}
        setPriceSyncSourceForRow={setPriceSyncSourceForRow}
        setFollowUpSyncSourceForRow={setFollowUpSyncSourceForRow}
      />
    </div>
  );
}
