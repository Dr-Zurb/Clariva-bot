import { Building2, CreditCard, Headset, IndianRupee, Plug, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
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
    href: "/dashboard/settings/front-desk",
    label: "Front desk",
    description: "Receptionist logins — only one active at a time",
    icon: <Headset className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/integrations",
    label: "Integrations",
    description: "Connect Instagram and control the receptionist",
    icon: <Plug className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/billing",
    label: "Billing",
    description: "Subscription, this month’s consults, and invoices",
    icon: <IndianRupee className="h-6 w-6" aria-hidden />,
  },
  {
    href: "/dashboard/settings/payments",
    label: "Payments",
    description: "How patients pay you — your Razorpay, not ours",
    icon: <CreditCard className="h-6 w-6" aria-hidden />,
  },
] as const;

/**
 * Settings landing (settings-refresh · sr-06).
 * Instagram OAuth may still bounce to this hub with `?connected=` — forward
 * to Integrations where the success/error banner lives.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await Promise.resolve(searchParams);
  if (params.connected != null && params.connected !== "") {
    const q = new URLSearchParams();
    q.set("connected", params.connected);
    if (params.error) q.set("error", params.error);
    redirect(`/dashboard/settings/integrations?${q.toString()}`);
  }

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
