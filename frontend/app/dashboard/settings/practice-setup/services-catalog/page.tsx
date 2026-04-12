"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ServiceCatalogEditor } from "@/components/practice-setup/ServiceCatalogEditor";
import { MyServiceCatalogTemplatesModal } from "@/components/practice-setup/MyServiceCatalogTemplatesModal";
import { SaveServiceCatalogTemplateModal } from "@/components/practice-setup/SaveServiceCatalogTemplateModal";
import { SaveButton } from "@/components/ui/SaveButton";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import {
  catalogToServiceDrafts,
  catchAllServiceDraft,
  competingVisitTypePreferKeyFromCatalog,
  draftsSaveBlockingReason,
  draftsToCatalogOrNull,
  type ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import {
  CATALOG_CATCH_ALL_SERVICE_KEY,
  safeParseServiceCatalogV1,
} from "@/lib/service-catalog-schema";
import { createClient } from "@/lib/supabase/client";
import { UnsavedLeaveGuard } from "@/components/ui/UnsavedLeaveGuard";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
  ServiceCatalogTemplatesJsonV1,
} from "@/types/doctor-settings";

function snapshot(services: ServiceOfferingDraft[], competingVisitTypePreferKey: string): string {
  return JSON.stringify({ services, competingVisitTypePreferKey });
}

