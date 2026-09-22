import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LabExtractVerifyDialog,
  type LabExtractVerifyGroup,
} from "@/components/cockpit/rx/objective/LabExtractVerifyDialog";
import { matchExtractedLabRow } from "@/lib/cockpit/lab-extract-match";
import type { RawExtractedLabRow } from "@/lib/api/lab-extract";

function raw(
  partial: Partial<RawExtractedLabRow> & Pick<RawExtractedLabRow, "rawName">
): RawExtractedLabRow {
  return {
    rawValue: null,
    rawUnit: null,
    rawRange: null,
    rawMethod: null,
    pageIndex: 0,
    lineText: partial.rawName,
    ...partial,
  };
}

function group(
  candidates: ReturnType<typeof matchExtractedLabRow>[],
  overrides: Partial<Omit<LabExtractVerifyGroup, "candidates">> = {}
): LabExtractVerifyGroup {
  return {
    attachmentId: "att-1",
    sourceLabel: "report.pdf",
    pageCount: 1,
    skippedPageCount: 0,
    candidates,
    source: "pdf_text",
    previewUrl: null,
    ...overrides,
  };
}

describe("LabExtractVerifyDialog", () => {
  it("pre-checks every extracted row and only confirms the checked set", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const green = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
      })
    );
    const unmatched = matchExtractedLabRow(
      raw({ rawName: "Mystery analyte", rawValue: "1" })
    );

    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={onOpenChange}
        groups={[group([green, unmatched])]}
        reportDate="2026-09-06"
        onConfirm={onConfirm}
      />
    );

    const checks = screen.getAllByTestId(
      "lab-extract-row-check"
    ) as HTMLInputElement[];
    expect(checks).toHaveLength(2);
    expect(checks.every((box) => box.checked)).toBe(true);
    expect(screen.getByTestId("lab-extract-select-all")).toBeDisabled();
    expect(screen.getByTestId("lab-extract-deselect-all")).toBeEnabled();

    const rows = screen.getAllByTestId("lab-extract-row");
    expect(rows[1]).toHaveAttribute("data-confidence", "unmatched");

    fireEvent.click(checks[1]!);
    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0]).toHaveLength(1);
    expect(onConfirm.mock.calls[0]![0][0].name).toBe("Haemoglobin");
    expect(onConfirm.mock.calls[0]![0][0].reportDate).toBe("2026-09-06");
  });

  it("selects and deselects every row", () => {
    const green = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
      })
    );
    const unmatched = matchExtractedLabRow(
      raw({ rawName: "Mystery analyte", rawValue: "1" })
    );

    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[group([green, unmatched])]}
        reportDate="2026-09-06"
        onConfirm={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId("lab-extract-deselect-all"));
    const checks = screen.getAllByTestId(
      "lab-extract-row-check"
    ) as HTMLInputElement[];
    expect(checks.every((box) => !box.checked)).toBe(true);
    expect(screen.getByTestId("lab-extract-confirm")).toBeDisabled();
    expect(screen.getByTestId("lab-extract-deselect-all")).toBeDisabled();

    fireEvent.click(screen.getByTestId("lab-extract-select-all"));
    expect(
      (
        screen.getAllByTestId("lab-extract-row-check") as HTMLInputElement[]
      ).every((box) => box.checked)
    ).toBe(true);
    expect(screen.getByTestId("lab-extract-confirm")).toBeEnabled();
  });

  it("does not confirm when the extract is empty", () => {
    const onConfirm = vi.fn();
    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[]}
        reportDate="2026-09-06"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByTestId("lab-extract-empty")).toBeInTheDocument();
    expect(screen.getByTestId("lab-extract-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("tabs multiple reports and keeps per-file dates on confirm", () => {
    const onConfirm = vi.fn();
    const hb = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
      })
    );
    const cr = matchExtractedLabRow(
      raw({ rawName: "Creatinine", rawValue: "1.1", rawUnit: "mg/dL" })
    );
    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[
          group([hb], {
            attachmentId: "pdf-1",
            sourceLabel: "02_LFT_Test_Report.pdf",
          }),
          group([cr], {
            attachmentId: "pdf-2",
            sourceLabel: "03_KFT_Test_Report.pdf",
          }),
        ]}
        reportDate="2026-09-06"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Verify · 2 reports")).toBeInTheDocument();
    const tabs = screen.getAllByTestId("lab-extract-report-tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("LFT");
    expect(tabs[1]).toHaveTextContent("KFT");
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Creatinine")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lab-extract-deselect-all"));
    fireEvent.click(tabs[1]!);
    expect(screen.getByDisplayValue("Creatinine")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("lab-extract-report-date"), {
      target: { value: "2026-08-01" },
    });
    expect(screen.getByTestId("lab-extract-selection-hint")).toHaveTextContent(
      "1 selected across 1 report"
    );

    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const selected = onConfirm.mock.calls[0]![0];
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe("Creatinine");
    expect(selected[0].reportDate).toBe("2026-08-01");
    expect(selected[0].attachmentId).toBe("pdf-2");
  });

  it("shows the source photo for model-read rows and not for PDF rows", () => {
    const hb = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
      })
    );
    const { rerender } = render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[
          group([hb], {
            source: "vision",
            previewUrl: "https://signed.example/report.jpg",
          }),
        ]}
        reportDate="2026-09-06"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByTestId("lab-extract-vision-notice")).toBeInTheDocument();
    expect(screen.getByAltText("Source report photo")).toHaveAttribute(
      "src",
      "https://signed.example/report.jpg"
    );
    expect(
      screen.getByRole("link", { name: "Open full size" })
    ).toHaveAttribute("target", "_blank");

    rerender(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[group([hb])]}
        reportDate="2026-09-06"
        onConfirm={() => {}}
      />
    );
    expect(
      screen.queryByTestId("lab-extract-vision-notice")
    ).not.toBeInTheDocument();
  });

  it("still verifies a photo extract when the preview URL could not be signed", () => {
    const onConfirm = vi.fn();
    const hb = matchExtractedLabRow(
      raw({ rawName: "Hb", rawValue: "11.8", rawUnit: "g/dL" })
    );
    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[group([hb], { source: "vision", previewUrl: null })]}
        reportDate="2026-09-06"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByTestId("lab-extract-vision-notice")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Source report photo")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("badges a merged value cell so the doctor re-reads that row", () => {
    const merged = matchExtractedLabRow(
      raw({ rawName: "Hb", rawValue: "11.8 15.0", rawUnit: "g/dL" })
    );
    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[group([merged], { source: "vision", previewUrl: null })]}
        reportDate="2026-09-06"
        onConfirm={() => {}}
      />
    );

    const row = screen.getByTestId("lab-extract-row");
    expect(row).toHaveAttribute("data-confidence", "flagged");
    expect(row).toHaveTextContent("Format");
  });

  it("shows one PDF page of rows at a time and keeps the other page selected", () => {
    const onConfirm = vi.fn();
    const pageOne = matchExtractedLabRow(
      raw({
        rawName: "Hb",
        rawValue: "11.8",
        rawUnit: "g/dL",
        rawRange: "12.0 - 15.0",
        pageIndex: 0,
      })
    );
    const pageTwo = matchExtractedLabRow(
      raw({
        rawName: "Creatinine",
        rawValue: "1.1",
        rawUnit: "mg/dL",
        pageIndex: 1,
      })
    );
    render(
      <LabExtractVerifyDialog
        open
        onOpenChange={() => {}}
        groups={[
          group([pageOne, pageTwo], { pageCount: 2, sourceLabel: "Page 1" }),
        ]}
        reportDate="2026-09-06"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Verify · Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Creatinine")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lab-extract-page-next"));
    expect(screen.getByText("Verify · Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Creatinine")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Haemoglobin")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lab-extract-deselect-all"));
    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    const selected = onConfirm.mock.calls[0]![0] as { name: string }[];
    expect(selected.map((row) => row.name)).toEqual(["Haemoglobin"]);
  });
});
