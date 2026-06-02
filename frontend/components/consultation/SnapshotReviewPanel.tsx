"use client";

/**
 * `<SnapshotReviewPanel>` — doctor's post-call snapshot review surface
 * (Sub-batch D · task-video-D3).
 *
 * Lists every snapshot captured during the session as a thumbnail grid.
 * Click a thumbnail to expand the modal preview with per-snapshot
 * actions:
 *
 *   - Section radio (Decision §19): Subjective / Objective / Assessment
 *     / Plan / Attachments
 *   - "Save to section" — calls
 *     POST /:sessionId/snapshots/:snapshotId/attach-to-section
 *   - "Discard" — soft-deletes via
 *     POST /:sessionId/snapshots/:snapshotId/discard
 *
 * AUDIT-DRIVEN PHASE 1 SHAPE:
 *
 *   - Annotations (C4) are already burned into the JPEG at capture
 *     time. The modal renders the JPEG as-is — no canvas re-composite.
 *     The structured `metadata.annotations` is preserved for future
 *     re-rendering / audit but isn't exposed in v1 UI.
 *
 *   - "Save to section" persists ON the snapshot row's metadata
 *     (`metadata.clinical_section`). No separate clinical-record
 *     table exists today; when SOAP infrastructure ships, the
 *     reprojection reads this field. v1 UI surfaces the assignment
 *     as a small badge on the thumbnail so the doctor can see at a
 *     glance which sections are filled.
 *
 *   - Discard is soft-delete only — the row stays in
 *     consultation_messages with `discarded_at`. The gallery hides
 *     discarded rows by default (`includeDiscarded=false` query param)
 *     to keep the doctor's review focused; restore-from-discard is a
 *     v2 affordance.
 *
 *   - Doctor-only on the backend; mounting in patient routes is a
 *     defense-in-depth no-op (the backend rejects non-doctor JWTs).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attachConsultSnapshotToSection,
  CLINICAL_SECTIONS,
  discardConsultSnapshot,
  listConsultSnapshots,
  type ClinicalSection,
  type SnapshotReviewItem,
} from "@/lib/api";
import { formatTime as formatTimePinned } from "@/lib/format-date";

export interface SnapshotReviewPanelProps {
  sessionId: string;
  /** Doctor's Supabase JWT. Backend rejects non-doctor callers. */
  doctorJwt: string;
  /** Optional className passthrough for the outer section. */
  className?: string;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "loaded"; items: SnapshotReviewItem[] }
  | { phase: "error"; error: string };

type ModalState =
  | { open: false }
  | {
      open: true;
      snapshot: SnapshotReviewItem;
      pendingSection: ClinicalSection | null;
      saving: boolean;
      discarding: boolean;
      actionError: string | null;
    };

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return formatTimePinned(d);
}