export default function ServicesCatalogPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [services, setServices] = useState<ServiceOfferingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [myTemplatesModalOpen, setMyTemplatesModalOpen] = useState(false);
  const [userTemplatesBusy, setUserTemplatesBusy] = useState(false);
  /** When chronic vs acute/general signals compete, prefer this non-`other` service_key (optional). */
  const [competingVisitTypePreferKey, setCompetingVisitTypePreferKey] = useState("");

  const fetchSettings = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getDoctorSettings(token);
      const s = res.data.settings;
      setSettings(s);
      const cat = s.service_offerings_json ?? null;
      const serverDrafts = catalogToServiceDrafts(cat);
      let displayDrafts = serverDrafts;
      if (!cat && serverDrafts.length === 0) {
        displayDrafts = [catchAllServiceDraft()];
      }
      const parsedCat = cat ? safeParseServiceCatalogV1(cat) : null;
      const preferKey =
        parsedCat?.ok === true ? competingVisitTypePreferKeyFromCatalog(parsedCat.data) : "";
      setCompetingVisitTypePreferKey(preferKey);
      setServices(displayDrafts);
      setLastSaved(snapshot(displayDrafts, preferKey));
      setSaveSuccess(false);
      setClientError(null);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isDirty = useMemo(
    () =>
      lastSaved !== "" &&
      snapshot(services, competingVisitTypePreferKey) !== lastSaved,
    [services, competingVisitTypePreferKey, lastSaved]
  );

  useEffect(() => {
    const keys = new Set(services.map((s) => s.service_key.trim().toLowerCase()));
    setCompetingVisitTypePreferKey((prev) => {
      const pref = prev.trim().toLowerCase();
      if (pref && !keys.has(pref)) return "";
      return prev;
    });
  }, [services]);

  const saveDisableReason = useMemo(
    () => (isDirty ? draftsSaveBlockingReason(services) : null),
    [isDirty, services]
  );

  const hasStructuredCatalog = Boolean(settings?.service_offerings_json);

  const userSavedTemplates = settings?.service_catalog_templates_json?.templates ?? [];

  const handleTemplatesLibraryChange = async (next: ServiceCatalogTemplatesJsonV1) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not signed in");
    setUserTemplatesBusy(true);
    setClientError(null);
    try {
      const res = await patchDoctorSettings(token, { service_catalog_templates_json: next });
      setSettings(res.data.settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update saved templates.";
      setClientError(msg);
      throw err;
    } finally {
      setUserTemplatesBusy(false);
    }
  };

  const performSave = useCallback(async (): Promise<boolean> => {
    setClientError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setClientError("Not signed in");
      return false;
    }

    let catalog: ReturnType<typeof draftsToCatalogOrNull>;
    try {
      catalog = draftsToCatalogOrNull(services, {
        competing_visit_type_prefer_service_key: competingVisitTypePreferKey.trim() || null,
      });
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Check your service rows and follow-up fields.");
      return false;
    }
    if (catalog === null) {
      setClientError(
        'Add at least one service to save, or use "Clear structured catalog" to remove the catalog (priced teleconsults require services on file).'
      );
      return false;
    }

    const parsed = safeParseServiceCatalogV1(catalog);
    if (!parsed.ok) {
      setClientError(parsed.message);
      return false;
    }

    const payload: PatchDoctorSettingsPayload = {
      service_offerings_json: parsed.data,
    };

    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
      const s = res.data.settings;
      const catNext = s.service_offerings_json ?? null;
      const serverDrafts = catalogToServiceDrafts(catNext);
      let displayDrafts = serverDrafts;
      if (!catNext && serverDrafts.length === 0) {
        displayDrafts = [catchAllServiceDraft()];
      }
      const parsedNext = catNext ? safeParseServiceCatalogV1(catNext) : null;
      const preferNext =
        parsedNext?.ok === true ? competingVisitTypePreferKeyFromCatalog(parsedNext.data) : "";
      setCompetingVisitTypePreferKey(preferNext);
      setServices(displayDrafts);
      setLastSaved(snapshot(displayDrafts, preferNext));
      setSaveSuccess(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setClientError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [services, competingVisitTypePreferKey]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSave();
  };

  const handleClearCatalog = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Remove structured service catalog? Priced teleconsult booking and quotes need at least one service row — add a catalog again before taking paid remote bookings."
      )
    ) {
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    setClearing(true);
    setClientError(null);
    try {
      const res = await patchDoctorSettings(token, { service_offerings_json: null });
      setSettings(res.data.settings);
      setCompetingVisitTypePreferKey("");
      setServices([catchAllServiceDraft()]);
      setLastSaved(snapshot([catchAllServiceDraft()], ""));
      setSaveSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not clear catalog";
      setClientError(msg);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <UnsavedLeaveGuard
        isDirty={isDirty}
        isSaving={saving}
        saveBlockedReason={saveDisableReason}
        onSave={performSave}
      />
      <h1 className="text-2xl font-semibold text-gray-900">Services catalog</h1>
      <p className="mt-1 text-gray-600">
        Set up your consultation types and teleconsult prices (text, voice, video). Follow-up discounts can differ by
        channel. These prices feed into quotes and checkout when patients book remote visits.
      </p>

      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => setSaveTemplateModalOpen(true)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save template
          </button>
          <button
            type="button"
            onClick={() => setMyTemplatesModalOpen(true)}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            My templates
          </button>
        </div>

        <SaveServiceCatalogTemplateModal
          open={saveTemplateModalOpen}
          onClose={() => setSaveTemplateModalOpen(false)}
          currentServices={services}
          competingVisitTypePreferKey={competingVisitTypePreferKey}
          templates={userSavedTemplates}
          onTemplatesChange={handleTemplatesLibraryChange}
          busy={userTemplatesBusy}
        />

        <MyServiceCatalogTemplatesModal
          open={myTemplatesModalOpen}
          onClose={() => setMyTemplatesModalOpen(false)}
          currentServicesCount={services.length}
          onApplyCatalog={(next, preferKey) => {
            setServices(next);
            setCompetingVisitTypePreferKey(preferKey ?? "");
            setSaveSuccess(false);
            setClientError(null);
          }}
          templates={userSavedTemplates}
          onTemplatesChange={handleTemplatesLibraryChange}
          busy={userTemplatesBusy}
        />

        <ServiceCatalogEditor
          services={services}
          onServicesChange={(next) => {
            setSaveSuccess(false);
            setClientError(null);
            setServices(next);
          }}
        />

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-medium text-gray-900">Ambiguous visit-type routing</h2>
          <p className="mt-1 text-sm text-gray-600">
            When a patient message mixes chronic follow-up and acute or general visit signals, the assistant can use
            this preference to pick a single consultation type. Leave unset to use default routing.
          </p>
          <label htmlFor="competing-visit-prefer" className="mt-3 block text-sm font-medium text-gray-800">
            Prefer service
          </label>
          <select
            id="competing-visit-prefer"
            className="mt-1 block w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={competingVisitTypePreferKey}
            onChange={(e) => {
              setCompetingVisitTypePreferKey(e.target.value);
              setSaveSuccess(false);
              setClientError(null);
            }}
          >
            <option value="">No preference</option>
            {services
              .filter((s) => {
                const k = s.service_key.trim().toLowerCase();
                return k.length > 0 && k !== CATALOG_CATCH_ALL_SERVICE_KEY;
              })
              .map((s) => {
                const k = s.service_key.trim().toLowerCase();
                return (
                  <option key={s.id} value={k}>
                    {s.label.trim() || k} ({k})
                  </option>
                );
              })}
          </select>
        </div>

        {(clientError || error) && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
            {clientError || error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <SaveButton
            isDirty={isDirty}
            saving={saving}
            saveSuccess={saveSuccess}
            disableReason={saveDisableReason}
          />
          {(hasStructuredCatalog || services.length > 0) && (
            <button
              type="button"
              onClick={handleClearCatalog}
              disabled={clearing}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear structured catalog"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
