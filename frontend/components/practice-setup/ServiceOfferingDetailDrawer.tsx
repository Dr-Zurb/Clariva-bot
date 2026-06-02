"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import {
  applyAiSuggestionToDraft,
  convertLegacyHintsToExamples,
  exampleListToText,
  exampleTextToList,
} from "@/lib/service-catalog-drafts";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
} from "@/lib/service-catalog-schema";

export { formatServiceChannelSummary } from "@/lib/service-catalog-channel-format";
import type { ModalityKey } from "./service-catalog-editor-shared";
import { ModalityColumn, updateService } from "./service-catalog-editor-shared";
import type {
  AiSuggestCardV1,
  AiSuggestRequest,
  AiSuggestResponse,
  AiSuggestWarning,
  ApiSuccess,
} from "@/lib/api";
import { describeAiSuggestWarning } from "@/lib/api";
import type { AiSuggestHandler } from "./ServiceCatalogEditor";

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
  /** Plan 02 / Task 06: present when the AI suggest endpoint is available. */
  onAiSuggest?: AiSuggestHandler;
};

export function hasMatcherHints(s: ServiceOfferingDraft): boolean {
  return Boolean(
    s.matcherExamples.length > 0 ||
      s.matcherKeywords.trim() ||
      s.matcherIncludeWhen.trim() ||
      s.matcherExcludeWhen.trim()
  );
}

/**
 * Routing v2 (Task 06 / Task 07): true when this row still carries un-migrated
 * legacy matcher hints (`keywords` / `include_when`) but no v2 `examples` yet.
 * Drives the per-card migration callout in the drawer (Task 07) and the
 * catalog-level banner on the services-catalog page (Task 07).
 *
 * Exported so the page can count legacy-only rows without having to re-derive
 * the same boolean (and so this stays a single source of truth — the resolver
 * uses the equivalent precedence on the backend).
 */
