"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { postConsultationTextQualitySample } from "@/lib/api";
import { computeP95 } from "@/lib/text/chat-quality-utils";

const SAMPLE_INTERVAL_MS = 30_000;

export interface ChatQualitySamplerControls {
  /** Call when an optimistic message is enqueued (own sends only). */
  onOptimisticSend: (messageId: string) => void;
  /** Call when the server-ack row is observed (Realtime INSERT echo). */
  onMessageAck: (messageId: string) => void;
  /** Call on Realtime channel reconnect-worthy errors. */
  onRealtimeReconnect: () => void;
  /** Call on counterparty presence online ↔ offline transitions. */
  onPresenceFlap: () => void;
}

export interface UseChatQualitySamplerOptions {
  sessionId: string;
  role: "doctor" | "patient";
  accessToken: string;
  enabled?: boolean;
}

/**
 * Background 30s sampler for text consult delivery health (task-text-D4).
 * Posts PHI-safe aggregates; pauses while the tab is hidden.
 */
export function useChatQualitySampler({
  sessionId,
  role,
  accessToken,
  enabled = true,
}: UseChatQualitySamplerOptions): ChatQualitySamplerControls {
  const rttStartsRef = useRef<Map<string, number>>(new Map());
  const rttSamplesRef = useRef<number[]>([]);
  const reconnectsRef = useRef(0);
  const flapsRef = useRef(0);
  const messagesRef = useRef(0);
  const visibleRef = useRef(true);

  const resetWindow = useCallback(() => {
    rttStartsRef.current.clear();
    rttSamplesRef.current = [];
    reconnectsRef.current = 0;
    flapsRef.current = 0;
    messagesRef.current = 0;
  }, []);

  const flushSample = useCallback(async () => {
    if (!enabled || !visibleRef.current || !accessToken.trim()) return;
    const p95 = computeP95(rttSamplesRef.current);
    try {
      await postConsultationTextQualitySample(accessToken, sessionId, {
        session_id: sessionId,
        roundtrip_p95_ms: p95,
        realtime_reconnects: reconnectsRef.current,
        presence_flaps: flapsRef.current,
        messages_in_window: messagesRef.current,
      });
    } catch {
      // Fire-and-forget — never block chat on telemetry failure.
    }
    resetWindow();
  }, [accessToken, enabled, resetWindow, sessionId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = window.setInterval(() => {
      void flushSample();
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(tick);
  }, [enabled, flushSample]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    const onVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  const onOptimisticSend = useCallback((messageId: string) => {
    if (!enabled) return;
    rttStartsRef.current.set(messageId, performance.now());
    messagesRef.current += 1;
  }, [enabled]);

  const onMessageAck = useCallback((messageId: string) => {
    if (!enabled) return;
    const start = rttStartsRef.current.get(messageId);
    if (start == null) return;
    rttStartsRef.current.delete(messageId);
    const rtt = Math.max(0, Math.round(performance.now() - start));
    rttSamplesRef.current.push(rtt);
  }, [enabled]);

  const onRealtimeReconnect = useCallback(() => {
    if (!enabled) return;
    reconnectsRef.current += 1;
  }, [enabled]);

  const onPresenceFlap = useCallback(() => {
    if (!enabled) return;
    flapsRef.current += 1;
  }, [enabled]);

  return useMemo(
    () => ({
      onOptimisticSend,
      onMessageAck,
      onRealtimeReconnect,
      onPresenceFlap,
    }),
    [onMessageAck, onOptimisticSend, onPresenceFlap, onRealtimeReconnect],
  );
}
