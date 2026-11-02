"use client";

import { useQuery } from "@tanstack/react-query";
import { appointmentsQueryOptions } from "@/lib/query/options";

export function useAppointmentsQuery(token: string, date: string) {
  return useQuery({
    ...appointmentsQueryOptions(token, date),
    enabled: Boolean(token) && date.length > 0,
  });
}
