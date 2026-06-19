import type { ReactNode } from "react";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
} from "@/components/cockpit/rx/RxFormContext";
import { SocialHistoryField } from "@/components/cockpit/rx/subjective/SocialHistoryField";

/**
 * The field embeds the (p6) SubjectiveSectionTemplateButton, which calls
 * useRxForm(). Provide a minimal RxFormProvider so the field can render in
 * isolation; the field's own value/onChange props drive the assertions.
 */
function RxFormTestWrapper({ children }: { children: ReactNode }) {
  const prescriptionIdRef = useRef<string | null>("rx-test");
  return (
    <RxFormProvider
      appointmentId="appt-test"
      patientId="pat-test"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {children}
    </RxFormProvider>
  );
}

function render(ui: Parameters<typeof rtlRender>[0]) {
  return rtlRender(ui, { wrapper: RxFormTestWrapper });
}
import { serializeSocialHistory } from "@/lib/cockpit/social-history";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
import { normalizeCaffeineSection } from "@/lib/cockpit/social-history-caffeine";
import type { PrescriptionWithRelations } from "@/types/prescription";

function renderField(
  value: SocialHistoryStructured,
  onChange: (next: SocialHistoryStructured) => void = vi.fn(),
) {
  const view = render(
    <SocialHistoryField value={value} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
  return view;
}

describe("SocialHistoryField", () => {
  it("hides smoking detail fields until current or ex is selected", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    expect(screen.queryByTestId("social-smoking-products")).not.toBeInTheDocument();

    const smokingGroup = screen.getByTestId("social-smoking-status");
    fireEvent.click(smokingGroup.querySelector('button[aria-label="Smoker"]')!);
    expect(screen.getByTestId("social-smoking-products")).toBeInTheDocument();
  });

  it("updates pack-years badge when per-day and years are entered", () => {
    const onChange = vi.fn();
    renderField(
      {
        smoking: {
          status: "current",
          products: [{ id: "p1", type: "cigarette", perDay: 20, years: 10 }],
        },
      },
      onChange,
    );

    expect(screen.getByTestId("social-smoking-pack-years")).toHaveTextContent(
      "≈ 10 pack-years",
    );

    fireEvent.change(screen.getByLabelText("Amount per occasion"), { target: { value: "10" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("computes pack-years from month duration", () => {
    renderField({
      smoking: {
        status: "current",
        products: [{ id: "p1", type: "cigarette", perDay: 20, years: 6, yearsUnit: "months" }],
      },
    });

    expect(screen.getByTestId("social-smoking-pack-years")).toHaveTextContent(
      "≈ 0.5 pack-years",
    );
  });

  it("shows LDCT screening hint at ≥30 pack-years", () => {
    renderField({
      smoking: {
        status: "current",
        products: [{ id: "p1", type: "cigarette", perDay: 20, years: 30 }],
      },
    });

    expect(screen.getByTestId("social-smoking-pack-years-hint")).toHaveTextContent("LDCT");
  });

  it("shows alcohol clinical action hint for hazardous intake", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [
          {
            id: "d1",
            type: "spirits",
            amount: 3,
            amountUnit: "peg",
            frequency: 1,
            frequencyUnit: "day",
          },
        ],
        cage: { cutDown: false, annoyed: false, guilty: false, eyeOpener: false },
      },
    });

    expect(screen.getByTestId("social-alcohol-units-week")).toHaveTextContent("hazardous");
    expect(screen.getByTestId("social-alcohol-intake-hint")).toHaveTextContent("High intake");
    expect(screen.queryByTestId("social-alcohol-cage-hint")).not.toBeInTheDocument();
  });

  it("switches duration unit to months", () => {
    const onChange = vi.fn();
    renderField(
      {
        smoking: {
          status: "current",
          products: [{ id: "p1", type: "cigarette", perDay: 2, years: 5 }],
        },
      },
      onChange,
    );

    fireEvent.click(within(screen.getByTestId("social-smoking-product-0")).getByRole("button", { name: "Months" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        smoking: expect.objectContaining({
          products: [
            expect.objectContaining({
              years: 5,
              yearsUnit: "months",
            }),
          ],
        }),
      }),
    );
  });

  it("shows quit duration for former smokeless users on product cards", () => {
    renderField({
      smokeless: {
        status: "ex",
        products: [
          {
            id: "p1",
            type: "khaini",
            perDay: 2,
            perDayUnit: "packets",
            years: 4,
            quitYearsAgo: 6,
            quitYearsUnit: "months",
          },
        ],
      },
    });

    expect(screen.queryByTestId("social-smoking-quit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("social-smokeless-quit")).not.toBeInTheDocument();
    const row = screen.getByTestId("social-smokeless-product-0");
    expect(within(row).getByLabelText("Quit duration")).toHaveValue(6);
  });

  it("ex-smoker shows per-product quit sentence on each card", () => {
    renderField({
      smoking: {
        status: "ex",
        products: [{ id: "p1", type: "cigarette", perDay: 4, years: 3, quitYearsAgo: 2 }],
      },
    });

    expect(screen.queryByTestId("social-smoking-quit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("social-smoking-phase-current-0")).not.toBeInTheDocument();
    const row = screen.getByTestId("social-smoking-product-0");
    expect(within(row).getByLabelText("Quit duration")).toHaveValue(2);
    expect(within(row).getByText("· for")).toBeInTheDocument();
    expect(within(row).getByText("ago")).toBeInTheDocument();
  });

  it("ex-smoker migrates legacy section quit onto each product card for display", () => {
    renderField({
      smoking: {
        status: "ex",
        products: [{ id: "p1", type: "cigarette", perDay: 4, years: 3 }],
        quitYearsAgo: 2,
      },
    });

    expect(within(screen.getByTestId("social-smoking-product-0")).getByLabelText("Quit duration")).toHaveValue(2);
  });

  it("shows other type text field and amount unit picker for smokeless", () => {
    const onChange = vi.fn();
    renderField(
      {
        smokeless: {
          status: "current",
          products: [{ id: "p1", type: "other", typeOther: "Naswar", perDay: 2 }],
        },
      },
      onChange,
    );

    expect(screen.getByLabelText("Other product name")).toHaveValue("Naswar");
    expect(screen.getByTestId("social-smokeless-products")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Times" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        smokeless: expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({ perDayUnit: "times" }),
          ]),
        }),
      }),
    );
  });

  it("shows per-drink quit duration for ex-drinkers with month unit", () => {
    const onChange = vi.fn();
    renderField(
      {
        alcohol: { status: "ex", types: ["spirits"], quitYearsAgo: 2 },
      },
      onChange,
    );

    const drinkCard = screen.getByTestId("social-alcohol-drink-0");
    expect(within(drinkCard).getByLabelText("Quit duration")).toBeInTheDocument();
    const quitUnitGroup = within(drinkCard).getByRole("group", { name: "Quit duration unit" });
    fireEvent.click(within(quitUnitGroup).getByRole("button", { name: "Months" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alcohol: expect.objectContaining({
          drinks: expect.arrayContaining([
            expect.objectContaining({
              quitYearsAgo: 2,
              quitYearsUnit: "months",
            }),
          ]),
        }),
      }),
    );
  });

  it("shows CAGE score and screen positive at ≥2", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [{ id: "d1", type: "spirits" }],
        cage: { cutDown: true, annoyed: true, guilty: false, eyeOpener: false },
      },
    });

    expect(screen.getByTestId("social-alcohol-cage-score")).toHaveTextContent(
      "CAGE 2/4 · screen positive",
    );
  });

  it("shows CAGE clinical hint when screen positive", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [{ id: "d1", type: "spirits", amount: 1, amountUnit: "peg", frequency: 1, frequencyUnit: "week" }],
        cage: { cutDown: true, annoyed: true, guilty: false, eyeOpener: false },
      },
    });

    expect(screen.getByTestId("social-alcohol-cage-hint")).toHaveTextContent("CAGE positive");
    expect(screen.queryByTestId("social-alcohol-intake-hint")).not.toBeInTheDocument();
  });

  it("shows full CAGE questions and helper", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [],
        cage: { cutDown: false, annoyed: false, guilty: false, eyeOpener: false },
      },
    });

    expect(screen.getByText(/Mark yes for each question the patient endorses/i)).toBeInTheDocument();
    expect(screen.getByText(/felt you should cut down on your drinking/i)).toBeInTheDocument();
    expect(screen.getByText(/annoyed you by criticizing your drinking/i)).toBeInTheDocument();
    expect(screen.getByText(/felt guilty about your drinking/i)).toBeInTheDocument();
    expect(screen.getByText(/first thing in the morning/i)).toBeInTheDocument();
  });

  it("hides CAGE and AUDIT-C questions until screen chips are opened", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [{ id: "d1", type: "spirits" }],
      },
    });

    expect(screen.getByTestId("social-alcohol-screen-chips")).toBeInTheDocument();
    expect(screen.queryByTestId("social-alcohol-cage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("social-alcohol-audit-c")).not.toBeInTheDocument();
    expect(screen.queryByTestId("social-alcohol-audit-full")).not.toBeInTheDocument();
  });

  it("expands CAGE when chip is clicked", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({
        alcohol: { status: "current", drinks: [{ id: "d1", type: "spirits" }] },
      });
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByTestId("social-alcohol-cage-toggle"));
    expect(screen.getByTestId("social-alcohol-cage")).toBeInTheDocument();
  });

  it("shows CAGE score summary on collapsed chip when filled", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [],
        cage: { cutDown: true, annoyed: true, guilty: false, eyeOpener: false, enabled: false },
      },
    });

    expect(screen.getByTestId("social-alcohol-cage-toggle")).toHaveTextContent(
      "CAGE screen (2/4 · positive)",
    );
    expect(screen.getByTestId("social-alcohol-cage-toggle")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("social-alcohol-cage")).not.toBeInTheDocument();
  });

  it("toggles CAGE answers", () => {
    const onChange = vi.fn();
    renderField(
      {
        alcohol: {
          status: "current",
          drinks: [],
          cage: { cutDown: false, annoyed: false, guilty: false, eyeOpener: false },
        },
      },
      onChange,
    );

    fireEvent.click(screen.getByTestId("social-alcohol-cage-cutDown"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alcohol: expect.objectContaining({
          cage: expect.objectContaining({ cutDown: true }),
        }),
      }),
    );
  });

  it("shows AUDIT-C score and screen positive at ≥4", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [{ id: "d1", type: "spirits" }],
        auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 1, enabled: true },
      },
    });

    expect(screen.getByTestId("social-alcohol-audit-c-score")).toHaveTextContent(
      "AUDIT-C 4/12 · screen positive",
    );
  });

  it("shows AUDIT-C clinical hint when screen positive", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [{ id: "d1", type: "spirits" }],
        auditC: { frequency: 2, typicalQuantity: 1, bingeFrequency: 1, enabled: true },
      },
    });

    expect(screen.getByTestId("social-alcohol-audit-c-hint")).toHaveTextContent("AUDIT-C positive");
  });

  it("shows full AUDIT-C questions and helper", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({
        alcohol: { status: "current", drinks: [] },
      });
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByTestId("social-alcohol-audit-c-toggle"));
    expect(screen.getByText(/Select the best-fitting answer for each question/i)).toBeInTheDocument();
    expect(screen.getByText(/How often do you have a drink containing alcohol/i)).toBeInTheDocument();
    expect(screen.getByText(/six or more drinks on one occasion/i)).toBeInTheDocument();
    expect(screen.getByTestId("social-alcohol-audit-c-typicalQuantity-1")).toHaveTextContent("(1)");
  });

  it("selects AUDIT-C answers", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({
        alcohol: { status: "current", drinks: [] },
      });
      return (
        <SocialHistoryField
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByTestId("social-alcohol-audit-c-toggle"));
    fireEvent.click(screen.getByTestId("social-alcohol-audit-c-frequency-2"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alcohol: expect.objectContaining({
          auditC: expect.objectContaining({ frequency: 2, enabled: true }),
        }),
      }),
    );
  });

  it("shows AUDIT-10 score and severity when all questions answered", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [],
        auditC: { frequency: 2, typicalQuantity: 2, bingeFrequency: 1, enabled: true },
        auditFull: {
          unableToStop: 1,
          failedExpectations: 1,
          morningDrink: 0,
          guiltRemorse: 2,
          blackout: 1,
          injury: 0,
          othersConcerned: 2,
          enabled: true,
        },
      },
    });

    expect(screen.getByTestId("social-alcohol-audit-full-toggle")).toHaveTextContent(
      "AUDIT-10 screen (12/40 · hazardous)",
    );
    expect(screen.getByTestId("social-alcohol-audit-full-score")).toHaveTextContent(
      "AUDIT-10 12/40 · hazardous",
    );
  });

  it("expands AUDIT-10 panel and selects Q4 answer", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({
        alcohol: { status: "current", drinks: [] },
      });
      return (
        <SocialHistoryField
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByTestId("social-alcohol-audit-full-toggle"));
    expect(screen.getByTestId("social-alcohol-audit-full")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("social-alcohol-audit-full-unableToStop-2"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alcohol: expect.objectContaining({
          auditFull: expect.objectContaining({ unableToStop: 2, enabled: true }),
        }),
      }),
    );
  });

  it("shows binge hint from max per session when weekly average is low", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [
          {
            id: "d1",
            type: "spirits",
            amount: 1,
            amountUnit: "peg",
            frequency: 10,
            frequencyUnit: "interval",
          },
        ],
        maxPerSession: { amount: 8, amountUnit: "peg" },
      },
    });

    expect(screen.getByTestId("social-alcohol-binge-hint")).toHaveTextContent("binge-pattern");
    expect(screen.queryByTestId("social-alcohol-intake-hint")).not.toBeInTheDocument();
  });

  it("updates max per session amount", () => {
    const onChange = vi.fn();
    renderField(
      {
        alcohol: {
          status: "current",
          drinks: [],
        },
      },
      onChange,
    );

    fireEvent.change(screen.getByTestId("social-alcohol-max-session-amount"), {
      target: { value: "6" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        alcohol: expect.objectContaining({
          maxPerSession: expect.objectContaining({ amount: 6 }),
        }),
      }),
    );
  });

  it("updates notes textarea", () => {
    const onChange = vi.fn();
    renderField({}, onChange);

    fireEvent.change(screen.getByLabelText("Social / personal history notes"), {
      target: { value: "Lives with parents" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Lives with parents" }),
    );
  });
});

