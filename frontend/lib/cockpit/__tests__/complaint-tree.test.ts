import { describe, expect, it } from "vitest";
import {
  addComplaintToTree,
  demoteComplaintUnderParent,
  getDemoteComplaintError,
  getPromoteAssociatedComplaintError,
  promoteAssociatedComplaint,
  removeComplaintFromTree,
  updateComplaintInTree,
} from "@/lib/cockpit/complaint-tree";
import {
  createEmptyComplaint,
  deriveCcFromComplaints,
  deriveHopiFromComplaints,
  formatComplaintHopiBlock,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";

const PARENT: Complaint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Chest pain",
  severity: "severe",
};

const CHILD: Complaint = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Breathlessness",
  timing: "on exertion",
  duration: "2 days",
};

describe("complaint-tree", () => {
  it("adds associated complaints under a parent only (one level)", () => {
    let tree = [PARENT];
    tree = addComplaintToTree(tree, CHILD, PARENT.id);
    expect(tree[0].associatedComplaints).toHaveLength(1);
    expect(tree[0].associatedComplaints![0].name).toBe("Breathlessness");
    expect(tree[0].associatedComplaints![0].associatedComplaints).toBeUndefined();
  });

  it("removing parent drops nested children", () => {
    let tree = addComplaintToTree([PARENT], CHILD, PARENT.id);
    tree = removeComplaintFromTree(tree, 0);
    expect(tree).toHaveLength(0);
  });

  it("updates nested child attributes", () => {
    let tree = addComplaintToTree([PARENT], CHILD, PARENT.id);
    tree = updateComplaintInTree(
      tree,
      0,
      { severity: "moderate" },
      PARENT.id,
    );
    expect(tree[0].associatedComplaints![0].severity).toBe("moderate");
  });

  it("promotes an associated complaint after its parent", () => {
    const nausea = {
      ...createEmptyComplaint("44444444-4444-4444-8444-444444444444"),
      name: "Nausea",
    };
    let tree = addComplaintToTree([PARENT], CHILD, PARENT.id);
    tree = addComplaintToTree(tree, nausea, PARENT.id);
    tree = promoteAssociatedComplaint(tree, PARENT.id, 0);

    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("Chest pain");
    expect(tree[0].associatedComplaints).toHaveLength(1);
    expect(tree[0].associatedComplaints![0].name).toBe("Nausea");
    expect(tree[1].name).toBe("Breathlessness");
    expect(tree[1].timing).toBe("on exertion");
    expect(tree[1].associatedComplaints).toBeUndefined();
  });

  it("demotes a root complaint under another parent", () => {
    const nausea = {
      ...createEmptyComplaint("44444444-4444-4444-8444-444444444444"),
      name: "Nausea",
      severity: "mild",
    };
    let tree = [PARENT, nausea];
    tree = demoteComplaintUnderParent(tree, 1, PARENT.id);

    expect(tree).toHaveLength(1);
    expect(tree[0].associatedComplaints).toHaveLength(1);
    expect(tree[0].associatedComplaints![0].name).toBe("Nausea");
    expect(tree[0].associatedComplaints![0].severity).toBe("mild");
    expect(deriveCcFromComplaints(tree)).toBe("Chest pain");
  });

  it("blocks demote when source has associated children", () => {
    const parentWithChild = {
      ...PARENT,
      associatedComplaints: [CHILD],
    };
    const fever = {
      ...createEmptyComplaint("55555555-5555-4555-8555-555555555555"),
      name: "Fever",
    };
    const tree = [parentWithChild, fever];
    expect(getDemoteComplaintError(tree, 0, fever.id)).toBe("has_children");
    expect(demoteComplaintUnderParent(tree, 0, fever.id)).toBe(tree);
  });

  it("blocks promote when the name already exists at root", () => {
    const duplicateRoot = { ...CHILD, id: "55555555-5555-4555-8555-555555555555" };
    let tree = addComplaintToTree([PARENT, duplicateRoot], CHILD, PARENT.id);
    expect(getPromoteAssociatedComplaintError(tree, PARENT.id, 0)).toBe("duplicate_name");
    expect(promoteAssociatedComplaint(tree, PARENT.id, 0)).toBe(tree);
  });
});

describe("nested hopi derivation", () => {
  it("renders associated complaints as indented sub-lines; cc stays top-level", () => {
    const parent: Complaint = {
      ...PARENT,
      associatedComplaints: [CHILD],
    };
    expect(deriveCcFromComplaints([parent])).toBe("Chest pain");
    expect(formatComplaintHopiBlock(parent)).toBe(
      [
        "Chest pain — Severity: severe",
        "  • Associated: Breathlessness — Duration: 2 days; When: on exertion",
      ].join("\n"),
    );
    expect(deriveHopiFromComplaints([parent])).toBe(formatComplaintHopiBlock(parent));
  });

  it("strips nested associatedComplaints when adding a child card", () => {
    const nestedChild = {
      ...createEmptyComplaint(),
      name: "Nested",
      associatedComplaints: [{ ...createEmptyComplaint(), name: "Too deep" }],
    };
    const tree = addComplaintToTree([PARENT], nestedChild, PARENT.id);
    expect(tree[0].associatedComplaints![0].associatedComplaints).toBeUndefined();
  });
});
