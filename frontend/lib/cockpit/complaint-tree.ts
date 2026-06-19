import type { Complaint } from "@/types/prescription";

export function normalizeComplaintName(name: string): string {
  return name.trim().toLowerCase();
}

/** Leaf cards cannot own nested associated complaints (one level max). */
export function stripNestedAssociatedComplaints(complaint: Complaint): Complaint {
  const { associatedComplaints: _nested, ...rest } = complaint;
  return rest;
}

export function sanitizeComplaintForStorage(complaint: Complaint, depth: 0 | 1): Complaint {
  const base = stripNestedAssociatedComplaints(complaint);
  if (depth === 0 && complaint.associatedComplaints) {
    return {
      ...base,
      associatedComplaints: complaint.associatedComplaints
        .filter((c) => c.name.trim())
        .map((c) => sanitizeComplaintForStorage(c, 1)),
    };
  }
  return base;
}

function findParentIndex(complaints: Complaint[], parentId: string): number {
  return complaints.findIndex((c) => c.id === parentId);
}

export function getAssociatedComplaints(
  complaints: Complaint[],
  parentId: string,
): Complaint[] {
  const parent = complaints[findParentIndex(complaints, parentId)];
  return parent?.associatedComplaints ?? [];
}

export function addComplaintToTree(
  complaints: Complaint[],
  complaint: Complaint,
  parentId?: string,
): Complaint[] {
  const clean = sanitizeComplaintForStorage(complaint, parentId ? 1 : 0);
  if (!parentId) {
    return [...complaints, clean];
  }
  const parentIndex = findParentIndex(complaints, parentId);
  if (parentIndex < 0) return complaints;
  const parent = complaints[parentIndex]!;
  const children = [...(parent.associatedComplaints ?? []), clean];
  const next = [...complaints];
  next[parentIndex] = { ...parent, associatedComplaints: children };
  return next;
}

export function updateComplaintInTree(
  complaints: Complaint[],
  index: number,
  patch: Partial<Complaint>,
  parentId?: string,
): Complaint[] {
  if (!parentId) {
    const next = [...complaints];
    const current = next[index];
    if (!current) return complaints;
    const merged = { ...current, ...patch };
    if (patch.associatedComplaints) {
      merged.associatedComplaints = patch.associatedComplaints.map((c) =>
        sanitizeComplaintForStorage(c, 1),
      );
    }
    next[index] = sanitizeComplaintForStorage(merged, 0);
    return next;
  }

  const parentIndex = findParentIndex(complaints, parentId);
  if (parentIndex < 0) return complaints;
  const parent = complaints[parentIndex]!;
  const children = [...(parent.associatedComplaints ?? [])];
  const current = children[index];
  if (!current) return complaints;
  const merged = { ...current, ...patch };
  children[index] = sanitizeComplaintForStorage(merged, 1);
  const next = [...complaints];
  next[parentIndex] = { ...parent, associatedComplaints: children };
  return next;
}

export function removeComplaintFromTree(
  complaints: Complaint[],
  index: number,
  parentId?: string,
): Complaint[] {
  if (!parentId) {
    return complaints.filter((_, i) => i !== index);
  }

  const parentIndex = findParentIndex(complaints, parentId);
  if (parentIndex < 0) return complaints;
  const parent = complaints[parentIndex]!;
  const children = (parent.associatedComplaints ?? []).filter((_, i) => i !== index);
  const next = [...complaints];
  next[parentIndex] = {
    ...parent,
    associatedComplaints: children.length > 0 ? children : undefined,
  };
  return next;
}

export function reorderComplaintsInTree(
  complaints: Complaint[],
  fromIndex: number,
  toIndex: number,
  parentId?: string,
): Complaint[] {
  if (fromIndex === toIndex) return complaints;

  const reorder = (list: Complaint[]): Complaint[] => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length
    ) {
      return list;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    return next;
  };

  if (!parentId) {
    return reorder(complaints);
  }

  const parentIndex = findParentIndex(complaints, parentId);
  if (parentIndex < 0) return complaints;
  const parent = complaints[parentIndex]!;
  const children = reorder(parent.associatedComplaints ?? []);
  const next = [...complaints];
  next[parentIndex] = { ...parent, associatedComplaints: children };
  return next;
}

