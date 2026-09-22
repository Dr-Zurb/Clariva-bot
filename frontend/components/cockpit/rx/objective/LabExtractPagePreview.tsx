"use client";

import { useEffect, useRef, useState } from "react";

type PdfPage = {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { cancel: () => void; promise: Promise<void> };
};

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type PdfjsApi = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDoc> };
};

let openUrl: string | null = null;
let openDoc: Promise<PdfDoc> | null = null;

async function loadPdfjs(): Promise<PdfjsApi> {
  const mod = (await import("pdfjs-dist/build/pdf")) as PdfjsApi & {
    default?: PdfjsApi;
  };
  return typeof mod.getDocument === "function"
    ? mod
    : (mod.default as PdfjsApi);
}

function loadDocument(url: string): Promise<PdfDoc> {
  if (openUrl === url && openDoc) return openDoc;
  const previous = openDoc;
  openUrl = url;
  openDoc = (async () => {
    const pdfjs = await loadPdfjs();
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
    const response = await fetch(url);
    if (!response.ok) throw new Error("fetch");
    const data = new Uint8Array(await response.arrayBuffer());
    return pdfjs.getDocument({
      data,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    }).promise;
  })();
  openDoc.catch(() => {
    if (openUrl === url) {
      openUrl = null;
      openDoc = null;
    }
  });
  if (previous) {
    void previous.then((doc) => doc.destroy()).catch(() => undefined);
  }
  return openDoc;
}

function isImageFile(fileType: string | null, fileUrl: string): boolean {
  const mime = (fileType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(fileUrl);
}

/**
 * The source page beside the extracted rows. Photos render as an image.
 * PDFs are drawn one page at a time in the browser from the file already
 * uploaded — the bytes are not sent anywhere else.
 */
export function LabExtractPagePreview({
  fileUrl,
  fileType,
  pageIndex,
}: {
  fileUrl: string;
  fileType: string | null;
  pageIndex: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const image = isImageFile(fileType, fileUrl);

  useEffect(() => {
    if (image) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    setStatus("loading");
    void (async () => {
      try {
        const doc = await loadDocument(fileUrl);
        if (cancelled) return;
        if (pageIndex < 0 || pageIndex >= doc.numPages) {
          setStatus("error");
          return;
        }
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const viewport = page.getViewport({ scale: 1.35 });
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [fileUrl, pageIndex, image]);

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived report URL
      <img
        src={fileUrl}
        alt="Report page"
        className="h-auto w-full object-contain"
        data-testid="lab-extract-page-preview"
      />
    );
  }

  return (
    <div className="relative" data-testid="lab-extract-page-preview">
      {status === "loading" ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Loading page…
        </p>
      ) : null}
      {status === "error" ? (
        <iframe
          title={`Report page ${pageIndex + 1}`}
          src={`${fileUrl}#page=${pageIndex + 1}&view=FitH`}
          className="min-h-[32rem] w-full"
          data-testid="lab-extract-page-frame"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className={status === "ready" ? "h-auto w-full" : "hidden"}
        aria-label={`Report page ${pageIndex + 1}`}
      />
    </div>
  );
}
