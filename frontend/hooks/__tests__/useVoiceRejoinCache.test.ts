/**
 * useVoiceRejoinCache — unit tests (Vitest).
 *
 * @see task-voice-C5-crash-recovery-rejoin.md
 *
 * Run: `pnpm --filter clariva-bot-frontend test hooks/__tests__/useVoiceRejoinCache`
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildVoiceRejoinCache,
  tryVoiceAutoRejoin,
} from "@/hooks/useVoiceRejoinCache";
import {
  storageKey,
  kickedFlagKey,
  writeSnapshot,
  type CallRejoinSnapshot,
} from "@/hooks/useCallRejoinCache";

const SESSION_ID = "sess-voice-123";
const TWILIO_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig";
const SUPABASE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig";

function voiceSnapshot(
  overrides: Partial<CallRejoinSnapshot> = {},
): CallRejoinSnapshot {
  return {
    sessionId: SESSION_ID,
    modality: "voice",
    role: "patient",
    twilioAccessToken: TWILIO_JWT,
    roomName: "appointment-voice-abc",
    supabaseJwt: SUPABASE_JWT,
    hmacToken: "hmac-test",
    companionCurrentUserId: "patient:abc",
    sessionStatus: "live",
    cachedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("buildVoiceRejoinCache", () => {
  it("returns a fresh snapshot when tokens are valid", () => {
    const cache = buildVoiceRejoinCache({
      sessionId: SESSION_ID,
      role: "patient",
      twilioAccessToken: TWILIO_JWT,
      roomName: "appointment-voice-abc",
      hmacToken: "hmac-test",
      supabaseJwt: SUPABASE_JWT,
      sessionStatus: "live",
    });
    expect(cache).not.toBeNull();
    expect(cache?.sessionId).toBe(SESSION_ID);
    expect(cache?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null when computed TTL is already expired", () => {
    const expiredTwilio =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.sig";
    const cache = buildVoiceRejoinCache({
      sessionId: SESSION_ID,
      role: "patient",
      twilioAccessToken: expiredTwilio,
      roomName: "appointment-voice-abc",
    });
    expect(cache).toBeNull();
  });
});

describe("tryVoiceAutoRejoin", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("returns null when no cache exists", () => {
    expect(tryVoiceAutoRejoin(SESSION_ID)).toBeNull();
  });

  it("returns voice cache when fresh", () => {
    writeSnapshot(voiceSnapshot());
    const result = tryVoiceAutoRejoin(SESSION_ID);
    expect(result?.twilioAccessToken).toBe(TWILIO_JWT);
    expect(result?.roomName).toBe("appointment-voice-abc");
  });

  it("clears and returns null when cache is stale", () => {
    writeSnapshot(
      voiceSnapshot({ expiresAt: Date.now() - 1, cachedAt: Date.now() - 10_000 }),
    );
    expect(tryVoiceAutoRejoin(SESSION_ID)).toBeNull();
    expect(window.sessionStorage.getItem(storageKey(SESSION_ID))).toBeNull();
  });

  it("returns null and clears cache when tab was kicked (C4 contract)", () => {
    writeSnapshot(voiceSnapshot());
    window.sessionStorage.setItem(kickedFlagKey(SESSION_ID), "1");
    expect(tryVoiceAutoRejoin(SESSION_ID)).toBeNull();
    expect(window.sessionStorage.getItem(storageKey(SESSION_ID))).toBeNull();
    expect(window.sessionStorage.getItem(kickedFlagKey(SESSION_ID))).toBeNull();
  });

  it("ignores non-voice modality snapshots", () => {
    writeSnapshot(voiceSnapshot({ modality: "video" }));
    expect(tryVoiceAutoRejoin(SESSION_ID)).toBeNull();
  });
});
