import { BarChart3, Plug } from "lucide-react";
import { PracticeSetupCard } from "@/components/settings/PracticeSetupCard";

const cards = [
  {
    href: "/dashboard/settings/practice-setup",
    label: "Practice Setup",
    description: "Practice info, services catalog, booking rules, bot messages, and availability",
    icon: <BarChart3 className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/integrations",
    label: "Integrations",
    description: "Connect Instagram and other accounts",
    icon: <Plug className="h-6 w-6" aria-hidden />,
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
