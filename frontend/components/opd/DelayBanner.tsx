interface DelayBannerProps {
  delayMinutes: number;
}

/**
 * Banner when the visit is running late vs scheduled start (e-task-opd-05).
 */
export default function DelayBanner({ delayMinutes }: DelayBannerProps) {
  if (delayMinutes <= 0) return null;

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">Running late</p>
      <p className="mt-1 text-sm text-amber-800">
        About {delayMinutes} minute{delayMinutes === 1 ? "" : "s"} behind your
        scheduled start. We&apos;ll update this page automatically.
      </p>
    </div>
  );
}
