import { describe, it, expect } from "vitest";
import {
  lineHasSigDetails,
  parseMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";

describe("parseMedicineLine", () => {
  it("returns null for empty input", () => {
    expect(parseMedicineLine("")).toBeNull();
    expect(parseMedicineLine("   ")).toBeNull();
  });

  it("parses the full classic sig: name strength qty freq duration food", () => {
    const p = parseMedicineLine("amlodipine 5 mg 2 tab od for 30 days after food");
    expect(p).not.toBeNull();
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.dosage).toBe("5 mg");
    expect(p!.doseQty).toBe(2);
    expect(p!.doseUnit).toBe("tab");
    expect(p!.frequencyCode).toBe("OD");
    expect(p!.frequency).toBe("Once daily");
    expect(p!.durationValue).toBe(30);
    expect(p!.durationUnit).toBe("days");
    expect(p!.duration).toBe("30 days");
    expect(p!.foodTiming).toBe("after_food");
    expect(p!.instructions).toBe("");
  });

  it("parses a syrup line with spoon dose and form prefix", () => {
    const p = parseMedicineLine("syp dextromethorphan 2 spoon bd 5 days");
    expect(p!.medicineName).toBe("dextromethorphan");
    expect(p!.form).toBe("syrup");
    expect(p!.doseQty).toBe(2);
    expect(p!.doseUnit).toBe("spoon");
    expect(p!.frequencyCode).toBe("BID");
    expect(p!.durationValue).toBe(5);
    expect(p!.durationUnit).toBe("days");
    expect(p!.routeCode).toBe("oral");
  });

  it("parses an ointment line with site instruction and leftover notes", () => {
    const p = parseMedicineLine(
      "ointment betamethasone twice at site for 10 days avoid face",
    );
    expect(p!.medicineName).toBe("betamethasone");
    expect(p!.form).toBe("ointment");
    expect(p!.frequencyCode).toBe("BID");
    expect(p!.routeCode).toBe("topical");
    expect(p!.durationValue).toBe(10);
    expect(p!.durationUnit).toBe("days");
    expect(p!.instructions).toBe("avoid face");
  });

  it("parses 1-0-1 dose patterns into frequency + per-dose qty", () => {
    const p = parseMedicineLine("tab dolo 650 1-0-1 x 5d");
    expect(p!.medicineName).toBe("dolo");
    expect(p!.form).toBe("tablet");
    expect(p!.dosage).toBe("650");
    expect(p!.frequencyCode).toBe("BID");
    expect(p!.doseSchedule).toBe("1-0-1");
    expect(p!.doseQty).toBe(1);
    expect(p!.doseUnit).toBe("tab"); // defaulted from the tablet form
    expect(p!.durationValue).toBe(5);
    expect(p!.durationUnit).toBe("days");
  });

  it("parses 1-1-1 as TID", () => {
    const p = parseMedicineLine("pcm 500mg 1-1-1 3 days");
    expect(p!.dosage).toBe("500 mg");
    expect(p!.frequencyCode).toBe("TID");
    expect(p!.doseSchedule).toBe("1-1-1");
    expect(p!.doseQty).toBe(1);
  });

  it("treats a bare trailing number after the name as strength", () => {
    const p = parseMedicineLine("amlodipine 5 od");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.dosage).toBe("5");
    expect(p!.doseQty).toBeNull();
    expect(p!.frequencyCode).toBe("OD");
  });

  it("parses half-tablet doses", () => {
    const p = parseMedicineLine("tab atenolol 50 mg half tab od");
    expect(p!.doseQty).toBe(0.5);
    expect(p!.doseUnit).toBe("tab");
    expect(p!.dosage).toBe("50 mg");
  });

  it("parses empty stomach + weeks duration", () => {
    const p = parseMedicineLine("pantoprazole 40 mg od on empty stomach for 2 weeks");
    expect(p!.foodTiming).toBe("empty_stomach");
    expect(p!.durationValue).toBe(2);
    expect(p!.durationUnit).toBe("weeks");
  });

  it("parses continue duration", () => {
    const p = parseMedicineLine("metformin 500 mg bd continue");
    expect(p!.durationUnit).toBe("continue");
    expect(p!.durationValue).toBeNull();
    expect(p!.duration).toBe("Continue");
  });

  it("parses hs as bedtime frequency", () => {
    const p = parseMedicineLine("atorvastatin 10 mg hs 30 days");
    expect(p!.frequencyCode).toBe("QHS");
  });

  it("parses drops with combined qty token", () => {
    const p = parseMedicineLine("drops ciprofloxacin 2drops tds 7 days");
    expect(p!.form).toBe("drops");
    expect(p!.doseQty).toBe(2);
    expect(p!.doseUnit).toBe("drops");
    expect(p!.frequencyCode).toBe("TID");
  });

  it("keeps multi-word names intact", () => {
    const p = parseMedicineLine("vitamin d3 60000 iu once a week");
    expect(p!.medicineName).toBe("vitamin d3");
    expect(p!.dosage).toBe("60000 iu");
  });

  it("parses percentage strengths", () => {
    const p = parseMedicineLine("cream hydrocortisone 0.05% bd 7 days");
    expect(p!.dosage).toBe("0.05%");
    expect(p!.form).toBe("cream");
    expect(p!.routeCode).toBe("topical");
  });

  it("returns plain name when no sig details present", () => {
    const p = parseMedicineLine("amlodipine");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.dosage).toBe("");
    expect(p!.frequencyCode).toBeNull();
    expect(p!.durationUnit).toBeNull();
    expect(p!.intakePattern).toBeNull();
    expect(p!.source).toBeNull();
  });
});

