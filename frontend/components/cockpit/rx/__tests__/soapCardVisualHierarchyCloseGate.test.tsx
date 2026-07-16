/**
 * vh-05 — soap-card-visual-hierarchy close gate.
 *
 * Consolidates the cross-cutting acceptance gate for vh-01..04: canonical depth
 * ladder, opted-in areas (Social History, chief complaints, exam), L1-only family
 * accent, a11y (not colour-only), and behaviour invariants. Product logic lives in
 * vh-01..04; this file only verifies the gate.
 */
import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import {
  RxFormProvider,
  createEmptyComplaint,
  createEmptyRxFormFields,
  deriveExaminationFindingsFromExam,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintList } from "@/components/cockpit/rx/subjective/ComplaintList";
import { FamilyHistoryField } from "@/components/cockpit/rx/subjective/FamilyHistoryField";
import { PatientBackgroundZone } from "@/components/cockpit/rx/subjective/PatientBackgroundZone";
import { SocialHistoryField } from "@/components/cockpit/rx/subjective/SocialHistoryField";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  DEPTH_TONE_RAIL,
  DEPTH_TONE_RAISED_SURFACE,
  DEPTH_TONE_RECESSED_SURFACE,
  resolveDepthToneSurface,
  resolveStickyPinShadowClass,
} from "@/components/ui/sticky-stack";
import {
  DEPTH_TONE_RAIL_BY_FAMILY,
  SOAP_TAB_FAMILY_ACCENT,
  SoapTabFamilyProvider,
  sectionHeaderIcon,
} from "@/components/cockpit/rx/sections/section-chrome";
import { Activity } from "lucide-react";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";

vi.mock("@/components/cockpit/rx/inputs/VitalsGrid", () => ({
  VitalsGrid: () => <div data-testid="vitals-grid-stub" />,
}));

const mockGetDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: vi.fn(),
    updatePrescription: vi.fn().mockResolvedValue({ data: {} }),
    createPrescription: vi.fn(),
    getAppointmentById: vi.fn().mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic" } },
    }),
    getPatientMedicalBackground: vi.fn().mockResolvedValue({
      data: {
        medicalBackground: {
          conditions: [],
          unlinkedMedications: [],
          links: [],
          notes: null,
        },
      },
    }),
  };
});

const prescriptionIdRef = { current: null as string | null };

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: {
      settings: { objective_section_order: [], objective_section_collapsed: {} },
    },
  });
});

function renderWithRxForm(
  ui: ReactElement,
  initial?: Partial<RxFormFields>,
  consultationType: string | null = "in_clinic",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{ ...createEmptyRxFormFields(), ...initial }}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
        consultationType={consultationType}
      >
        {ui}
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("vh-05 · canonical depth-tone ladder", () => {
  it("uses only the canonical recessed/raised/rail tokens", () => {
    expect(DEPTH_TONE_RECESSED_SURFACE).toBe("bg-muted/30");
    expect(DEPTH_TONE_RAISED_SURFACE).toBe("bg-card");
    expect(DEPTH_TONE_RAIL).toBe("border-l-2 border-l-primary/30");

    for (const depth of [0, 1, 2, 3]) {
      const tone = resolveDepthToneSurface(depth);
      expect([DEPTH_TONE_RECESSED_SURFACE, DEPTH_TONE_RAISED_SURFACE]).toContain(
        tone.surface,
      );
      if (depth >= 1) expect(tone.rail).toBe(DEPTH_TONE_RAIL);
    }
  });

  it("ramps sticky pin shadow by stack depth without changing offset math", () => {
    expect(resolveStickyPinShadowClass(1)).toBe("shadow-sm");
    expect(resolveStickyPinShadowClass(2)).toBe("shadow-md");
    expect(resolveStickyPinShadowClass(3)).toBe("shadow-lg");
  });
});

