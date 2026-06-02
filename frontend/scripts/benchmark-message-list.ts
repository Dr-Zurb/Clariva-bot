/**
 * Manual perf harness for text-D3 message-list virtualization.
 *
 * Usage (browser console on a text consult page with a long thread):
 *   1. Import or paste helpers from this module in dev, or run against a
 *      staging build with `?debugMessageListBench=1` (future hook).
 *   2. Open DevTools → Performance, record while scrolling top-to-bottom.
 *   3. Target: ≥45 FPS sustained scroll with virtualization enabled (>100 msgs).
 *
 * This script exports pure helpers for unit tests and local benchmarking.
 */

import { buildMessageRows, shouldVirtualizeMessageList } from "@/lib/text/build-message-rows";
import type { ConsultationMessage } from "@/lib/text/types";

export function makeBenchMessages(count: number): ConsultationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bench-${i}`,
    sessionId: "bench-session",
    senderId: i % 2 === 0 ? "doctor-1" : "patient-1",
    senderRole: i % 2 === 0 ? ("doctor" as const) : ("patient" as const),
    body: `Benchmark message ${i} — lorem ipsum for height measurement.`,
    createdAt: new Date(Date.UTC(2026, 3, 28, 10, 0, i)).toISOString(),
    kind: "text" as const,
  }));
}

export function summarizeMessageListBench(messageCount: number): {
  messageCount: number;
  rowCount: number;
  virtualize: boolean;
} {
  const messages = makeBenchMessages(messageCount);
  const rows = buildMessageRows(messages);
  return {
    messageCount,
    rowCount: rows.length,
    virtualize: shouldVirtualizeMessageList(rows),
  };
}
