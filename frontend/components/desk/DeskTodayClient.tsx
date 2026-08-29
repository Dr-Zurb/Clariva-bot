"use client";

import { DeskQueueList } from "@/components/desk/DeskQueueList";

/** Today tab — waiting, arrived, and seen. */
export function DeskTodayClient({ token }: { token: string }) {
  return <DeskQueueList token={token} density="full" />;
}