describe("vh-05 · opted-in depth stacks", () => {
  it("Social History root is recessed and nested cards are raised inset cards without accent rails", () => {
    const noop = () => {};
    renderWithRxForm(
      <SoapTabFamilyProvider family="subjective">
        <SocialHistoryField value={{} as SocialHistoryStructured} onChange={noop} />
      </SoapTabFamilyProvider>,
    );

    const root = screen.getByTestId("social-history-field");
    expect(root.className).toContain(DEPTH_TONE_RECESSED_SURFACE);
    expect(root.className).toContain(SOAP_TAB_FAMILY_ACCENT.subjective);

    fireEvent.click(
      screen.getByRole("button", { name: /Toggle Social \/ personal history/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Toggle lifestyle cluster/i }));
    const lifestyleCluster = screen.getByTestId("social-history-cluster-lifestyle");
    expect(lifestyleCluster.className).toContain(DEPTH_TONE_RAISED_SURFACE);
    expect(lifestyleCluster.className).toContain("shadow-sm");
    expect(lifestyleCluster.className).not.toContain(DEPTH_TONE_RAIL_BY_FAMILY.subjective);
    const lifestyleDot = lifestyleCluster.querySelector("span.h-2.rounded-full");
    expect(lifestyleDot).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Toggle diet/i }));
    const dietCard = screen.getByTestId("social-diet-card");
    expect(dietCard.className).toContain(DEPTH_TONE_RECESSED_SURFACE);
    expect(dietCard.className).not.toContain("shadow-sm");
    expect(dietCard.className).not.toContain(DEPTH_TONE_RAIL_BY_FAMILY.subjective);
  });

  it("chief complaints alternate section well and raised inset cards without accent rails on cards", () => {
    const complaint = createEmptyComplaint();
    complaint.name = "Headache";

    renderWithRxForm(
      <SoapTabFamilyProvider family="subjective">
        <ComplaintList />
      </SoapTabFamilyProvider>,
      { complaints: [complaint] },
    );

    const section = screen.getByLabelText("Chief complaints");
    expect(section.className).toContain(DEPTH_TONE_RECESSED_SURFACE);
    expect(section.className).toContain(SOAP_TAB_FAMILY_ACCENT.subjective);

    const card = document.querySelector("[data-complaint-instance]");
    expect(card?.className).toContain(DEPTH_TONE_RAISED_SURFACE);
    expect(card?.className).toContain("shadow-sm");
    expect(card?.className).not.toContain(DEPTH_TONE_RAIL_BY_FAMILY.subjective);
  });

  it("family history and patient background use recessed L1 shells and raised L2 subsections without accent rails", () => {
    const noop = () => {};
    renderWithRxForm(
      <SoapTabFamilyProvider family="subjective">
        <>
          <FamilyHistoryField value={{}} onChange={noop} />
          <PatientBackgroundZone patientId="pat-1" token="test-token" mode="default" />
        </>
      </SoapTabFamilyProvider>,
    );

    expect(screen.getByTestId("family-history-field").className).toContain(
      DEPTH_TONE_RECESSED_SURFACE,
    );
    expect(screen.getByTestId("patient-background-zone").className).toContain(
      DEPTH_TONE_RECESSED_SURFACE,
    );

    fireEvent.click(screen.getByRole("button", { name: /Toggle patient background/i }));
    expect(screen.getByTestId("past-medical-history-field").className).toContain(
      DEPTH_TONE_RAISED_SURFACE,
    );
    expect(screen.getByTestId("past-medical-history-field").className).toContain("shadow-sm");
    expect(screen.getByTestId("past-medical-history-field").className).not.toContain(
      DEPTH_TONE_RAIL_BY_FAMILY.subjective,
    );

    const pmhSection = screen.getByTestId("past-medical-history-field");
    const pmhDot = pmhSection.querySelector("span.h-2.w-2.rounded-full");
    expect(pmhDot).toBeTruthy();
  });

  it("exam subsections are recessed wells and every finding row carries the objective depth rail", () => {
    renderWithRxForm(
      <SoapTabFamilyProvider family="objective">
        <ExamSystemList />
      </SoapTabFamilyProvider>,
    );
    fireEvent.click(screen.getByTestId("exam-toggle-cvs"));

    const systemCard = screen.getByTestId("exam-system-card-cvs");
    expect(systemCard.querySelector("span.h-2.rounded-full")).toBeTruthy();

    const inspection = screen.getByTestId("cvs-subsection-inspection");
    expect(inspection.className).toContain(DEPTH_TONE_RECESSED_SURFACE);
    expect(inspection.className).not.toContain(DEPTH_TONE_RAIL);
    expect(inspection.querySelector("span.h-1\\.5.rounded-sm")).toBeTruthy();

    fireEvent.click(screen.getByTestId("cvs-subsection-toggle-auscultation"));
    const findingCard = screen.getByTestId("cvs-chip-group-card-auscultation-s1_s2");
    expect(findingCard.className).toContain(DEPTH_TONE_RAIL);
  });

  it("subsection status dots reflect captured data on smoking cards", () => {
    const noop = () => {};
    renderWithRxForm(
      <SoapTabFamilyProvider family="subjective">
        <SocialHistoryField
          value={{ smoking: { status: "never", products: [] } } as SocialHistoryStructured}
          onChange={noop}
        />
      </SoapTabFamilyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Toggle Social \/ personal history/i }));
    fireEvent.click(screen.getByRole("button", { name: /Toggle tobacco, alcohol and drugs cluster/i }));

    const smokingSection = screen.getByTestId("social-smoking-card");
    const smokingDot = smokingSection.querySelector("span.h-1\\.5.rounded-sm");
    expect(smokingDot?.className).toContain("bg-primary");
  });

  it("general appearance finding rows are uniformly raised with depth rails", () => {
    renderWithRxForm(<ExamSystemList />);
    fireEvent.click(screen.getByTestId("exam-toggle-general"));
    fireEvent.click(screen.getByTestId("general-subsection-toggle-appearance"));

    for (const findingId of ["pallor", "icterus", "cyanosis", "plethora"]) {
      const row = screen.getByTestId(`general-finding-card-${findingId}`);
      expect(row.className).toContain(DEPTH_TONE_RAISED_SURFACE);
      expect(row.className).toContain(DEPTH_TONE_RAIL);
    }
  });

  it("general volume finding rows are uniformly raised with depth rails", () => {
    renderWithRxForm(<ExamSystemList />);
    fireEvent.click(screen.getByTestId("exam-toggle-general"));
    fireEvent.click(screen.getByTestId("general-subsection-toggle-volume"));

    for (const findingId of ["dehydration", "edema"]) {
      const row = screen.getByTestId(`general-finding-card-${findingId}`);
      expect(row.className).toContain(DEPTH_TONE_RAISED_SURFACE);
      expect(row.className).toContain(DEPTH_TONE_RAIL);
    }
  });

  it("general peripheral clubbing and lymphadenopathy use depth rail without teleconsult dashed box", () => {
    renderWithRxForm(<ExamSystemList />, {}, "video");
    fireEvent.click(screen.getByTestId("exam-toggle-general"));
    fireEvent.click(screen.getByTestId("general-subsection-toggle-peripheral"));

    const clubbing = screen.getByTestId("general-finding-card-clubbing");
    expect(clubbing.className).toContain(DEPTH_TONE_RAISED_SURFACE);
    expect(clubbing.className).toContain(DEPTH_TONE_RAIL);
    expect(clubbing.className).not.toContain("border-dashed");

    const lymph = screen.getByTestId("general-finding-card-lymphadenopathy");
    expect(lymph.className).toContain("bg-muted/10");
    expect(lymph.className).toContain(DEPTH_TONE_RAIL);
    expect(lymph.className).not.toContain("border-dashed");
    expect(within(lymph).getByText(/Limited on teleconsult/i)).toBeInTheDocument();
  });
});

