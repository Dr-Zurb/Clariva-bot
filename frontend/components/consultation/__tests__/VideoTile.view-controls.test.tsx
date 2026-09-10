import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoTile, {
  VIDEO_MOUSE_ZOOM_RATE,
  VIDEO_PINCH_WHEEL_ZOOM_RATE,
  VIDEO_TRACKPAD_ZOOM_RATE,
  applyWheelZoom,
  isDiscreteMouseWheel,
  nextVideoRotation,
  nextVideoZoom,
  panTowardAnchor,
  zoomFromPinchDistance,
} from "../VideoTile";
import { formatVideoZoomLabel } from "../VideoTileViewControls";

describe("nextVideoRotation", () => {
  it("wraps 270 + 90 back to 0", () => {
    expect(nextVideoRotation(270, 90)).toBe(0);
  });

  it("wraps 0 - 90 to 270", () => {
    expect(nextVideoRotation(0, -90)).toBe(270);
  });
});

describe("nextVideoZoom", () => {
  it("steps by 0.5 and clamps at 1× and 8×", () => {
    expect(nextVideoZoom(1, 1)).toBe(1.5);
    expect(nextVideoZoom(1.5, 1)).toBe(2);
    expect(nextVideoZoom(4, 1)).toBe(4.5);
    expect(nextVideoZoom(8, 1)).toBe(8);
    expect(nextVideoZoom(1, -1)).toBe(1);
  });
});

describe("formatVideoZoomLabel", () => {
  it("shows one decimal, and drops .0 on whole numbers", () => {
    expect(formatVideoZoomLabel(4.680671308733657)).toBe("4.7×");
    expect(formatVideoZoomLabel(2)).toBe("2×");
    expect(formatVideoZoomLabel(1.04)).toBe("1×");
  });
});

