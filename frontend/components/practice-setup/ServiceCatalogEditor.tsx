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

function updateService(
  services: ServiceOfferingDraft[],
  id: string,
  patch: Partial<ServiceOfferingDraft>
): ServiceOfferingDraft[] {
  return services.map((si) => (si.id === id ? { ...si, ...patch } : si));
}

/** Compact follow-up fields: one dense block inside <details>. */
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
    <div className="mt-1.5 rounded-md border border-gray-100 bg-gray-50/80 px-2 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
        <input
          type="checkbox"
          checked={draft.followUpDiscountEnabled}
          onChange={(e) => onChange({ ...draft, followUpDiscountEnabled: e.target.checked })}
          className="rounded border-gray-300"
        />
        Follow-up pricing · {label}
      </label>

      {draft.followUpDiscountEnabled && (
        <details className="group mt-2 rounded border border-dashed border-gray-200 bg-white px-2 py-1.5">
          <summary className="cursor-pointer select-none text-xs font-medium text-blue-700 hover:text-blue-900">
            Rules (max visits, window, discount)
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 pb-1">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-gray-500"
                title="Maximum discounted follow-up visits on this channel after the index visit"
              >
                Max visits
              </span>
              <input
                id={`${prefix}-fmax`}
                type="number"
                min={0}
                max={100}
                value={draft.max_followups}
                onChange={(e) => onChange({ ...draft, max_followups: e.target.value })}
                className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-gray-500"
                title="Days after index visit when follow-ups qualify"
              >
                Window (d)
              </span>
              <input
                id={`${prefix}-fwin`}
                type="number"
                min={1}
                max={3650}
                value={draft.eligibility_window_days}
                onChange={(e) => onChange({ ...draft, eligibility_window_days: e.target.value })}
                className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
              />
            </div>
            <div className="flex min-w-[7.5rem] flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Discount</span>
              <select
                id={`${prefix}-dtype`}
                value={draft.discount_type}
                title="How follow-up price is derived from list price"
                onChange={(e) =>
                  onChange({ ...draft, discount_type: e.target.value as DiscountTypeOption })
                }
                className="rounded border border-gray-300 px-1.5 py-1 text-xs"
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
                  className="w-20 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
                />
              </div>
            )}
          </div>
        </details>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Service {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeService(s.id)}
                    className="text-xs text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-2">
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

                <div className="mt-2">
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
                      <p className="line-clamp-1 flex-1 text-xs text-gray-600" title={s.description}>
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
                        rows={2}
                        maxLength={500}
                        className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                        placeholder="Optional"
                      />
                    </>
                  )}
                </div>

                <fieldset className="mt-3 min-w-0 border-0 p-0">
                  <legend className="text-xs font-semibold text-gray-800">Channels &amp; prices</legend>
                  <p className="text-[10px] text-gray-500">Enable at least one · amounts in your main currency</p>
                  <div className="mt-1.5 space-y-1.5">
                    {(
                      [
                        ["text", "Text", s.textEnabled, s.textPriceMain, "textPriceMain", s.textFollowUp, "textFollowUp"] as const,
                        ["voice", "Voice", s.voiceEnabled, s.voicePriceMain, "voicePriceMain", s.voiceFollowUp, "voiceFollowUp"] as const,
                        ["video", "Video", s.videoEnabled, s.videoPriceMain, "videoPriceMain", s.videoFollowUp, "videoFollowUp"] as const,
                      ]
                    ).map(([key, shortLabel, enabled, price, priceField, fuDraft, fuField]) => (
                      <div
                        key={key}
                        className="rounded-md border border-gray-100 bg-white px-2 py-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <label className="flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(e) => {
                                const on = e.target.checked;
                                onServicesChange(
                                  updateService(services, s.id, {
                                    [`${key}Enabled`]: on,
                                    ...(on ? {} : { [priceField]: "" }),
                                  } as Partial<ServiceOfferingDraft>)
                                );
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="font-medium">{shortLabel}</span>
                          </label>
                          {enabled && (
                            <>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">Price</span>
                                <input
                                  id={`${key}-price-${s.id}`}
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={price}
                                  onChange={(e) =>
                                    onServicesChange(
                                      updateService(services, s.id, {
                                        [priceField]: e.target.value,
                                      } as Partial<ServiceOfferingDraft>)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums sm:w-28"
                                />
                              </div>
                            </>
                          )}
                        </div>
                        {enabled && (
                          <FollowUpDiscountFieldsCompact
                            serviceId={s.id}
                            modalityKey={key}
                            label={shortLabel}
                            draft={fuDraft}
                            onChange={(next) =>
                              onServicesChange(
                                updateService(services, s.id, {
                                  [fuField]: next,
                                } as Partial<ServiceOfferingDraft>)
                              )
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
