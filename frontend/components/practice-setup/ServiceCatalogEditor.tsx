"use client";

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
  return services.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function FollowUpDiscountFields({
  serviceId,
  label,
  draft,
  onChange,
}: {
  serviceId: string;
  label: string;
  draft: ModalityFollowUpDiscountDraft;
  onChange: (next: ModalityFollowUpDiscountDraft) => void;
}) {
  const prefix = `${serviceId}-${label}`;
  return (
    <div className="mt-2 border-t border-dashed border-gray-200 pt-2">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
        <input
          type="checkbox"
          checked={draft.followUpDiscountEnabled}
          onChange={(e) => onChange({ ...draft, followUpDiscountEnabled: e.target.checked })}
          className="rounded border-gray-300"
        />
        Follow-up discount ({label})
      </label>
      {draft.followUpDiscountEnabled && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={`${prefix}-fmax`} tooltip="Maximum discounted follow-up visits on this channel after the index visit.">
              Max follow-up visits
            </FieldLabel>
            <input
              id={`${prefix}-fmax`}
              type="number"
              min={0}
              max={100}
              value={draft.max_followups}
              onChange={(e) => onChange({ ...draft, max_followups: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <FieldLabel
              htmlFor={`${prefix}-fwin`}
              tooltip="Days after the index visit during which follow-ups on this channel still qualify."
            >
              Eligibility window (days)
            </FieldLabel>
            <input
              id={`${prefix}-fwin`}
              type="number"
              min={1}
              max={3650}
              value={draft.eligibility_window_days}
              onChange={(e) => onChange({ ...draft, eligibility_window_days: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${prefix}-dtype`} tooltip="How follow-up price is derived from this channel list price.">
              Discount type
            </FieldLabel>
            <select
              id={`${prefix}-dtype`}
              value={draft.discount_type}
              onChange={(e) =>
                onChange({ ...draft, discount_type: e.target.value as DiscountTypeOption })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="percent">Percent off list</option>
              <option value="flat_off">Fixed amount off</option>
              <option value="fixed_price">Fixed follow-up price</option>
              <option value="free">Free follow-ups</option>
              <option value="none">No discount</option>
            </select>
          </div>
          {(draft.discount_type === "percent" ||
            draft.discount_type === "flat_off" ||
            draft.discount_type === "fixed_price") && (
            <div>
              <FieldLabel
                htmlFor={`${prefix}-dval`}
                tooltip={
                  draft.discount_type === "percent"
                    ? "0–100 (percent off list)"
                    : draft.discount_type === "flat_off"
                      ? "Amount off in main currency"
                      : "Follow-up price in main currency"
                }
              >
                {draft.discount_type === "percent"
                  ? "Percent off"
                  : draft.discount_type === "flat_off"
                    ? "Amount off"
                    : "Price"}
              </FieldLabel>
              <input
                id={`${prefix}-dval`}
                type="number"
                min={0}
                step={draft.discount_type === "percent" ? 1 : "0.01"}
                max={draft.discount_type === "percent" ? 100 : undefined}
                value={draft.discount_value}
                onChange={(e) => onChange({ ...draft, discount_value: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ServiceCatalogEditor({ services, onServicesChange }: Props) {
  const removeService = (id: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this service from your catalog?")
    ) {
      return;
    }
    onServicesChange(services.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Services &amp; teleconsult prices</h2>
            <p className="mt-1 text-sm text-gray-600">
              Add a name and prices per channel. Follow-up discounts can differ for text, voice, and video. In-clinic visits
              use the flat <span className="font-medium">appointment fee</span> on Booking Rules.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onServicesChange([...services, emptyServiceDraft()])}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add service
          </button>
        </div>

        {services.length === 0 && (
          <p className="mt-4 text-sm text-gray-600">
            No structured services yet. Add at least one to charge modality-specific teleconsult fees, or clear the catalog
            to keep using only the legacy flat fee.
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {services.map((s, idx) => (
            <li key={s.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Service {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeService(s.id)}
                  className="rounded text-sm text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Remove
                </button>
              </div>
              <div className="mt-3">
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
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  maxLength={200}
                  placeholder="e.g. General dermatology"
                />
              </div>
              <div className="mt-3">
                <FieldLabel htmlFor={`svc-desc-${s.id}`} tooltip="Optional short description (max 500 characters).">
                  Description (optional)
                </FieldLabel>
                <textarea
                  id={`svc-desc-${s.id}`}
                  value={s.description}
                  onChange={(e) =>
                    onServicesChange(updateService(services, s.id, { description: e.target.value }))
                  }
                  rows={2}
                  maxLength={500}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-gray-800">Modalities</legend>
                <p className="text-xs text-gray-600">Enable at least one. Prices in your main currency (e.g. ₹).</p>
                <div className="mt-2 space-y-3">
                  {(
                    [
                      ["text", "Text chat", s.textEnabled, s.textPriceMain, "textPriceMain", s.textFollowUp, "textFollowUp"] as const,
                      ["voice", "Voice call", s.voiceEnabled, s.voicePriceMain, "voicePriceMain", s.voiceFollowUp, "voiceFollowUp"] as const,
                      ["video", "Video", s.videoEnabled, s.videoPriceMain, "videoPriceMain", s.videoFollowUp, "videoFollowUp"] as const,
                    ]
                  ).map(([key, label, enabled, price, priceField, fuDraft, fuField]) => (
                    <div
                      key={key}
                      className="flex flex-col gap-2 rounded-md border border-gray-100 bg-white p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="flex min-w-[8rem] items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                              const on = e.target.checked;
                              onServicesChange(
                                updateService(services, s.id, {
                                  [`${key}Enabled`]: on,
                                  ...(on
                                    ? {}
                                    : {
                                        [priceField]: "",
                                      }),
                                } as Partial<ServiceOfferingDraft>)
                              );
                            }}
                            className="rounded border-gray-300"
                          />
                          {label}
                        </label>
                        {enabled && (
                          <div className="flex-1">
                            <label className="sr-only" htmlFor={`${key}-price-${s.id}`}>
                              {label} price
                            </label>
                            <input
                              id={`${key}-price-${s.id}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={price}
                              onChange={(e) =>
                                onServicesChange(
                                  updateService(services, s.id, { [priceField]: e.target.value } as Partial<
                                    ServiceOfferingDraft
                                  >)
                                )
                              }
                              placeholder="0"
                              className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      {enabled && (
                        <FollowUpDiscountFields
                          serviceId={s.id}
                          label={label}
                          draft={fuDraft}
                          onChange={(next) =>
                            onServicesChange(updateService(services, s.id, { [fuField]: next } as Partial<ServiceOfferingDraft>))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
