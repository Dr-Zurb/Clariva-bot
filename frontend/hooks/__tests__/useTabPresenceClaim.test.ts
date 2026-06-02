/**
 * useTabPresenceClaim — reducer unit tests (Vitest).
 *
 * @see task-voice-C4-multi-tab-kick.md
 *
 * Run: `pnpm --filter clariva-bot-frontend test hooks/__tests__/useTabPresenceClaim`
 */

import { describe, it, expect } from "vitest";
import { deriveStatus } from "@/hooks/useTabPresenceClaim";

function claims(
  entries: Array<{ tab_id: string; role: "doctor" | "patient"; claimed_at: number }>,
) {
  return new Map(entries.map((entry) => [entry.tab_id, entry]));
}

describe("deriveStatus", () => {
  it("returns sole when only this patient tab is present", () => {
    const result = deriveStatus({
      selfTabId: "tab-a",
      selfRole: "patient",
      selfClaimedAt: 100,
      claims: claims([
        { tab_id: "tab-a", role: "patient", claimed_at: 100 },
      ]),
    });
    expect(result).toEqual({ status: "sole", otherTabsCount: 0 });
  });

  it("kicks older patient tab when a newer patient claim arrives", () => {
    const result = deriveStatus({
      selfTabId: "tab-a",
      selfRole: "patient",
      selfClaimedAt: 100,
      claims: claims([
        { tab_id: "tab-a", role: "patient", claimed_at: 100 },
        { tab_id: "tab-b", role: "patient", claimed_at: 200 },
      ]),
    });
    expect(result).toEqual({ status: "kicked", otherTabsCount: 1 });
  });

  it("keeps newest patient tab sole even when older tabs exist", () => {
    const result = deriveStatus({
      selfTabId: "tab-b",
      selfRole: "patient",
      selfClaimedAt: 200,
      claims: claims([
        { tab_id: "tab-a", role: "patient", claimed_at: 100 },
        { tab_id: "tab-b", role: "patient", claimed_at: 200 },
      ]),
    });
    expect(result).toEqual({ status: "sole", otherTabsCount: 1 });
  });

  it("warns doctor when another doctor tab is present without kicking", () => {
    const result = deriveStatus({
      selfTabId: "tab-a",
      selfRole: "doctor",
      selfClaimedAt: 100,
      claims: claims([
        { tab_id: "tab-a", role: "doctor", claimed_at: 100 },
        { tab_id: "tab-b", role: "doctor", claimed_at: 50 },
      ]),
    });
    expect(result).toEqual({ status: "multi-tab-warned", otherTabsCount: 1 });
  });

  it("ignores claims from the other role when deriving patient status", () => {
    const result = deriveStatus({
      selfTabId: "tab-a",
      selfRole: "patient",
      selfClaimedAt: 100,
      claims: claims([
        { tab_id: "tab-a", role: "patient", claimed_at: 100 },
        { tab_id: "tab-doc", role: "doctor", claimed_at: 500 },
      ]),
    });
    expect(result).toEqual({ status: "sole", otherTabsCount: 0 });
  });
});