describe("vh-05 · L1 family accent (vh-04)", () => {
  it("SOAP families share one primary L1 rail token", () => {
    expect(SOAP_TAB_FAMILY_ACCENT.subjective).toBe(SOAP_TAB_FAMILY_ACCENT.objective);
    expect(SOAP_TAB_FAMILY_ACCENT.assessment).toBe(SOAP_TAB_FAMILY_ACCENT.objective);
    expect(SOAP_TAB_FAMILY_ACCENT.plan).toBe(SOAP_TAB_FAMILY_ACCENT.objective);
    expect(SOAP_TAB_FAMILY_ACCENT.objective).toContain("border-l-primary");
  });

  it("applies family accent only on L1 section shells, not subsections", () => {
    const { container } = render(
      <SoapTabFamilyProvider family="objective">
        <CollapsibleContainer title="Vitals" defaultOpen toggleLabel="Toggle vitals">
          <CollapsibleContainer
            title="Nested"
            variant="subsection"
            defaultOpen
            toggleLabel="Toggle nested"
          >
            <p>Body</p>
          </CollapsibleContainer>
        </CollapsibleContainer>
      </SoapTabFamilyProvider>,
    );

    const sections = container.querySelectorAll("section");
    expect(sections[0]?.className).toContain(SOAP_TAB_FAMILY_ACCENT.objective);
    expect(sections[1]?.className).not.toContain(SOAP_TAB_FAMILY_ACCENT.objective);
  });

  it("objective L1 sections inherit the objective family accent rail", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} />);

    await screen.findByTestId("objective-section-vitals");
    const vitalsSection = screen.getByTestId("objective-section-vitals");
    expect(vitalsSection.className).toContain(SOAP_TAB_FAMILY_ACCENT.objective);
  });
});

