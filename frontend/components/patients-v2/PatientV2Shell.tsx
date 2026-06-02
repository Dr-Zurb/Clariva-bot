"use client";

import { useCallback } from "react";
import {
  Activity,
  CalendarDays,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Pill,
  ShieldCheck,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePatientOverviewQuery } from "@/hooks/queries/usePatientOverviewQuery";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types/patient";
import { PatientIdentityStrip, type PatientHeaderAction } from "./PatientIdentityStrip";
import { AuditTab } from "./tabs/AuditTab";
import { ConversationsTab } from "./tabs/ConversationsTab";
import { FilesTab } from "./tabs/FilesTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RxTab } from "./tabs/RxTab";
import { VisitsTab } from "./tabs/VisitsTab";
import { VitalsTab } from "./tabs/VitalsTab";

const PATIENT_V2_TAB_IDS = [
  "overview",
  "visits",
  "conversations",
  "rx",
  "vitals",
  "files",
  "audit",
] as const;

export type PatientV2TabId = (typeof PATIENT_V2_TAB_IDS)[number];

const DEFAULT_TAB: PatientV2TabId = "overview";

const PATIENT_V2_TABS: ReadonlyArray<{
  id: PatientV2TabId;
  title: string;
  icon: React.ReactNode;
}> = [
  { id: "overview", title: "Overview", icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
  { id: "visits", title: "Visits", icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
  {
    id: "conversations",
    title: "Conversations",
    icon: <MessageCircle className="h-4 w-4" aria-hidden />,
  },
  { id: "rx", title: "Rx", icon: <Pill className="h-4 w-4" aria-hidden /> },
  { id: "vitals", title: "Vitals", icon: <Activity className="h-4 w-4" aria-hidden /> },
  { id: "files", title: "Files", icon: <FileText className="h-4 w-4" aria-hidden /> },
  { id: "audit", title: "Audit", icon: <ShieldCheck className="h-4 w-4" aria-hidden /> },
] as const;

function isValidTabId(value: string | null): value is PatientV2TabId {
  return value != null && (PATIENT_V2_TAB_IDS as readonly string[]).includes(value);
}

export interface PatientV2ShellProps {
  patient: Patient;
  token: string;
  userId: string | undefined;
}

export function PatientV2Shell({ patient, token, userId }: PatientV2ShellProps) {
  void userId;

  const router = useRouter();
  const searchParams = useSearchParams();

  const overviewQuery = usePatientOverviewQuery(token, patient.id);
  const overview = overviewQuery.data ?? null;
  const overviewError = overviewQuery.error
    ? overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : "Failed to load patient overview"
    : null;

  const tabParam = searchParams.get("tab");
  const activeTab: PatientV2TabId = isValidTabId(tabParam) ? tabParam : DEFAULT_TAB;

  const setTab = useCallback(
    (tabId: PatientV2TabId, visitId?: string) => {
      const params = new URLSearchParams();
      params.set("tab", tabId);
      if (visitId) params.set("visit", visitId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const handleVisitClick = useCallback(
    (appointmentId: string) => {
      setTab("visits", appointmentId);
    },
    [setTab],
  );

  const handleIdentityAction = useCallback(
    (action: PatientHeaderAction) => {
      if (action.type === "audit_log") {
        setTab("audit");
      }
    },
    [setTab],
  );

  const visitFocus = searchParams.get("visit") ?? undefined;

  const renderTabContent = useCallback(
    (tabId: PatientV2TabId) => {
      switch (tabId) {
        case "overview":
          return <OverviewTab patientId={patient.id} token={token} />;
        case "visits":
          return (
            <VisitsTab
              patientId={patient.id}
              token={token}
              initialVisitFocus={visitFocus}
            />
          );
        case "conversations":
          return <ConversationsTab patientId={patient.id} token={token} />;
        case "rx":
          return <RxTab patientId={patient.id} token={token} />;
        case "vitals":
          return <VitalsTab patientId={patient.id} token={token} />;
        case "files":
          return <FilesTab patientId={patient.id} token={token} />;
        case "audit":
          return <AuditTab patientId={patient.id} token={token} />;
        default:
          return null;
      }
    },
    [patient.id, token, visitFocus],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PatientIdentityStrip
        patient={patient}
        overview={overview}
        token={token}
        onAction={handleIdentityAction}
        onVisitClick={handleVisitClick}
      />

      {overviewError ? (
        <p className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {overviewError}
        </p>
      ) : null}

      <div role="tablist" className="flex gap-1 border-b px-4">
        {PATIENT_V2_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              "flex items-center border-b-2 px-3 py-2 text-sm font-medium",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.icon}
            <span className="ml-2">{tab.title}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {renderTabContent(activeTab)}
      </div>
    </div>
  );
}
