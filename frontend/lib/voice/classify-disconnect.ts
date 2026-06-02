/**
 * voice-A9 — re-export the modality-agnostic classifier shipped by
 * video B5. Voice and video share one implementation at
 * `@/lib/call/classify-disconnect` so splash copy + branch order stay
 * in sync; import from here when working voice-only surfaces.
 */
export {
  classifyDisconnect,
  disconnectReasonCopy,
  type ClassifyDisconnectInput,
  type DisconnectReason,
} from "@/lib/call/classify-disconnect";
