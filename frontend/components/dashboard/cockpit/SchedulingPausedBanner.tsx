"use client";

import Link from "next/link";
import { ArrowRight, Pause } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDoctorSettingsQuery } from "@/hooks/queries/useDoctorSettingsQuery";

interface SchedulingPausedBannerProps {
  token: string;
}

/**
 * Today-home reminder while the doctor has paused automated Instagram
 * scheduling. Hidden while settings load, on error, and when scheduling is on.
 */
export function SchedulingPausedBanner({ token }: SchedulingPausedBannerProps) {
  const { data, isLoading, isError } = useDoctorSettingsQuery(token);
  const paused = data?.data.settings.instagram_receptionist_paused === true;

  if (isLoading || isError || !paused) {
    return null;
  }

  return (
    <section
      aria-labelledby="scheduling-paused-heading"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
      >
        <Pause className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2
          id="scheduling-paused-heading"
          className="text-sm font-semibold text-foreground"
        >
          Automated scheduling is paused
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Instagram isn’t booking new appointments. Turn it back on when you’re
          ready so requests don’t sit unanswered.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/dashboard/settings/integrations#receptionist-pause">
            Turn scheduling back on
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
