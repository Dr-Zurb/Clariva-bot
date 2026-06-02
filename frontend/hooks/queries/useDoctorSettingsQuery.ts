"use client";

import { useQuery } from "@tanstack/react-query";
import { doctorSettingsQueryOptions } from "@/lib/query/options";

export function useDoctorSettingsQuery(token: string) {
  return useQuery({
    ...doctorSettingsQueryOptions(token),
    enabled: Boolean(token),
  });
}
