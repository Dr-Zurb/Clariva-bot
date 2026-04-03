"use client";

import { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type {
  DiscountTypeOption,
  ModalityFollowUpDiscountDraft,
  ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import {
  catalogMissingCatchAllOffering,
  catchAllServiceDraft,
  emptyServiceDraft,
  normalizeDraftOrder,
} from "@/lib/service-catalog-drafts";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
} from "@/lib/service-catalog-schema";

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

function cloneFollowUpDraft(d: ModalityFollowUpDiscountDraft): ModalityFollowUpDiscountDraft {
  return { ...d };
}

/** Sync list price across enabled channels only (does not enable/disable channels). */
function applyPricePatch(
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

/** Sync follow-up draft across enabled channels only (does not enable/disable channels). */
function applyFollowUpPatch(
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

/** Follow-up policy fields: always expanded below price. */
function FollowUpDiscountFieldsCompact({
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

export function ServiceCatalogEditor({ services, onServicesChange }: Props) {
  /** Which channel is the “source” for list-price sync (only that column’s edits propagate). */
  const [priceSyncSourceById, setPriceSyncSourceById] = useState<Record<string, ModalityKey>>({});
  /** Which channel is the “source” for follow-up sync. */
  const [followUpSyncSourceById, setFollowUpSyncSourceById] = useState<Record<string, ModalityKey>>(
    {}
  );

  const setPriceSyncSourceForRow = (rowId: string, next: ModalityKey | null) => {
    setPriceSyncSourceById((prev) => {
      const n = { ...prev };
      if (next === null) delete n[rowId];
      else n[rowId] = next;
      return n;
    });
  };

  const setFollowUpSyncSourceForRow = (rowId: string, next: ModalityKey | null) => {
    setFollowUpSyncSourceById((prev) => {
      const n = { ...prev };
      if (next === null) delete n[rowId];
      else n[rowId] = next;
      return n;
    });
  };

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
            onClick={() => {
              const nextRow = catalogMissingCatchAllOffering(services)
                ? catchAllServiceDraft()
                : emptyServiceDraft();
              const isCatchAllNew =
                nextRow.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
              if (isCatchAllNew) {
                onServicesChange(normalizeDraftOrder([...services, nextRow]));
                return;
              }
              const nonOther = services.filter(
                (row) =>
                  row.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
              );
              const otherRows = services.filter(
                (row) => row.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
              );
              onServicesChange([nextRow, ...nonOther, ...otherRows]);
            }}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add service
          </button>
        </div>

        <ul className="mt-3 space-y-3">
          {services.map((s, idx) => {
            const priceSyncSource = priceSyncSourceById[s.id] ?? null;
            const followUpSyncSource = followUpSyncSourceById[s.id] ?? null;
            const isCatchAllRow =
              s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
            const namedBefore = services
              .slice(0, idx)
              .filter(
                (row) =>
                  row.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
              ).length;

            return (
              <li
                key={s.id}
                className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:p-3"
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-200/90 pb-2">
                  <span
                    className={`text-xs font-semibold tracking-wide ${
                      isCatchAllRow ? "text-amber-900" : "uppercase text-gray-600"
                    }`}
                  >
                    {isCatchAllRow ? (
                      <>
                        {CATALOG_CATCH_ALL_LABEL_DEFAULT}{" "}
                        <span className="font-normal normal-case text-gray-600">(required)</span>{" "}
                        <span className="text-red-600 normal-case" aria-hidden>
                          *
                        </span>
                      </>
                    ) : (
                      <>Service {namedBefore + 1}</>
                    )}
                  </span>
                  {isCatchAllRow ? (
                    <span className="shrink-0 text-[10px] font-normal normal-case text-gray-500 sm:text-xs">
                      Always included
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeService(s.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:underline focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-stretch lg:gap-x-6 lg:gap-y-2">
                  <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1">
                    <FieldLabel htmlFor={`svc-label-${s.id}`} tooltip="Shown to you and in patient-facing copy.">
                      Service name
                      {isCatchAllRow ? (
                        <>
                          {" "}
                          <span className="text-red-600" aria-hidden>
                            *
                          </span>
                        </>
                      ) : null}
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
                    {isCatchAllRow && (
                      <div className="rounded-md border border-amber-100 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-950 sm:text-xs">
                        <p className="font-semibold text-amber-950">Why this row is here</p>
                        <p className="mt-1">
                          Every saved catalog needs <span className="font-medium">{CATALOG_CATCH_ALL_LABEL_DEFAULT}</span>
                          . Use it for visits that don&apos;t match one of your named services above, so patients still
                          see clear prices and can complete a remote booking. This is not a cheaper or &quot;special&quot;
                          tier — it covers the &quot;everything else&quot; cases. You may edit the name and description if
                          you prefer different wording for your practice.
                        </p>
                      </div>
                    )}
                    {isCatchAllRow && (
                      <div className="min-w-0">
                        <FieldLabel
                          htmlFor={`svc-key-${s.id}`}
                          tooltip="The app uses this code only for this row. Do not reuse it on another service."
                        >
                          Reference code (fixed)
                        </FieldLabel>
                        <input
                          id={`svc-key-${s.id}`}
                          readOnly
                          value={CATALOG_CATCH_ALL_SERVICE_KEY}
                          className="mt-0.5 w-full max-w-md rounded-md border border-gray-200 bg-gray-100 px-2.5 py-1.5 text-sm text-gray-700"
                        />
                      </div>
                    )}
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

                    <div className="flex min-w-0 flex-col">
                      <FieldLabel htmlFor={`svc-desc-${s.id}`} tooltip="Optional (max 500 characters).">
                        Description
                      </FieldLabel>
                      <textarea
                        id={`svc-desc-${s.id}`}
                        value={s.description}
                        onChange={(e) =>
                          onServicesChange(updateService(services, s.id, { description: e.target.value }))
                        }
                        rows={6}
                        maxLength={500}
                        wrap="soft"
                        placeholder="Optional"
                        className="mt-0.5 min-h-[12rem] w-full resize-y overflow-x-hidden rounded-md border border-gray-300 px-2.5 py-1.5 text-sm leading-snug"
                      />
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-violet-100 bg-violet-50/50 p-2.5">
                      <p className="text-xs font-semibold text-violet-950">Matching hints (optional)</p>
                      <p className="text-[11px] leading-snug text-violet-900/85">
                        Optional hints for the assistant so patient questions line up with the right service. Not shown in
                        patient fee messages. Add keywords and short rules in plain language — never put patient names or
                        PHI here.
                      </p>
                      <div className="min-w-0">
                        <FieldLabel
                          htmlFor={`svc-mkw-${s.id}`}
                          tooltip="Synonyms or phrases, e.g. skin rash, eczema, acne, mole check"
                        >
                          Keywords / synonyms
                        </FieldLabel>
                        <textarea
                          id={`svc-mkw-${s.id}`}
                          value={s.matcherKeywords}
                          onChange={(e) =>
                            onServicesChange(
                              updateService(services, s.id, { matcherKeywords: e.target.value })
                            )
                          }
                          rows={2}
                          maxLength={400}
                          wrap="soft"
                          placeholder="e.g. fever 3 days, diabetes follow-up, dressing change"
                          className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                        />
                      </div>
                      <div className="min-w-0">
                        <FieldLabel
                          htmlFor={`svc-minc-${s.id}`}
                          tooltip="When this row is the right teleconsult service"
                        >
                          Book this service when…
                        </FieldLabel>
                        <textarea
                          id={`svc-minc-${s.id}`}
                          value={s.matcherIncludeWhen}
                          onChange={(e) =>
                            onServicesChange(
                              updateService(services, s.id, { matcherIncludeWhen: e.target.value })
                            )
                          }
                          rows={2}
                          maxLength={800}
                          wrap="soft"
                          placeholder="e.g. Chronic condition follow-up already diagnosed; medication adjustment questions."
                          className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                        />
                      </div>
                      <div className="min-w-0">
                        <FieldLabel
                          htmlFor={`svc-mexc-${s.id}`}
                          tooltip="Steer away from this row when…"
                        >
                          Not this service when…
                        </FieldLabel>
                        <textarea
                          id={`svc-mexc-${s.id}`}
                          value={s.matcherExcludeWhen}
                          onChange={(e) =>
                            onServicesChange(
                              updateService(services, s.id, { matcherExcludeWhen: e.target.value })
                            )
                          }
                          rows={2}
                          maxLength={800}
                          wrap="soft"
                          placeholder="e.g. First-time chest pain — suggest emergency; acute injury — in-person."
                          className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                        />
                      </div>
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
                        priceSyncSource={priceSyncSource}
                        followUpSyncSource={followUpSyncSource}
                        onSetPriceSyncSource={(next) => setPriceSyncSourceForRow(s.id, next)}
                        onSetFollowUpSyncSource={(next) => setFollowUpSyncSourceForRow(s.id, next)}
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
                        priceSyncSource={priceSyncSource}
                        followUpSyncSource={followUpSyncSource}
                        onSetPriceSyncSource={(next) => setPriceSyncSourceForRow(s.id, next)}
                        onSetFollowUpSyncSource={(next) => setFollowUpSyncSourceForRow(s.id, next)}
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
                        priceSyncSource={priceSyncSource}
                        followUpSyncSource={followUpSyncSource}
                        onSetPriceSyncSource={(next) => setPriceSyncSourceForRow(s.id, next)}
                        onSetFollowUpSyncSource={(next) => setFollowUpSyncSourceForRow(s.id, next)}
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
