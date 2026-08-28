import Link from "next/link";

interface PracticeSetupCardProps {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * Card for Settings / Practice setup landings (settings-refresh · SR-D2).
 */
export function PracticeSetupCard({
  href,
  label,
  description,
  icon,
}: PracticeSetupCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
