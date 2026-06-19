import { describe, expect, it } from "vitest";
import {
  COMPLAINT_SHARED_FIELD_KEYS,
  ABDOMEN_RADIATION_CHIPS,
  CHEST_CHARACTER_CHIPS,
  CHEST_LOCATION_CHIPS,
  CHEST_RADIATION_CHIPS,
  CHEST_WHEN_CHIPS,
  FEVER_CHILLS_CHIPS,
  FEVER_PATTERN_CHIPS,
  HEADACHE_ASSOCIATED_CHIPS,
  HEADACHE_RADIATION_CHIPS,
  LOIN_RADIATION_CHIPS,
  HEADACHE_CHARACTER_CHIPS,
  HEADACHE_LOCATION_CHIPS,
  HEADACHE_SIDE_CHIPS,
  inferComplaintCategoryFromName,
  isChestPainSchema,
  isFeverComplaintTimingField,
  isHeadacheSchema,
  normalizeChestPainCharacterValue,
  normalizeChestPainLocationValue,
  normalizeChestPainWhenValue,
  normalizeFeverChillsValue,
  normalizeFeverTimingValue,
  normalizeHeadacheCharacterValue,
  normalizeHeadacheLocationValue,
  normalizeOnsetValue,
  normalizePainTimingValue,
  ONSET_CHIPS,
  resolveComplaintAttributeFields,
  resolveComplaintCategory,
  resolveAssociatedSymptomChips,
  resolveComplaintNameFieldDefaults,
  resolveLateralityChips,
  resolveRadiationChips,
  sharedComplaintFieldKeys,
} from "@/lib/cockpit/complaint-schema";

const labels = (name: string, category?: string) =>
  resolveComplaintAttributeFields({ complaintName: name, category }).map((f) => f.label);