describe("parseMedicineLine — source + intake pattern", () => {
  it("captures a self-started source without losing the name", () => {
    const p = parseMedicineLine("paracetamol 500 mg bd self-started");
    expect(p!.medicineName).toBe("paracetamol");
    expect(p!.source).toBe("self");
    expect(p!.frequencyCode).toBe("BID");
  });

  it("reads 'self prescribed' as self-started, not prescribed", () => {
    const p = parseMedicineLine("metformin 500 mg od self prescribed");
    expect(p!.medicineName).toBe("metformin");
    expect(p!.source).toBe("self");
  });

  it("captures a doctor-prescribed source", () => {
    const p = parseMedicineLine("amlodipine 5 mg od prescribed");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.source).toBe("prescribed");
  });

  it("maps OTC to a self source", () => {
    const p = parseMedicineLine("cetirizine 10 mg hs otc");
    expect(p!.source).toBe("self");
  });

  it("captures regular intake from the adverb + drops the verb filler", () => {
    const p = parseMedicineLine("amlodipine 5 mg taking regularly");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.intakePattern).toBe("regular");
  });

  it("classifies taken regularly but missed occasionally as regular", () => {
    const p = parseMedicineLine(
      "amlodipine 5 years was taken regularly but missed occasionally",
    );
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.intakePattern).toBe("regular");
    expect(p!.startedAgoValue).toBe(5);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("captures irregular intake", () => {
    const p = parseMedicineLine("metformin 500 mg bd taken irregularly");
    expect(p!.intakePattern).toBe("irregular");
  });

  it("captures 'off and on' as irregular", () => {
    const p = parseMedicineLine("aspirin 75 mg od off and on");
    expect(p!.medicineName).toBe("aspirin");
    expect(p!.intakePattern).toBe("irregular");
  });

  it("does NOT eat the bare adjective in 'regular insulin'", () => {
    const p = parseMedicineLine("regular insulin 10 unit bd");
    expect(p!.medicineName).toBe("regular insulin");
    expect(p!.intakePattern).toBeNull();
  });

  it("implies SOS intake from a PRN frequency", () => {
    const p = parseMedicineLine("paracetamol 500 mg sos");
    expect(p!.frequencyCode).toBe("PRN");
    expect(p!.intakePattern).toBe("prn");
  });
});

