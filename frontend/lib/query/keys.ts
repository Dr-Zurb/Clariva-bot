/**
 * TanStack Query key conventions (np-04).
 *
 * Shape: [domain, ...segments] where segments are resource IDs or serialisable
 * filter objects — never PHI (no patient names, free-text search, or chart notes).
 *
 * Examples:
 *   queryKeys.patients.list({ page: 1, status: "active" })
 *   queryKeys.patient("uuid").vitals()
 *   queryKeys.dashboard.events({ unreadOnly: true, limit: 100 })
 *
 * Invalidation convention (np-05):
 *   - After a mutation, invalidate affected read keys:
 *       queryClient.invalidateQueries({ queryKey: queryKeys.patient(id).all })
 *   - When a list row changes, invalidate both detail and list:
 *       queryClient.invalidateQueries({ queryKey: queryKeys.patients.all })
 *   - Never cache mutation responses — use useMutation without seeding query
 *     cache from write payloads; always invalidate reads instead.
 */

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    events: (filters: { unreadOnly?: boolean; limit?: number; cursor?: string }) =>
      [...queryKeys.dashboard.all, "events", filters] as const,
    counts: () => [...queryKeys.dashboard.all, "counts"] as const,
    appointments: () => [...queryKeys.dashboard.all, "appointments"] as const,
    pendingReviews: () => [...queryKeys.dashboard.all, "pending-reviews"] as const,
    rxSentToday: () => [...queryKeys.dashboard.all, "rx-sent-today"] as const,
  },
  patients: {
    all: ["patients"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.patients.all, "list", filters] as const,
  },
  patient: (patientId: string) => ({
    all: ["patient", patientId] as const,
    overview: () => [...queryKeys.patient(patientId).all, "overview"] as const,
    vitals: () => [...queryKeys.patient(patientId).all, "vitals"] as const,
    conditions: () => [...queryKeys.patient(patientId).all, "conditions"] as const,
    allergies: () => [...queryKeys.patient(patientId).all, "allergies"] as const,
    prescriptions: () =>
      [...queryKeys.patient(patientId).all, "prescriptions", "recent"] as const,
  }),
  opd: {
    all: ["opd"] as const,
    queueSession: (dateIso: string) =>
      [...queryKeys.opd.all, "queue-session", dateIso] as const,
    session: (dateIso: string) => [...queryKeys.opd.all, "session", dateIso] as const,
    doctorSettings: () => [...queryKeys.opd.all, "doctor-settings"] as const,
  },
} as const;
