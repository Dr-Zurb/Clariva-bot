import { PracticeSetupCard } from "@/components/settings/PracticeSetupCard";

const cards = [
  {
    href: "/dashboard/settings/practice-setup",
    label: "Practice Setup",
    description: "Configure practice info, booking rules, bot messages, and availability",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v18" />
        <rect x="4" y="8" width="6" height="12" rx="1" />
        <rect x="14" y="4" width="6" height="16" rx="1" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings/integrations",
    label: "Integrations",
    description: "Connect Instagram and other accounts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
] as const;

/**
 * Settings landing: 2 cards — Practice Setup and Integrations.
 */
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-gray-600">
        Manage your practice configuration and connected accounts.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <PracticeSetupCard
            key={card.href}
            href={card.href}
            label={card.label}
            description={card.description}
            icon={card.icon}
          />
        ))}
      </div>
    </div>
  );
}
