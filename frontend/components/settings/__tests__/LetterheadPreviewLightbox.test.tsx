import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  applyPreviewWheelZoom,
  clampPreviewZoom,
  LetterheadPreviewPane,
  nextPreviewFitScale,
  parsePreviewZoomPercent,
  previewWheelDeltaY,
  previewWheelShouldZoom,
  previewZoomAnchorScroll,
  stepPreviewZoom,
} from "@/components/settings/LetterheadPreviewPane";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const model = {
  doctorName: "Dr. Test",
  qualifications: "MBBS",
  specialty: "GP",
  clinicName: "Halo Clinic",
  clinicAddress: "1 Main St",
  logoUrl: null,
  preset: "classic" as const,
  pageSize: "a4" as const,
  accentColor: "#1D4ED8",
  preprintMarginTopMm: 40,
  preprintMarginBottomMm: 30,
};

describe("letterhead preview zoom math", () => {
  it("clamps and steps in 25% increments", () => {
    expect(clampPreviewZoom(0)).toBe(0.5);
    expect(clampPreviewZoom(9)).toBe(3);
    expect(stepPreviewZoom(1, 1)).toBe(1.25);
    expect(stepPreviewZoom(1, -1)).toBe(0.75);
    expect(parsePreviewZoomPercent("137")).toBeCloseTo(1.37);
    expect(parsePreviewZoomPercent("175%")).toBe(1.75);
    expect(parsePreviewZoomPercent("10")).toBe(0.5);
    expect(parsePreviewZoomPercent("900")).toBe(3);
    expect(parsePreviewZoomPercent("")).toBeNull();
  });

  it("keeps the old trackpad zoom rate; Ctrl/⌘ only gates the wheel", () => {
    expect(previewWheelShouldZoom({ ctrlKey: false, metaKey: false })).toBe(
      false,
    );
    expect(previewWheelShouldZoom({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(previewWheelShouldZoom({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(applyPreviewWheelZoom(1, -80, false)).toBeGreaterThan(1);
    expect(applyPreviewWheelZoom(1, 80, false)).toBeLessThan(1);
    expect(applyPreviewWheelZoom(1, -20, true)).toBeGreaterThan(1);
    expect(applyPreviewWheelZoom(1, 1000, false)).toBe(
      applyPreviewWheelZoom(1, 80, false),
    );
    expect(applyPreviewWheelZoom(1, -1000, false)).toBe(
      applyPreviewWheelZoom(1, -80, false),
    );
  });

  it("normalizes line and page wheel deltas before they hit zoom math", () => {
    expect(previewWheelDeltaY({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(previewWheelDeltaY({ deltaY: 1, deltaMode: 2 })).toBe(400);
    expect(previewWheelDeltaY({ deltaY: -40, deltaMode: 0 })).toBe(-40);
  });

  it("keeps fit scale across sub-pixel box jitter so zoom does not oscillate", () => {
    const a = nextPreviewFitScale(0, 400, 560, 794, 1123);
    expect(nextPreviewFitScale(a, 400.4, 560.3, 794, 1123)).toBe(a);
    expect(nextPreviewFitScale(0.45, Number.NaN, 500, 794, 1123)).toBe(0.45);
  });

  it("scrolls so the page point under the cursor stays put when zooming", () => {
    const next = previewZoomAnchorScroll({
      clientWidth: 400,
      clientHeight: 400,
      scrollLeft: 0,
      scrollTop: 0,
      cursorOffsetX: 200,
      cursorOffsetY: 200,
      pageWidth: 1000,
      pageHeight: 1000,
      oldScale: 1,
      newScale: 2,
      canvasPad: 32,
    });

    expect(next.scrollLeft).toBeCloseTo(184);
    expect(next.scrollTop).toBeCloseTo(184);

    const unchanged = previewZoomAnchorScroll({
      clientWidth: 400,
      clientHeight: 400,
      scrollLeft: 40,
      scrollTop: 80,
      cursorOffsetX: 200,
      cursorOffsetY: 200,
      pageWidth: 1000,
      pageHeight: 1000,
      oldScale: 1.5,
      newScale: 1.5,
      canvasPad: 32,
    });
    expect(unchanged).toEqual({ scrollLeft: 40, scrollTop: 80 });
  });
});

describe("LetterheadPreviewPane", () => {
  it("zooms in and out from the plus and minus controls", () => {
    render(<LetterheadPreviewPane model={model} />);

    const zoomBar = screen.getByTestId("letterhead-zoom-controls");
    expect(zoomBar).toBeInTheDocument();
    expect(zoomBar.parentElement?.className).toMatch(/shrink-0/);
    expect(screen.getByTestId("letterhead-zoom-percent")).toHaveValue("100");
    expect(
      screen.getByText(/ctrl\/⌘\+scroll or pinch to zoom/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to 100%/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByTestId("letterhead-zoom-percent")).toHaveValue("125");

    fireEvent.click(screen.getByRole("button", { name: /back to 100%/i }));
    expect(screen.getByTestId("letterhead-zoom-percent")).toHaveValue("100");
    expect(screen.getByRole("button", { name: /back to 100%/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /print only/i })).not.toBeInTheDocument();
  });

  it("applies a typed zoom percent and clamps out-of-range values", () => {
    render(<LetterheadPreviewPane model={model} />);
    const input = screen.getByRole("textbox", { name: /zoom percent/i });

    fireEvent.change(input, { target: { value: "137" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("137");

    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("50");

    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("50");
  });

  it("shows print only when an onPrint handler is passed", () => {
    const onPrint = vi.fn();
    render(<LetterheadPreviewPane model={model} onPrint={onPrint} />);
    fireEvent.click(screen.getByRole("button", { name: /print only/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /download pdf/i })).not.toBeInTheDocument();
  });

  it("shows download next to print when an onDownload handler is passed", () => {
    const onDownload = vi.fn();
    render(
      <LetterheadPreviewPane
        model={model}
        onPrint={vi.fn()}
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
