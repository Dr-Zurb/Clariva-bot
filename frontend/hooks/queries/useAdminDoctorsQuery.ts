"use client";

import { useQuery } from "@tanstack/react-query";
import {
  listAdminDoctors,
  type AdminDoctorFunnelStatus,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * admin-console-v3 · list doctors with derived funnel status.
 */
export function useAdminDoctorsQuery(
  token: string,
  status?: AdminDoctorFunnelStatus,
) {
  return useQuery({
    queryKey: queryKeys.admin.doctors(status ?? "all"),
    queryFn: async () => {
      const res = await listAdminDoctors(token, status);
      return res.data.items;
    },
    enabled: Boolean(token),
  });
}