describe("SocialHistoryField phase-2 lifestyle + context (sh-06)", () => {
  it("reveals per-substance detail when status and type are selected", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    expect(screen.queryByTestId("social-substances-details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("social-substances-status-current"));
    fireEvent.click(screen.getByTestId("social-substances-add-cannabis"));
    expect(screen.getByTestId("social-substances-details")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("social-substances-item-0-route-iv"),
    );
    expect(screen.getByTestId("social-substances-item-0-iv-hint")).toHaveTextContent("BBV screening");
  });

  it("captures caffeine in its own section without diet type", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));

    fireEvent.click(screen.getByTestId("social-caffeine-status-current"));
    fireEvent.click(screen.getByTestId("social-caffeine-add-tea"));
    expect(screen.getByTestId("social-caffeine-details")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Caffeine amount"), { target: { value: "2" } });
    expect(screen.getByLabelText("Caffeine amount")).toHaveValue(2);
  });

  it("persists caffeine source and occasional frequency without amount", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));

    fireEvent.click(screen.getByTestId("social-caffeine-status-current"));
    fireEvent.click(screen.getByTestId("social-caffeine-add-coffee"));
    fireEvent.change(screen.getByTestId("social-caffeine-item-0-frequency-unit"), {
      target: { value: "occasional" },
    });

    expect(screen.getByTestId("social-caffeine-item-0-frequency-unit")).toHaveValue("occasional");
  });

  it("keeps caffeine when diet type chip is deselected", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({
        diet: { type: "vegetarian" },
        caffeine: normalizeCaffeineSection({
          status: "current",
          items: [
            {
              id: "caf-1",
              type: "tea",
              amount: 2,
              frequencyUnit: "day",
              frequency: 1,
              phase: "current",
            },
          ],
        }),
      });
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(
      screen.getByTestId("social-diet-type").querySelector('button[aria-pressed="true"]')!,
    );
    expect(screen.getByLabelText("Caffeine amount")).toHaveValue(2);
  });

  it("reveals activity details when level is selected", () => {
    renderField({ activity: { level: "moderate", items: [] } });

    expect(screen.getByTestId("social-activity-details")).toBeInTheDocument();
    expect(screen.getByLabelText("Days per week")).toBeInTheDocument();
  });

  it("captures occupation text and exposures", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle work, home and exposure cluster" }));

    fireEvent.change(screen.getByPlaceholderText("Job or role"), {
      target: { value: "Farmer" },
    });
    expect(screen.getByTestId("social-occupation-details")).toBeInTheDocument();

    fireEvent.click(
      screen
        .getByTestId("social-occupation-exposures")
        .querySelector('button[aria-label="Heat"]')!,
    );
    expect(
      screen
        .getByTestId("social-occupation-exposures")
        .querySelector('button[aria-label="Heat"]'),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reveals travel details on toggle and clears on second click", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle work, home and exposure cluster" }));
    expect(screen.queryByTestId("social-travel-details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recent travel" }));
    expect(screen.getByTestId("social-travel-details")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "Mumbai" } });

    fireEvent.click(screen.getByRole("button", { name: "Recent travel" }));
    expect(screen.queryByTestId("social-travel-details")).not.toBeInTheDocument();
  });

  it("captures sick contact independently of travel", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle work, home and exposure cluster" }));

    fireEvent.click(screen.getByRole("button", { name: "Recent sick contact" }));
    expect(screen.getByTestId("social-sick-contact-details")).toBeInTheDocument();

    fireEvent.click(
      screen
        .getByTestId("social-sick-contact-types")
        .querySelector('button[aria-label="Flu / COVID / cold"]')!,
    );
    fireEvent.change(screen.getByPlaceholderText("Who, when, diagnosis if known"), {
      target: { value: "roommate had dengue" },
    });

    expect(screen.queryByTestId("social-travel-details")).not.toBeInTheDocument();
  });

  it("round-trips lifestyle + context fields through serializeSocialHistory", () => {
    const structured: SocialHistoryStructured = {
      substances: {
        status: "current",
        items: [{ id: "s1", type: "cannabis", route: "inhaled" }],
      },
      diet: { type: "vegetarian", caffeineCupsPerDay: 2 },
      activity: { level: "moderate", daysPerWeek: 3, items: [] },
      occupation: { text: "Farmer", exposures: ["heat"] },
      living: { situation: "with-family" },
      travel: { recent: true, place: "Mumbai" },
      sickContact: { present: true, types: ["flu-covid-cold"], context: ["household"] },
    };

    const text = serializeSocialHistory(structured);
    expect(text).toContain("Substances:");
    expect(text).toContain("Cannabis");
    expect(text).toContain("inhaled");
    expect(text).toContain("Diet: Vegetarian");
    expect(text).toContain("Caffeine: Current use — Caffeine (2 cups/day · ~80 mg/serving)");
    expect(text).toContain("Travel: Mumbai");
    expect(text).toContain("Sick contact: Flu/COVID/cold · Household");
  });
});

