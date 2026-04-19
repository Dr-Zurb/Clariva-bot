"use client";

/**
 * Plan service-catalog-matcher-routing-v2 / Task 10 (Phase 4 hybrid):
 * "Try as patient" preview panel.
 *
 * Doctor pastes a sample patient message → we POST it to
 * `/api/v1/catalog/preview-match` against the **current draft catalog** (not
 * the persisted one) and render which Stage won (A = instant rules, B = AI
 * assistant) along with the matched service.
 *
 * Gating contract:
 *   - The parent page only mounts this panel when
 *     `NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED === "true"` (or in dev).
 *   - The backend route is gated separately via `CATALOG_PREVIEW_MATCH_ENABLED`.
 *     If the flags disagree (UI on, backend off) the call returns 404 and the
 *     API helper surfaces a clear "preview disabled on backend" error.
 *
 * Design choices:
 *   - **Deferred to follow-up:** doctor-facing telemetry (misroute → suggest
 *     example phrases). This widget is read-only.
 *   - **Deferred to follow-up:** in-DM-style transcript preview. The first
 *     slice surfaces only the matcher result; the DM copy layer is downstream
 *     and tested separately (Plan 04 — Patient DM copy polish).
 */

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  postCatalogPreviewMatch,
  type PreviewMatchPath,
  type PreviewMatchResponse,
} from "@/lib/api";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";

type Props = {
  /**
   * The current on-screen draft catalog — `null` when the editor has no
   * services yet (e.g. doctor just opened a fresh catalog). When `null` the
   * panel renders a disabled state instead of calling the API.
   */
  catalog: ServiceCatalogV1 | null;
  /** Optional doctor profile for richer LLM context (specialty etc). */
  doctorProfile?: { practiceName?: string | null; specialty?: string | null } | null;
};

const PATH_LABEL: Record<PreviewMatchPath, string> = {
  stage_a: "Stage A — instant",
  stage_b: "Stage B — AI assistant",
  fallback: "No match — fell through to catch-all",
  single_fee: "Single-fee mode (no routing)",
};

const PATH_TONE: Record<PreviewMatchPath, string> = {
  stage_a: "bg-emerald-50 text-emerald-900 border-emerald-200",
  stage_b: "bg-indigo-50 text-indigo-900 border-indigo-200",
  fallback: "bg-amber-50 text-amber-900 border-amber-200",
  single_fee: "bg-slate-50 text-slate-900 border-slate-200",
};

export function CatalogPreviewMatchPanel({ catalog, doctorProfile }: Props): JSX.Element {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewMatchResponse | null>(null);

  const disabled = !catalog || catalog.services.length === 0 || text.trim().length === 0;

  const handleRun = useCallback(async () => {
    if (!catalog || catalog.services.length === 0) {
      setError("Add at least one service before previewing.");
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("You need to be signed in to run a preview.");
        return;
      }
      const res = await postCatalogPreviewMatch(token, {
        catalog,
        reasonForVisitText: trimmed,
        doctorProfile: doctorProfile ?? null,
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [catalog, doctorProfile, text]);

  return (
    <section
      data-testid="catalog-preview-match-panel"
      className="rounded-lg border border-gray-200 bg-white p-4"
      aria-label="Try as patient preview"
    >
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-gray-900">Try as patient (preview)</h2>
        <p className="mt-0.5 text-xs text-gray-600">
          Type a sample patient message to see which service the assistant would book and which
          stage handled it. Uses your current unsaved edits.
        </p>
      </header>

      <label htmlFor="catalog-preview-match-input" className="sr-only">
        Sample patient message
      </label>
      <textarea
        id="catalog-preview-match-input"
        data-testid="catalog-preview-match-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="e.g. I have an itchy red rash on my arm since two days"
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={disabled || loading}
          data-testid="catalog-preview-match-run"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? "Running…" : "Run preview"}
        </button>
        {!catalog || catalog.services.length === 0 ? (
          <p className="text-xs text-gray-500">Add a service to enable preview.</p>
        ) : null}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="catalog-preview-match-error"
          className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900"
        >
          {error}
        </p>
      )}

      {result && (
        <div
          data-testid="catalog-preview-match-result"
          className="mt-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="catalog-preview-match-path-badge"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${PATH_TONE[result.path]}`}
            >
              {PATH_LABEL[result.path]}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-gray-500">
              confidence: {result.confidence}
            </span>
            {result.suggestedModality && (
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                suggested: {result.suggestedModality}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-900">
            <span className="font-medium">Matched:</span>{" "}
            {result.matchedLabel || <em className="text-gray-500">(no service)</em>}{" "}
            {result.matchedServiceKey && (
              <span className="text-xs text-gray-500">({result.matchedServiceKey})</span>
            )}
          </p>

          {result.path === "fallback" && !result.llmAvailable && (
            <p className="text-xs text-amber-800">
              Stage B (AI) is unavailable in this environment — the result fell through to the
              catch-all without trying the assistant. Set <code>OPENAI_API_KEY</code> to enable.
            </p>
          )}

          {result.mixedComplaints && (
            <p className="text-xs text-indigo-900">
              Mixed complaints detected — production DM would ask for clarification before booking.
            </p>
          )}

          {result.reasonCodes.length > 0 && (
            <p className="text-[11px] text-gray-500">
              reasonCodes: {result.reasonCodes.join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default CatalogPreviewMatchPanel;
