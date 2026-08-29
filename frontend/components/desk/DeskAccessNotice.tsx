import type { DeskAccessState } from "@/lib/desk/api";

/**
 * Empty states for staff who can load the shell but cannot call desk APIs
 * (P1-Q3: unlinked / suspended keep a valid session; next request 403s).
 */
export function DeskAccessNotice({ state }: { state: DeskAccessState }) {
  if (state === "ok") return null;

  const title =
    state === "forbidden"
      ? "Your access has been removed"
      : "Could not reach the clinic";
  const body =
    state === "forbidden"
      ? "Ask the doctor to restore your desk login. You can sign out from the header."
      : "Check the connection and try again.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border bg-card px-4 py-6 shadow-sm"
    >
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