describe("SocialHistoryField phase-2 wellbeing + sexual (sh-07)", () => {
  it("captures sleep quality, hours, and flags", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle sleep and stress cluster" }));

    fireEvent.click(
      screen.getByTestId("social-sleep-quality").querySelector('button[aria-label="Poor"]')!,
    );
    expect(
      screen.getByTestId("social-sleep-quality").querySelector('button[aria-label="Poor"]'),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Hours/night (optional)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Snoring / suspected OSA" }));
  });

  it("captures stress level and support", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle sleep and stress cluster" }));

    fireEvent.click(
      screen.getByTestId("social-stress-level").querySelector('button[aria-label="High"]')!,
    );
    expect(screen.getByTestId("social-stress-details")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("social-stress-support").querySelector('button[aria-label="Limited"]')!,
    );
    expect(
      screen.getByTestId("social-stress-support").querySelector('button[aria-label="Limited"]'),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows sexual history fields when the cluster is expanded", () => {
    function Harness() {
      const [value, setValue] = useState<SocialHistoryStructured>({});
      return <SocialHistoryField value={value} onChange={setValue} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle sexual history" }));
    expect(screen.getByTestId("social-sexual-details")).toBeInTheDocument();
    expect(screen.getByTestId("social-sexual-active")).toBeInTheDocument();
    expect(screen.getByTestId("social-sexual-notes")).toBeInTheDocument();
  });

  it("clears sexual data when all fields are deselected", () => {
    const onChange = vi.fn();
    renderField(
      {
        sexual: { enabled: true, active: true },
      },
      onChange,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle sexual history" }));
    fireEvent.click(
      screen.getByTestId("social-sexual-active").querySelector('button[aria-label="Active"]')!,
    );
    expect(onChange).toHaveBeenCalledWith(expect.not.objectContaining({ sexual: expect.anything() }));
  });

  it("serializes sexual history only when enabled and filled", () => {
    const hidden = serializeSocialHistory({ sexual: { enabled: false, active: true } });
    expect(hidden).not.toContain("Sexual:");

    const enabledEmpty = serializeSocialHistory({ sexual: { enabled: true } });
    expect(enabledEmpty).toBe("");

    const filled = serializeSocialHistory({
      sexual: { enabled: true, active: true, protection: "sometimes" },
    });
    expect(filled).toBe("Sexual: active, protection sometimes");
  });

  it("round-trips sleep and stress through serializeSocialHistory", () => {
    const structured: SocialHistoryStructured = {
      sleep: { hoursPerNight: 6, quality: "poor" },
      stress: { level: "high", support: "limited" },
    };
    const text = serializeSocialHistory(structured);
    expect(text).toBe("Sleep: 6 h, poor · Stress: High, limited support");
  });

  it("exposes a11y attrs on phase-2 travel and sexual toggles (sh-08)", () => {
    renderField({
      travel: { recent: true, place: "Mumbai" },
      sexual: { enabled: true, active: true },
    });

    const travelBtn = screen.getByRole("button", { name: "Recent travel" });
    expect(travelBtn).toHaveAttribute("aria-expanded", "true");
    expect(travelBtn).toHaveAttribute("aria-controls");
    expect(screen.getByRole("group", { name: "Travel" })).toBeInTheDocument();

    expect(screen.getByTestId("social-history-cluster-sexual")).toBeInTheDocument();
    expect(screen.getByTestId("social-sexual-details")).toBeInTheDocument();

    expect(screen.getByTestId("social-history-cluster-wellbeing")).toBeInTheDocument();
    expect(screen.getByTestId("social-history-cluster-lifestyle")).toBeInTheDocument();
    expect(screen.getByTestId("social-history-cluster-context")).toBeInTheDocument();
  });
});

describe("buildRxPayload social history dual write", () => {
  it("sends JSONB and derived TEXT from structured state", () => {
    const fields = createEmptyRxFormFields();
    fields.socialHistoryStructured = {
      smoking: { status: "never", products: [] },
      notes: "Office worker",
    };

    const payload = buildRxPayload(fields);
    expect(payload.socialHistoryStructured).toEqual(fields.socialHistoryStructured);
    expect(payload.socialHistory).toBe("Smoking: Non-smoker · Office worker");
  });
});

describe("rxFormFieldsFromPrescription social history hydrate", () => {
  it("prefers JSONB over legacy TEXT", () => {
    const structured = {
      smoking: {
        status: "ex" as const,
        products: [{ id: "p1", type: "cigarette", perDay: 10, years: 20 }],
      },
    };
    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      investigations_orders: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
      complaints: [],
      family_history: null,
      social_history: "Legacy text only",
      social_history_structured: structured,
      past_surgical_history: null,
    } as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.socialHistoryStructured.smoking?.products[0]).toMatchObject({
      type: "cigarette",
      perDay: 10,
      years: 20,
    });
  });

  it("hydrates legacy TEXT when JSONB is absent", () => {
    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      investigations_orders: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
      complaints: [],
      family_history: null,
      social_history: "Smoking: Non-smoker",
      past_surgical_history: null,
    } as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.socialHistoryStructured.smoking).toEqual({ status: "never", products: [] });
  });
});

