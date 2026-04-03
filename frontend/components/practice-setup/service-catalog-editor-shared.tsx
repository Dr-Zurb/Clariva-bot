"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import type {
  DiscountTypeOption,
  ModalityFollowUpDiscountDraft,
  ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";

export type ModalityKey = "text" | "voice" | "video";
export type PriceField = "textPriceMain" | "voicePriceMain" | "videoPriceMain";
export type FollowUpField = "textFollowUp" | "voiceFollowUp" | "videoFollowUp";

export const MODALITY_ACCENT: Record<ModalityKey, string> = {
  text: "border-t-blue-400",
  voice: "border-t-violet-400",
  video: "border-t-emerald-500",
};

export function updateService(
  services: ServiceOfferingDraft[],
  id: string,
  patch: Partial<ServiceOfferingDraft>
): ServiceOfferingDraft[] {
  return services.map((si) => (si.id === id ? { ...si, ...patch } : si));
}

export function cloneFollowUpDraft(d: ModalityFollowUpDiscountDraft): ModalityFollowUpDiscountDraft {
  return { ...d };
}

export function applyPricePatch(
  services: ServiceOfferingDraft[],
  serviceRowId: string,
  priceField: PriceField,
  priceValue: string,
  syncPrice: boolean
): ServiceOfferingDraft[] {
  return services.map((row) => {
    if (row.id !== serviceRowId) return row;
    if (!syncPrice) {
      return { ...row, [priceField]: priceValue };
    }
    const patch: Partial<ServiceOfferingDraft> = {};
    if (row.textEnabled) patch.textPriceMain = priceValue;
    if (row.voiceEnabled) patch.voicePriceMain = priceValue;
    if (row.videoEnabled) patch.videoPriceMain = priceValue;
    return { ...row, ...patch };
  });
}

export function applyFollowUpPatch(
  services: ServiceOfferingDraft[],
  serviceRowId: string,
  fuField: FollowUpField,
  nextDraft: ModalityFollowUpDiscountDraft,
  syncFollowUp: boolean
): ServiceOfferingDraft[] {
  return services.map((row) => {
    if (row.id !== serviceRowId) return row;
    if (!syncFollowUp) {
      return { ...row, [fuField]: cloneFollowUpDraft(nextDraft) };
    }
    const base = cloneFollowUpDraft(nextDraft);
    const patch: Partial<ServiceOfferingDraft> = {};
    if (row.textEnabled) patch.textFollowUp = { ...base };
    if (row.voiceEnabled) patch.voiceFollowUp = { ...base };
    if (row.videoEnabled) patch.videoFollowUp = { ...base };
    return { ...row, ...patch };
  });
}

