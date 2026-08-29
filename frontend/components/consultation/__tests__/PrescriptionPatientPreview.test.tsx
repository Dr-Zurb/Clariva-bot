import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrescriptionPatientPreview, {
  letterheadPreviewModelFromRx,
} from "@/components/consultation/PrescriptionPatientPreview";
import type { PatientRxViewModel } from "@/components/ehr/PatientRxView";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const viewModel: PatientRxViewModel = {
  doctorName: "Dr Test",
  doctorSpecialty: null,
  clinicName: null,
  clinicAddress: null,
  patientName: "Patient",
  visitDateLabel: null,
  cc: "cough",
  hopi: null,
  provisionalDiagnosis: null,
  investigations: null,
  advice: null,
  followUp: null,
  patientEducation: null,
  referral: null,
  medicines: [],
};

/** Radix DropdownMenu opens on pointerDown + click (jsdom). */
function openDropdown(trigger: Element) {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

function renderCommitPreview(
  overrides: Partial<ComponentProps<typeof PrescriptionPatientPreview>> = {}
) {
  const onSendFinishAndPrint = vi.fn();
  const onSendAndFinish = vi.fn();
  const onSendRx = vi.fn();
  const onFinish = vi.fn();
  const onPrint = vi.fn();
  const onDownload = vi.fn();

  render(
    <PrescriptionPatientPreview
      open
      onClose={vi.fn()}
      viewModel={viewModel}
      canSend
      canFinish
      canPrint
      onSendFinishAndPrint={onSendFinishAndPrint}
      onSendAndFinish={onSendAndFinish}
      onSendRx={onSendRx}
      onFinish={onFinish}
      onPrint={onPrint}
      onDownload={onDownload}
      {...overrides}
    />
  );

  return {
    onSendFinishAndPrint,
    onSendAndFinish,
    onSendRx,
    onFinish,
    onPrint,
    onDownload,
  };
}

describe("PrescriptionPatientPreview", () => {
  it("joins food timing and notes into medicine instructions", () => {
    const model = letterheadPreviewModelFromRx({
      ...viewModel,
      medicines: [
        {
          medicineName: "Salbutamol inhaler 100 mcg",
          dosage: "100 mcg",
          route: "Inhaled",
          routeCode: "inhaled",
          frequency: null,
          frequencyCode: "SOS",
          duration: null,
          durationValue: 14,
          durationUnit: "days",
          instructions: "2 puffs when wheezy. Shake well.",
          doseQty: 2,
          doseUnit: "puff",
          foodTiming: "after_food",
        },
      ],
    });

    expect(model.rx?.medicines?.[0]?.instructions).toBe(
      "After food — 2 puffs when wheezy. Shake well."
    );
  });

  it("forwards social history and custom sections onto the letterhead model", () => {
    const model = letterheadPreviewModelFromRx({
      ...viewModel,
      hopi: "Throbbing for 2 days",
      socialHistory: "Non-smoker",
      customSubsections: [
        { title: "Travel history", body: "Visited Kerala", children: [] },
      ],
      assessmentCustomSections: [
        { title: "Risk notes", body: "No red flags", children: [] },
      ],
      planCustomSections: [
        { title: "Physio", body: "Neck stretches", children: [] },
      ],
    });

    expect(model.rx?.hopi).toBe("Throbbing for 2 days");
    expect(model.rx?.socialHistory).toBe("Non-smoker");
    expect(model.rx?.customSubsections?.[0]?.title).toBe("Travel history");
    expect(model.rx?.assessmentCustomSections?.[0]?.title).toBe("Risk notes");
    expect(model.rx?.planCustomSections?.[0]?.title).toBe("Physio");
  });

  it("renders peek-only without a commit bar", () => {
    render(
      <PrescriptionPatientPreview
        open
        onClose={vi.fn()}
        viewModel={viewModel}
      />
    );
    expect(
      screen.getByRole("dialog", { name: /review prescription/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("rx-review-actions")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /print only/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /download pdf/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("pins dialog height so the zoomed page cannot cover Send & finish", () => {
    renderCommitPreview();
    const shell = screen.getByRole("dialog", {
      name: /review prescription/i,
    }).firstElementChild;
    expect(shell?.className).toMatch(/h-\[94vh\]/);
    expect(shell?.className).toMatch(/overflow-hidden/);
    expect(
      screen.getByRole("button", { name: /^send & finish$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /print only/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("letterhead-zoom-percent")).toHaveValue("150");
  });

  it("prints from the preview bar without sending", () => {
    const { onPrint, onSendAndFinish } = renderCommitPreview();

    fireEvent.click(screen.getByRole("button", { name: /print only/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onSendAndFinish).not.toHaveBeenCalled();
  });

  it("downloads the PDF from the preview bar without sending", () => {
    const { onDownload, onSendAndFinish } = renderCommitPreview();

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onSendAndFinish).not.toHaveBeenCalled();
  });

  it("sends and finishes from the primary button", () => {
    const { onSendAndFinish, onSendFinishAndPrint } = renderCommitPreview();

    expect(screen.getByTestId("rx-review-actions")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send rx, finish & print/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^send & finish$/i }));
    expect(onSendAndFinish).toHaveBeenCalledTimes(1);
    expect(onSendFinishAndPrint).not.toHaveBeenCalled();
  });

  it("prints with send & finish when Also print is checked", () => {
    const { onSendAndFinish, onSendFinishAndPrint } = renderCommitPreview();

    fireEvent.click(screen.getByRole("checkbox", { name: /also print/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send & finish$/i }));

    expect(onSendFinishAndPrint).toHaveBeenCalledTimes(1);
    expect(onSendAndFinish).not.toHaveBeenCalled();
  });

  it("keeps send-only and finish-only in More", () => {
    const { onSendRx, onFinish } = renderCommitPreview();

    openDropdown(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /send rx only/i }));
    expect(onSendRx).toHaveBeenCalledTimes(1);

    openDropdown(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /finish without sending/i })
    );
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("omits Stay / resume later on the intentional Done path", () => {
    renderCommitPreview();
    expect(screen.queryByTestId("rx-leave-exit")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^stay$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /leave — resume later/i })
    ).not.toBeInTheDocument();
  });

  it("shows Stay / resume later when the leave path provides them", () => {
    const onStay = vi.fn();
    const onResumeLater = vi.fn();
    renderCommitPreview({ onStay, onResumeLater });

    expect(screen.getByTestId("rx-leave-exit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^stay$/i }));
    expect(onStay).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: /leave — resume later/i })
    );
    expect(onResumeLater).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /^send & finish$/i })
    ).toBeInTheDocument();
  });

  it("hides finish and send combos when those gates are off", () => {
    render(
      <PrescriptionPatientPreview
        open
        onClose={vi.fn()}
        viewModel={viewModel}
        canSend={false}
        canFinish={false}
        canPrint
        onSendFinishAndPrint={vi.fn()}
        onSendAndFinish={vi.fn()}
        onSendRx={vi.fn()}
        onFinish={vi.fn()}
        onPrint={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /send & finish/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /finish visit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /also print/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^print$/i })
    ).toBeInTheDocument();
  });
});
