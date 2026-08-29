"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { patchDoctorSettings } from "@/lib/api";
import { useDoctorSettingsQuery } from "@/hooks/queries/useDoctorSettingsQuery";
import { queryKeys } from "@/lib/query/keys";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";

/**
 * Shared load + dirty + save for Settings leaf pages (settings-refresh · SR-D1).
 *
 * `toForm` may be inline — we only re-seed the form when server `settings`
 * identity changes (ref-held converter).
 */
export function useDoctorSettingsForm<TForm>(
  token: string,
  toForm: (settings: DoctorSettings) => TForm,
) {
  const query = useDoctorSettingsQuery(token);
  const queryClient = useQueryClient();
  const settings = query.data?.data.settings ?? null;

  const toFormRef = useRef(toForm);
  toFormRef.current = toForm;

  const [form, setFormState] = useState<TForm | null>(null);
  const [lastSaved, setLastSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const next = toFormRef.current(settings);
    const serialized = JSON.stringify(next);
    setFormState((prev) => {
      if (prev !== null && JSON.stringify(prev) === serialized) return prev;
      return next;
    });
    setLastSaved(serialized);
    // Do not clear saveSuccess here — invalidate-after-save would wipe "Saved".
  }, [settings]);

  const setForm = useCallback(
    (updater: TForm | ((prev: TForm) => TForm)) => {
      setSaveSuccess(false);
      setSaveError(null);
      setFormState((prev) => {
        if (prev === null) return prev;
        return typeof updater === "function"
          ? (updater as (p: TForm) => TForm)(prev)
          : updater;
      });
    },
    [],
  );

  const isDirty = useMemo(() => {
    if (form === null || lastSaved === "") return false;
    return JSON.stringify(form) !== lastSaved;
  }, [form, lastSaved]);

  const save = useCallback(
    async (payload: PatchDoctorSettingsPayload) => {
      if (!token) return;
      setSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      try {
        const res = await patchDoctorSettings(token, payload);
        const next = toFormRef.current(res.data.settings);
        setFormState(next);
        setLastSaved(JSON.stringify(next));
        setSaveSuccess(true);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.opd.doctorSettings(),
        });
      } catch {
        setSaveError("Save failed. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [queryClient, token],
  );

  const loadError =
    query.isError && !settings
      ? query.error &&
        typeof query.error === "object" &&
        "status" in query.error &&
        (query.error as { status?: number }).status === 401
        ? "Session expired."
        : "Unable to load."
      : null;

  return {
    settings,
    form,
    setForm,
    isDirty,
    saving,
    saveSuccess,
    saveError,
    save,
    isLoading: query.isLoading || (query.isFetching && !settings),
    loadError,
    refetch: query.refetch,
    token,
  };
}