export function hasUnmigratedLegacyHints(s: ServiceOfferingDraft): boolean {
  return (
    s.matcherExamples.length === 0 &&
    Boolean(s.matcherKeywords.trim() || s.matcherIncludeWhen.trim())
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
  onAiSuggest,
}: DetailDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const s = serviceId ? services.find((x) => x.id === serviceId) : undefined;

  /**
   * Plan 02 / Task 06 — inline-banner state (Trigger 2: new card describe-it-in-your-words).
   * Lives in the drawer because the row UI in the list collapses behind the modal sheet.
   */
  const [aiFreeformDescription, setAiFreeformDescription] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  /** Diff modal state for Trigger 4 (re-runnable AI on a card with existing hints). */
  const [diffPending, setDiffPending] = useState<{
    card: AiSuggestCardV1;
    warnings: AiSuggestWarning[];
  } | null>(null);

  // Reset transient AI state whenever the active card changes.
  useEffect(() => {
    setAiFreeformDescription("");
    setAiError(null);
    setDiffPending(null);
  }, [serviceId]);

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

  // Plan 02 / Task 06 — derived flags
  const aiAvailable = onAiSuggest != null && !isCatchAllRow;
  const cardHasHints = hasMatcherHints(s);
  const cardIsBlankNew =
    !s.aiSuggestionMeta &&
    !s.label.trim() &&
    !s.description.trim() &&
    !cardHasHints;
  const cardHasLegacyOnly = hasUnmigratedLegacyHints(s);

  /** Common AI call path used by both the inline banner and the sparkle button. */
  const requestSingleCard = async (
    payload: AiSuggestRequest["payload"]
  ): Promise<ApiSuccess<AiSuggestResponse> | null> => {
    if (!onAiSuggest) return null;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await onAiSuggest({ mode: "single_card", payload });
      return res;
    } catch (err) {
      const errWithStatus = err as { status?: number; message?: string };
      if (errWithStatus.status === 422) {
        setAiError(
          "Your practice profile is missing details the AI needs (specialty, etc.). Add them in Practice info first."
        );
      } else {
        setAiError(errWithStatus.message ?? "AI suggestion failed. Try again.");
      }
      return null;
    } finally {
      setAiBusy(false);
    }
  };

  const applySingleCardToActiveDraft = (
    card: AiSuggestCardV1,
    warnings: AiSuggestWarning[],
    source: "single_card" | "review_apply" = "single_card"
  ) => {
    const docFacing = warnings.map((w) => ({
      kind: w.kind,
      message: describeAiSuggestWarning(w),
    }));
    onServicesChange(
      services.map((row) =>
        row.id === s.id ? applyAiSuggestionToDraft(row, card, source, docFacing) : row
      )
    );
  };

  const handleInlineGenerate = async () => {
    if (!aiAvailable) return;
    const res = await requestSingleCard({
      label: s.label.trim() || undefined,
      freeformDescription: aiFreeformDescription.trim() || undefined,
    });
    if (!res || res.data.mode !== "single_card") return;
    const card = res.data.cards[0];
    if (!card) {
      setAiError("AI did not return a card. Try again with a clearer description.");
      return;
    }
    applySingleCardToActiveDraft(card, res.data.warnings ?? []);
    setAiFreeformDescription("");
  };

  const handleSparkleClick = async () => {
    if (!aiAvailable) return;
    const res = await requestSingleCard({
      label: s.label.trim() || undefined,
      freeformDescription: s.description.trim() || undefined,
      existingHints: {
        examples: s.matcherExamples.length > 0 ? [...s.matcherExamples] : undefined,
        keywords: s.matcherKeywords.trim() || undefined,
        include_when: s.matcherIncludeWhen.trim() || undefined,
        exclude_when: s.matcherExcludeWhen.trim() || undefined,
      },
    });
    if (!res || res.data.mode !== "single_card") return;
    const card = res.data.cards[0];
    if (!card) {
      setAiError("AI did not return a card. Try again.");
      return;
    }
    if (cardHasHints) {
      // Trigger 4: existing hints — show diff modal instead of clobbering.
      setDiffPending({ card, warnings: res.data.warnings ?? [] });
    } else {
      applySingleCardToActiveDraft(card, res.data.warnings ?? []);
    }
  };

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
            {/* Plan 02 / Task 06 — AI suggestion meta banner (post-apply, doctor-facing). */}
            {s.aiSuggestionMeta && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 sm:text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    AI suggestion applied — review before saving
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onServicesChange(
                        services.map((row) =>
                          row.id === s.id
                            ? (() => {
                                const { aiSuggestionMeta: _omit, ...rest } = row;
                                return rest as ServiceOfferingDraft;
                              })()
                            : row
                        )
                      )
                    }
                    className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Dismiss
                  </button>
                </div>
                {s.aiSuggestionMeta.warnings.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {s.aiSuggestionMeta.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Plan 02 / Task 06 — Trigger 2: inline "describe in your words" banner for blank new cards. */}
            {aiAvailable && cardIsBlankNew && (
              <div className="rounded-md border border-violet-200 bg-violet-50/70 px-2.5 py-2.5 text-xs leading-snug text-violet-950">
                <p className="font-semibold">
                  What is this service for? Let AI fill in the details.
                </p>
                <p className="mt-1 text-[11px] text-violet-900/85">
                  Describe it in plain words (e.g. <em>&quot;Acne and skin rashes for adults&quot;</em>).
                  AI will draft the service name, matching hints, scope, and per-channel prices.
                </p>
                <textarea
                  value={aiFreeformDescription}
                  onChange={(e) => setAiFreeformDescription(e.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder="e.g. Diabetes follow-ups for existing patients (medication adjustments, blood sugar review)"
                  className="mt-2 w-full resize-y rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm leading-snug"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleInlineGenerate}
                    disabled={aiBusy || !aiFreeformDescription.trim()}
                    className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
                  >
                    {aiBusy ? "Generating…" : "Generate with AI"}
                  </button>
                  <span className="text-[11px] text-violet-900/70">
                    Or just start typing the fields below.
                  </span>
                </div>
                {aiError && (
                  <p className="mt-1.5 text-[11px] text-red-700" role="alert">
                    {aiError}
                  </p>
                )}
              </div>
            )}

            {/* Plan 02 / Task 07 — Scope-aware save-time nudge.
                Shown when the current card has no routing hints and isn't the
                catch-all. Severity escalates with `scopeMode`:
                  - strict: red — matcher will route nothing; offer [Fill with AI] + [Switch to flexible]
                  - flexible: amber — matcher can still cope via label fallback; offer [Fill with AI] only
                This is advisory only; nothing persists until the doctor hits Save on the page. */}
            {aiAvailable && !isCatchAllRow && !cardHasHints && !cardIsBlankNew && (
              <div
                className={
                  s.scopeMode === "strict"
                    ? "rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-900 sm:text-xs"
                    : "rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 sm:text-xs"
                }
                role="status"
                data-testid="drawer-empty-hints-nudge"
                data-severity={s.scopeMode === "strict" ? "error" : "suggestion"}
              >
                <p className="font-semibold">
                  {s.scopeMode === "strict"
                    ? "Strict matching with no hints — the bot will route almost nothing here."
                    : "No routing hints yet — the bot may struggle to match patients correctly."}
                </p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  {s.scopeMode === "strict"
                    ? "Fix before saving or switch to flexible so the bot can at least guess from the label."
                    : "Optional — consider filling them so the matcher has something concrete to latch onto."}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSparkleClick}
                    disabled={aiBusy}
                    className={
                      s.scopeMode === "strict"
                        ? "rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                        : "rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                    }
                  >
                    {aiBusy ? "Filling…" : "Fill with AI"}
                  </button>
                  {s.scopeMode === "strict" && (
                    <button
                      type="button"
                      onClick={() =>
                        onServicesChange(
                          updateService(services, s.id, { scopeMode: "flexible" })
                        )
                      }
                      className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      Switch to flexible
                    </button>
                  )}
                </div>
              </div>
            )}

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
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-semibold text-violet-950">Matching hints (optional)</p>
                {/* Plan 02 / Task 06 — Trigger 3 (sparkle) + Trigger 4 (re-runnable diff). */}
                {aiAvailable && (
                  <button
                    type="button"
                    onClick={handleSparkleClick}
                    disabled={aiBusy}
                    title={
                      cardHasHints
                        ? "Re-run AI suggestions (you'll see a diff before it's applied)"
                        : "Auto-fill with AI based on your service name and specialty"
                    }
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60 ${
                      cardHasHints
                        ? "border border-violet-200 bg-white text-violet-800 hover:bg-violet-100"
                        : "border border-violet-300 bg-violet-600 text-white hover:bg-violet-700"
                    }`}
                  >
                    <span aria-hidden>✨</span>
                    {aiBusy ? "Thinking…" : cardHasHints ? "Re-run AI" : "Fill with AI"}
                  </button>
                )}
              </div>
              {aiError && !cardIsBlankNew && (
                <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800" role="alert">
                  {aiError}
                </p>
              )}
              <p className="text-[11px] leading-snug text-violet-900/85">
                List a few short example phrases your patients might actually send, one per line. These are the words
                the assistant looks for when routing a chat to this service. Not shown in patient fee messages. Never
                put patient names or PHI here.
              </p>
              <p className="text-[11px] leading-snug text-violet-900/80">
                Matching runs in two steps: the system first checks if a patient&apos;s message overlaps with your
                example phrases (fast). If that isn&apos;t enough to pick a service confidently, the assistant uses
                your full service list and these phrases together in a second step — so the more natural wording you
                add here, the better the matches.
              </p>
              <ExamplePhrasesField
                draft={s}
                services={services}
                onServicesChange={onServicesChange}
              />
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

              {/* Routing v2 (Task 07): always-visible migration callout for rows
                  that still have only legacy hints. Three pieces:
                    1. Non-alarming explainer — routing keeps working via the
                       resolver until the doctor saves with examples.
                    2. One-tap "Convert to example phrases" CTA — splits
                       legacy text into the v2 list (and zeros legacy fields).
                       Doctor still must hit Save on the page.
                    3. Editable legacy textareas — kept open (not behind a
                       <details>) so legacy-only rows are never blank-looking
                       in the new UI (Task 07 acceptance: "no empty matcher
                       UX for legacy-only rows").
                  Hidden once the row has at least one example phrase, since
                  draftsToCatalogOrNull then drops legacy on save anyway. */}
              {cardHasLegacyOnly && (
                <div
                  className="min-w-0 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900"
                  data-testid="drawer-legacy-hints-migration-callout"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        This service still uses older matching hints
                      </p>
                      <p className="mt-0.5 leading-snug text-amber-900/90">
                        Routing keeps working — the assistant uses your{" "}
                        <em>Keywords</em> and <em>Book this service when…</em> text below
                        until you add Example phrases above. One-tap below copies them
                        into Example phrases for you.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onServicesChange(
                          services.map((row) =>
                            row.id === s.id ? convertLegacyHintsToExamples(row) : row
                          )
                        )
                      }
                      className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      data-testid="drawer-convert-legacy-hints"
                    >
                      Convert to example phrases
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="min-w-0">
                      <FieldLabel
                        htmlFor={`drawer-svc-mkw-${s.id}`}
                        tooltip="Legacy synonyms field — superseded by Example phrases above."
                      >
                        Keywords / synonyms (legacy)
                      </FieldLabel>
                      <textarea
                        id={`drawer-svc-mkw-${s.id}`}
                        value={s.matcherKeywords}
                        onChange={(e) =>
                          onServicesChange(
                            updateService(services, s.id, { matcherKeywords: e.target.value })
                          )
                        }
                        rows={2}
                        maxLength={400}
                        wrap="soft"
                        placeholder="e.g. fever 3 days, blood sugar, diabetes follow-up"
                        className="mt-0.5 w-full resize-y rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm leading-snug"
                      />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel
                        htmlFor={`drawer-svc-minc-${s.id}`}
                        tooltip="Legacy free-text rule — superseded by Example phrases above."
                      >
                        Book this service when… (legacy)
                      </FieldLabel>
                      <textarea
                        id={`drawer-svc-minc-${s.id}`}
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
                        className="mt-0.5 w-full resize-y rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm leading-snug"
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-snug text-amber-900/75">
                    On save, once Example phrases above has at least one entry, these
                    legacy fields are dropped from the saved catalog automatically.
                  </p>
                </div>
              )}
            </div>

            {/* SFU-18: per-service scope mode control. Catch-all is locked to flexible. */}
            <fieldset
              aria-label="Scope of matching"
              className="flex min-w-0 flex-col gap-1.5 rounded-md border border-sky-100 bg-sky-50/50 p-2.5"
            >
              <legend className="px-1 text-xs font-semibold text-sky-950">
                Scope of matching
              </legend>
              {isCatchAllRow ? (
                <>
                  <div
                    role="group"
                    aria-label="Scope mode (locked for catch-all)"
                    className="inline-flex w-fit overflow-hidden rounded-md border border-sky-200 bg-white"
                  >
                    <span
                      aria-current="true"
                      className="cursor-not-allowed bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900"
                    >
                      Flexible
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-sky-900/85">
                    Always matches — cannot be changed. This row absorbs anything that does not fit your named
                    services, so patients still see prices.
                  </p>
                </>
              ) : (
                <>
                  <div
                    role="radiogroup"
                    aria-label="Scope mode"
                    className="inline-flex w-fit overflow-hidden rounded-md border border-sky-200 bg-white"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={s.scopeMode === "strict"}
                      onClick={() =>
                        onServicesChange(updateService(services, s.id, { scopeMode: "strict" }))
                      }
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        s.scopeMode === "strict"
                          ? "bg-sky-600 text-white"
                          : "bg-white text-sky-900 hover:bg-sky-50"
                      }`}
                      title="Only route patients here when their complaint matches your keywords / include_when hints. Prevents over-generalization."
                    >
                      Strict
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={s.scopeMode === "flexible"}
                      onClick={() =>
                        onServicesChange(updateService(services, s.id, { scopeMode: "flexible" }))
                      }
                      className={`border-l border-sky-200 px-3 py-1 text-xs font-medium transition-colors ${
                        s.scopeMode === "flexible"
                          ? "bg-sky-600 text-white"
                          : "bg-white text-sky-900 hover:bg-sky-50"
                      }`}
                      title="Allow broader category matching beyond the listed hints. Good for general-purpose rows."
                    >
                      Flexible
                    </button>
                  </div>
                  <p className="text-[11px] leading-snug text-sky-900/85">
                    <span className="font-medium">Strict</span> only routes complaints that match your keywords or
                    include-when hints — anything else goes to another row or <em>Other / not listed</em>.{" "}
                    <span className="font-medium">Flexible</span> lets the assistant also match related complaints
                    in the same category. New services default to Strict; existing services default to Flexible
                    until you change them here.
                  </p>
                </>
              )}
            </fieldset>

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

      {/* Plan 02 / Task 06 — Trigger 4: re-runnable AI diff modal. */}
      {diffPending && (
        <AiSuggestionDiffModal
          current={s}
          suggestion={diffPending.card}
          warnings={diffPending.warnings}
          onCancel={() => setDiffPending(null)}
          onApplyAll={() => {
            applySingleCardToActiveDraft(diffPending.card, diffPending.warnings, "single_card");
            setDiffPending(null);
          }}
          onApplyPartial={(patched) => {
            applySingleCardToActiveDraft(patched, diffPending.warnings, "single_card");
            setDiffPending(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Plan 02 / Task 06 — diff modal
// ============================================================================

type DiffField =
  | "scope_mode"
  | "description"
  | "matcherExamples"
  | "matcherKeywords"
  | "matcherIncludeWhen"
  | "matcherExcludeWhen";

type DiffModalProps = {
  current: ServiceOfferingDraft;
  suggestion: AiSuggestCardV1;
  warnings: AiSuggestWarning[];
  onCancel: () => void;
  onApplyAll: () => void;
  /** Caller receives a `suggestion`-shaped patch with only the kept fields populated. */
  onApplyPartial: (partial: AiSuggestCardV1) => void;
};

function AiSuggestionDiffModal({
  current,
  suggestion,
  warnings,
  onCancel,
  onApplyAll,
  onApplyPartial,
}: DiffModalProps) {
  // Default: every changed field is "accepted"; doctor can opt-out per field.
  const suggestedExamples = useMemo(
    () => (suggestion.matcher_hints?.examples ?? []).map((p) => p.trim()).filter((p) => p.length > 0),
    [suggestion]
  );
  const initialKeep: Record<DiffField, boolean> = useMemo(
    () => ({
      scope_mode: (suggestion.scope_mode ?? null) !== current.scopeMode,
      description: (suggestion.description?.trim() ?? "") !== current.description.trim(),
      matcherExamples:
        suggestedExamples.length > 0 &&
        JSON.stringify(suggestedExamples) !== JSON.stringify(current.matcherExamples),
      matcherKeywords:
        (suggestion.matcher_hints?.keywords?.trim() ?? "") !== current.matcherKeywords.trim(),
      matcherIncludeWhen:
        (suggestion.matcher_hints?.include_when?.trim() ?? "") !== current.matcherIncludeWhen.trim(),
      matcherExcludeWhen:
        (suggestion.matcher_hints?.exclude_when?.trim() ?? "") !== current.matcherExcludeWhen.trim(),
    }),
    [current, suggestion, suggestedExamples]
  );
  const [keep, setKeep] = useState<Record<DiffField, boolean>>(initialKeep);

  const anyChange =
    initialKeep.scope_mode ||
    initialKeep.description ||
    initialKeep.matcherExamples ||
    initialKeep.matcherKeywords ||
    initialKeep.matcherIncludeWhen ||
    initialKeep.matcherExcludeWhen;

  const buildPartialPatch = (): AiSuggestCardV1 => {
    const patch: AiSuggestCardV1 = {
      service_key: suggestion.service_key,
      label: suggestion.label,
      modalities: suggestion.modalities,
    };
    if (keep.scope_mode && suggestion.scope_mode) {
      patch.scope_mode = suggestion.scope_mode;
    }
    if (keep.description) {
      patch.description = suggestion.description ?? current.description;
    } else if (current.description) {
      patch.description = current.description;
    }
    const hints: NonNullable<AiSuggestCardV1["matcher_hints"]> = {};
    /**
     * Routing v2 (Task 06) — when the doctor opts to keep AI-suggested
     * `examples`, hand them through verbatim so {@link applyAiSuggestionToDraft}
     * adopts the v2 list (and consequently zeros the legacy fields). When the
     * doctor opts out, echo back the current draft examples so the apply path
     * leaves them alone.
     */
    if (keep.matcherExamples && suggestedExamples.length > 0) {
      hints.examples = suggestedExamples;
    } else if (current.matcherExamples.length > 0) {
      hints.examples = [...current.matcherExamples];
    }
    hints.keywords = keep.matcherKeywords
      ? suggestion.matcher_hints?.keywords ?? current.matcherKeywords
      : current.matcherKeywords;
    hints.include_when = keep.matcherIncludeWhen
      ? suggestion.matcher_hints?.include_when ?? current.matcherIncludeWhen
      : current.matcherIncludeWhen;
    hints.exclude_when = keep.matcherExcludeWhen
      ? suggestion.matcher_hints?.exclude_when ?? current.matcherExcludeWhen
      : current.matcherExcludeWhen;
    patch.matcher_hints = hints;
    return patch;
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-3"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare AI suggestions"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Review AI suggestions for &ldquo;{current.label.trim() || suggestion.label}&rdquo;
            </h3>
            <p className="mt-0.5 text-xs text-gray-600">
              Pick what to keep. Nothing is saved until you click Save on the catalog page.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        {warnings.length > 0 && (
          <ul className="border-b border-amber-100 bg-amber-50/70 px-4 py-2 text-[11px] text-amber-900">
            {warnings.map((w, i) => (
              <li key={i}>• {describeAiSuggestWarning(w)}</li>
            ))}
          </ul>
        )}

        <div className="space-y-3 px-4 py-3">
          {!anyChange && (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              No differences — the AI suggestion matches your current values.
            </p>
          )}

          {/* scope_mode highlighted at the top per spec. */}
          {initialKeep.scope_mode && (
            <DiffRow
              label="Scope mode (most consequential)"
              currentText={current.scopeMode}
              suggestedText={suggestion.scope_mode ?? "—"}
              keepSuggestion={keep.scope_mode}
              onToggle={() => setKeep((p) => ({ ...p, scope_mode: !p.scope_mode }))}
              highlight
            />
          )}
          {initialKeep.description && (
            <DiffRow
              label="Description"
              currentText={current.description || "(empty)"}
              suggestedText={suggestion.description ?? ""}
              keepSuggestion={keep.description}
              onToggle={() => setKeep((p) => ({ ...p, description: !p.description }))}
            />
          )}
          {initialKeep.matcherExamples && (
            <DiffRow
              label="Example phrases"
              currentText={
                current.matcherExamples.length > 0 ? current.matcherExamples.join("\n") : "(empty)"
              }
              suggestedText={suggestedExamples.join("\n")}
              keepSuggestion={keep.matcherExamples}
              onToggle={() => setKeep((p) => ({ ...p, matcherExamples: !p.matcherExamples }))}
            />
          )}
          {initialKeep.matcherKeywords && (
            <DiffRow
              label="Keywords"
              currentText={current.matcherKeywords || "(empty)"}
              suggestedText={suggestion.matcher_hints?.keywords ?? ""}
              keepSuggestion={keep.matcherKeywords}
              onToggle={() => setKeep((p) => ({ ...p, matcherKeywords: !p.matcherKeywords }))}
            />
          )}
          {initialKeep.matcherIncludeWhen && (
            <DiffRow
              label="Book this service when…"
              currentText={current.matcherIncludeWhen || "(empty)"}
              suggestedText={suggestion.matcher_hints?.include_when ?? ""}
              keepSuggestion={keep.matcherIncludeWhen}
              onToggle={() =>
                setKeep((p) => ({ ...p, matcherIncludeWhen: !p.matcherIncludeWhen }))
              }
            />
          )}
          {initialKeep.matcherExcludeWhen && (
            <DiffRow
              label="Not this service when…"
              currentText={current.matcherExcludeWhen || "(empty)"}
              suggestedText={suggestion.matcher_hints?.exclude_when ?? ""}
              keepSuggestion={keep.matcherExcludeWhen}
              onToggle={() =>
                setKeep((p) => ({ ...p, matcherExcludeWhen: !p.matcherExcludeWhen }))
              }
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={() => onApplyPartial(buildPartialPatch())}
            disabled={!anyChange}
            className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
          >
            Apply selected
          </button>
          <button
            type="button"
            onClick={onApplyAll}
            disabled={!anyChange}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            Apply all
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Routing v2 (Task 06) — Example phrases primary input
// ============================================================================

/**
 * Newline-separated textarea editor for `matcherExamples`. Local state keeps
 * the raw textarea contents so an in-progress phrase isn't dropped while the
 * user is typing; we re-normalize into the draft array on every change so
 * downstream consumers always see schema-valid (trimmed, deduped, clamped)
 * phrases. The chip preview underneath the textarea makes the array shape
 * visible to the doctor and lets them see when a duplicate or empty line was
 * collapsed away.
 */
function ExamplePhrasesField({
  draft,
  services,
  onServicesChange,
}: {
  draft: ServiceOfferingDraft;
  services: ServiceOfferingDraft[];
  onServicesChange: (next: ServiceOfferingDraft[]) => void;
}) {
  const inputId = `drawer-svc-mexamples-${draft.id}`;
  const [text, setText] = useState<string>(() => exampleListToText(draft.matcherExamples));
  const lastSyncedListRef = useRef<string>(JSON.stringify(draft.matcherExamples));

  // Re-sync when the parent draft changes from outside (e.g. AI suggest applied).
  useEffect(() => {
    const incoming = JSON.stringify(draft.matcherExamples);
    if (incoming !== lastSyncedListRef.current) {
      lastSyncedListRef.current = incoming;
      setText(exampleListToText(draft.matcherExamples));
    }
  }, [draft.matcherExamples]);

  const phrases = useMemo(() => exampleTextToList(text), [text]);
  const remaining = MATCHER_HINT_EXAMPLES_MAX_COUNT - phrases.length;
  const hitCap = phrases.length >= MATCHER_HINT_EXAMPLES_MAX_COUNT;

  const handleChange = (next: string) => {
    setText(next);
    const normalized = exampleTextToList(next);
    const serialized = JSON.stringify(normalized);
    if (serialized !== JSON.stringify(draft.matcherExamples)) {
      lastSyncedListRef.current = serialized;
      onServicesChange(updateService(services, draft.id, { matcherExamples: normalized }));
    }
  };

  const handleRemoveChip = (idx: number) => {
    const next = phrases.filter((_, i) => i !== idx);
    setText(exampleListToText(next));
    lastSyncedListRef.current = JSON.stringify(next);
    onServicesChange(updateService(services, draft.id, { matcherExamples: next }));
  };

  return (
    <div className="min-w-0">
      <FieldLabel
        htmlFor={inputId}
        tooltip="Short patient-style phrases — one per line. Example: 'fever for 3 days' or 'sugar going up'."
      >
        Example phrases
      </FieldLabel>
      <textarea
        id={inputId}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        wrap="soft"
        placeholder={
          "One phrase per line, e.g.\n" +
          "fever for 3 days\n" +
          "sugar going up\n" +
          "BP medicine refill"
        }
        className="mt-0.5 w-full resize-y rounded-md border border-violet-200/80 bg-white px-2 py-1.5 text-sm leading-snug"
        data-testid="drawer-example-phrases-input"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-violet-900/80">
        <span>
          {phrases.length} phrase{phrases.length === 1 ? "" : "s"}
          {hitCap ? " (max reached)" : remaining <= 5 ? ` · ${remaining} left` : ""}
        </span>
        <span className="text-violet-900/60">Patients&apos; words work better than clinical jargon.</span>
      </div>
      {phrases.length > 0 && (
        <ul
          className="mt-1.5 flex flex-wrap gap-1"
          aria-label="Current example phrases"
          data-testid="drawer-example-phrases-chips"
        >
          {phrases.map((p, i) => (
            <li
              key={`${i}-${p}`}
              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-900"
            >
              <span className="max-w-[18ch] truncate" title={p}>
                {p}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveChip(i)}
                aria-label={`Remove example phrase: ${p}`}
                className="rounded text-violet-700 hover:text-violet-900 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffRow({
  label,
  currentText,
  suggestedText,
  keepSuggestion,
  onToggle,
  highlight,
}: {
  label: string;
  currentText: string;
  suggestedText: string;
  keepSuggestion: boolean;
  onToggle: () => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-800">{label}</p>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
          <input
            type="checkbox"
            checked={keepSuggestion}
            onChange={onToggle}
            className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          />
          Apply this field
        </label>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] leading-snug text-gray-700">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Current</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words">{currentText}</p>
        </div>
        <div className="rounded border border-violet-200 bg-violet-50/60 px-2 py-1.5 text-[11px] leading-snug text-violet-900">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">AI suggested</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words">{suggestedText || "(empty)"}</p>
        </div>
      </div>
    </div>
  );
}