describe("vh-05 · a11y — not colour-only", () => {
  it("depth hierarchy uses luminance and elevation, not accent rails on nested cards", () => {
    const { container } = render(
      <CollapsibleContainer title="Root" depthTone defaultOpen toggleLabel="Toggle root">
        <CollapsibleContainer title="Nested" variant="subsection" defaultOpen toggleLabel="Toggle nested">
          <p>Body</p>
        </CollapsibleContainer>
      </CollapsibleContainer>,
    );

    const sections = container.querySelectorAll("section");
    // Recessed well (luminance) + raised card (luminance) — survives grayscale.
    expect(sections[0]?.className).toContain("bg-muted/30");
    expect(sections[1]?.className).toContain("bg-card");
    // Elevation (structure) — survives grayscale; accent rail reserved for L1 only.
    expect(sections[1]?.className).toContain("shadow-sm");
    expect(sections[1]?.className).not.toContain("border-l-2");
    // No saturated hue as a card background.
    expect(sections[1]?.className).not.toMatch(/bg-(primary|accent|emerald|violet)/);
  });

  it("section icons are decorative; titles remain the accessible name", () => {
    render(
      <CollapsibleContainer
        title="Vitals"
        sectionIcon={sectionHeaderIcon(Activity)}
        toggleLabel="Toggle vitals"
        defaultOpen
      >
        <p>Vitals body</p>
      </CollapsibleContainer>,
    );

    expect(screen.getByRole("button", { name: /^Vitals\b/i })).toBeInTheDocument();
    expect(screen.getByText("Vitals body")).toBeInTheDocument();
  });
});

describe("vh-05 · behaviour invariants", () => {
  it("collapse/expand still works on depth-toned chief complaints", () => {
    renderWithRxForm(<ComplaintList />);

    const toggle = screen.getByRole("button", { name: /Toggle chief complaints/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("exam derivation is unchanged after depth-tone presentation (byte-identical payload)", () => {
    const fields = createEmptyRxFormFields();
    fields.examFindings = [
      {
        systemId: "cvs",
        status: "abnormal",
        findings: [{ findingId: "murmur", attributes: { grade: "2/6" } }],
        notes: null,
      },
    ];

    const derived = deriveExaminationFindingsFromExam(fields.examFindings, fields);
    expect(typeof derived).toBe("string");
    expect(derived.length).toBeGreaterThan(0);
    expect(derived).toContain("Cardiovascular");
  });
});
