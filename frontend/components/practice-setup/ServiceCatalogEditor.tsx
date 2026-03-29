"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import type { DiscountTypeOption, FollowUpFormDraft, ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import { emptyServiceDraft } from "@/lib/service-catalog-drafts";

type Props = {
  services: ServiceOfferingDraft[];
  followUp: FollowUpFormDraft;
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
  onFollowUpChange: (next: FollowUpFormDraft) => void;
};

function updateService(
  services: ServiceOfferingDraft[],
  id: string,
  patch: Partial<ServiceOfferingDraft>
): ServiceOfferingDraft[] {
  return services.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function ServiceCatalogEditor({
  services,
  followUp,
  onServicesChange,
  onFollowUpChange,
}: Props) {
  const removeService = (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Remove this service from your catalog?")) {
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
              Add a name and prices per channel: text chat, voice, or video. In-clinic visits still use the flat{" "}
              <span className="font-medium">appointment fee</span> on Booking Rules.
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
            No structured services yet. Add at least one to charge modality-specific teleconsult fees, or clear the catalog to keep using only the legacy flat fee.
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {services.map((s, idx) => (
            <li
              key={s.id}
              className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Service {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeService(s.id)}
                  className="text-sm text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
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
                        ["text", "Text chat", s.textEnabled, s.textPriceMain, "textPriceMain"] as const,
                        ["voice", "Voice call", s.voiceEnabled, s.voicePriceMain, "voicePriceMain"] as const,
                        ["video", "Video", s.videoEnabled, s.videoPriceMain, "videoPriceMain"] as const,
                      ]
                    ).map(([key, label, enabled, price, priceField]) => (
                    <div
                      key={key}
                      className="flex flex-col gap-2 rounded-md border border-gray-100 bg-white p-3 sm:flex-row sm:items-center"
                    >
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
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      </div>

      <details className="rounded-lg border border-gray-200 bg-white p-4 open:shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
          Follow-up pricing
        </summary>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">Tip:</span> Up to N follow-up visits after your first{" "}
          <span className="font-medium">completed</span> consultation, within the eligibility window. The same policy is
          applied to every service in this catalog.
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={followUp.enabled}
              onChange={(e) => onFollowUpChange({ ...followUp, enabled: e.target.checked })}
              className="rounded border-gray-300"
            />
            Enable follow-up discounts
          </label>
          {followUp.enabled && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel
                    htmlFor="fu-max"
                    tooltip="Maximum number of discounted follow-up visits after the index visit."
                  >
                    Max follow-up visits
                  </FieldLabel>
                  <input
                    id="fu-max"
                    type="number"
                    min={0}
                    max={100}
                    value={followUp.max_followups}
                    onChange={(e) => onFollowUpChange({ ...followUp, max_followups: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="fu-window"
                    tooltip="Days after the index visit during which follow-up pricing applies."
                  >
                    Eligibility window (days)
                  </FieldLabel>
                  <input
                    id="fu-window"
                    type="number"
                    min={1}
                    max={3650}
                    value={followUp.eligibility_window_days}
                    onChange={(e) =>
                      onFollowUpChange({ ...followUp, eligibility_window_days: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="fu-discount-type" tooltip="How follow-up visit price is derived from the list price.">
                  Discount type
                </FieldLabel>
                <select
                  id="fu-discount-type"
                  value={followUp.discount_type}
                  onChange={(e) =>
                    onFollowUpChange({
                      ...followUp,
                      discount_type: e.target.value as DiscountTypeOption,
                    })
                  }
                  className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="percent">Percent off list price</option>
                  <option value="flat_off">Fixed amount off (main currency)</option>
                  <option value="fixed_price">Fixed follow-up price (main currency)</option>
                  <option value="free">Free follow-ups</option>
                  <option value="none">No discount (same as list)</option>
                </select>
              </div>
              {(followUp.discount_type === "percent" ||
                followUp.discount_type === "flat_off" ||
                followUp.discount_type === "fixed_price") && (
                <div>
                  <FieldLabel
                    htmlFor="fu-discount-val"
                    tooltip={
                      followUp.discount_type === "percent"
                        ? "0–100. E.g. 30 means patient pays 70% of list price."
                        : followUp.discount_type === "flat_off"
                          ? "Amount subtracted from list price (e.g. ₹100 off)."
                          : "Price charged for each follow-up visit."
                    }
                  >
                    {followUp.discount_type === "percent"
                      ? "Percent off"
                      : followUp.discount_type === "flat_off"
                        ? "Amount off"
                        : "Follow-up price"}
                  </FieldLabel>
                  <input
                    id="fu-discount-val"
                    type="number"
                    min={0}
                    step={followUp.discount_type === "percent" ? 1 : "0.01"}
                    max={followUp.discount_type === "percent" ? 100 : undefined}
                    value={followUp.discount_value}
                    onChange={(e) => onFollowUpChange({ ...followUp, discount_value: e.target.value })}
                    className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
