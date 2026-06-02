"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface CameraPreviewOverlayProps {
  previewUrl: string;
  onRetake: () => void;
  onSwitchToGallery: () => void;
  onCancel: () => void;
  onSend: (caption: string) => void;
  sendDisabled?: boolean;
}

/**
 * text-C1 — full-screen (mobile) / modal (desktop) preview after OS camera
 * capture. Caption + Retake / Switch to gallery / Cancel / Send before the
 * file enters the B8 composer queue.
 */
export function CameraPreviewOverlay({
  previewUrl,
  onRetake,
  onSwitchToGallery,
  onCancel,
  onSend,
  sendDisabled = false,
}: CameraPreviewOverlayProps): JSX.Element | null {
  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    captionRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      data-testid="camera-preview-overlay"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden bg-white sm:rounded-xl sm:shadow-2xl">
        <div className="relative min-h-0 flex-1 bg-black sm:max-h-[60vh]">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob preview */}
          <img
            src={previewUrl}
            alt="Captured photo preview"
            className="h-full max-h-[70vh] w-full object-contain sm:max-h-[60vh]"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 p-4">
          <label className="sr-only" htmlFor="camera-preview-caption">
            Caption
          </label>
          <textarea
            ref={captionRef}
            id="camera-preview-caption"
            rows={2}
            placeholder="Add a caption (optional)…"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="camera-preview-caption"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetake}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              data-testid="camera-preview-retake"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={onSwitchToGallery}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              data-testid="camera-preview-gallery"
            >
              Switch to gallery
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              data-testid="camera-preview-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendDisabled}
              onClick={() => onSend(captionRef.current?.value ?? "")}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="camera-preview-send"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
