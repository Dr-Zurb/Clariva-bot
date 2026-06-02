import "@testing-library/jest-dom";

// Polyfill PointerEvent for Radix UI components in jsdom.
// Radix DropdownMenu / Popover etc. listen for `pointerdown` to open
// the overlay; jsdom doesn't ship PointerEvent, so we provide a minimal
// shim that extends MouseEvent so `fireEvent.pointerDown(el)` dispatches
// a real PointerEvent rather than a plain MouseEvent.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (window as unknown as Record<string, unknown>).PointerEvent = PointerEventShim;
  HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}

// cmdk uses ResizeObserver for list layout in jsdom tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
