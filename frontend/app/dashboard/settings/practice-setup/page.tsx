import { CalendarDays, Clock, Home, MessageSquare, Users, Workflow } from "lucide-react";
import { PracticeSetupCard } from "@/components/settings/PracticeSetupCard";
import { ServicesLandingCard } from "@/components/settings/ServicesLandingCard";

const practiceSetupBase = "/dashboard/settings/practice-setup";

/**
 * Services-catalog card is rendered separately (dynamic, mode-aware) and
 * intentionally omitted from this list. See Plan 03 · Task 13.
 */
const servicesCatalogHref = `${practiceSetupBase}/services-catalog`;

const cards = [
  {
    href: `${practiceSetupBase}/practice-info`,
    label: "Practice Info",
    description: "Practice name, timezone, specialty, address, and practice currency",
    icon: <Home className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/booking-rules`,
    label: "Booking Rules",
    description: "Slot length, advance booking limits, cancellation policy, and booking buffers",
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
    description: "What happens after you tap Done — countdown, instant, or manual; plus auto no-show",
    icon: <Workflow className="h-6 w-6" aria-hidden />,
  },
  {
    href: `${practiceSetupBase}/bot-messages`,
    label: "Bot Messages",
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
 * Practice Setup landing: icon+label cards with short descriptions.
 */
export default function PracticeSetupLandingPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Practice Setup</h1>
      <p className="mt-1 text-gray-600">
        Configure how your receptionist bot communicates with patients. Choose a section to get started.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        {/* Practice Info */}
        <PracticeSetupCard
          key={cards[0].href}
          href={cards[0].href}
          label={cards[0].label}
          description={cards[0].description}
          icon={cards[0].icon}
        />
        {/* Plan 03 · Task 13: services catalog is mode-aware. */}
        <ServicesLandingCard href={servicesCatalogHref} label="Services catalog" />
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
