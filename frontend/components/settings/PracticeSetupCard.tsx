import Link from "next/link";

interface PracticeSetupCardProps {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * Card for Practice Setup landing. Icon + label + description.
 */
export function PracticeSetupCard({ href, label, description, icon }: PracticeSetupCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900">{label}</h3>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </Link>
  );
}
