import { describe, it, expect } from "vitest";
import {
  CONSENT_ALREADY_VISIBLE,
  CONSENT_BODY_PARAGRAPHS,
  CONSENT_DECLINE,
  CONSENT_GRANT_BOUNDS,
  CONSENT_PAUSE_OR_STOP,
} from "../video-consent-copy";

describe("VideoConsentModal — rec-26 copy", () => {
  it("states already-visible versus being-saved above the CTAs", () => {
    expect(CONSENT_ALREADY_VISIBLE).toBe(
      "Your doctor can already see you. This choice is only about whether we save the video.",
    );
    expect(CONSENT_GRANT_BOUNDS).toMatch(/up to 2 minutes/);
    expect(CONSENT_GRANT_BOUNDS).toMatch(/2 more minutes once/);
    expect(CONSENT_PAUSE_OR_STOP).toMatch(/pause or stop saving/);
    expect(CONSENT_PAUSE_OR_STOP).toMatch(/resume without being asked again/);
    expect(CONSENT_PAUSE_OR_STOP).toMatch(/turns your camera off/);
    expect(CONSENT_DECLINE).toBe(
      "If you say no, the video is not saved. The visit goes on. Your doctor can still see you, just like now.",
    );
  });

  it("never uses escalation / composition / Twilio or deletion language", () => {
    const joined = CONSENT_BODY_PARAGRAPHS.join(" ");
    expect(joined).not.toMatch(/escalation|composition|Twilio/i);
    expect(joined).not.toMatch(/delet|eras|removed|won't keep/i);
  });
});
