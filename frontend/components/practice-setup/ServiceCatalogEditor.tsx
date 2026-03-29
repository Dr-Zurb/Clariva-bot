"use client";

import { useCallback, useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type {
  DiscountTypeOption,
  ModalityFollowUpDiscountDraft,
  ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import { emptyServiceDraft } from "@/lib/service-catalog-drafts";

type Props = {
  services: ServiceOfferingDraft[];
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
};

type ModalityKey = "text" | "voice" | "video";
type PriceField = "textPriceMain" | "voicePriceMain" | "videoPriceMain";
type FollowUpField = "textFollowUp" | "voiceFollowUp" | "videoFollowUp";

const MODALITY_ACCENT: Record<ModalityKey, string> = {
  text: "border-t-blue-400",
  voice: "border-t-violet-400",
  video: "border-t-emerald-500",
};

function updateService(
  services: ServiceOfferingDraft[],
  id: string,
  patch: Partial<ServiceOfferingDraft>
): ServiceOfferingDraft[] {
  return services.map((si) => (si.id === id ? { ...si, ...patch } : si));
}

/** Compact follow-up fields: one dense block inside <details> (fits narrow columns). */
function FollowUpDiscountFieldsCompact({
  serviceId,
  modalityKey,
  label,
  draft,
  onChange,
}: {
  serviceId: string;
  modalityKey: string;
  label: string;
  draft: ModalityFollowUpDiscountDraft;
  onChange: (next: ModalityFollowUpDiscountDraft) => void;
}) {
  const prefix = `${serviceId}-${modalityKey}`;
  const needsValue =
    draft.discount_type === "percent" ||
    draft.discount_type === "flat_off" ||
    draft.discount_type === "fixed_price";

  return (
    <div className="mt-1.5 rounded-md border border-gray-100 bg-gray-50/80 px-1.5 py-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium leading-tight text-gray-700">
        <input
          type="checkbox"
          checked={draft.followUpDiscountEnabled}
          onChange={(e) => onChange({ ...draft, followUpDiscountEnabled: e.target.checked })}
          className="rounded border-gray-300"
        />
        <span>Follow-up · {label}</span>
      </label>

      {draft.followUpDiscountEnabled && (
        <details className="group mt-1.5 rounded border border-dashed border-gray-200 bg-white px-1.5 py-1">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-blue-700 hover:text-blue-900">
            Rules
          </summary>
          <div className="mt-2 flex max-h-[min(50vh,260px)] flex-col gap-2 overflow-y-auto overscroll-contain pb-1">
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-[10px] font-medium uppercase tracking-wide text-gray-500"
                  title="Maximum discounted follow-up visits on this channel after the index visit"
                >
                  Max
                </span>
                <input
                  id={`${prefix}-fmax`}
                  type="number"
                  min={0}
                  max={100}
                  value={draft.max_followups}
                  onChange={(e) => onChange({ ...draft, max_followups: e.target.value })}
                  className="w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums sm:w-14"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-[10px] font-medium uppercase tracking-wide text-gray-500"
                  title="Days after index visit when follow-ups qualify"
                >
                  Days
                </span>
                <input
                  id={`${prefix}-fwin`}
                  type="number"
                  min={1}
                  max={3650}
                  value={draft.eligibility_window_days}
                  onChange={(e) => onChange({ ...draft, eligibility_window_days: e.target.value })}
                  className="w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums sm:w-14"
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Discount</span>
              <select
                id={`${prefix}-dtype`}
                value={draft.discount_type}
                title="How follow-up price is derived from list price"
                onChange={(e) =>
                  onChange({ ...draft, discount_type: e.target.value as DiscountTypeOption })
                }
                className="w-full min-w-0 rounded border border-gray-300 px-1 py-1 text-[11px]"
              >
                <option value="percent">% off list</option>
                <option value="flat_off">Amount off</option>
                <option value="fixed_price">Fixed price</option>
                <option value="free">Free</option>
                <option value="none">No discount</option>
              </select>
            </div>
            {needsValue && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {draft.discount_type === "percent"
                    ? "% off"
                    : draft.discount_type === "flat_off"
                      ? "Amount"
                      : "Price"}
                </span>
                <input
                  id={`${prefix}-dval`}
                  type="number"
                  min={0}
                  step={draft.discount_type === "percent" ? 1 : "0.01"}
                  max={draft.discount_type === "percent" ? 100 : undefined}
                  value={draft.discount_value}
                  onChange={(e) => onChange({ ...draft, discount_value: e.target.value })}
                  className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
                />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** One fixed modality column (Text / Voice / Video). */
function ModalityColumn({
  serviceId,
  modalityKey,
  columnTitle,
  enabled,
  price,
  priceField,
  fuDraft,
  fuField,
  services,
  onServicesChange,
}: {
  serviceId: string;
  modalityKey: ModalityKey;
  columnTitle: string;
  enabled: boolean;
  price: string;
  priceField: PriceField;
  fuDraft: ModalityFollowUpDiscountDraft;
  fuField: FollowUpField;
  services: ServiceOfferingDraft[];
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
}) {
  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col rounded-md border border-gray-200 bg-white p-2 shadow-sm ${
        MODALITY_ACCENT[modalityKey]
      } border-t-2 pt-1.5 ${enabled ? "" : "opacity-[0.88]"}`}
    >
      <div className="border-b border-gray-100 pb-1.5 text-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{columnTitle}</span>
      </div>

      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const on = e.target.checked;
            onServicesChange(
              updateService(services, serviceId, {
                [`${modalityKey}Enabled`]: on,
                ...(on ? {} : { [priceField]: "" }),
              } as Partial<ServiceOfferingDraft>)
            );
          }}
          className="rounded border-gray-300"
        />
        <span className="font-medium text-gray-800">On</span>
      </label>

      <div className="mt-2 min-h-[2.5rem]">
        {enabled ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-500">Price</span>
            <input
              id={`${modalityKey}-price-${serviceId}`}
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) =>
                onServicesChange(
                  updateService(services, serviceId, {
                    [priceField]: e.target.value,
                  } as Partial<ServiceOfferingDraft>)
                )
              }
              placeholder="0"
              className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
            />
          </div>
        ) : (
          <p className="pt-1 text-center text-[10px] text-gray-400">Off</p>
        )}
      </div>

      {/* Fills leftover height so column cards share one row height; follow-up sits above card bottom */}
      <div className="min-h-1 flex-1 shrink-0" aria-hidden="true" />

      {enabled && (
        <div className="shrink-0">
          <FollowUpDiscountFieldsCompact
            serviceId={serviceId}
            modalityKey={modalityKey}
            label={columnTitle}
            draft={fuDraft}
            onChange={(next) =>
              onServicesChange(
                updateService(services, serviceId, {
                  [fuField]: next,
                } as Partial<ServiceOfferingDraft>)
              )
            }
          />
        </div>
      )}
    </div>
  );
}

export function ServiceCatalogEditor({ services, onServicesChange }: Props) {
  const [descOpenById, setDescOpen] = useState<Record<string, boolean>>({});

  const setDescExpanded = useCallback((id: string, open: boolean) => {
    setDescOpen((prev) => ({ ...prev, [id]: open }));
  }, []);

  const removeService = (id: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this service from your catalog?")
    ) {
      return;
    }
    onServicesChange(services.filter((s) => s.id !== id));
    setDescOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
          </div>
          <button
            type="button"
            onClick={() => onServicesChange([...services, emptyServiceDraft()])}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add service
          </button>
        </div>

        {services.length === 0 && (
          <p className="mt-3 text-sm text-gray-600">
            No structured services yet. Add at least one, or clear the catalog to use only the legacy flat fee.
          </p>
        )}

        <ul className="mt-3 space-y-3">
          {services.map((s, idx) => {
            const hasDesc = s.description.trim().length > 0;
            const descExpanded = descOpenById[s.id] ?? false;

            return (
              <li
                key={s.id}
                className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:p-3"
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-200/90 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Service {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeService(s.id)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:underline focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
                  {/* Left: name + description — does not stretch with tall channel grid */}
                  <div className="min-w-0 w-full shrink-0 space-y-2 self-start lg:max-w-[20rem]">
                    <div>
                      <FieldLabel htmlFor={`svc-label-${s.id}`} tooltip="Shown to you and in patient-facing copy.">
                        Service name
                      </FieldLabel>
                      <input
                        id={`svc-label-${s.id}`}
                        type="text"
                        value={s.label}
                        onChange={(e) =>
                          onServicesChange(updateService(services, s.id, { label: e.target.value }))
                        }
                        className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                        maxLength={200}
                        placeholder="e.g. General checkup"
                      />
                    </div>

                    <div>
                      {!descExpanded && !hasDesc && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded(s.id, true)}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          + Add description
                        </button>
                      )}
                      {!descExpanded && hasDesc && (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="line-clamp-2 flex-1 text-xs text-gray-600" title={s.description}>
                            {s.description}
                          </p>
                          <button
                            type="button"
                            onClick={() => setDescExpanded(s.id, true)}
                            className="shrink-0 text-xs font-medium text-blue-700 hover:text-blue-900"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                      {descExpanded && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <FieldLabel htmlFor={`svc-desc-${s.id}`} tooltip="Optional (max 500 characters).">
                              Description
                            </FieldLabel>
                            <button
                              type="button"
                              onClick={() => setDescExpanded(s.id, false)}
                              className="text-xs text-gray-500 hover:text-gray-800"
                            >
                              Collapse
                            </button>
                          </div>
                          <textarea
                            id={`svc-desc-${s.id}`}
                            value={s.description}
                            onChange={(e) =>
                              onServicesChange(updateService(services, s.id, { description: e.target.value }))
                            }
                            rows={3}
                            maxLength={500}
                            className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                            placeholder="Optional"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: fixed 3 modality columns — equal height on md+ */}
                  <fieldset className="flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0">
                    <legend className="text-xs font-semibold text-gray-800">Channels &amp; prices</legend>
                    <p className="text-[10px] text-gray-500">
                      Enable at least one · amounts in your main currency
                    </p>
                    <div className="mt-2 grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3 md:gap-2 md:items-stretch">
                      <ModalityColumn
                        serviceId={s.id}
                        modalityKey="text"
                        columnTitle="Text"
                        enabled={s.textEnabled}
                        price={s.textPriceMain}
                        priceField="textPriceMain"
                        fuDraft={s.textFollowUp}
                        fuField="textFollowUp"
                        services={services}
                        onServicesChange={onServicesChange}
                      />
                      <ModalityColumn
                        serviceId={s.id}
                        modalityKey="voice"
                        columnTitle="Voice"
                        enabled={s.voiceEnabled}
                        price={s.voicePriceMain}
                        priceField="voicePriceMain"
                        fuDraft={s.voiceFollowUp}
                        fuField="voiceFollowUp"
                        services={services}
                        onServicesChange={onServicesChange}
                      />
                      <ModalityColumn
                        serviceId={s.id}
                        modalityKey="video"
                        columnTitle="Video"
                        enabled={s.videoEnabled}
                        price={s.videoPriceMain}
                        priceField="videoPriceMain"
                        fuDraft={s.videoFollowUp}
                        fuField="videoFollowUp"
                        services={services}
                        onServicesChange={onServicesChange}
                      />
                    </div>
                  </fieldset>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
