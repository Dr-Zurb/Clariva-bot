"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Inbox,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DashboardCounts } from "@/hooks/useDashboardCounts";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<LucideProps>;
  exact?: boolean;
  /** When set, renders a numeric badge using this key from DashboardCounts. */
  badgeKey?: keyof DashboardCounts;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard, exact: true },
  {
    href: "/dashboard/opd-today",
    label: "OPD",
    icon: Users,
    badgeKey: "opdLive",
  },
  { href: "/dashboard/patients-v2", label: "Patients", icon: User },
  {
    href: "/dashboard/insights",
    label: "Insights",
    icon: BarChart3,
  },
  {
    href: "/dashboard/booking-review",
    label: "Booking review",
    icon: Inbox,
    badgeKey: "bookingReviewsUnconfirmed",
  },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
  /** Live badge counts from useDashboardCounts. Hidden when null or 0. */
  counts?: DashboardCounts | null;
  /** Desktop collapse-to-icons state. Ignored on mobile. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Dashboard sidebar — flat nav (6 items), lucide icons.
 *
 * Settings + Integrations live in the profile dropdown (not in the sidebar) per DL-7.
 * The legacy appointments list was removed; OPD today is the operational hub.
 *
 * Desktop expanded: collapse control floats top-right (clears nav labels).
 * Desktop collapsed: expand control is the first nav row — same py-2 / h-4 icon
 * rhythm as real links (no tiny orphan chip + dead space).
 * Mobile: full-width drawer; no collapse toggle.
 */
export function Sidebar({
  isMobileOpen = false,
  onClose,
  counts,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();

  const navLinkChrome = cn(
    "relative flex items-center rounded-md py-2 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  );

  return (
    <TooltipProvider delayDuration={300}>
      <>
        {isMobileOpen && (
          <button
            type="button"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Close menu"
          />
        )}
        <aside
          className={cn(
            "relative z-50 flex flex-col border-r border-border bg-background",
            "md:relative md:flex-shrink-0 md:transition-[width] md:duration-200 md:ease-in-out",
            collapsed ? "md:w-14" : "md:w-56",
            "fixed inset-y-0 left-0 w-56 transition-transform duration-200 ease-in-out md:translate-x-0",
            isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Expanded desktop only — float collapse top-right */}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Collapse sidebar"
                  className={cn(
                    "absolute top-2 right-2 z-10 hidden items-center justify-center rounded-md p-2 text-muted-foreground transition-colors md:flex",
                    "hover:bg-muted/50 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse sidebar</TooltipContent>
            </Tooltip>
          )}

          <nav
            className={cn(
              "flex flex-1 flex-col gap-0.5 p-3",
              collapsed ? "pt-3 md:pt-3" : "pt-3 md:pt-10"
            )}
            aria-label="Main navigation"
          >
            {/* Collapsed desktop — expand sits in the nav stack like a sibling icon row */}
            {collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label="Expand sidebar"
                    className={cn(
                      navLinkChrome,
                      "hidden w-full justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground md:flex"
                    )}
                  >
                    <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            )}

            {navItems.map(({ href, label, icon: Icon, exact, badgeKey }) => {
              const basePath = href.split("#")[0];
              const isActive = exact
                ? pathname === href || pathname === basePath
                : pathname.startsWith(basePath);

              const count =
                badgeKey != null && counts != null ? counts[badgeKey] : 0;

              const linkEl = (
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    navLinkChrome,
                    collapsed ? "justify-center px-2" : "px-3",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  <span className={cn("relative shrink-0", !collapsed && "mr-2")}>
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    {collapsed && count > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>

                  {!collapsed && label}

                  {!collapsed && count > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );

              if (collapsed) {
                const tooltipLabel =
                  count > 0
                    ? `${label} (${count > 99 ? "99+" : count})`
                    : label;
                return (
                  <Tooltip key={href}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right">{tooltipLabel}</TooltipContent>
                  </Tooltip>
                );
              }

              return <span key={href}>{linkEl}</span>;
            })}
          </nav>
        </aside>
      </>
    </TooltipProvider>
  );
}
