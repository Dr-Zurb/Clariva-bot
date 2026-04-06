"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ServiceStaffReviewListItem,
  ServiceStaffReviewListQueryStatus,
} from "@/types/service-staff-review";
import type { DoctorSettings } from "@/types/doctor-settings";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import {
  getServiceStaffReviews,
  postCancelServiceStaffReview,
  postConfirmServiceStaffReview,
  postReassignServiceStaffReview,
} from "@/lib/api";
import {
  formatCandidateSummary,
  matchExplanationSummary,
  matchReasonChipMeta,
  parseCandidateLabels,
  parseMatchReasonCodes,
} from "@/lib/staff-review-match-explain";

function slaTimeRemainingLabel(iso: string): string {
  const end = new Date(iso).getTime();
  const now = Date.now();
  const ms = end - now;
  if (Number.isNaN(end)) return "—";
  if (ms <= 0) return "Overdue";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 72) return `${Math.ceil(h / 24)} days left`;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${Math.max(1, m)} min left`;
}

function labelForServiceKey(
  catalog: ServiceCatalogV1 | null | undefined,
  key: string
): string | null {
  if (!catalog?.services?.length) return null;
  const k = key.trim().toLowerCase();
  const s = catalog.services.find((x) => x.service_key === k);
  return s?.label ?? null;
}

function confidenceClass(conf: string): string {
  const c = conf.toLowerCase();
  if (c === "high") return "bg-emerald-100 text-emerald-800";
  if (c === "medium") return "bg-amber-100 text-amber-900";
  return "bg-orange-100 text-orange-900";
}

function formatResolvedAt(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function rowStatusLabel(status: ServiceStaffReviewListItem["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "reassigned":
      return "Reassigned";
    case "cancelled_by_staff":
      return "Cancelled (staff)";
    case "cancelled_timeout":
      return "Cancelled (timeout)";
    default:
      return status;
  }
}

const INBOX_TABS: { id: ServiceStaffReviewListQueryStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "reassigned", label: "Reassigned" },
  { id: "cancelled", label: "Cancelled" },
];

export interface ServiceReviewsInboxProps {
  initialReviews: ServiceStaffReviewListItem[];
  settings: DoctorSettings | null;
  token: string;
}

type DialogState =
  | null
  | { mode: "reassign"; review: ServiceStaffReviewListItem }
  | { mode: "cancel"; review: ServiceStaffReviewListItem };

/**
 * ARM-07: doctor inbox for pending AI service-match reviews (confirm / reassign / cancel).
 * PHI is shown only in-session; avoid console logging patient or reason text.
 */
export function ServiceReviewsInbox({
  initialReviews,
  settings,
  token,
}: ServiceReviewsInboxProps) {
  const catalog = settings?.service_offerings_json ?? null;
  const [activeTab, setActiveTab] = useState<ServiceStaffReviewListQueryStatus>("pending");
  const [reviews, setReviews] = useState(initialReviews);
  /** Which tab the current `reviews` rows belong to (last applied successful fetch only). */
  const [dataTab, setDataTab] = useState<ServiceStaffReviewListQueryStatus>("pending");
  /** Monotonic id so out-of-order HTTP responses cannot overwrite the UI after a newer tab load starts. */
  const loadGenRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  const isPendingTab = activeTab === "pending";
  const tableColCount = isPendingTab ? 6 : 7;
  /** Avoid empty state + wrong columns while the list for the selected tab is still in flight. */
  const dataStale = refreshing && activeTab !== dataTab;

  const loadTab = useCallback(
    async (tab: ServiceStaffReviewListQueryStatus) => {
      const gen = ++loadGenRef.current;
      setRefreshing(true);
      try {
        const res = await getServiceStaffReviews(token, tab);
        if (gen !== loadGenRef.current) return;
        const rows = res.data.reviews;
        setReviews(rows);
        setDataTab(tab);
      } finally {
        if (gen === loadGenRef.current) {
          setRefreshing(false);
        }
      }
    },
    [token]
  );

  const refresh = useCallback(async () => {
    await loadTab(activeTab);
  }, [loadTab, activeTab]);

  const selectTab = (tab: ServiceStaffReviewListQueryStatus) => {
    setActiveTab(tab);
    void loadTab(tab);
  };

  const runAction = async (
    reviewId: string,
    fn: () => Promise<unknown>,
    okMessage: string
  ): Promise<boolean> => {
    setBusyId(reviewId);
    setBanner(null);
    try {
      await fn();
      setBanner({
        kind: "ok",
        text: okMessage,
      });
      await loadTab(activeTab);
      return true;
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
      if (status === 409) {
        setBanner({
          kind: "err",
          text: "This request was already resolved. The list has been refreshed.",
        });
        await loadTab(activeTab);
        return true;
      }
      setBanner({
        kind: "err",
        text: "Something went wrong. Please try again.",
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const onConfirm = (r: ServiceStaffReviewListItem) => {
    void runAction(
      r.id,
      () => postConfirmServiceStaffReview(token, r.id, {}),
      "Saved. We messaged the patient on Instagram with a link to pick a time and finish booking (opens your booking page)."
    );
  };

  const okReassign =
    "Saved. We messaged the patient on Instagram with a link to pick a time and finish booking.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Service match reviews</h1>
          <p className="mt-1 text-sm text-gray-600">
            Confirm AI-suggested visit types from Instagram bookings; once confirmed, patients get a
            booking link in the same chat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div
        className="flex flex-wrap gap-2 border-b border-gray-200 pb-2"
        role="tablist"
        aria-label="Review status"
      >
        {INBOX_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => selectTab(t.id)}
            className={
              activeTab === t.id
                ? "rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 ring-1 ring-blue-200"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {banner && (
        <div
          role="status"
          className={
            banner.kind === "ok"
              ? "rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"
              : "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          }
        >
          {banner.text}
        </div>
      )}

      {dataStale ? (
        <div
          className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-gray-800">Loading reviews…</p>
          <p className="mt-1 text-xs text-gray-500">
            {INBOX_TABS.find((x) => x.id === activeTab)?.label ?? "This view"} will appear here in a
            moment.
          </p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="font-medium text-gray-900">
            {activeTab === "pending"
              ? "No pending reviews"
              : `No ${INBOX_TABS.find((x) => x.id === activeTab)?.label.toLowerCase() ?? "matching"} reviews`}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {activeTab === "pending"
              ? "When the bot is unsure about a visit type, requests appear here. Tune matcher hints in your catalog to reduce low-confidence matches."
              : "Resolved requests stay here for your records. Switch tabs to see other outcomes."}
          </p>
          {activeTab === "pending" && (
            <Link
              href="/dashboard/settings/practice-setup/services-catalog"
              className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Open services catalog
            </Link>
          )}
        </div>
      ) : (
        <div
          className={`overflow-x-auto rounded-lg border border-gray-200 shadow-sm transition-opacity duration-150 ${
            refreshing && !dataStale ? "opacity-75" : ""
          }`}
        >
          <table
            className="min-w-full divide-y divide-gray-200 text-left text-sm"
            aria-busy={refreshing}
            aria-label="Service match reviews"
          >
            <caption className="sr-only">
              {isPendingTab
                ? "Pending reviews sorted by SLA deadline"
                : "Resolved reviews sorted by resolved time"}
            </caption>
            <thead className="bg-gray-50">
              <tr>
                {!isPendingTab && (
                  <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                    Outcome
                  </th>
                )}
                <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                  Patient
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                  Reason (preview)
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                  AI proposal
                </th>
                {!isPendingTab && (
                  <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                    Final visit type
                  </th>
                )}
                <th scope="col" className="min-w-[14rem] px-4 py-3 font-medium text-gray-700">
                  Match (AI signals)
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                  {isPendingTab ? "SLA" : "Resolved"}
                </th>
                {isPendingTab && (
                  <th scope="col" className="px-4 py-3 font-medium text-gray-700">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {reviews.map((r) => {
                const propLabel = labelForServiceKey(catalog, r.proposed_catalog_service_key);
                const finalKey = r.final_catalog_service_key?.trim();
                const finalLabel = finalKey ? labelForServiceKey(catalog, finalKey) : null;
                const patientLabel =
                  r.patient_display_name?.trim() ||
                  (r.patient_id ? `Patient ${r.patient_id.slice(0, 8)}…` : "—");
                const disabled = busyId === r.id;
                const reasonCodes = parseMatchReasonCodes(r.match_reason_codes);
                const candidates = parseCandidateLabels(r.candidate_labels);
                const matchSummary = matchExplanationSummary(reasonCodes, r.match_confidence);
                const candidateLine = formatCandidateSummary(candidates);
                return (
                  <Fragment key={r.id}>
                  <tr>
                    {!isPendingTab && (
                      <td className="px-4 py-3 text-gray-700">
                        <span className="text-xs font-medium text-gray-600">{rowStatusLabel(r.status)}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {r.patient_id ? (
                        <Link
                          href={`/dashboard/patients/${r.patient_id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {patientLabel}
                        </Link>
                      ) : (
                        <span>{patientLabel}</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3 text-gray-700">
                      {r.reason_for_visit_preview ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      <span className="font-medium">{propLabel ?? r.proposed_catalog_service_key}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({r.proposed_catalog_service_key})
                      </span>
                    </td>
                    {!isPendingTab && (
                      <td className="px-4 py-3 text-gray-800">
                        {finalKey ? (
                          <>
                            <span className="font-medium">{finalLabel ?? finalKey}</span>
                            <span className="ml-2 text-xs text-gray-500">({finalKey})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="max-w-[17rem] px-4 py-3 align-top text-gray-800">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${confidenceClass(r.match_confidence)}`}
                      >
                        {r.match_confidence}
                      </span>
                      <p className="mt-1.5 text-xs leading-snug text-gray-600">{matchSummary}</p>
                      {reasonCodes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1" role="list" aria-label="Match reason codes">
                          {reasonCodes.map((code) => {
                            const m = matchReasonChipMeta(code);
                            return (
                              <span
                                key={code}
                                role="listitem"
                                title={m.detail}
                                className="inline-flex max-w-full cursor-help rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-800"
                              >
                                {m.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {candidateLine && (
                        <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                          <span className="font-medium text-gray-600">Alternatives: </span>
                          {candidateLine}
                        </p>
                      )}
                      <button
                        type="button"
                        className="mt-1.5 text-left text-[11px] font-medium text-blue-700 hover:underline"
                        aria-expanded={expandedReviewId === r.id}
                        onClick={() =>
                          setExpandedReviewId((id) => (id === r.id ? null : r.id))
                        }
                      >
                        {expandedReviewId === r.id ? "Hide technical detail" : "Show technical detail"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {isPendingTab
                        ? slaTimeRemainingLabel(r.sla_deadline_at)
                        : formatResolvedAt(r.resolved_at)}
                    </td>
                    {isPendingTab && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onConfirm(r)}
                            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setDialog({ mode: "reassign", review: r })}
                            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Reassign
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setDialog({ mode: "cancel", review: r })}
                            className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {expandedReviewId === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={tableColCount} className="px-4 py-3 text-sm text-gray-800">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Matcher signals (technical)
                        </p>
                        {reasonCodes.length === 0 ? (
                          <p className="mt-2 text-sm text-gray-600">No reason codes stored.</p>
                        ) : (
                          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
                            {reasonCodes.map((code) => {
                              const m = matchReasonChipMeta(code);
                              return (
                                <li key={code}>
                                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-800">
                                    {code}
                                  </code>
                                  <span className="font-medium"> — {m.label}.</span> {m.detail}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {candidates.length > 0 && (
                          <>
                            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Candidate services considered
                            </p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                              {candidates.map((c) => (
                                <li key={`${c.service_key}-${c.label}`}>
                                  {c.label}{" "}
                                  <span className="text-gray-500">({c.service_key})</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.mode === "reassign" && (
        <ReassignDialog
          key={dialog.review.id}
          catalog={catalog}
          review={dialog.review}
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => {
            const ok = await runAction(
              dialog.review.id,
              () => postReassignServiceStaffReview(token, dialog.review.id, payload),
              okReassign
            );
            if (ok) setDialog(null);
          }}
        />
      )}

      {dialog?.mode === "cancel" && (
        <CancelDialog
          review={dialog.review}
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            const ok = await runAction(
              dialog.review.id,
              () => postCancelServiceStaffReview(token, dialog.review.id, { note }),
              "Saved. No booking link was sent. The patient can keep chatting in Instagram if they need help."
            );
            if (ok) setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ReassignDialog({
  catalog,
  review,
  onClose,
  onSubmit,
}: {
  catalog: ServiceCatalogV1 | null;
  review: ServiceStaffReviewListItem;
  onClose: () => void;
  onSubmit: (body: {
    catalogServiceKey: string;
    catalogServiceId?: string;
    consultationModality?: "text" | "voice" | "video";
    matcherHints: {
      keywords: string;
      include_when: string;
      exclude_when: string;
    };
  }) => Promise<void>;
}) {
  const MATCHER_KW_MAX = 400;
  const MATCHER_TX_MAX = 800;
  const services = catalog?.services ?? [];
  const want = review.proposed_catalog_service_key.trim().toLowerCase();
  const defaultKey =
    services.find((s) => s.service_key === want)?.service_key ?? services[0]?.service_key ?? "";
  const [serviceKey, setServiceKey] = useState(defaultKey);
  const [modality, setModality] = useState<"" | "text" | "voice" | "video">(
    review.proposed_consultation_modality ?? ""
  );
  const [hintKeywords, setHintKeywords] = useState("");
  const [hintInclude, setHintInclude] = useState("");
  const [hintExclude, setHintExclude] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedOffering = services.find((s) => s.service_key === serviceKey.trim().toLowerCase());
  const catalogReady = Boolean(catalog?.services?.length);

  /** Refill from catalog when the selected service changes or catalog first becomes available (not on every catalog object identity change). */
  useEffect(() => {
    if (!catalog?.services?.length) return;
    const o = catalog.services.find(
      (s) => s.service_key.trim().toLowerCase() === serviceKey.trim().toLowerCase()
    );
    const h = o?.matcher_hints;
    setHintKeywords(h?.keywords ?? "");
    setHintInclude(h?.include_when ?? "");
    setHintExclude(h?.exclude_when ?? "");
  }, [serviceKey, catalogReady]);

  const submit = async () => {
    const key = serviceKey.trim().toLowerCase();
    if (!selectedOffering) return;
    setSaving(true);
    try {
      await onSubmit({
        catalogServiceKey: key,
        catalogServiceId: selectedOffering.service_id,
        consultationModality: modality || undefined,
        matcherHints: {
          keywords: hintKeywords,
          include_when: hintInclude,
          exclude_when: hintExclude,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-labelledby="reassign-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="reassign-title" className="text-lg font-semibold text-gray-900">
          Reassign service
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose a visit type from your catalog. The patient will be able to book with the new
          selection.
        </p>
        {services.length === 0 ? (
          <p className="mt-4 text-sm text-red-700">
            No catalog loaded. Add services in Practice setup first.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700" htmlFor="reassign-service">
              Catalog service
            </label>
            <select
              id="reassign-service"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={serviceKey}
              onChange={(e) => setServiceKey(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.service_id} value={s.service_key}>
                  {s.label} ({s.service_key})
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-gray-700" htmlFor="reassign-modality">
              Consultation modality (optional)
            </label>
            <select
              id="reassign-modality"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={modality}
              onChange={(e) => setModality(e.target.value as typeof modality)}
            >
              <option value="">—</option>
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="video">Video</option>
            </select>
            <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3">
              <p className="text-sm font-medium text-gray-900">Matching hints (catalog)</p>
              <p className="mt-1 text-sm text-gray-700">
                Same fields as Practice setup for this visit type. Edits here update your service
                catalog and help the AI map patients to the right service.
              </p>
              <p className="mt-2 text-xs text-amber-800">
                Plain language only. Do not include patient names, identifiers, or other PHI.
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    className="block text-xs font-medium text-gray-700"
                    htmlFor="reassign-hint-kw"
                  >
                    Keywords ({hintKeywords.length}/{MATCHER_KW_MAX})
                  </label>
                  <textarea
                    id="reassign-hint-kw"
                    rows={2}
                    maxLength={MATCHER_KW_MAX}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={hintKeywords}
                    onChange={(e) => setHintKeywords(e.target.value)}
                    placeholder="e.g. skin rash, tele-derm"
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-medium text-gray-700"
                    htmlFor="reassign-hint-inc"
                  >
                    Include when ({hintInclude.length}/{MATCHER_TX_MAX})
                  </label>
                  <textarea
                    id="reassign-hint-inc"
                    rows={2}
                    maxLength={MATCHER_TX_MAX}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={hintInclude}
                    onChange={(e) => setHintInclude(e.target.value)}
                    placeholder="When this visit type should be preferred"
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-medium text-gray-700"
                    htmlFor="reassign-hint-exc"
                  >
                    Exclude when ({hintExclude.length}/{MATCHER_TX_MAX})
                  </label>
                  <textarea
                    id="reassign-hint-exc"
                    rows={2}
                    maxLength={MATCHER_TX_MAX}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={hintExclude}
                    onChange={(e) => setHintExclude(e.target.value)}
                    placeholder="When another service is a better fit"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || services.length === 0 || !selectedOffering}
            onClick={() => void submit()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save reassignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({
  review: _review,
  onClose,
  onSubmit,
}: {
  review: ServiceStaffReviewListItem;
  onClose: () => void;
  onSubmit: (note?: string) => Promise<void>;
}) {
  void _review;
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(note.trim() || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-labelledby="cancel-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="cancel-title" className="text-lg font-semibold text-gray-900">
          Cancel review
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          The patient will not get a finalized visit type from this proposal. They can continue the
          conversation in Instagram.
        </p>
        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="cancel-note">
          Internal note (optional)
        </label>
        <textarea
          id="cancel-note"
          rows={2}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For your team only"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Cancel request"}
          </button>
        </div>
      </div>
    </div>
  );
}
