"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChecklistStepView } from "./onboarding-steps";

interface OnboardingStepsProps {
  steps: ChecklistStepView[];
}

/**
 * Ordered go-live checklist with live done/todo state + deep links.
 */
export function OnboardingSteps({ steps }: OnboardingStepsProps) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                step.done
                  ? "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  : "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
              }
            >
              {step.done ? (
                <Check className="h-4 w-4" />
              ) : (
                <span className="text-xs font-semibold">{index + 1}</span>
              )}
            </span>
            <div>
              <p className="font-medium text-foreground">
                {step.title}
                {step.done ? (
                  <span className="sr-only"> (complete)</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          </div>
          {step.done ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary sm:shrink-0">
              <Circle className="h-2 w-2 fill-current" aria-hidden />
              Done
            </span>
          ) : step.statusLabel ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 sm:shrink-0 dark:text-amber-400">
              <Circle className="h-2 w-2 fill-current" aria-hidden />
              {step.statusLabel}
            </span>
          ) : (
            <Button asChild size="sm" className="sm:shrink-0">
              <Link href={step.href}>{step.cta}</Link>
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}