describe("parseMedicineLine — on-drug start timing + form inference", () => {
  it("parses 'for 5 years' as started ago", () => {
    const p = parseMedicineLine("metformin 500 mg bd for 5 years");
    expect(p!.medicineName).toBe("metformin");
    expect(p!.startedAgoValue).toBe(5);
    expect(p!.startedAgoUnit).toBe("years");
    expect(p!.frequencyCode).toBe("BID");
  });

  it("parses 'since 2 years' as started ago", () => {
    const p = parseMedicineLine("amlodipine 5 mg od since 2 years");
    expect(p!.startedAgoValue).toBe(2);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("parses combined token '5years'", () => {
    const p = parseMedicineLine("metformin 500 bd 5years");
    expect(p!.startedAgoValue).toBe(5);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("infers tablet form from dose unit when no prefix", () => {
    const p = parseMedicineLine("metformin 500 mg 1 tab od");
    expect(p!.form).toBe("tablet");
    expect(p!.doseUnit).toBe("tab");
  });

  it("keeps explicit form prefix", () => {
    const p = parseMedicineLine("syp dextromethorphan 2 spoon bd");
    expect(p!.form).toBe("syrup");
  });

  it("does not map Rx course 'for 30 days' to started ago", () => {
    const p = parseMedicineLine("amoxicillin 500 mg tds for 30 days");
    expect(p!.startedAgoValue).toBeNull();
    expect(p!.durationValue).toBe(30);
    expect(p!.durationUnit).toBe("days");
  });
});

describe("parseMedicineLine — started-ago connector robustness", () => {
  it("reads a trailing 'ago' for any unit and leaves no residue", () => {
    const p = parseMedicineLine("amlodipine 2 months ago");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.startedAgoValue).toBe(2);
    expect(p!.startedAgoUnit).toBe("months");
    expect(p!.instructions).toBe("");
  });

  it("reads a trailing 'back' (e.g. '2 years back')", () => {
    const p = parseMedicineLine("amlodipine 2 years back");
    expect(p!.startedAgoValue).toBe(2);
    expect(p!.startedAgoUnit).toBe("years");
    expect(p!.instructions).toBe("");
  });

  it("treats 'from' like 'since' for any unit and consumes it", () => {
    const p = parseMedicineLine("amlodipine from 2 months");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.startedAgoValue).toBe(2);
    expect(p!.startedAgoUnit).toBe("months");
  });

  it("skips a fuzzy qualifier before the value (since approx 2 years)", () => {
    const p = parseMedicineLine("amlodipine since approx 2 years");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.startedAgoValue).toBe(2);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("parses no-space '2yrs' and '2mos'", () => {
    expect(parseMedicineLine("amlodipine 2yrs")!.startedAgoUnit).toBe("years");
    expect(parseMedicineLine("amlodipine since 2mos")!.startedAgoUnit).toBe("months");
  });

  it("still does not steal a bare 'for X months' (stays Rx course)", () => {
    const p = parseMedicineLine("amlodipine for 2 months");
    expect(p!.startedAgoValue).toBeNull();
    expect(p!.durationValue).toBe(2);
    expect(p!.durationUnit).toBe("months");
  });
});

describe("parseMedicineLine — bare frequency adverbs", () => {
  it("maps standalone 'daily' to OD (not absorbed into drug name)", () => {
    const p = parseMedicineLine("amlodipine daily for 5 years");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.frequencyCode).toBe("OD");
    expect(p!.startedAgoValue).toBe(5);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("maps nightly/nocte/noct to QHS and mane to OD", () => {
    expect(parseMedicineLine("metformin nightly")!.frequencyCode).toBe("QHS");
    expect(parseMedicineLine("aspirin nocte")!.frequencyCode).toBe("QHS");
    expect(parseMedicineLine("thyroxine mane")!.frequencyCode).toBe("OD");
  });
});

describe("parseMedicineLine — single-letter form prefixes", () => {
  it("reads 't' as tablet when a name follows", () => {
    const p = parseMedicineLine("t amlo 5 for 10 days");
    expect(p!.form).toBe("tablet");
    expect(p!.medicineName).toBe("amlo");
    expect(p!.durationValue).toBe(10);
  });

  it("reads 'c' as capsule and 's' as syrup", () => {
    expect(parseMedicineLine("c omez 20 od")!.form).toBe("capsule");
    expect(parseMedicineLine("c omez 20 od")!.medicineName).toBe("omez");
    expect(parseMedicineLine("s ondem 5 ml bd")!.form).toBe("syrup");
  });

  it("does NOT treat a lone single letter as a form (stays a name search)", () => {
    const p = parseMedicineLine("t");
    // No name beyond the letter → not a parseable med line.
    expect(p === null || p.medicineName === "t").toBe(true);
    if (p) expect(p.form).toBeNull();
  });

  it("does not hijack a single letter mid-line", () => {
    const p = parseMedicineLine("amoxicillin 500 mg t bd");
    expect(p!.medicineName).toBe("amoxicillin");
    // 't' is not the first token, so it must not become a form prefix here.
    expect(p!.form).not.toBe("tablet");
  });
});

describe("parseMedicineLine — past / discontinued status", () => {
  it("defaults to no explicit status for a plain active line", () => {
    const p = parseMedicineLine("amlodipine 5 mg od");
    expect(p!.status).toBeNull();
    expect(p!.stoppedAgoValue).toBeNull();
    expect(p!.stopReason).toBeNull();
  });

  it("does NOT mark a chronic 'for X years' line as past", () => {
    const p = parseMedicineLine("metformin 500 bd for 10 years");
    expect(p!.status).toBeNull();
    expect(p!.startedAgoValue).toBe(10);
    expect(p!.startedAgoUnit).toBe("years");
  });

  it("flags 'stopped' as past and keeps the name clean", () => {
    const p = parseMedicineLine("amlodipine stopped");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.status).toBe("past");
  });

  it("captures stop-timing from 'stopped N months ago'", () => {
    const p = parseMedicineLine("amlodipine stopped 2 months ago");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.status).toBe("past");
    expect(p!.stoppedAgoValue).toBe(2);
    expect(p!.stoppedAgoUnit).toBe("months");
    // Stop timing must NOT leak into on-drug start timing.
    expect(p!.startedAgoValue).toBeNull();
  });

  it("captures stop-timing with a leading stop cue ('stopped <name> ...')", () => {
    const p = parseMedicineLine("stopped metformin 3 weeks ago");
    expect(p!.medicineName).toBe("metformin");
    expect(p!.status).toBe("past");
    expect(p!.stoppedAgoValue).toBe(3);
    expect(p!.stoppedAgoUnit).toBe("weeks");
  });

  it("recognises 'discontinued' and 'd/c' as past", () => {
    expect(parseMedicineLine("telmisartan discontinued")!.status).toBe("past");
    expect(parseMedicineLine("aspirin d/c 1 year ago")!.status).toBe("past");
    expect(parseMedicineLine("aspirin d/c 1 year ago")!.stoppedAgoValue).toBe(1);
  });

  it("recognises 'was on' / 'used to take' / 'no longer on' phrases", () => {
    expect(parseMedicineLine("was on atenolol")!.status).toBe("past");
    expect(parseMedicineLine("was on atenolol")!.medicineName).toBe("atenolol");
    expect(parseMedicineLine("used to take ramipril")!.medicineName).toBe("ramipril");
    expect(parseMedicineLine("no longer on losartan")!.status).toBe("past");
  });

  it("captures a stated stop reason (side effects)", () => {
    const p = parseMedicineLine("statin stopped due to side effects");
    expect(p!.medicineName).toBe("statin");
    expect(p!.status).toBe("past");
    expect(p!.stopReason).toBe("side_effects");
  });

  it("does NOT confuse 'off and on' (irregular) with a past cue", () => {
    const p = parseMedicineLine("amlodipine off and on");
    expect(p!.status).toBeNull();
    expect(p!.intakePattern).toBe("irregular");
  });

  it("treats past-tense 'took <name> N months ago' as past + stop-timing", () => {
    const p = parseMedicineLine("took amlodipine 6 months ago");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.status).toBe("past");
    expect(p!.stoppedAgoValue).toBe(6);
    expect(p!.stoppedAgoUnit).toBe("months");
    // Must not double-count as on-drug start timing.
    expect(p!.startedAgoValue).toBeNull();
  });

  it("strips 'took' from the name even without timing", () => {
    const p = parseMedicineLine("took metformin");
    expect(p!.medicineName).toBe("metformin");
    expect(p!.status).toBe("past");
  });

  it("keeps the name clean when a 'for' connector precedes past stop-timing", () => {
    const p = parseMedicineLine("took amlodipine for 5 years");
    expect(p!.medicineName).toBe("amlodipine");
    expect(p!.status).toBe("past");
  });

  it("recognises 'was taking' / 'had been on' as past", () => {
    expect(parseMedicineLine("was taking atorvastatin")!.status).toBe("past");
    expect(parseMedicineLine("was taking atorvastatin")!.medicineName).toBe("atorvastatin");
    expect(parseMedicineLine("had been on ramipril")!.status).toBe("past");
    expect(parseMedicineLine("had been on ramipril")!.medicineName).toBe("ramipril");
  });
});

describe("lineHasSigDetails", () => {
  it("is false for a bare drug-name search", () => {
    expect(lineHasSigDetails("amlodip")).toBe(false);
    expect(lineHasSigDetails("vitamin d3")).toBe(false);
  });

  it("is true once sig tokens appear", () => {
    expect(lineHasSigDetails("amlodipine 5 mg od")).toBe(true);
    expect(lineHasSigDetails("syp cough syrup 2 spoon")).toBe(true);
    expect(lineHasSigDetails("pcm 1-0-1")).toBe(true);
  });

  it("is true when only a source or intake cue is present", () => {
    expect(lineHasSigDetails("metformin prescribed")).toBe(true);
    expect(lineHasSigDetails("aspirin taking irregularly")).toBe(true);
  });

  it("is true when a past / stop cue is present", () => {
    expect(lineHasSigDetails("amlodipine stopped")).toBe(true);
    expect(lineHasSigDetails("metformin stopped 2 months ago")).toBe(true);
  });
});
