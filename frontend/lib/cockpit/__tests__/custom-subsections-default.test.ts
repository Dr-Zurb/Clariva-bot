import { describe, expect, it } from "vitest";
import {
  createEmptyCustomSubsection,
  customSubsectionsStructureKey,
  customSubsectionsToDefaultTemplate,
  normalizeCustomSubsectionInForm,
  seedCustomSubsectionsFromDefault,
  updateCustomSubsection,
} from "@/lib/cockpit/custom-subsections";
import type { CustomSubsection } from "@/types/prescription";

const VISIT_SECTIONS: CustomSubsection[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    title: "Travel",
    body: "Visited Kerala",
    children: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
        title: "Prophylaxis",
        body: "Doxycycline",
      },
    ],
  },
];

describe("custom subsections default template (subj-21/36)", () => {
  it("strips bodies and preserves existing ids for the doctor default template", () => {
    const template = customSubsectionsToDefaultTemplate(VISIT_SECTIONS);
    expect(template).toHaveLength(1);
    expect(template[0].title).toBe("Travel");
    expect(template[0].body).toBeNull();
    expect(template[0].id).toBe(VISIT_SECTIONS[0].id);
    expect(template[0].children[0].title).toBe("Prophylaxis");
    expect(template[0].children[0].body).toBeNull();
    expect(template[0].children[0].id).toBe(VISIT_SECTIONS[0].children[0].id);
  });

  it("mints an id only for an absent/malformed section id", () => {
    const template = customSubsectionsToDefaultTemplate([
      {
        id: "   ",
        title: "Legacy",
        body: "old",
        children: [{ id: undefined as unknown as string, title: "Child", body: "x" }],
      },
    ]);
    expect(template[0].id.trim().length).toBeGreaterThan(0);
    expect(template[0].id).not.toBe("   ");
    expect(template[0].children[0].id.trim().length).toBeGreaterThan(0);
  });

  it("seeds a fresh visit from the doctor default preserving ids with empty bodies", () => {
    const defaults: CustomSubsection[] = [
      {
        id: "cccccccc-cccc-4ccc-8ccc-000000000003",
        title: "Occupation",
        body: null,
        children: [],
      },
    ];
    const seeded = seedCustomSubsectionsFromDefault(defaults);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].title).toBe("Occupation");
    expect(seeded[0].body).toBeNull();
    expect(seeded[0].id).toBe(defaults[0].id);
  });

  it("seeding the same template twice yields identical ids (cross-visit stability)", () => {
    const template = customSubsectionsToDefaultTemplate(VISIT_SECTIONS);
    const firstSeed = seedCustomSubsectionsFromDefault(template);
    const secondSeed = seedCustomSubsectionsFromDefault(template);

    expect(firstSeed[0].id).toBe(template[0].id);
    expect(secondSeed[0].id).toBe(template[0].id);
    expect(firstSeed[0].id).toBe(secondSeed[0].id);
    expect(firstSeed[0].children[0].id).toBe(template[0].children[0].id);
    expect(secondSeed[0].children[0].id).toBe(template[0].children[0].id);
  });

  it("an ad-hoc section keeps its uuid through template autosave + next-visit seed", () => {
    const adHoc = createEmptyCustomSubsection("eeeeeeee-eeee-4eee-8eee-000000000005");
    adHoc.title = "Hobbies";
    adHoc.body = "Cycling";

    const template = customSubsectionsToDefaultTemplate([adHoc]);
    expect(template[0].id).toBe(adHoc.id);

    const seeded = seedCustomSubsectionsFromDefault(template);
    expect(seeded[0].id).toBe(adHoc.id);
  });

  it("omits untitled sections from the default template", () => {
    const template = customSubsectionsToDefaultTemplate([
      { id: "dddddddd-dddd-4ddd-8ddd-000000000004", title: "   ", body: "x", children: [] },
      ...VISIT_SECTIONS,
    ]);
    expect(template).toHaveLength(1);
    expect(template[0].title).toBe("Travel");
  });

  it("structure key ignores ids and bodies", () => {
    const withBody = customSubsectionsStructureKey(VISIT_SECTIONS);
    const withoutBody = customSubsectionsStructureKey([
      {
        ...VISIT_SECTIONS[0],
        id: "other-id",
        body: "Different notes",
        children: [{ ...VISIT_SECTIONS[0].children[0], id: "other-child", body: "Other" }],
      },
    ]);
    expect(withBody).toBe(withoutBody);
  });

  it("updateCustomSubsection preserves trailing spaces during edit", () => {
    const sections = updateCustomSubsection(VISIT_SECTIONS, 0, { title: "Travel " });
    expect(sections[0].title).toBe("Travel ");
    expect(normalizeCustomSubsectionInForm(sections[0]).title).toBe("Travel ");
  });

  it("default template trims titles on persistence", () => {
    const template = customSubsectionsToDefaultTemplate([
      { ...VISIT_SECTIONS[0], title: " Travel history " },
    ]);
    expect(template[0].title).toBe("Travel history");
  });
});
