import { describe, expect, it } from "vitest";
import {
  hydrateAdviceField,
  resolveAdviceForOutput,
} from "@/lib/cockpit/advice-format";
import {
  ADVICE_ATTACHMENT_CATEGORY,
  filterAdviceAttachments,
  isAdviceAttachment,
} from "@/lib/cockpit/advice-media";

describe("advice-format", () => {
  it("merges advice and legacy patient education", () => {
    expect(resolveAdviceForOutput("Rest", "Hydrate")).toBe("Rest\nHydrate");
    expect(resolveAdviceForOutput("Rest\nHydrate", "Hydrate")).toBe(
      "Rest\nHydrate",
    );
    expect(resolveAdviceForOutput(null, "Hydrate")).toBe("Hydrate");
    expect(resolveAdviceForOutput("Rest", null)).toBe("Rest");
    expect(resolveAdviceForOutput("  ", "  ")).toBeNull();
  });

  it("hydrates a single advice field", () => {
    expect(hydrateAdviceField("Rest", "SOS")).toBe("Rest\nSOS");
    expect(hydrateAdviceField(null, null)).toBe("");
  });
});

describe("advice-media", () => {
  it("tags advice path segments", () => {
    expect(
      isAdviceAttachment({
        file_path: `doc/rx/${ADVICE_ATTACHMENT_CATEGORY}/uuid-sheet.pdf`,
      }),
    ).toBe(true);
    expect(
      isAdviceAttachment({ file_path: "doc/rx/objective/uuid-wound.jpg" }),
    ).toBe(false);
    expect(
      filterAdviceAttachments([
        { file_path: "doc/rx/advice/a.pdf", id: "1" },
        { file_path: "doc/rx/objective/b.jpg", id: "2" },
      ] as never),
    ).toHaveLength(1);
  });
});
