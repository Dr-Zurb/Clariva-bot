import { describe, expect, it } from "vitest";
import {
  buildInboxPathJourney,
  journeyStepLabel,
  summarizeInboxPathJourney,
} from "@/lib/inbox/path-journey";

describe("buildInboxPathJourney", () => {
  it("skips comment for cold DMs and greys future steps", () => {
    const journey = buildInboxPathJourney([
      {
        type: "first_dm",
        at: "2026-07-27T10:00:00.000Z",
        conversation_id: "c1",
      },
    ]);

    expect(journey.nodes.map((n) => n.type)).toEqual([
      "first_dm",
      "booking_started",
      "slot_selected",
      "booked",
      "paid",
    ]);
    expect(journey.nodes[0]?.state).toBe("current");
    expect(journey.nodes[1]?.state).toBe("upcoming");
    expect(journey.nodes[4]?.state).toBe("upcoming");
  });

  it("includes commented when present and marks earlier steps done", () => {
    const journey = buildInboxPathJourney([
      {
        type: "comment_captured",
        at: "2026-07-27T08:00:00.000Z",
        comment_lead_id: "cl1",
      },
      {
        type: "first_dm",
        at: "2026-07-27T09:00:00.000Z",
        conversation_id: "c1",
      },
      {
        type: "booking_started",
        at: "2026-07-27T09:05:00.000Z",
        conversation_id: "c1",
      },
    ]);

    expect(journey.nodes[0]).toMatchObject({
      type: "comment_captured",
      state: "done",
    });
    expect(journey.nodes[1]).toMatchObject({ type: "first_dm", state: "done" });
    expect(journey.nodes[2]).toMatchObject({
      type: "booking_started",
      state: "current",
    });
    expect(journey.nodes[3]?.state).toBe("upcoming");
  });

  it("uses sidebar funnel terminology for mapped steps", () => {
    expect(journeyStepLabel("first_dm")).toBe("Chatting");
    expect(journeyStepLabel("booking_started")).toBe("Booking in progress");
    expect(journeyStepLabel("slot_selected")).toBe("Slot picked");
    expect(journeyStepLabel("booked")).toBe("On calendar");
    expect(journeyStepLabel("paid")).toBe("Confirmed");
  });

  it("surfaces review / reschedule as extras", () => {
    const journey = buildInboxPathJourney([
      {
        type: "first_dm",
        at: "2026-07-27T10:00:00.000Z",
        conversation_id: "c1",
      },
      {
        type: "needs_review",
        at: "2026-07-27T11:00:00.000Z",
        review_id: "r1",
      },
    ]);
    expect(journey.extras).toHaveLength(1);
    expect(journey.extras[0]?.type).toBe("needs_review");
  });

  it("summarizeInboxPathJourney returns current stage and progress", () => {
    const journey = buildInboxPathJourney([
      {
        type: "comment_captured",
        at: "2026-07-27T08:00:00.000Z",
        comment_lead_id: "cl1",
      },
      {
        type: "first_dm",
        at: "2026-07-27T09:00:00.000Z",
        conversation_id: "c1",
      },
    ]);
    const summary = summarizeInboxPathJourney(journey);
    expect(summary.current?.type).toBe("first_dm");
    expect(summary.current?.label).toBe("Chatting");
    expect(summary.reachedIndex).toBe(2);
    expect(summary.total).toBe(6);
    expect(summary.hasActionExtras).toBe(false);
  });

  it("summarizeInboxPathJourney flags action extras", () => {
    const journey = buildInboxPathJourney([
      {
        type: "first_dm",
        at: "2026-07-27T10:00:00.000Z",
        conversation_id: "c1",
      },
      {
        type: "needs_review",
        at: "2026-07-27T11:00:00.000Z",
        review_id: "r1",
      },
    ]);
    expect(summarizeInboxPathJourney(journey).hasActionExtras).toBe(true);
  });
});
