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

/** Preview follow-up price in main currency from list price + discount (matches backend applyFollowUpDiscount logic). */
function computeFollowUpFinalDisplay(
  listMainStr: string,
  dt: DiscountTypeOption,
  discountValueStr: string
): string {
  const list = parseFloat(String(listMainStr).trim());
  if (!Number.isFinite(list) || list < 0) {
    return "—";
  }
  const vRaw = parseFloat(String(discountValueStr).trim());
  const v = Number.isFinite(vRaw) ? vRaw : 0;
  switch (dt) {
    case "none":
      return list.toFixed(2);
    case "free":
      return (0).toFixed(2);
    case "percent": {
      const pct = Math.min(100, Math.max(0, v));
      return Math.max(0, (list * (100 - pct)) / 100).toFixed(2);
    }
    case "flat_off":
      return Math.max(0, list - v).toFixed(2);
    case "fixed_price":
      return Math.max(0, v).toFixed(2);
    default:
      return "—";
  }
}

/** Follow-up policy fields: always expanded below price; no &lt;details&gt;. */
function FollowUpDiscountFieldsCompact({
  serviceId,
  modalityKey,
  label,
  listPriceMain,
  draft,
  onChange,
}: {
  serviceId: string;
  modalityKey: string;
  label: string;
  /** Channel list price (main currency) for final-price preview */
  listPriceMain: string;
  draft: ModalityFollowUpDiscountDraft;
  onChange: (next: ModalityFollowUpDiscountDraft) => void;
}) {
  const prefix = `${serviceId}-${modalityKey}`;
  const needsValue =
    draft.discount_type === "percent" ||
    draft.discount_type === "flat_off" ||
    draft.discount_type === "fixed_price";

  const middleLabel =
    draft.discount_type === "percent"
      ? "% off list"
      : draft.discount_type === "flat_off"
        ? "Amount off"
        : draft.discount_type === "fixed_price"
          ? "Follow-up price"
          : "—";

  const finalDisplay = computeFollowUpFinalDisplay(
    listPriceMain,
    draft.discount_type,
    draft.discount_value
  );

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
        <div className="mt-1.5 space-y-2 rounded border border-dashed border-gray-200 bg-white px-1.5 py-2">
          {/* Row 1: max visits + eligibility window */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel
                htmlFor={`${prefix}-fmax`}
                tooltip="Maximum discounted follow-up visits on this channel after the index visit."
              >
                Max visits
              </FieldLabel>
              <input
                id={`${prefix}-fmax`}
                type="number"
                min={0}
                max={100}
                value={draft.max_followups}
                onChange={(e) => onChange({ ...draft, max_followups: e.target.value })}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
              />
            </div>
            <div className="min-w-0">
              <FieldLabel
                htmlFor={`${prefix}-fwin`}
                tooltip="Days after the index visit during which follow-ups on this channel still qualify."
              >
                Eligibility (days)
              </FieldLabel>
              <input
                id={`${prefix}-fwin`}
                type="number"
                min={1}
                max={3650}
                value={draft.eligibility_window_days}
                onChange={(e) => onChange({ ...draft, eligibility_window_days: e.target.value })}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
              />
            </div>
          </div>

          {/* Row 2: discount type | value | final price (Option A) */}
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            <div className="min-w-0">
              <FieldLabel
                htmlFor={`${prefix}-dtype`}
                tooltip="How follow-up price is derived from this channel list price."
              >
                Discount
              </FieldLabel>
              <select
                id={`${prefix}-dtype`}
                value={draft.discount_type}
                onChange={(e) =>
                  onChange({ ...draft, discount_type: e.target.value as DiscountTypeOption })
                }
                className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1 py-1.5 text-[11px]"
              >
                <option value="percent">% off list</option>
                <option value="flat_off">Amount off</option>
                <option value="fixed_price">Fixed price</option>
                <option value="free">Free</option>
                <option value="none">No discount</option>
              </select>
            </div>
            <div className="min-w-0">
              {needsValue ? (
                <>
                  <FieldLabel htmlFor={`${prefix}-dval`} tooltip={`${middleLabel} (main currency).`}>
                    {middleLabel}
                  </FieldLabel>
                  <input
                    id={`${prefix}-dval`}
                    type="number"
                    min={0}
                    step={draft.discount_type === "percent" ? 1 : "0.01"}
                    max={draft.discount_type === "percent" ? 100 : undefined}
                    value={draft.discount_value}
                    onChange={(e) => onChange({ ...draft, discount_value: e.target.value })}
                    className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
                  />
                </>
              ) : (
                <>
                  <FieldLabel htmlFor={`${prefix}-dval-na`} tooltip="No extra amount for this discount type.">
                    Value
                  </FieldLabel>
                  <input
                    id={`${prefix}-dval-na`}
                    readOnly
                    disabled
                    value=""
                    placeholder="—"
                    className="mt-0.5 w-full cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-sm text-gray-400"
                  />
                </>
              )}
            </div>
            <div className="min-w-0">
              <FieldLabel
                htmlFor={`${prefix}-final`}
                tooltip="Estimated follow-up price from this channel’s list price (preview only)."
              >
                Final price
              </FieldLabel>
              <input
                id={`${prefix}-final`}
                readOnly
                value={finalDisplay}
                className="mt-0.5 w-full min-w-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-sm tabular-nums text-gray-800"
              />
            </div>
          </div>
        </div>
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
      <label className="flex cursor-pointer items-center gap-2 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-800">
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
        <span>{columnTitle}</span>
      </label>

      <div className="mt-2 min-h-[2.5rem] shrink-0">
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

      {enabled && (
        <div className="shrink-0">
          <FollowUpDiscountFieldsCompact
            serviceId={serviceId}
            modalityKey={modalityKey}
            label={columnTitle}
            listPriceMain={price}
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

                {/*
                  Mobile (flex): label → name + description → channels line → grid.
                  lg (grid): row1 [label | channels], row2 [name + description | grid]; items stretch so description grows.
                */}
                <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-stretch lg:gap-x-6 lg:gap-y-2">
                  <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1">
                    <FieldLabel htmlFor={`svc-label-${s.id}`} tooltip="Shown to you and in patient-facing copy.">
                      Service name
                    </FieldLabel>
                  </div>

                  <div className="order-3 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
                    <p className="text-sm leading-snug text-gray-800">
                      <span className="font-medium">Channels &amp; prices</span>
                      <span className="font-normal text-gray-600">
                        {" "}
                        · Enable at least one · amounts in your main currency
                      </span>
                    </p>
                  </div>

                  <div className="order-2 flex h-full min-h-0 min-w-0 flex-col gap-3 lg:order-none lg:col-start-1 lg:row-start-2">
                    <textarea
                      id={`svc-label-${s.id}`}
                      value={s.label}
                      onChange={(e) =>
                        onServicesChange(updateService(services, s.id, { label: e.target.value }))
                      }
                      autoComplete="off"
                      rows={2}
                      maxLength={200}
                      wrap="soft"
                      placeholder="e.g. General checkup"
                      className="block w-full shrink-0 resize-y overflow-x-hidden rounded-md border border-gray-300 px-2.5 py-1.5 text-sm leading-snug"
                    />

                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <FieldLabel htmlFor={`svc-desc-${s.id}`} tooltip="Optional (max 500 characters).">
                        Description
                      </FieldLabel>
                      <textarea
                        id={`svc-desc-${s.id}`}
                        value={s.description}
                        onChange={(e) =>
                          onServicesChange(updateService(services, s.id, { description: e.target.value }))
                        }
                        maxLength={500}
                        wrap="soft"
                        placeholder="Optional"
                        className="mt-0.5 min-h-[12rem] w-full flex-1 resize-y overflow-x-hidden rounded-md border border-gray-300 px-2.5 py-1.5 text-sm leading-snug lg:min-h-0"
                      />
                    </div>
                  </div>

                  <fieldset
                    aria-label="Channels and prices"
                    className="order-4 flex h-full min-h-0 min-w-0 flex-col border-0 p-0 lg:order-none lg:col-start-2 lg:row-start-2"
                  >
                    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3 md:gap-2 md:items-stretch">
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
