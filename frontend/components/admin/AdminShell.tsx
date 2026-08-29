"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Menu,
  Headset,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/doctors", label: "Doctors", icon: Users },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/clinic-staff", label: "Front desk", icon: Headset },
] as const;

/**
 * Admin console shell — mirrors DashboardShell visual language (sticky
 * branded header + icon sidebar + fluid main) without mixing into the
 * doctor dashboard nav.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header
        className={cn(
          "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4",
          "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Link
          href="/admin/verifications"
          className="flex select-none items-center gap-2"
          aria-label="Halo Aid Admin home"
        >
          <Image
            src="/brand/halo-logomark.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
            priority
            aria-hidden
          />
          <span className="text-base font-semibold text-foreground">
            Halo Aid
          </span>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            Admin
          </span>
        </Link>

        <div className="flex-1" />

        <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to app
          </Link>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "z-50 flex w-56 flex-col border-r border-border bg-background",
            "fixed bottom-0 left-0 top-14 transition-transform duration-200 ease-in-out",
            "md:relative md:top-0 md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <nav
            className="flex flex-1 flex-col gap-0.5 p-3 pt-3 md:pt-3"
            aria-label="Admin navigation"
          >
            {NAV.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main
          id="admin-main"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-auto p-4 md:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
