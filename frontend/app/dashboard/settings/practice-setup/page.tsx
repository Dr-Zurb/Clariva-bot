import {
  CalendarDays,
  Clock,
  Home,
  MessageSquare,
  Users,
  Workflow,
} from "lucide-react";
import { PracticeSetupCard } from "@/components/settings/PracticeSetupCard";
import { ServicesLandingCard } from "@/components/settings/ServicesLandingCard";

const practiceSetupBase = "/dashboard/settings/practice-setup";
const pricingHref = `${practiceSetupBase}/services-catalog`;

const cards = [
  {
    href: `${practiceSetupBase}/practice-info`,
    label: "Practice info",
    description: "Practice name, timezone, specialty, and address",
    icon: <Home className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/booking-rules`,
    label: "Booking rules",
    description:
      "Slot length, advance booking limits, cancellation policy, and buffers",
    icon: <Clock className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/opd-mode`,
    label: "OPD mode",
    description: "Fixed slots vs token queue — how patients join your session",
    icon: <Users className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/patient-flow`,
    label: "Patient flow",
    description:
      "What happens after you tap Done — countdown, instant, or manual; plus auto no-show",
    icon: <Workflow className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/bot-messages`,
    label: "Messaging",
    description: "Welcome message and default appointment notes",
    icon: <MessageSquare className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/availability`,
    label: "Availability",
    description: "Weekly schedule and blocked times when you're unavailable",
    icon: <CalendarDays className="h-6 w-6" aria-hidden />,
  },
] as const;

/**
 * Practice setup landing (settings-refresh · sr-06).
 */
export default function PracticeSetupLandingPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Practice setup</h1>
      <p className="mt-1 text-muted-foreground">
        Configure practice details, pricing, scheduling, and patient messaging.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        <PracticeSetupCard
          key={cards[0].href}
          href={cards[0].href}
          label={cards[0].label}
          description={cards[0].description}
          icon={cards[0].icon}
        />
        <ServicesLandingCard href={pricingHref} label="Pricing" />
        {cards.slice(1).map((card) => (
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
