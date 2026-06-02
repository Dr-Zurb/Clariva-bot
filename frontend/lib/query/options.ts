import {
  getAppointments,
  getDashboardEvents,
  getDoctorOpdQueueSession,
  getDoctorSettings,
  getPrescriptionsForPatient,
  getServiceStaffReviews,
} from "@/lib/api";
import { getPatientOverview } from "@/lib/api/patients";
import { listVitalsHistory } from "@/lib/api/patient-chart";
import { requireApiBaseUrl } from "@/lib/api-base";
import { queryKeys } from "@/lib/query/keys";
import { POLL_INTERVAL, pollingOptions } from "@/lib/query/polling";
import { STALE } from "@/lib/query/stale";

const VITALS_FETCH_LIMIT = 500;

export const DASHBOARD_EVENTS_FILTERS = {
  unreadOnly: true,
  limit: 100,
} as const;

async function fetchRxSentTodayCount(token: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const params = new URLSearchParams({ date_from: todayStart.toISOString() });
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Prescriptions fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    prescriptions?: Array<{ created_at: string; status?: string }>;
  };
  const prescriptions = json.prescriptions ?? [];

  return prescriptions.filter((rx) => {
    const created = new Date(rx.created_at);
    return created >= todayStart && rx.status === "sent";
  }).length;
}

export function patientOverviewQueryOptions(token: string, patientId: string) {
  return {
    queryKey: queryKeys.patient(patientId).overview(),
    queryFn: () => getPatientOverview(token, patientId),
    staleTime: STALE.CLINICAL,
  } as const;
}

export function patientVitalsQueryOptions(token: string, patientId: string) {
  return {
    queryKey: queryKeys.patient(patientId).vitals(),
    queryFn: () => listVitalsHistory(token, patientId, VITALS_FETCH_LIMIT),
    staleTime: STALE.CLINICAL,
  } as const;
}

export function patientPrescriptionsQueryOptions(token: string, patientId: string) {
  return {
    queryKey: queryKeys.patient(patientId).prescriptions(),
    queryFn: async () => {
      const res = await getPrescriptionsForPatient(token, patientId);
      return (res.data.prescriptions ?? []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    staleTime: STALE.CLINICAL,
  } as const;
}

export function appointmentsQueryOptions(token: string) {
  return {
    queryKey: queryKeys.dashboard.appointments(),
    queryFn: () => getAppointments(token),
    staleTime: STALE.COUNTS,
    ...pollingOptions(POLL_INTERVAL.COCKPIT),
  } as const;
}

export function rxSentTodayQueryOptions(token: string) {
  return {
    queryKey: queryKeys.dashboard.rxSentToday(),
    queryFn: () => fetchRxSentTodayCount(token),
    staleTime: STALE.COUNTS,
    ...pollingOptions(POLL_INTERVAL.COCKPIT),
  } as const;
}

export function pendingReviewsCountQueryOptions(token: string) {
  return {
    queryKey: queryKeys.dashboard.pendingReviews(),
    queryFn: async () => {
      const res = await getServiceStaffReviews(token, "pending");
      return res.data.reviews.length;
    },
    staleTime: STALE.COUNTS,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  } as const;
}

export function dashboardEventsUnreadCountQueryOptions(token: string) {
  return {
    queryKey: queryKeys.dashboard.events(DASHBOARD_EVENTS_FILTERS),
    queryFn: async () => {
      const res = await getDashboardEvents(token, DASHBOARD_EVENTS_FILTERS);
      return res.data.events.filter((event) => event.acknowledgedAt === null)
        .length;
    },
    staleTime: STALE.COUNTS,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  } as const;
}

export function opdQueueSessionQueryOptions(token: string, dateIso: string) {
  return {
    queryKey: queryKeys.opd.queueSession(dateIso),
    queryFn: () => getDoctorOpdQueueSession(token, dateIso),
    staleTime: STALE.LIVE,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  } as const;
}

export function doctorSettingsQueryOptions(token: string) {
  return {
    queryKey: queryKeys.opd.doctorSettings(),
    queryFn: () => getDoctorSettings(token),
    staleTime: STALE.STATIC,
  } as const;
}
