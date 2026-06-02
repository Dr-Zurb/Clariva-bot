/**
 * text-C2 — ImageLightbox interaction tests.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "@/components/consultation/ImageLightbox";

const IMAGES = [
  { src: "https://example.com/1.jpg", alt: "One", messageId: "m1" },
  { src: "https://example.com/2.jpg", alt: "Two", messageId: "m2" },
  { src: "https://example.com/3.jpg", alt: "Three", messageId: "m3" },
];

describe("ImageLightbox", () => {
  it("renders dialog with counter and navigates with arrow keys", () => {
    const onClose = vi.fn();
    render(
      <ImageLightbox images={IMAGES} initialIndex={1} onClose={onClose} />,
    );

    expect(screen.getByRole("dialog", { name: "Image viewer" })).toBeTruthy();
    expect(screen.getByTestId("image-lightbox-counter")).toHaveTextContent(
      "2 / 3",
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("image-lightbox-counter")).toHaveTextContent(
      "3 / 3",
    );

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("image-lightbox-counter")).toHaveTextContent(
      "2 / 3",
    );
  });

  it("closes on Escape and close button", () => {
    const onClose = vi.fn();
    render(
      <ImageLightbox images={IMAGES} initialIndex={0} onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.click(screen.getByTestId("image-lightbox-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides counter for a single image", () => {
    render(
      <ImageLightbox
        images={[IMAGES[0]]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId("image-lightbox-counter")).toBeNull();
    expect(screen.queryByTestId("image-lightbox-prev")).toBeNull();
  });
});