export default function SnapshotReviewPanel({
  sessionId,
  doctorJwt,
  className,
}: SnapshotReviewPanelProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [modal, setModal] = useState<ModalState>({ open: false });

  const reload = useCallback(
    async (signal?: { cancelled: boolean }) => {
      try {
        // Hide discarded by default — the gallery wants the active subset.
        const res = await listConsultSnapshots(sessionId, doctorJwt, false);
        if (signal?.cancelled) return;
        setState({ phase: "loaded", items: res.data.items });
      } catch (err) {
        if (signal?.cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not load snapshots";
        setState({ phase: "error", error: message });
      }
    },
    [sessionId, doctorJwt],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void reload(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [reload]);

  const items = useMemo(
    () =>
      state.phase === "loaded"
        ? state.items.filter((s) => !s.discardedAt)
        : [],
    [state],
  );

  const sectionTallies = useMemo(() => {
    const tallies: Record<ClinicalSection, number> = {
      Subjective: 0,
      Objective: 0,
      Assessment: 0,
      Plan: 0,
      Attachments: 0,
    };
    for (const s of items) {
      if (s.clinicalSection) tallies[s.clinicalSection] += 1;
    }
    return tallies;
  }, [items]);

  const openModal = useCallback((snapshot: SnapshotReviewItem) => {
    setModal({
      open: true,
      snapshot,
      pendingSection: snapshot.clinicalSection,
      saving: false,
      discarding: false,
      actionError: null,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal({ open: false });
  }, []);

  const handleSave = useCallback(async () => {
    if (!modal.open) return;
    if (!modal.pendingSection) return;
    setModal((m) =>
      m.open ? { ...m, saving: true, actionError: null } : m,
    );
    try {
      await attachConsultSnapshotToSection(
        sessionId,
        modal.snapshot.snapshotId,
        modal.pendingSection,
        doctorJwt,
      );
      // Refresh + close the modal so the gallery thumbnail reflects
      // the new section badge.
      await reload();
      setModal({ open: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save section";
      setModal((m) =>
        m.open ? { ...m, saving: false, actionError: message } : m,
      );
    }
  }, [modal, sessionId, doctorJwt, reload]);

  const handleDiscard = useCallback(async () => {
    if (!modal.open) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Discard this snapshot? It will be hidden from the clinical record (audit log preserved).",
          );
    if (!confirmed) return;
    setModal((m) =>
      m.open ? { ...m, discarding: true, actionError: null } : m,
    );
    try {
      await discardConsultSnapshot(
        sessionId,
        modal.snapshot.snapshotId,
        doctorJwt,
      );
      await reload();
      setModal({ open: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not discard snapshot";
      setModal((m) =>
        m.open ? { ...m, discarding: false, actionError: message } : m,
      );
    }
  }, [modal, sessionId, doctorJwt, reload]);

  return (
    <section
      aria-labelledby={`snapshot-review-${sessionId}-heading`}
      className={[
        "rounded-lg border border-gray-200 bg-white p-4",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3
          id={`snapshot-review-${sessionId}-heading`}
          className="text-sm font-semibold text-gray-900"
        >
          Snapshot review
        </h3>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          Doctor only
        </span>
      </header>

      {state.phase === "loading" ? (
        <p className="mt-3 text-sm text-gray-500">Loading snapshots…</p>
      ) : null}

      {state.phase === "error" ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.phase === "loaded" && items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          No snapshots were captured during this consult.
        </p>
      ) : null}

      {state.phase === "loaded" && items.length > 0 ? (
        <>
          <p className="mt-2 text-xs text-gray-500">
            Tap a snapshot to assign it to a clinical section or discard it.
            Discarded snapshots are hidden from the clinical record but
            remain in the audit log.
          </p>

          {/* Section tallies — gives the doctor an at-a-glance sense of
              how the snapshots are distributed across SOAP sections. */}
          <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {CLINICAL_SECTIONS.map((s) => (
              <li
                key={s}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  sectionTallies[s] > 0
                    ? "bg-blue-50 text-blue-700"
                    : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                <span>{s}</span>
                <span className="font-semibold">{sectionTallies[s]}</span>
              </li>
            ))}
          </ul>

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((snapshot) => (
              <li key={snapshot.snapshotId}>
                <button
                  type="button"
                  onClick={() => openModal(snapshot)}
                  className="group relative block w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Open snapshot captured at ${formatTime(snapshot.capturedAt)}`}
                >
                  {snapshot.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={snapshot.signedUrl}
                      alt={`Snapshot ${formatTime(snapshot.capturedAt)}`}
                      className="aspect-square w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-xs text-gray-500">
                      Preview unavailable
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[10px] text-white">
                    <span>{formatTime(snapshot.capturedAt)}</span>
                    <span className="flex items-center gap-1">
                      {snapshot.annotated ? (
                        <span aria-label="Annotated">✏️</span>
                      ) : null}
                      {snapshot.clinicalSection ? (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium">
                          {snapshot.clinicalSection.slice(0, 3)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {modal.open ? (
        <SnapshotReviewModal
          modal={modal}
          onClose={closeModal}
          onPickSection={(section) =>
            setModal((m) =>
              m.open ? { ...m, pendingSection: section } : m,
            )
          }
          onSave={() => void handleSave()}
          onDiscard={() => void handleDiscard()}
        />
      ) : null}
    </section>
  );
}

interface SnapshotReviewModalProps {
  modal: Extract<ModalState, { open: true }>;
  onClose: () => void;
  onPickSection: (section: ClinicalSection) => void;
  onSave: () => void;
  onDiscard: () => void;
}

function SnapshotReviewModal({
  modal,
  onClose,
  onPickSection,
  onSave,
  onDiscard,
}: SnapshotReviewModalProps) {
  const { snapshot, pendingSection, saving, discarding, actionError } = modal;
  const dirty = pendingSection !== snapshot.clinicalSection;
  const busy = saving || discarding;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="snapshot-review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-baseline justify-between gap-2 border-b border-gray-200 px-5 py-3">
          <h3
            id="snapshot-review-modal-title"
            className="text-base font-semibold text-gray-900"
          >
            Snapshot · {formatTime(snapshot.capturedAt)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm text-gray-500 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close snapshot preview"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-gray-50 p-3">
          {snapshot.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snapshot.signedUrl}
              alt={`Snapshot ${formatTime(snapshot.capturedAt)}`}
              className="mx-auto max-h-[60vh] w-auto rounded-md object-contain shadow-sm"
              draggable={false}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-500">
              Preview unavailable. Try reloading the panel.
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-gray-500">
            Captured by {snapshot.capturerRole}
            {snapshot.target === "remote" ? " (other party)" : " (self)"}
            {snapshot.annotated ? " · annotated" : ""}
            {snapshot.dimensions
              ? ` · ${snapshot.dimensions.width}×${snapshot.dimensions.height}px`
              : ""}
          </p>
        </div>

        <footer className="flex flex-col gap-3 border-t border-gray-200 px-5 py-3">
          <fieldset>
            <legend className="text-xs font-medium text-gray-700">
              Attach to clinical section
            </legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CLINICAL_SECTIONS.map((section) => (
                <label
                  key={section}
                  className={[
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                    pendingSection === section
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="snapshot-section"
                    value={section}
                    className="sr-only"
                    checked={pendingSection === section}
                    onChange={() => onPickSection(section)}
                    disabled={busy}
                  />
                  {section}
                </label>
              ))}
            </div>
            {snapshot.clinicalSection && pendingSection === snapshot.clinicalSection ? (
              <p className="mt-1 text-[11px] text-gray-500">
                Currently saved to {snapshot.clinicalSection}.
              </p>
            ) : null}
          </fieldset>

          {actionError ? (
            <p role="alert" className="text-xs text-red-600">
              {actionError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {discarding ? "Discarding…" : "Discard"}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!pendingSection || !dirty || busy}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? "Saving…" : "Save to section"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
