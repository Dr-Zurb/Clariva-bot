import { describe, expect, it, vi } from "vitest";
import { archiveCustomBlockTemplates } from "@/lib/cockpit/archive-custom-block-templates";

describe("archiveCustomBlockTemplates (subj-42)", () => {
  it("archives every id when all calls succeed", async () => {
    const archive = vi.fn().mockResolvedValue(undefined);
    const result = await archiveCustomBlockTemplates("token", ["a", "b"], archive);
    expect(result).toEqual({ archivedIds: ["a", "b"], failedIds: [] });
    expect(archive).toHaveBeenCalledTimes(2);
  });

  it("keeps successes and records failures without throwing (partial failure)", async () => {
    const archive = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);

    const result = await archiveCustomBlockTemplates("token", ["a", "b", "c"], archive);
    expect(result).toEqual({ archivedIds: ["a", "c"], failedIds: ["b"] });
  });

  it("archives nothing when the id list is empty", async () => {
    const archive = vi.fn();
    const result = await archiveCustomBlockTemplates("token", [], archive);
    expect(result).toEqual({ archivedIds: [], failedIds: [] });
    expect(archive).not.toHaveBeenCalled();
  });
});