describe("complaint-schema resolver", () => {
  it("infers pain from headache-like names", () => {
    expect(inferComplaintCategoryFromName("Headache")).toBe("pain");
    expect(inferComplaintCategoryFromName("leg pain")).toBe("pain");
    expect(resolveComplaintCategory({ complaintName: "Migraine" })).toBe("pain");
  });

  it("infers fever and cough categories", () => {
    expect(inferComplaintCategoryFromName("Fever")).toBe("fever");
    expect(inferComplaintCategoryFromName("high temperature")).toBe("fever");
    expect(inferComplaintCategoryFromName("Dry cough")).toBe("cough");
  });

  it("defaults unknown complaints to a neutral (de-pained) schema", () => {
    expect(resolveComplaintCategory({ complaintName: "Fatigue" })).toBe("default");
    const fields = resolveComplaintAttributeFields({ complaintName: "Fatigue" });
    expect(fields.map((f) => f.label)).toEqual([
      "Onset",
      "Duration",
      "Site / area",
      "Severity",
      "Notes",
    ]);
    // No pain semantics (radiation / SOCRATES character chips) in the catch-all.
    expect(fields.some((f) => f.key === "radiation")).toBe(false);
    expect(fields.some((f) => f.key === "character")).toBe(false);
  });

  it("routes the new clinical categories from free text", () => {
    expect(inferComplaintCategoryFromName("Blurred vision")).toBe("eye");
    expect(inferComplaintCategoryFromName("Hearing loss")).toBe("ear");
    expect(inferComplaintCategoryFromName("Heart racing")).toBe("cardiac");
    expect(inferComplaintCategoryFromName("Dizziness")).toBe("dizziness");
    expect(inferComplaintCategoryFromName("Fainting")).toBe("dizziness");
    expect(inferComplaintCategoryFromName("Irregular periods")).toBe("gynae");
    expect(inferComplaintCategoryFromName("Anxiety")).toBe("mental");
    expect(inferComplaintCategoryFromName("Difficulty sleeping")).toBe("mental");
    expect(inferComplaintCategoryFromName("Dog bite")).toBe("trauma");
    expect(inferComplaintCategoryFromName("Fall injury")).toBe("trauma");
  });

  it("keeps tricky names out of false-positive categories", () => {
    // "burn"/"bite" must not shadow GIT / urinary; "ear" must not catch "heart".
    expect(inferComplaintCategoryFromName("Heartburn")).toBe("git");
    expect(inferComplaintCategoryFromName("Burning urination")).toBe("urinary");
    // "periods" (plural) is gynae; singular "Period pain" stays pain.
    expect(inferComplaintCategoryFromName("Period pain")).toBe("pain");
    // "Hair fall" must not route to trauma via "fall" (no keyword → null → default).
    expect(inferComplaintCategoryFromName("Hair fall")).toBeNull();
    expect(resolveComplaintCategory({ complaintName: "Hair fall" })).toBe("default");
  });

  it("returns headache-specific side and head-region fields (not generic pain)", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Headache" });
    expect(fields.map((f) => f.label)).toEqual([
      "Side",
      "Where on head",
      "Onset",
      "Duration",
      "How it feels",
      "Radiates to",
      "Pattern",
      "Worsened by",
      "Relieved by",
      "Pain score (0–10)",
      "Severity",
      "Notes",
    ]);
    expect(isHeadacheSchema(fields)).toBe(true);
    const side = fields.find((f) => f.key === "laterality");
    expect(side?.chips).toEqual([...HEADACHE_SIDE_CHIPS]);
    const region = fields.find((f) => f.key === "location");
    expect(region?.chips).toEqual([...HEADACHE_LOCATION_CHIPS]);
    const character = fields.find((f) => f.key === "character");
    expect(character?.chips).toEqual([...HEADACHE_CHARACTER_CHIPS]);
    const radiation = fields.find((f) => f.key === "radiation");
    expect(radiation?.type).toBe("chips");
    expect(radiation?.chips).toEqual([...HEADACHE_RADIATION_CHIPS]);
    const pattern = fields.find((f) => f.key === "timing");
    expect(pattern?.chips).toContain("On waking");
    expect(pattern?.chips).toContain("Comes and goes");
  });

  it("uses patient-language onset and pain pattern chips across the pain family", () => {
    const knee = resolveComplaintAttributeFields({ complaintName: "Knee pain" });
    expect(knee.find((f) => f.key === "onset")?.chips).toEqual([...ONSET_CHIPS]);
    expect(knee.find((f) => f.key === "timing")?.label).toBe("Pattern");
    expect(knee.find((f) => f.key === "aggravating")?.label).toBe("Worsened by");
    expect(normalizeOnsetValue("acute")).toBe("Sudden");
    expect(normalizePainTimingValue("intermittent")).toBe("Comes and goes");
    expect(normalizeHeadacheLocationValue("Frontal")).toBe("Forehead");
    expect(normalizeHeadacheCharacterValue("pounding")).toBe("Throbbing");
  });

  it("applies headache schema to migraine by name", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Migraine" });
    expect(fields[0]?.label).toBe("Side");
    expect(fields[1]?.label).toBe("Where on head");
  });

  it("suggests patient-language associated chips for headache", () => {
    expect(resolveAssociatedSymptomChips({ complaintName: "Headache" })).toEqual([
      ...HEADACHE_ASSOCIATED_CHIPS,
    ]);
  });

  it("suggests standalone associated chips for chest pain and fever", () => {
    expect(resolveAssociatedSymptomChips({ complaintName: "Chest pain" })).toEqual([
      "breathlessness",
      "sweating",
      "palpitations",
      "nausea",
      "giddiness",
      "fainting",
    ]);
    expect(resolveAssociatedSymptomChips({ complaintName: "Fever" })).toEqual([
      "cough",
      "sore throat",
      "loose stools",
      "burning urination",
      "vomiting",
      "body ache",
    ]);
    expect(resolveAssociatedSymptomChips({ complaintName: "Ear discharge" })).toContain(
      "ringing in ear",
    );
    expect(resolveAssociatedSymptomChips({ complaintName: "Itching" })).toContain("skin pain");
  });

  it("omits laterality for pain with no obvious side/position", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Body ache" });
    expect(fields.some((f) => f.key === "laterality")).toBe(false);
    expect(fields[0]?.label).toBe("Site");
  });

  it("resolves body-part-aware laterality chips", () => {
    expect(resolveLateralityChips({ complaintName: "Knee pain" })).toEqual([
      "Left",
      "Right",
      "Both",
    ]);
    expect(resolveLateralityChips({ complaintName: "Chest pain" })).toEqual([
      "Left",
      "Right",
      "Central",
    ]);
    expect(resolveLateralityChips({ complaintName: "Lower back pain" })).toEqual([
      "Upper",
      "Mid",
      "Lower",
    ]);
    expect(resolveLateralityChips({ complaintName: "Headache" })).toEqual([]);
    expect(resolveLateralityChips({ complaintName: "Fever" })).toEqual([]);
  });

  it("returns generic pain laterality for non-headache limb pain", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Knee pain" });
    expect(fields[0]?.label).toBe("Side / position");
    expect(fields[0]?.chips).toEqual(["Left", "Right", "Both"]);
    expect(fields[1]?.label).toBe("Site");
  });

  it("gives abdomen pain a 9-region grid and de-overlaps the Site field", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Stomach pain" });
    // The grid IS the locator → labelled distinctly, with 9 lay-language quadrants.
    expect(fields[0]?.label).toBe("Abdomen area");
    expect(fields[0]?.chips).toEqual([
      "Upper right",
      "Upper middle",
      "Upper left",
      "Right side",
      "Around navel",
      "Left side",
      "Lower right",
      "Lower middle",
      "Lower left",
    ]);
    // The generic SOCRATES "Site" text field is relabelled to remove the overlap.
    const site = fields.find((f) => f.key === "location");
    expect(site?.label).toBe("Exact spot (optional)");
    const radiation = fields.find((f) => f.key === "radiation");
    expect(radiation?.type).toBe("chips");
    expect(radiation?.chips).toEqual([...ABDOMEN_RADIATION_CHIPS]);
    expect(fields.some((f) => f.label === "Side / position")).toBe(false);
  });

  it("resolves body-part-aware radiation chips for pain", () => {
    expect(resolveRadiationChips({ complaintName: "Chest pain" })).toEqual([
      ...CHEST_RADIATION_CHIPS,
    ]);
    expect(resolveRadiationChips({ complaintName: "Stomach pain" })).toEqual([
      ...ABDOMEN_RADIATION_CHIPS,
    ]);
    expect(resolveRadiationChips({ complaintName: "Flank pain" })).toEqual([
      ...LOIN_RADIATION_CHIPS,
    ]);
    expect(resolveRadiationChips({ complaintName: "Lower back pain" })).toEqual([
      "Down the leg",
      "Buttock",
      "Both legs",
      "None",
    ]);
    expect(resolveRadiationChips({ complaintName: "Shoulder pain" })).toEqual([
      "Down the arm",
      "Neck",
      "None",
    ]);
    expect(resolveRadiationChips({ complaintName: "Knee pain" })).toEqual([
      "Up the limb",
      "Down the limb",
      "None",
    ]);
    expect(resolveRadiationChips({ complaintName: "Headache" })).toEqual([]);
  });

  it("returns chest-pain-specific fields (not generic limb SOCRATES)", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Chest pain" });
    expect(isChestPainSchema(fields)).toBe(true);
    expect(fields.map((f) => f.label)).toEqual([
      "Where in chest",
      "Exact spot (optional)",
      "Onset",
      "Duration",
      "How it feels",
      "Radiates to",
      "When",
      "Worsened by",
      "Relieved by",
      "Pain score (0–10)",
      "Severity",
      "Notes",
    ]);
    expect(fields.find((f) => f.key === "laterality")?.chips).toEqual([...CHEST_LOCATION_CHIPS]);
    expect(fields.find((f) => f.key === "character")?.chips).toEqual([...CHEST_CHARACTER_CHIPS]);
    expect(fields.find((f) => f.key === "timing")?.chips).toEqual([...CHEST_WHEN_CHIPS]);
    expect(fields.find((f) => f.key === "radiation")?.chips).toEqual([...CHEST_RADIATION_CHIPS]);
    expect(normalizeChestPainLocationValue("central")).toBe("Behind breastbone");
    expect(normalizeChestPainCharacterValue("sharp")).toBe("Sharp / stabbing");
    expect(normalizeChestPainWhenValue("on exertion")).toBe("On exertion");
  });

  it("applies chest pain schema to chest discomfort by name", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Chest discomfort" });
    expect(isChestPainSchema(fields)).toBe(true);
    expect(fields[0]?.label).toBe("Where in chest");
  });

  it("gives loin pain paired laterality and renal radiation chips", () => {
    expect(resolveLateralityChips({ complaintName: "Flank pain" })).toEqual([
      "Left",
      "Right",
      "Both",
    ]);
    const fields = resolveComplaintAttributeFields({ complaintName: "Kidney pain" });
    const radiation = fields.find((f) => f.key === "radiation");
    expect(radiation?.chips).toEqual([...LOIN_RADIATION_CHIPS]);
  });

  it("keeps Upper/Mid/Lower for back pain (not the abdomen grid)", () => {
    expect(resolveLateralityChips({ complaintName: "Lower back pain" })).toEqual([
      "Upper",
      "Mid",
      "Lower",
    ]);
  });

  it("offers a 0–10 pain scale on pain cards", () => {
    const knee = resolveComplaintAttributeFields({ complaintName: "Knee pain" });
    const scale = knee.find((f) => f.key === "painScore");
    expect(scale?.type).toBe("painscale");
    expect(scale?.label).toBe("Pain score (0–10)");
    // Non-pain schemas (e.g. fever) do not get the scale.
    expect(
      resolveComplaintAttributeFields({ complaintName: "Fever" }).some(
        (f) => f.key === "painScore",
      ),
    ).toBe(false);
  });

  it("returns fever-specific fields", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Fever" });
    expect(fields.map((f) => f.label)).toEqual([
      "Duration",
      "Measured",
      "Reported by",
      "Temperature",
      "Pattern",
      "Chills",
      "Notes",
    ]);
  });

  it("uses patient-language chips for fever pattern", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Fever" });
    const pattern = fields.find((f) => f.key === "timing");
    expect(pattern?.chips).toEqual([...FEVER_PATTERN_CHIPS]);
    expect(isFeverComplaintTimingField(fields)).toBe(true);
    expect(isFeverComplaintTimingField(resolveComplaintAttributeFields({ complaintName: "Cough" }))).toBe(
      false,
    );
  });

  it("normalizes legacy medical fever timing tokens to patient language", () => {
    expect(normalizeFeverTimingValue("intermittent")).toBe("Comes and goes");
    expect(normalizeFeverTimingValue("continuous")).toBe("Constant");
    expect(normalizeFeverTimingValue("remittent")).toBe("Drops then spikes again");
    expect(normalizeFeverTimingValue("COMES AND GOES")).toBe("Comes and goes");
    expect(normalizeFeverTimingValue("custom note")).toBe("custom note");
  });

  it("uses patient-language chips for fever chills", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Fever" });
    const chills = fields.find((f) => f.key === "aggravating");
    expect(chills?.chips).toEqual([...FEVER_CHILLS_CHIPS]);
    expect(normalizeFeverChillsValue("rigors")).toBe("shaking chills");
    expect(normalizeFeverChillsValue("SHAKING CHILLS")).toBe("shaking chills");
  });

  it("returns cough-specific fields", () => {
    const fields = resolveComplaintAttributeFields({ complaintName: "Cough" });
    expect(fields.map((f) => f.label)).toEqual([
      "Type",
      "Duration",
      "Sputum",
      "Worse",
      "Notes",
    ]);
  });

  it("routes GIT / urinary / respiratory / ENT / derm complaints", () => {
    expect(inferComplaintCategoryFromName("Loose stools")).toBe("git");
    expect(inferComplaintCategoryFromName("Burning urination")).toBe("urinary");
    expect(inferComplaintCategoryFromName("Shortness of breath")).toBe("respiratory");
    expect(inferComplaintCategoryFromName("Blocked nose")).toBe("ent");
    expect(inferComplaintCategoryFromName("Itching")).toBe("derm");

    expect(
      resolveComplaintAttributeFields({ complaintName: "Loose stools" }).some(
        (f) => f.key === "frequency",
      ),
    ).toBe(true);
  });

  it("prefers an explicit category over name inference (Phase 2 seam)", () => {
    // "Cough" infers cough, but an explicit fever category wins (and "Cough"
    // is not a bespoke name override, so the category schema applies).
    expect(resolveComplaintCategory({ complaintName: "Cough", category: "fever" })).toBe("fever");
    expect(labels("Cough", "fever")).toContain("Temperature");
  });

  it("lets a bespoke name override beat even an explicit category", () => {
    // "Dog bite" is category=trauma in the catalog, but the bite schema wins
    // (no generic 'Mechanism' chips that contradict the name).
    const bite = labels("Dog bite", "trauma");
    expect(bite).toContain("Local reaction");
    expect(bite).not.toContain("Mechanism");
    // Headache override wins over a (contrived) explicit fever category.
    expect(labels("Headache", "fever")).toContain("Side");
  });

  describe("name overrides fix restating / contradicting fields", () => {
    it("bite asks local reaction, not mechanism", () => {
      const f = labels("Insect bite");
      expect(f).toEqual([
        "Site",
        "Local reaction",
        "Bleeding",
        "Time since bite",
        "Tetanus / anti-rabies / anti-venom",
        "Severity",
        "Notes",
      ]);
    });

    it("burn asks cause; heartburn is dyspepsia (not burn)", () => {
      expect(labels("Burn")).toContain("Cause");
      // whole-word match: 'heartburn' must NOT trigger the burn override
      const heartburn = labels("Heartburn");
      expect(heartburn).not.toContain("Cause");
      expect(heartburn).toContain("Triggers");
      expect(heartburn).not.toContain("Episodes / day");
    });

    it("vomiting asks content, not stool consistency", () => {
      const f = labels("Vomiting");
      expect(f).toContain("Content");
      expect(f).not.toContain("Consistency / content");
    });

    it("constipation asks bowel frequency, not episodes/day", () => {
      const f = labels("Constipation");
      expect(f).toContain("Bowel frequency");
      expect(f).not.toContain("Episodes / day");
    });

    it("sore throat asks swallowing + voice, not nasal discharge colour", () => {
      const f = labels("Sore throat");
      expect(f).toContain("Throat");
      expect(f).toContain("Voice");
      expect(f).not.toContain("Discharge colour");
    });

    it("fainting is an event schema, not dizziness 'Type'", () => {
      const f = labels("Fainting");
      expect(f).toContain("Episode length");
      expect(f).toContain("Recovery");
    });

    it("ringing in ears (tinnitus) asks sound, not ear discharge", () => {
      const f = labels("Ringing in ears");
      expect(f).toContain("Sound");
      expect(f).not.toContain("Discharge");
    });

    it("something in eye is a foreign-body schema", () => {
      const f = labels("Something in eye");
      expect(f).toContain("What got in");
      expect(f).not.toContain("Vision affected");
    });

    it("missed periods asks LMP / pregnancy, not flow", () => {
      const f = labels("Missed periods");
      expect(f).toContain("Last period (LMP)");
      expect(f).toContain("Pregnancy possible");
      expect(f).not.toContain("Flow");
    });

    it("hearing loss asks onset, not a redundant 'Hearing affected?'", () => {
      const f = labels("Hearing loss");
      expect(f).toEqual(["Which ear", "Onset", "Duration", "Discharge", "Severity", "Notes"]);
      expect(f).not.toContain("Hearing affected");
    });

    it("blurred / double vision ask onset + pattern, not 'Vision affected?'", () => {
      const blurred = labels("Blurred vision");
      expect(blurred).toEqual([
        "Which eye",
        "Onset",
        "Duration",
        "Pattern",
        "Triggers / associated",
        "Severity",
        "Notes",
      ]);
      expect(blurred).not.toContain("Vision affected");
      expect(labels("Double vision")).not.toContain("Vision affected");
    });

    it("keeps 'Vision affected' only where vision may be normal (red / watering eye)", () => {
      expect(labels("Red eye")).toContain("Vision affected");
      expect(labels("Watering eye")).toContain("Vision affected");
    });

    it("does not let 'hair fall' trigger the injury override", () => {
      const f = labels("Hair fall");
      expect(f).not.toContain("Site of injury");
      expect(f).toEqual(["Onset", "Duration", "Site / area", "Severity", "Notes"]);
    });

    it("ear discharge asks discharge type, not a contradictory 'Discharge: none?'", () => {
      const f = labels("Ear discharge");
      expect(f).toEqual([
        "Which ear",
        "Discharge type",
        "Ear pain",
        "Hearing affected",
        "Duration",
        "Severity",
        "Notes",
      ]);
      const type = resolveComplaintAttributeFields({ complaintName: "Ear discharge" }).find(
        (x) => x.label === "Discharge type",
      );
      expect(type?.chips).toContain("foul-smelling");
    });

    it("matches ear discharge from lay phrasing too (pus from ear)", () => {
      expect(labels("pus from ear")).toContain("Discharge type");
    });

    it("eye discharge (sticky eye) asks discharge type + redness / itching", () => {
      const f = labels("Eye discharge");
      expect(f).toEqual([
        "Which eye",
        "Discharge type",
        "Redness",
        "Itching",
        "Duration",
        "Severity",
        "Notes",
      ]);
      expect(labels("sticky eyes")).toContain("Discharge type");
    });

    it("vaginal / white discharge asks colour + consistency, not gynae flow", () => {
      const f = labels("White discharge");
      expect(f).toEqual([
        "Colour",
        "Consistency",
        "Smell",
        "Itching / irritation",
        "Duration",
        "Severity",
        "Notes (LMP, pregnancy, burning urine)",
      ]);
      expect(f).not.toContain("Flow");
      expect(labels("leucorrhoea")).toContain("Consistency");
    });

    it("nosebleed (epistaxis) is a bleeding schema, not nasal discharge", () => {
      const f = labels("Nosebleed");
      expect(f).toEqual([
        "Which nostril",
        "How often",
        "Amount",
        "Triggers",
        "Duration",
        "Severity",
        "Notes (BP, bleeding disorder, medicines)",
      ]);
      expect(f).not.toContain("Discharge colour");
      expect(labels("bleeding from nose")).toContain("Which nostril");
      expect(labels("epistaxis")).toContain("Which nostril");
    });
  });

  it("pre-fills colour from a 'white discharge' name", () => {
    expect(resolveComplaintNameFieldDefaults("White discharge")).toEqual({ color: "white" });
  });

  describe("name-implied field prefill (RESTATES)", () => {
    it("seeds the chip value the name already states", () => {
      expect(resolveComplaintNameFieldDefaults("Dry cough")).toEqual({ character: "dry" });
      expect(resolveComplaintNameFieldDefaults("Fever with chills")).toEqual({ aggravating: "yes" });
      expect(resolveComplaintNameFieldDefaults("Fever with shivering")).toEqual({
        aggravating: "shaking chills",
      });
      expect(resolveComplaintNameFieldDefaults("Continuous fever")).toEqual({ timing: "Constant" });
      expect(resolveComplaintNameFieldDefaults("Fever that comes and goes")).toEqual({
        timing: "Comes and goes",
      });
      expect(resolveComplaintNameFieldDefaults("Blocked nose")).toEqual({ character: "blocked" });
      expect(resolveComplaintNameFieldDefaults("Irregular periods")).toEqual({ timing: "irregular" });
      expect(resolveComplaintNameFieldDefaults("Cough with blood")).toEqual({
        character: "productive",
        color: "blood-streaked",
      });
    });

    it("does not prefill vision / hearing (handled by reframed schemas)", () => {
      expect(resolveComplaintNameFieldDefaults("Blurred vision")).toEqual({});
      expect(resolveComplaintNameFieldDefaults("Hearing loss")).toEqual({});
    });

    it("returns empty for names with nothing implied", () => {
      expect(resolveComplaintNameFieldDefaults("Fever")).toEqual({});
      expect(resolveComplaintNameFieldDefaults("")).toEqual({});
    });
  });

  describe("eye / ear pain routing consistency", () => {
    it("routes eye/ear pain to pain (with laterality), not the eye/ear schema", () => {
      expect(inferComplaintCategoryFromName("Eye pain")).toBe("pain");
      expect(inferComplaintCategoryFromName("Ear pain")).toBe("pain");
      expect(inferComplaintCategoryFromName("Earache")).toBe("pain");
      // function complaints still route to eye/ear
      expect(inferComplaintCategoryFromName("Blurred vision")).toBe("eye");
      expect(inferComplaintCategoryFromName("Hearing loss")).toBe("ear");
    });
  });

  it("preserves shared field keys when re-resolving between categories", () => {
    const painToFever = sharedComplaintFieldKeys("pain", "fever");
    expect(painToFever).toContain("duration");
    expect(painToFever).toContain("notes");

    for (const key of COMPLAINT_SHARED_FIELD_KEYS) {
      const painHas = resolveComplaintAttributeFields({ category: "pain" }).some(
        (f) => f.key === key,
      );
      const defaultHas = resolveComplaintAttributeFields({ category: "default" }).some(
        (f) => f.key === key,
      );
      if (painHas && defaultHas) {
        expect(sharedComplaintFieldKeys("pain", "default")).toContain(key);
      }
    }
  });
});
