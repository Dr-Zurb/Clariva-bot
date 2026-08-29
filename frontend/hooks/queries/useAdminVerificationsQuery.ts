"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAdminVerificationDetail,
  listAdminVerifications,
  type AdminVerificationListStatus,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * admin-console-v1 · list doctor verification signups by status.
 */
export function useAdminVerificationsQuery(
  token: string,
  status: AdminVerificationListStatus,
) {
  return useQuery({
    queryKey: queryKeys.admin.verifications(status),
    queryFn: async () => {
      const res = await listAdminVerifications(token, status);
      return res.data.items;
    },
    enabled: Boolean(token),
  });
}

/**
 * admin-console-v1 · single verification detail (incl. short-lived signed docs).
 */
export function useAdminVerificationDetailQuery(
  token: string,
  doctorId: string,
) {
  return useQuery({
    queryKey: queryKeys.admin.verificationDetail(doctorId),
    queryFn: async () => {
      const res = await getAdminVerificationDetail(token, doctorId);
      return res.data;
    },
    enabled: Boolean(token && doctorId),
  });
}
