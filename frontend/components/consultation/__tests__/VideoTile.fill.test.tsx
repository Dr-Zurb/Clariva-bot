import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import VideoTile from "../VideoTile";

describe("VideoTile fill (vsf-01)", () => {
  it("uses fill-stage classes instead of aspect-video when fill=true", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          hideLabel
          fill
        />
      </div>,
    );

    const root = container.querySelector("[data-fill='true']");
    expect(root).toBeTruthy();
    expect(root?.className).toMatch(/h-full/);
    expect(container.querySelector("[data-testid='video-tile-media']")).toBeTruthy();
    const video = container.querySelector("video");
    expect(video?.className).toMatch(/object-contain/);
    expect(video?.className).not.toMatch(/object-cover/);
    expect(video?.className).not.toMatch(/aspect-video/);
  });

  it("keeps a stable media wrapper when toggling fill (no video remount)", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container, rerender } = render(
      <VideoTile
        videoRef={ref}
        label="You"
        cameraOff={false}
        actorName="Doctor"
        hideLabel
        fill={false}
      />,
    );
    const videoBefore = container.querySelector("video");
    const mediaBefore = container.querySelector("[data-testid='video-tile-media']");

    rerender(
      <VideoTile
        videoRef={ref}
        label="You"
        cameraOff={false}
        actorName="Doctor"
        hideLabel
        fill
      />,
    );

    expect(container.querySelector("video")).toBe(videoBefore);
    expect(container.querySelector("[data-testid='video-tile-media']")).toBe(
      mediaBefore,
    );
  });

  it("keeps aspect-video for legacy inline tiles", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoTile
        videoRef={ref}
        label="You"
        cameraOff={false}
        actorName="Doctor"
      />,
    );

    const root = container.querySelector("[data-fill='false']");
    expect(root).toBeTruthy();
    const video = container.querySelector("video");
    expect(video?.className).toMatch(/aspect-video/);
    expect(video?.className).toMatch(/object-cover/);
  });

  it("honors objectFit=cover on fill-stage tiles", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="Patient"
          cameraOff={false}
          actorName="Patient"
          hideLabel
          fill
          objectFit="cover"
        />
      </div>,
    );
    const video = container.querySelector("video");
    expect(video?.className).toMatch(/object-cover/);
    expect(video?.getAttribute("data-object-fit")).toBe("cover");
  });

  it("applies local rotation without remounting the video", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container, rerender } = render(
      <VideoTile
        videoRef={ref}
        label="Patient"
        cameraOff={false}
        actorName="Patient"
        fill
        rotation={0}
      />,
    );
    const videoBefore = container.querySelector("video");
    rerender(
      <VideoTile
        videoRef={ref}
        label="Patient"
        cameraOff={false}
        actorName="Patient"
        fill
        rotation={90}
      />,
    );
    const video = container.querySelector("video");
    expect(video).toBe(videoBefore);
    expect(video?.getAttribute("data-rotation")).toBe("90");
    expect(video?.style.transform).toContain("rotate(90deg)");
  });

  it("keeps object-cover on floating PiP tiles", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div className="relative h-96 w-96">
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          hideLabel
          fill
          floating={{ position: "BR" }}
        />
      </div>,
    );

    const video = container.querySelector("video");
    expect(video?.className).toMatch(/object-cover/);
    expect(video?.className).not.toMatch(/object-contain/);
  });

  it("invokes onTap for non-floating fill tiles (gallery/sidebar swap)", () => {
    const onTap = vi.fn();
    const ref = createRef<HTMLVideoElement>();
    render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          fill
          onTap={onTap}
          tapAriaLabel="Swap video positions"
        />
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Swap video positions" }),
    );
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("overlays the name chip inside the media box (no external heading)", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container, getByTestId, getByText } = render(
      <div style={{ height: 400 }}>
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          fill
        />
      </div>,
    );

    const media = getByTestId("video-tile-media");
    const chip = getByTestId("video-tile-label");
    expect(media.contains(chip)).toBe(true);
    expect(getByText("You")).toBe(chip);
    expect(chip.className).toMatch(/absolute/);
    expect(chip.className).toMatch(/bg-black\/45/);
    // Fill layout must not reserve a flex column for an external label.
    const root = container.querySelector("[data-testid='video-tile']");
    expect(root?.className).not.toMatch(/flex-col/);
  });

  it("keeps video mounted when entering floating PiP", () => {
    const ref = createRef<HTMLVideoElement>();
    const { container, rerender } = render(
      <div className="relative h-96 w-96">
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          hideLabel
          fill
        />
      </div>,
    );
    const videoBefore = container.querySelector("video");

    rerender(
      <div className="relative h-96 w-96">
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Doctor"
          hideLabel
          fill
          floating={{ position: "BR" }}
        />
      </div>,
    );

    expect(container.querySelector("video")).toBe(videoBefore);
    expect(container.querySelector("[data-fill='false']")).toBeTruthy();
  });

  it("taps a Speaker PiP to swap, and drags it to a corner", () => {
    const onTap = vi.fn();
    const onMove = vi.fn();
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <div
        className="relative"
        style={{ width: 400, height: 800 }}
        data-testid="pip-stage"
      >
        <VideoTile
          videoRef={ref}
          label="You"
          cameraOff={false}
          actorName="Patient"
          hideLabel
          fill
          floating={{
            position: "BR",
            onTap,
            onMove,
          }}
        />
      </div>,
    );

    const pip = screen.getByRole("button", { name: "Swap with main video" });
    expect(pip).toHaveAttribute("data-pip", "true");
    expect(pip).toHaveAttribute("data-pip-corner", "BR");

    fireEvent.click(pip);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();

    const stage = screen.getByTestId("pip-stage");
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 400,
      height: 800,
      right: 400,
      bottom: 800,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(pip, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 20,
      left: 20,
      top: 20,
      width: 96,
      height: 128,
      right: 116,
      bottom: 148,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(pip, "offsetParent", { configurable: true, value: stage });

    fireEvent.pointerDown(pip, { pointerId: 1, clientX: 300, clientY: 700 });
    fireEvent.pointerMove(pip, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(pip, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.click(pip);

    expect(onMove).toHaveBeenCalledWith("TL");
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")).toBeTruthy();
  });
});