describe("VideoTile view controls", () => {
  it("renders Fit / Fill / Rotate on a stage tile", () => {
    const ref = createRef<HTMLVideoElement>();
    const onFit = vi.fn();
    const onRotate = vi.fn();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          viewControls={{
            onObjectFitChange: onFit,
            onRotate,
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill frame" }));
    expect(onFit).toHaveBeenCalledWith("cover");
    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    expect(onRotate).toHaveBeenCalledWith(90);
    fireEvent.click(
      screen.getByRole("button", { name: "Rotate counterclockwise" }),
    );
    expect(onRotate).toHaveBeenCalledWith(-90);
  });

  it("does not fire tile onTap when clicking rotate", () => {
    const ref = createRef<HTMLVideoElement>();
    const onTap = vi.fn();
    const onRotate = vi.fn();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          onTap={onTap}
          tapAriaLabel="Swap video positions"
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate,
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("swaps from the action bar instead of clicking the video", () => {
    const ref = createRef<HTMLVideoElement>();
    const onSwap = vi.fn();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
            onSwap,
          }}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Swap video positions" }));
    expect(onSwap).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("video-tile-media"));
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it("hides Fit/Fill on floating PiP (rotate only)", () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <div className="relative h-96 w-96">
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          hideLabel
          fill
          floating={{ position: "BR" }}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );

    expect(screen.getByTestId("video-tile-view-controls")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Fit to frame" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Zoom in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate clockwise" }),
    ).toBeInTheDocument();
  });

  it("zooms in for lesion inspection and keeps the video mounted", () => {
    const ref = createRef<HTMLVideoElement>();
    const onZoom = vi.fn();
    const onZoomReset = vi.fn();
    const { container, rerender } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={1}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom,
            onZoomReset,
          }}
        />
      </div>,
    );
    const videoBefore = container.querySelector("video");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onZoom).toHaveBeenCalledWith(1);

    rerender(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={2}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom,
            onZoomReset,
          }}
        />
      </div>,
    );
    const video = container.querySelector("video");
    expect(video).toBe(videoBefore);
    expect(video?.getAttribute("data-zoom")).toBe("2");
    expect(video?.style.transform).toContain("scale(2)");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(onZoomReset).toHaveBeenCalledTimes(1);
  });

  it("marks the media box while the self camera is flipping", () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Patient"
          fill
          cameraFlipping
        />
      </div>,
    );
    const media = screen.getByTestId("video-tile-media");
    expect(media).toHaveAttribute("data-camera-flipping", "true");
    expect(media.className).toContain("video-camera-flip");
  });

  it("renders a bottom-left overlay without unmounting the video", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Patient"
          fill
          bottomLeftOverlay={
            <button type="button" data-testid="self-camera-flip">
              Flip
            </button>
          }
        />
      </div>,
    );
    expect(screen.getByTestId("self-camera-flip")).toHaveTextContent("Flip");
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("zooms continuously on pinch-wheel and mouse notch", () => {
    const ref = createRef<HTMLVideoElement>();
    const onZoom = vi.fn();
    const onZoomTo = vi.fn();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={1}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom,
            onZoomTo,
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );
    const media = screen.getByTestId("video-tile-media");
    fireEvent.wheel(media, { deltaY: -8, ctrlKey: true, deltaMode: 0 });
    expect(onZoom).not.toHaveBeenCalled();
    const afterPinch = applyWheelZoom(1, -8, VIDEO_PINCH_WHEEL_ZOOM_RATE);
    expect(onZoomTo).toHaveBeenCalledWith(afterPinch);
    onZoomTo.mockClear();
    fireEvent.wheel(media, { deltaY: -100, deltaX: 0, deltaMode: 0 });
    expect(onZoomTo).toHaveBeenCalledWith(
      applyWheelZoom(afterPinch, -100, VIDEO_MOUSE_ZOOM_RATE),
    );
  });

  it("zooms from the tile centre so the image does not slide", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={2}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomTo: vi.fn(),
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );
    const media = screen.getByTestId("video-tile-media");
    vi.spyOn(media, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    });
    fireEvent.wheel(media, {
      deltaY: -100,
      deltaX: 0,
      deltaMode: 0,
      clientX: 520,
      clientY: 40,
    });
    expect(container.querySelector("video")?.style.transform).not.toContain(
      "translate",
    );
  });

  it("consumes mouse wheel so the consult pane does not scroll", () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={1}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomTo: vi.fn(),
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );
    const tile = screen.getByTestId("video-tile");
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      deltaX: 0,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
    });
    const prevent = vi.spyOn(event, "preventDefault");
    const stop = vi.spyOn(event, "stopPropagation");
    tile.dispatchEvent(event);
    expect(prevent).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("zooms on a slow scroll instead of panning the frame", () => {
    const ref = createRef<HTMLVideoElement>();
    const onZoomTo = vi.fn();
    const { container } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          zoom={2}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomTo,
            onZoomReset: vi.fn(),
          }}
        />
      </div>,
    );
    const media = screen.getByTestId("video-tile-media");
    vi.spyOn(media, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 400,
      right: 600,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    });
    fireEvent.wheel(media, { deltaY: 12, deltaX: 8, deltaMode: 0 });
    expect(onZoomTo).toHaveBeenCalledWith(
      applyWheelZoom(2, 12, VIDEO_TRACKPAD_ZOOM_RATE),
    );
    expect(container.querySelector("video")?.style.transform).not.toContain(
      "translate",
    );
  });
});

describe("applyWheelZoom", () => {
  it("scales exponentially and clamps at 1× and 8×", () => {
    const zoomed = applyWheelZoom(1, -20, VIDEO_TRACKPAD_ZOOM_RATE);
    expect(zoomed).toBeGreaterThan(1);
    expect(zoomed).toBeLessThan(1.2);
    expect(applyWheelZoom(1, 40, VIDEO_TRACKPAD_ZOOM_RATE)).toBe(1);
    expect(applyWheelZoom(8, -40, VIDEO_TRACKPAD_ZOOM_RATE)).toBe(8);
  });
});

