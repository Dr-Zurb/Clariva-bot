"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SplitStartOption<TOption extends string> {
  value: TOption;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  booked?: boolean;
}

export interface SplitStartButtonProps<TOption extends string> {
  primary: TOption;
  options: ReadonlyArray<SplitStartOption<TOption>>;
  onAction: (option: TOption) => void;
  label?: string;
  disabled?: boolean;
  primaryIcon?: ReactNode;
}

export function SplitStartButton<TOption extends string>({
  primary,
  options,
  onAction,
  label = "Start consult",
  disabled = false,
  primaryIcon,
}: SplitStartButtonProps<TOption>) {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => onAction(primary)}
        className="rounded-r-none gap-1.5"
      >
        {primaryIcon}
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
            aria-label="Choose option"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {options.map(
            ({ value, label: optLabel, icon, disabled: optDisabled, disabledReason, booked }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => !optDisabled && onAction(value)}
                disabled={optDisabled}
                title={optDisabled ? disabledReason : undefined}
                className="gap-2"
              >
                {icon}
                {optLabel}
                {booked ? (
                  <span className="ml-auto text-xs text-muted-foreground">booked</span>
                ) : null}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
