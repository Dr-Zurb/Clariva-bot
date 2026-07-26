/**
 * Shared verification document preview (admin-console list + detail).
 * Signed URLs are short-lived — use <img>, not next/image.
 */

export function DocPreview({
  label,
  url,
  compact = false,
}: {
  label: string;
  url: string | null;
  /** Smaller preview height for dialogs on the list page. */
  compact?: boolean;
}) {
  if (!url) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No {label.toLowerCase()} on file.
      </div>
    );
  }

  let isPdf = false;
  try {
    isPdf = new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    isPdf = /\.pdf($|\?)/i.test(url);
  }

  const frameClass = compact
    ? "h-[18rem] w-full rounded-md border border-border bg-muted/20"
    : "h-[28rem] w-full rounded-md border border-border bg-muted/20";
  const imgClass = compact
    ? "max-h-[18rem] w-full rounded-md border border-border object-contain bg-muted/20"
    : "max-h-[28rem] w-full rounded-md border border-border object-contain bg-muted/20";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Open in new tab
        </a>
      </div>
      {isPdf ? (
        <iframe title={label} src={url} className={frameClass} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image not appropriate
        <img src={url} alt={label} className={imgClass} />
      )}
    </div>
  );
}
