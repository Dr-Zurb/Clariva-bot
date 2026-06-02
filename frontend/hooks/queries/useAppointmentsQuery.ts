"use client";

import { useQuery } from "@tanstack/react-query";
import { appointmentsQueryOptions } from "@/lib/query/options";

export function useAppointmentsQuery(token: string) {
  return useQuery({
    ...appointmentsQueryOptions(token),
    enabled: Boolean(token),
  });
}