describe("isDiscreteMouseWheel", () => {
  it("treats a whole-notch vertical tick as a mouse wheel", () => {
    expect(
      isDiscreteMouseWheel({
        ctrlKey: false,
        deltaX: 0,
        deltaY: -100,
        deltaMode: 0,
      }),
    ).toBe(true);
    expect(
      isDiscreteMouseWheel({
        ctrlKey: false,
        deltaX: 3.2,
        deltaY: 8.4,
        deltaMode: 0,
      }),
    ).toBe(false);
  });
});

describe("zoomFromPinchDistance", () => {
  it("tracks pinch distance absolutely from the start zoom", () => {
    expect(zoomFromPinchDistance(2, 100, 150)).toBe(3);
    expect(zoomFromPinchDistance(2, 100, 50)).toBe(1);
    expect(zoomFromPinchDistance(2, 0, 50)).toBe(2);
  });
});

describe("VideoTile tap-to-inspect", () => {
  it("hides the pill until the tile is tapped", () => {
    const ref = createRef<HTMLVideoElement>();
    const onRotate = vi.fn();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate,
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
            revealOnTap: true,
            cycleRotate: true,
          }}
        />
      </div>,
    );

    expect(
      screen.queryByTestId("video-tile-view-controls"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("video-tile-media"));
    expect(screen.getByTestId("video-tile-view-controls")).toHaveAttribute(
      "data-variant",
      "touch",
    );
    fireEvent.click(screen.getByRole("button", { name: "Rotate view" }));
    expect(onRotate).toHaveBeenCalledWith(90);
    expect(
      screen.queryByRole("button", { name: "Rotate counterclockwise" }),
    ).not.toBeInTheDocument();
  });

  it("parks a touch strip on the splitter and can hide zoom", () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
            revealOnTap: true,
            cycleRotate: true,
            inspectPlacement: "bottom-center",
            inspectHideZoom: true,
          }}
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId("video-tile-media"));
    const strip = screen.getByTestId("video-tile-view-controls");
    expect(strip).toHaveAttribute("data-placement", "bottom-center");
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit to frame" })).toBeInTheDocument();
  });

  it("shows the strip on mouse hover and hides it on leave", () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          fill
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
            revealOnTap: true,
            inspectVariant: "desktop",
          }}
        />
      </div>,
    );
    const tile = screen.getByTestId("video-tile");
    expect(
      screen.queryByTestId("video-tile-view-controls"),
    ).not.toBeInTheDocument();
    fireEvent.pointerEnter(tile, { pointerType: "mouse" });
    expect(screen.getByTestId("video-tile-view-controls")).toBeInTheDocument();
    fireEvent.pointerLeave(tile, { pointerType: "mouse" });
    expect(
      screen.queryByTestId("video-tile-view-controls"),
    ).not.toBeInTheDocument();
  });

  it("does not show inspect on a PiP — tap stays swap", () => {
    const ref = createRef<HTMLVideoElement>();
    const onTap = vi.fn();
    render(
      <div className="relative h-96 w-96">
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Patient"
          hideLabel
          fill
          floating={{ position: "BR", onTap }}
          viewControls={{
            onObjectFitChange: vi.fn(),
            onRotate: vi.fn(),
            onZoom: vi.fn(),
            onZoomReset: vi.fn(),
            revealOnTap: true,
            cycleRotate: true,
          }}
        />
      </div>,
    );

    expect(
      screen.queryByTestId("video-tile-view-controls"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("video-tile"));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("video-tile-view-controls"),
    ).not.toBeInTheDocument();
  });
});

describe("panTowardAnchor", () => {
  it("keeps the cursor point fixed when zoom doubles", () => {
    expect(panTowardAnchor({ x: 0, y: 0 }, 1, 2, { x: 40, y: -20 })).toEqual({
      x: -40,
      y: 20,
    });
  });
});