describe("SET_SOCIAL_HISTORY_STRUCTURED reducer", () => {
  it("syncs derived TEXT on structured updates", () => {
    const initial = createEmptyRxFormFields();
    const next = rxFormReducer(
      {
        fields: initial,
        isDirty: false,
        isSaving: false,
        isSubmitting: false,
        lastSavedAt: null,
        submitError: null,
      },
      {
        type: "SET_SOCIAL_HISTORY_STRUCTURED",
        structured: { smoking: { status: "never", products: [] } },
      },
    );

    expect(next.fields.socialHistoryStructured.smoking?.status).toBe("never");
    expect(next.fields.socialHistory).toBe("Smoking: Non-smoker");
    expect(next.isDirty).toBe(true);
  });

  it("shows approximate label when hookah contributes to pack-years", () => {
    renderField({
      smoking: {
        status: "current",
        products: [{ id: "p1", type: "hookah", perDay: 1, years: 10 }],
      },
    });

    expect(screen.getByTestId("social-smoking-pack-years")).toHaveTextContent(
      "≈ 5 pack-years (approx.)",
    );
  });

  it("keeps cigarette-only pack-years label without approximate suffix", () => {
    renderField({
      smoking: {
        status: "current",
        products: [{ id: "p1", type: "cigarette", perDay: 20, years: 10 }],
      },
    });

    expect(screen.getByTestId("social-smoking-pack-years")).toHaveTextContent("≈ 10 pack-years");
    expect(screen.getByTestId("social-smoking-pack-years")).not.toHaveTextContent("(approx.)");
  });

  it("exposes accessible labels on phase-3 alcohol controls (sh-13 a11y)", () => {
    renderField({
      alcohol: {
        status: "current",
        drinks: [
          {
            id: "d1",
            type: "beer",
            amount: 330,
            amountUnit: "ml",
            abv: 8,
            frequency: 3,
            frequencyUnit: "month",
          },
        ],
        maxPerSession: { amount: 6, amountUnit: "peg" },
        auditC: { frequency: 1, typicalQuantity: 0, bingeFrequency: 0, enabled: true },
      },
    });

    expect(screen.getByRole("group", { name: "Drink strength" })).toBeInTheDocument();
    expect(screen.getByTestId("social-alcohol-strength-8-0")).toBeInTheDocument();
    expect(screen.getByTestId("social-alcohol-max-session-amount")).toHaveAttribute(
      "aria-label",
      "Max amount in one sitting",
    );
    expect(screen.getByTestId("social-alcohol-audit-c-frequency-1")).toHaveAttribute(
      "aria-pressed",
    );
    expect(screen.getByTestId("social-alcohol-binge-hint")).toHaveAttribute("role", "status");
  });

  it("announces live indices to screen readers", () => {
    renderField({
      smoking: {
        status: "current",
        products: [{ id: "p1", type: "cigarette", perDay: 20, years: 10 }],
      },
      alcohol: {
        status: "current",
        drinks: [],
        cage: { cutDown: true, annoyed: true, guilty: false, eyeOpener: false, enabled: true },
        auditC: { frequency: 1, typicalQuantity: 1, bingeFrequency: 1, enabled: true },
      },
    });

    expect(screen.getByTestId("social-smoking-pack-years")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("social-alcohol-cage-score")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("social-alcohol-audit-c-score")).toHaveAttribute("aria-live", "polite");
  });
});
