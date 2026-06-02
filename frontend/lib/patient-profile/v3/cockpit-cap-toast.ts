import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import { MAX_LEAVES, MAX_PANES_PER_TABS } from "@/lib/patient-profile/v3/foundation";

export type CockpitMutationResult = { ok: true } | { ok: false; reason?: string };

export function toastOnCapRejection(result: CockpitMutationResult): void {
  if (result.ok) return;
  if (result.reason === "cap-reached") {
    layoutUxToast.error(
      `Layout limit reached (${MAX_LEAVES} sub-panes max). Hide or merge a pane to add more.`,
    );
    return;
  }
  if (result.reason === "last-pane-in-tree") {
    layoutUxToast.error("Cannot remove the last pane in the tree.");
    return;
  }
  if (result.reason === "already-in-target") {
    layoutUxToast.error("That pane is already in the target group.");
    return;
  }
  if (result.reason === "not-found") {
    layoutUxToast.error("Could not find that pane in the layout.");
    return;
  }
  if (result.reason === "no-op") {
    return;
  }
  if (result.reason) {
    layoutUxToast.error(`Could not update layout: ${result.reason}`);
  }
}

export function tabCapMessage(): string {
  return `Tab limit reached (${MAX_PANES_PER_TABS} tabs max per group).`;
}