export function countNamedAssociatedComplaints(complaint: Complaint): number {
  return (complaint.associatedComplaints ?? []).filter((c) => c.name.trim()).length;
}

export type PromoteAssociatedComplaintError = "not_found" | "empty_name" | "duplicate_name";

export function getPromoteAssociatedComplaintError(
  complaints: Complaint[],
  parentId: string,
  childIndex: number,
): PromoteAssociatedComplaintError | null {
  const parentIndex = findParentIndex(complaints, parentId);
  if (parentIndex < 0) return "not_found";

  const children = complaints[parentIndex]!.associatedComplaints ?? [];
  const child = children[childIndex];
  if (!child) return "not_found";
  if (!child.name.trim()) return "empty_name";

  const normalized = normalizeComplaintName(child.name);
  if (complaints.some((c) => normalizeComplaintName(c.name) === normalized)) {
    return "duplicate_name";
  }

  return null;
}

/** Move an associated symptom to the root list, inserted immediately after its parent. */
export function promoteAssociatedComplaint(
  complaints: Complaint[],
  parentId: string,
  childIndex: number,
): Complaint[] {
  if (getPromoteAssociatedComplaintError(complaints, parentId, childIndex)) {
    return complaints;
  }

  const parentIndex = findParentIndex(complaints, parentId);
  const parent = complaints[parentIndex]!;
  const children = [...(parent.associatedComplaints ?? [])];
  const [child] = children.splice(childIndex, 1);
  const promoted = sanitizeComplaintForStorage(stripNestedAssociatedComplaints(child!), 0);

  const next = [...complaints];
  next[parentIndex] = {
    ...parent,
    associatedComplaints: children.length > 0 ? children : undefined,
  };
  next.splice(parentIndex + 1, 0, promoted);
  return next;
}

export type DemoteComplaintError =
  | "not_found"
  | "same_target"
  | "empty_name"
  | "duplicate_name"
  | "has_children";

export function getDemoteComplaintError(
  complaints: Complaint[],
  sourceIndex: number,
  targetParentId: string,
): DemoteComplaintError | null {
  const source = complaints[sourceIndex];
  if (!source) return "not_found";
  if (source.id === targetParentId) return "same_target";
  if (!source.name.trim()) return "empty_name";
  if (countNamedAssociatedComplaints(source) > 0) return "has_children";

  const parentIndex = findParentIndex(complaints, targetParentId);
  if (parentIndex < 0) return "not_found";

  const normalized = normalizeComplaintName(source.name);
  const siblings = complaints[parentIndex]!.associatedComplaints ?? [];
  if (siblings.some((c) => normalizeComplaintName(c.name) === normalized)) {
    return "duplicate_name";
  }

  return null;
}

/** Move a root complaint under another as an associated symptom (inverse of promote). */
export function demoteComplaintUnderParent(
  complaints: Complaint[],
  sourceIndex: number,
  targetParentId: string,
): Complaint[] {
  if (getDemoteComplaintError(complaints, sourceIndex, targetParentId)) {
    return complaints;
  }

  const source = complaints[sourceIndex]!;
  const demoted = sanitizeComplaintForStorage(stripNestedAssociatedComplaints(source), 1);
  const next = complaints.filter((_, i) => i !== sourceIndex);

  const parentIndex = next.findIndex((c) => c.id === targetParentId);
  if (parentIndex < 0) return complaints;

  const parent = next[parentIndex]!;
  const children = [...(parent.associatedComplaints ?? []), demoted];
  next[parentIndex] = { ...parent, associatedComplaints: children };
  return next;
}

export function formatDemoteComplaintError(
  error: DemoteComplaintError,
  complaintName: string,
): string {
  const name = complaintName.trim() || "This complaint";
  switch (error) {
    case "same_target":
      return "Cannot link a complaint to itself.";
    case "empty_name":
      return "Add a name before linking as an associated symptom.";
    case "has_children":
      return `${name} has associated symptoms — promote or remove them first.`;
    case "duplicate_name":
      return `${name} is already linked under that complaint.`;
    default:
      return "Could not link complaint.";
  }
}