export function computeFollowUpFinalDisplay(
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

export function FollowUpDiscountFieldsCompact({
  serviceId,
  modalityKey,
  listPriceMain,
  draft,
  onChange,
  isFollowUpSyncSource,
  onFollowUpSyncToggle,
}: {
  serviceId: string;
  modalityKey: string;
  listPriceMain: string;
  draft: ModalityFollowUpDiscountDraft;
  onChange: (next: ModalityFollowUpDiscountDraft) => void;
  isFollowUpSyncSource: boolean;
  onFollowUpSyncToggle: (checked: boolean) => void;
}) {
  const prefix = `${serviceId}-${modalityKey}`;
  const dt = draft.discount_type;
  const showPercentFlatRow = dt === "percent" || dt === "flat_off";
  const showFixedRow = dt === "fixed_price";

  const middleLabel =
    dt === "percent" ? "% off list" : dt === "flat_off" ? "Amount off" : "Follow-up price";

  const finalDisplay = computeFollowUpFinalDisplay(listPriceMain, dt, draft.discount_value);

  const discountBlock = (
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
  );

  return (
    <div className="mt-1.5 rounded-md border border-gray-100 bg-gray-50/80 px-1.5 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[11px] font-medium leading-tight text-gray-700">
          <input
            type="checkbox"
            checked={draft.followUpDiscountEnabled}
            onChange={(e) => onChange({ ...draft, followUpDiscountEnabled: e.target.checked })}
            className="rounded border-gray-300"
          />
          <span>Follow ups</span>
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={isFollowUpSyncSource}
            onChange={(e) => onFollowUpSyncToggle(e.target.checked)}
            className="rounded border-gray-300"
            title="Copy these follow-up rules to all other enabled channels"
          />
          <span className="whitespace-nowrap">Same for all</span>
        </label>
      </div>

      {draft.followUpDiscountEnabled && (
        <div className="mt-1.5 space-y-2 rounded border border-dashed border-gray-200 bg-white px-1.5 py-2">
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

          {showPercentFlatRow && (
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {discountBlock}
              <div className="min-w-0">
                <FieldLabel htmlFor={`${prefix}-dval`} tooltip={`${middleLabel} (main currency).`}>
                  {middleLabel}
                </FieldLabel>
                <input
                  id={`${prefix}-dval`}
                  type="number"
                  min={0}
                  step={dt === "percent" ? 1 : "0.01"}
                  max={dt === "percent" ? 100 : undefined}
                  value={draft.discount_value}
                  onChange={(e) => onChange({ ...draft, discount_value: e.target.value })}
                  className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
                />
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
          )}

          {showFixedRow && (
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {discountBlock}
              <div className="min-w-0">
                <FieldLabel htmlFor={`${prefix}-dval`} tooltip="Follow-up visit price in main currency.">
                  Follow-up price
                </FieldLabel>
                <input
                  id={`${prefix}-dval`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.discount_value}
                  onChange={(e) => onChange({ ...draft, discount_value: e.target.value })}
                  className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-1.5 py-1 text-sm tabular-nums"
                />
              </div>
            </div>
          )}

          {(dt === "free" || dt === "none") && (
            <div className="grid grid-cols-1">{discountBlock}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModalityColumn({
  serviceId,
  modalityKey,
  columnTitle,
  enabled,
  price,
  priceField,
  fuDraft,
  fuField,
  services,
  priceSyncSource,
  followUpSyncSource,
  onSetPriceSyncSource,
  onSetFollowUpSyncSource,
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
  priceSyncSource: ModalityKey | null;
  followUpSyncSource: ModalityKey | null;
  onSetPriceSyncSource: (next: ModalityKey | null) => void;
  onSetFollowUpSyncSource: (next: ModalityKey | null) => void;
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
}) {
  const isPriceSyncSource = priceSyncSource === modalityKey;
  const isFollowUpSyncSource = followUpSyncSource === modalityKey;

  const handlePriceSyncToggle = (checked: boolean) => {
    if (checked) {
      onSetPriceSyncSource(modalityKey);
      onServicesChange(applyPricePatch(services, serviceId, priceField, price, true));
    } else if (isPriceSyncSource) {
      onSetPriceSyncSource(null);
    }
  };

  const handleFollowUpSyncToggle = (checked: boolean) => {
    if (checked) {
      onSetFollowUpSyncSource(modalityKey);
      onServicesChange(
        applyFollowUpPatch(services, serviceId, fuField, cloneFollowUpDraft(fuDraft), true)
      );
    } else if (isFollowUpSyncSource) {
      onSetFollowUpSyncSource(null);
    }
  };

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
            if (!on) {
              if (priceSyncSource === modalityKey) onSetPriceSyncSource(null);
              if (followUpSyncSource === modalityKey) onSetFollowUpSyncSource(null);
            }
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium text-gray-700">Price</span>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-gray-600">
                <input
                  type="checkbox"
                  checked={isPriceSyncSource}
                  onChange={(e) => handlePriceSyncToggle(e.target.checked)}
                  className="rounded border-gray-300"
                  title="Use this channel’s list price for all other enabled channels"
                />
                <span className="whitespace-nowrap">Same for all</span>
              </label>
            </div>
            <input
              id={`${modalityKey}-price-${serviceId}`}
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) =>
                onServicesChange(
                  applyPricePatch(services, serviceId, priceField, e.target.value, isPriceSyncSource)
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
            listPriceMain={price}
            draft={fuDraft}
            onChange={(next) =>
              onServicesChange(
                applyFollowUpPatch(services, serviceId, fuField, next, isFollowUpSyncSource)
              )
            }
            isFollowUpSyncSource={isFollowUpSyncSource}
            onFollowUpSyncToggle={handleFollowUpSyncToggle}
          />
        </div>
      )}
    </div>
  );
}
