"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardList,
  FlaskConical,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  NotebookPen,
  Pill,
  Scissors,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import type { StaticObjectiveSectionId } from "@/lib/cockpit/objective-section-order";
import {
  isCustomBlockSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";
import { cn } from "@/lib/utils";

/** SOAP tab family — drives the additive L1-only category accent (vh-04). */
export type SoapTabFamily = "subjective" | "objective" | "assessment" | "plan";

/**
 * Additive left-rail hue for L1 section shells. Never a card background — layered
 * on top of the neutral depth-tone cue (VH-D2/D5). Tokenised only (VH-D1).
 * All SOAP families share primary so the 4-up wall reads as one workspace.
 */
export const SOAP_TAB_FAMILY_ACCENT: Record<SoapTabFamily, string> = {
  subjective: "border-l-2 border-l-primary/35",
  objective: "border-l-2 border-l-primary/35",
  assessment: "border-l-2 border-l-primary/35",
  plan: "border-l-2 border-l-primary/35",
};

/**
 * Depth-tone left rail keyed to SOAP tab family — matches the L1 accent hue so
 * nesting does not jump between family colors.
 */
export const DEPTH_TONE_RAIL_BY_FAMILY: Record<SoapTabFamily, string> = {
  subjective: "border-l-2 border-l-primary/30",
  objective: "border-l-2 border-l-primary/30",
  assessment: "border-l-2 border-l-primary/30",
  plan: "border-l-2 border-l-primary/30",
};

/** Resolves the depth rail for a tab family; defaults to primary when unknown. */
export function resolveDepthToneRail(family: SoapTabFamily | null): string {
  if (family && family in DEPTH_TONE_RAIL_BY_FAMILY) {
    return DEPTH_TONE_RAIL_BY_FAMILY[family];
  }
  return DEPTH_TONE_RAIL_BY_FAMILY.objective;
}

/**
 * L2 cluster cards vs L3+ leaf cards — distinct dot shapes so nesting depth is
 * scannable without changing title typography (subjective + objective).
 */
export type SoapNestedDotTier = "cluster" | "leaf";

/** @deprecated Use {@link SoapNestedDotTier}. */
export type SubjectiveSubsectionDotTier = SoapNestedDotTier;

const SOAP_NESTED_DOT_FILLED: Record<SoapTabFamily, string> = {
  subjective: "bg-primary",
  objective: "bg-primary",
  assessment: "bg-primary",
  plan: "bg-primary",
};

/** Status dot before nested SOAP card titles (L2 circle · L3 square). */
export function resolveSoapNestedStatusDotClass(
  family: SoapTabFamily,
  hasData: boolean,
  tier: SoapNestedDotTier = "cluster",
): string {
  if (tier === "leaf") {
    return cn(
      "h-1.5 w-1.5 shrink-0 rounded-sm",
      hasData ? SOAP_NESTED_DOT_FILLED[family] : "bg-muted-foreground/35",
    );
  }

  return cn(
    "h-2 w-2 shrink-0 rounded-full",
    hasData ? SOAP_NESTED_DOT_FILLED[family] : "bg-muted-foreground/40",
  );
}

/** Subjective wrapper — prefer {@link resolveSoapNestedStatusDotClass}. */
export function resolveSubjectiveSubsectionStatusDotClass(
  hasData: boolean,
  tier: SoapNestedDotTier = "cluster",
): string {
  return resolveSoapNestedStatusDotClass("subjective", hasData, tier);
}

/** Tab-level heading icon (scanning aid, not colour-only — VH-D5). */
export const SOAP_TAB_HEADING_ICON: Record<SoapTabFamily, LucideIcon> = {
  subjective: MessageSquare,
  objective: Stethoscope,
  assessment: ClipboardList,
  plan: Pill,
};

const SoapTabFamilyContext = createContext<SoapTabFamily | null>(null);

export function SoapTabFamilyProvider({
  family,
  children,
}: {
  family: SoapTabFamily;
  children: ReactNode;
}) {
  return (
    <SoapTabFamilyContext.Provider value={family}>{children}</SoapTabFamilyContext.Provider>
  );
}

/** Current SOAP tab family, or `null` outside subjective/objective sections. */
export function useSoapTabFamily(): SoapTabFamily | null {
  return useContext(SoapTabFamilyContext);
}

/** Leading glyph for an objective L1 section header. */
export function resolveObjectiveSectionIcon(
  sectionId: StaticObjectiveSectionId,
): LucideIcon | undefined {
  switch (sectionId) {
    case "vitals":
      return Activity;
    case "exam":
      return Stethoscope;
    case "notes":
      return NotebookPen;
    case "test_results":
      return FlaskConical;
    default:
      return undefined;
  }
}

/** Leading glyph for a subjective L1 section header (parity with objective). */
export function resolveSubjectiveSectionIcon(
  sectionId: SubjectiveSectionId,
): LucideIcon | undefined {
  if (isCustomBlockSectionId(sectionId)) return Layers;
  switch (sectionId) {
    case "chief_complaints":
      return MessageCircle;
    case "patient_background":
      return UserRound;
    case "allergies":
      return ShieldAlert;
    case "past_surgical":
      return Scissors;
    case "family_history":
      return Users;
    case "social_history":
      return Home;
    case "free_text_notes":
      return NotebookPen;
    case "custom_subsections":
      return Layers;
    default:
      return undefined;
  }
}

/** Shared icon sizing for L1 section headers — keeps sticky offset stable. */
export const SECTION_HEADER_ICON_CLASS = "h-3.5 w-3.5 shrink-0 text-muted-foreground";

export function sectionHeaderIcon(icon: LucideIcon) {
  const Icon = icon;
  return <Icon className={SECTION_HEADER_ICON_CLASS} aria-hidden />;
}

/** Placeholder while doctor section order / visibility hydrates — avoids order flash. */
export function SoapSectionListSkeleton({
  testId,
  rows = 5,
}: {
  testId: string;
  rows?: number;
}) {
  return (
    <div
      className="space-y-2"
      data-testid={testId}
      aria-busy="true"
      aria-label="Loading sections"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-10 w-full animate-pulse rounded-md bg-muted/60"
        />
      ))}
    </div>
  );
}

/** Tab-level heading row: icon + additive family accent rail (L1 chrome only). */
export function soapTabHeadingClassName(family: SoapTabFamily, className?: string): string {
  return cn(
    "flex items-center gap-2 pl-2.5",
    SOAP_TAB_FAMILY_ACCENT[family],
    className,
  );
}
