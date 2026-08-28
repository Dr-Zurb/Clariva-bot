import { Building2, Plug, UserRound } from "lucide-react";
import { PracticeSetupCard } from "@/components/settings/PracticeSetupCard";

const cards = [
  {
    href: "/dashboard/settings/account",
    label: "Account",
    description: "Password and sign-in",
    icon: <UserRound className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/practice-setup",
    label: "Practice setup",
    description:
      "Practice info, pricing, booking rules, messaging, and availability",
    icon: <Building2 className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/integrations",
    label: "Integrations",
    description: "Connect Instagram and control the receptionist",
    icon: <Plug className="h-6 w-6" aria-hidden />,
  },
] as const;

/**
 * Settings landing (settings-refresh · sr-06).
 */
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-muted-foreground">
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
