"use client";

import { useEffect, useId, useRef } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
} from "@/lib/service-catalog-schema";
import type { ModalityKey } from "./service-catalog-editor-shared";
import { ModalityColumn, updateService } from "./service-catalog-editor-shared";

export type DetailDrawerProps = {
  open: boolean;
  serviceId: string | null;
  services: ServiceOfferingDraft[];
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
  onClose: () => void;
  onSelectServiceId: (id: string) => void;
  priceSyncSourceById: Record<string, ModalityKey>;
  followUpSyncSourceById: Record<string, ModalityKey>;
  setPriceSyncSourceForRow: (rowId: string, next: ModalityKey | null) => void;
  setFollowUpSyncSourceForRow: (rowId: string, next: ModalityKey | null) => void;
};

/** Compact price line for list rows (uses same string fields as save flow). */
export function formatServiceChannelSummary(s: ServiceOfferingDraft): string {
  const fmt = (on: boolean, price: string) =>
    on ? (price.trim() ? price.trim() : "—") : "off";
  return `Vid ${fmt(s.videoEnabled, s.videoPriceMain)} · V ${fmt(s.voiceEnabled, s.voicePriceMain)} · T ${fmt(s.textEnabled, s.textPriceMain)}`;
}

export function hasMatcherHints(s: ServiceOfferingDraft): boolean {
  return Boolean(
    s.matcherKeywords.trim() || s.matcherIncludeWhen.trim() || s.matcherExcludeWhen.trim()
  );
}

export function ServiceOfferingDetailDrawer({
  open,
  serviceId,
  services,
  onServicesChange,
  onClose,
  onSelectServiceId,
  priceSyncSourceById,
  followUpSyncSourceById,
  setPriceSyncSourceForRow,
  setFollowUpSyncSourceForRow,
}: DetailDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const s = serviceId ? services.find((x) => x.id === serviceId) : undefined;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open, serviceId]);

  useEffect(() => {
    if (open && serviceId && !s) {
      onClose();
    }
  }, [open, serviceId, s, onClose]);

  if (!open || !serviceId || !s) return null;

  const idx = services.findIndex((x) => x.id === serviceId);
  const isCatchAllRow = s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
  const priceSyncSource = priceSyncSourceById[s.id] ?? null;
  const followUpSyncSource = followUpSyncSourceById[s.id] ?? null;
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < services.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={s ? titleId : undefined}
        className="relative z-[101] flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {idx >= 0 ? `Row ${idx + 1} of ${services.length}` : ""}
            </p>
            <h2 id={titleId} className="mt-0.5 truncate text-base font-semibold text-gray-900">
              {s.label.trim() || (isCatchAllRow ? CATALOG_CATCH_ALL_LABEL_DEFAULT : "Untitled service")}
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              Channels &amp; follow-ups · amounts in your main currency
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => canPrev && onSelectServiceId(services[idx - 1]!.id)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-40"
              aria-label="Previous service"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => canNext && onSelectServiceId(services[idx + 1]!.id)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-40"
              aria-label="Next service"
            >
              ›
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="ml-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {isCatchAllRow && (
              <div className="rounded-md border border-amber-100 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-950 sm:text-xs">
                <p className="font-semibold text-amber-950">Why this row is here</p>
                <p className="mt-1">
                  Every saved catalog needs <span className="font-medium">{CATALOG_CATCH_ALL_LABEL_DEFAULT}</span>. Use
                  it for visits that don&apos;t match one of your named services in the list, so patients still see clear
                  prices and can complete a remote booking. This is not a cheaper or &quot;special&quot; tier — it
                  covers the &quot;everything else&quot; cases. You may edit the name and description if you prefer
                  different wording for your practice.
                </p>
              </div>
            )}
            {isCatchAllRow && (
              <div className="min-w-0">
                <FieldLabel
                  htmlFor={`drawer-svc-key-${s.id}`}
                  tooltip="The app uses this code only for this row. Do not reuse it on another service."
                >
                  Reference code (fixed)
                </FieldLabel>
                <input
                  id={`drawer-svc-key-${s.id}`}
                  readOnly
                  value={CATALOG_CATCH_ALL_SERVICE_KEY}
                  className="mt-0.5 w-full max-w-md rounded-md border border-gray-200 bg-gray-100 px-2.5 py-1.5 text-sm text-gray-700"
                />
              </div>
            )}

            <div className="min-w-0">
              <FieldLabel htmlFor={`drawer-svc-label-${s.id}`} tooltip="Shown to you and in patient-facing copy.">
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
              <textarea
                id={`drawer-svc-label-${s.id}`}
                value={s.label}
                onChange={(e) =>
                  onServicesChange(updateService(services, s.id, { label: e.target.value }))
                }
                autoComplete="off"
                rows={2}
                maxLength={200}
                wrap="soft"
                placeholder="e.g. General checkup"
                className="mt-0.5 block w-full shrink-0 resize-y overflow-x-hidden rounded-md border border-gray-300 px-2.5 py-1.5 text-sm leading-snug"
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <FieldLabel htmlFor={`drawer-svc-desc-${s.id}`} tooltip="Optional (max 500 characters).">
                Description
              </FieldLabel>
              <textarea
                id={`drawer-svc-desc-${s.id}`}
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
                patient fee messages. Add keywords and short rules in plain language — never put patient names or PHI
                here.
              </p>
              <div className="min-w-0">
                <FieldLabel
                  htmlFor={`drawer-svc-mkw-${s.id}`}
                  tooltip="Synonyms or phrases, e.g. skin rash, eczema, acne, mole check"
                >
                  Keywords / synonyms
                </FieldLabel>
                <textarea
                  id={`drawer-svc-mkw-${s.id}`}
                  value={s.matcherKeywords}
                  onChange={(e) =>
                    onServicesChange(updateService(services, s.id, { matcherKeywords: e.target.value }))
                  }
                  rows={2}
                  maxLength={400}
                  wrap="soft"
                  placeholder="e.g. fever 3 days, diabetes follow-up, dressing change"
                  className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor={`drawer-svc-minc-${s.id}`} tooltip="When this row is the right teleconsult service">
                  Book this service when…
                </FieldLabel>
                <textarea
                  id={`drawer-svc-minc-${s.id}`}
                  value={s.matcherIncludeWhen}
                  onChange={(e) =>
                    onServicesChange(updateService(services, s.id, { matcherIncludeWhen: e.target.value }))
                  }
                  rows={2}
                  maxLength={800}
                  wrap="soft"
                  placeholder="e.g. Chronic condition follow-up already diagnosed; medication adjustment questions."
                  className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor={`drawer-svc-mexc-${s.id}`} tooltip="Steer away from this row when…">
                  Not this service when…
                </FieldLabel>
                <textarea
                  id={`drawer-svc-mexc-${s.id}`}
                  value={s.matcherExcludeWhen}
                  onChange={(e) =>
                    onServicesChange(updateService(services, s.id, { matcherExcludeWhen: e.target.value }))
                  }
                  rows={2}
                  maxLength={800}
                  wrap="soft"
                  placeholder="e.g. First-time chest pain — suggest emergency; acute injury — in-person."
                  className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
                />
              </div>
            </div>

            <fieldset aria-label="Channels and prices" className="flex flex-col border-0 p-0">
              <p className="mb-2 text-sm font-medium text-gray-800">
                Channels &amp; prices{" "}
                <span className="font-normal text-gray-600">· enable at least one</span>
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-3">
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
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}
