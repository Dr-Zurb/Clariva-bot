"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_LEVEL_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  activityClinicalHints,
  activityHasContent,
  activityLevelTooltip,
  availableActivityAddChips,
  createActivityItem,
  defaultDaysPerWeekForLevel,
  JOB_ACTIVITY_OPTIONS,
  levelShowsExerciseDetails,
  MAX_ACTIVITY_ITEMS,
  normalizeActivitySection,
  type ActivityLevel,
  type ActivitySectionInput,
  type ActivityUseItem,
  type JobActivityLevel,
} from "@/lib/cockpit/social-history-activity";
import { setActivity, type SocialHistoryStructured } from "@/lib/cockpit/social-history";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";
const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";
const COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-8 max-w-[3.5rem] px-2 py-1 text-xs");

interface ActivitySectionProps {
  value: SocialHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  onChange: (next: SocialHistoryStructured) => void;
}

function patchActivity(
  structured: SocialHistoryStructured,
  patch: ActivitySectionInput | null,
): SocialHistoryStructured {
  return setActivity(structured, patch);
}

function ActivityItemRow({
  item,
  index,
  disabled,
  onPatch,
  onRemove,
}: {
  item: ActivityUseItem;
  index: number;
  disabled?: boolean;
  onPatch: (patch: Partial<ActivityUseItem>) => void;
  onRemove: () => void;
}) {
  const displayLabel =
    item.type === "other"
      ? item.typeOther?.trim() || ACTIVITY_TYPE_LABELS.other
      : (ACTIVITY_TYPE_LABELS[item.type] ?? item.type);

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-border/50 bg-background/60 px-2 py-1.5"
      data-testid={`social-activity-item-${index}`}
    >
      {item.type === "other" ? (
        <input
          type="text"
          value={item.typeOther ?? ""}
          disabled={disabled}
          placeholder="Other"
          aria-label="Other activity name"
          data-testid={`social-activity-item-${index}-other`}
          onChange={(e) => onPatch({ typeOther: e.target.value || undefined })}
          className={cn(
            RX_FIELD_INPUT_CLASS,
            "h-7 min-w-[5rem] max-w-[8rem] px-2 py-0.5 text-xs font-medium",
          )}
        />
      ) : (
        <span className="min-w-[3.5rem] text-xs font-medium text-foreground">{displayLabel}</span>
      )}
      <input
        type="number"
        min={0}
        max={7}
        value={item.daysPerWeek ?? ""}
        disabled={disabled}
        aria-label={`${displayLabel} days per week`}
        data-testid={`social-activity-item-${index}-days`}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onPatch({ daysPerWeek: undefined });
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onPatch({ daysPerWeek: Number.isFinite(parsed) ? parsed : undefined });
        }}
        className={COMPACT_INPUT_CLASS}
        placeholder="—"
      />
      <span className="text-[10px] text-muted-foreground">d/wk</span>
      <input
        type="number"
        min={0}
        max={300}
        value={item.minutesPerSession ?? ""}
        disabled={disabled}
        aria-label={`${displayLabel} minutes per session`}
        data-testid={`social-activity-item-${index}-minutes`}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onPatch({ minutesPerSession: undefined });
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onPatch({ minutesPerSession: Number.isFinite(parsed) ? parsed : undefined });
        }}
        className={COMPACT_INPUT_CLASS}
        placeholder="—"
      />
      <span className="text-[10px] text-muted-foreground">min</span>
      <RemoveIconButton
        label={`Remove ${displayLabel}`}
        disabled={disabled}
        testId={`social-activity-item-${index}-remove`}
        className="ml-auto"
        onClick={onRemove}
      />
    </div>
  );
}

export function ActivitySection({ value, disabled, inputIdPrefix, onChange }: ActivitySectionProps) {
  const activity = useMemo(() => normalizeActivitySection(value.activity), [value.activity]);
  const level = activity?.level;
  const items = activity?.items ?? [];
  const addOptions = useMemo(() => availableActivityAddChips(items), [items]);
  const showExerciseDetails = levelShowsExerciseDetails(level);
  const hints = activityClinicalHints({ activity: activity ?? undefined });
  const inBreakdownMode = items.length > 0;

  const baseSection = (): ActivitySectionInput => ({
    ...(activity ?? {}),
    items,
  });

  const updateSection = (patch: ActivitySectionInput | null) => {
    onChange(patchActivity(value, patch));
  };

  const handleJobActivity = (nextJob: JobActivityLevel | undefined) => {
    updateSection({
      ...baseSection(),
      jobActivity: nextJob,
    });
  };

  const handleLevel = (nextLevel: ActivityLevel | undefined) => {
    if (!nextLevel) {
      const preserved: ActivitySectionInput = { items: [] };
      if (activity?.jobActivity) preserved.jobActivity = activity.jobActivity;
      if (activity?.notes) preserved.notes = activity.notes;
      if (activity?.limitedByHealth != null) preserved.limitedByHealth = activity.limitedByHealth;
      if (activity?.barriers) preserved.barriers = activity.barriers;
      updateSection(activityHasContent(preserved) ? preserved : null);
      return;
    }

    const defaultDays = defaultDaysPerWeekForLevel(nextLevel);
    const leavingSedentary = level === "sedentary" || level == null;
    const becomingSedentary = nextLevel === "sedentary";

    updateSection({
      ...baseSection(),
      level: nextLevel,
      items: becomingSedentary ? [] : items,
      types: undefined,
      daysPerWeek: becomingSedentary
        ? undefined
        : leavingSedentary
          ? (activity?.daysPerWeek ?? defaultDays)
          : activity?.daysPerWeek,
      minutesPerSession: becomingSedentary ? undefined : activity?.minutesPerSession,
    });
  };

  const patchItem = (itemId: string, patch: Partial<ActivityUseItem>) => {
    updateSection({
      ...baseSection(),
      items: items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    });
  };

  const addActivityItem = (type: ActivityUseItem["type"]) => {
    const seed: Partial<Omit<ActivityUseItem, "id" | "type">> = {};
    if (items.length === 0) {
      if (activity?.daysPerWeek != null) seed.daysPerWeek = activity.daysPerWeek;
      if (activity?.minutesPerSession != null) seed.minutesPerSession = activity.minutesPerSession;
    }
    updateSection({
      ...baseSection(),
      items: [...items, createActivityItem(type, seed)],
      daysPerWeek: undefined,
      minutesPerSession: undefined,
      types: undefined,
    });
  };

  const removeActivityItem = (itemId: string) => {
    updateSection({
      ...baseSection(),
      items: items.filter((i) => i.id !== itemId),
    });
  };

  const noneSelected = activity?.limitedByHealth === false;
  const limitedSelected = activity?.limitedByHealth === true;

  const handleHealthLimitNone = () => {
    updateSection({
      ...baseSection(),
      limitedByHealth: noneSelected ? undefined : false,
      barriers: undefined,
    });
  };

  const handleHealthLimitLimited = () => {
    updateSection({
      ...baseSection(),
      limitedByHealth: limitedSelected ? undefined : true,
      barriers: limitedSelected ? undefined : activity?.barriers,
    });
  };

  return (
    <section className="space-y-2" aria-label="Physical activity">
      <p className="text-xs font-medium text-foreground/80">Physical activity</p>

      <div className="space-y-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-2.5">
      <div className="space-y-1" data-testid="social-activity-work">
        <p className="text-xs font-medium text-foreground/80">Job movement</p>
        <p className="text-[10px] text-muted-foreground">Movement at work or through the day</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Job movement level">
          {JOB_ACTIVITY_OPTIONS.map((option) => {
            const selected = activity?.jobActivity === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={option.label}
                data-testid={`social-activity-job-${option.value}`}
                onClick={() =>
                  handleJobActivity(selected ? undefined : option.value)
                }
                className={cn(
                  CHIP_CLASS,
                  selected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1" data-testid="social-activity-level">
        <p className="text-xs font-medium text-foreground/80">Planned exercise</p>
        <p className="text-[10px] text-muted-foreground">
          Sport, gym, walking for fitness
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Planned exercise level">
          {ACTIVITY_LEVEL_OPTIONS.map((option) => {
            const isSelected = level === option.value;
            return (
              <TooltipProvider key={option.value} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={option.label}
                      data-testid={`social-activity-level-${option.value}`}
                      onClick={() => handleLevel(isSelected ? undefined : option.value)}
                      className={cn(
                        CHIP_CLASS,
                        isSelected
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[14rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
                  >
                    {activityLevelTooltip(option.value)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>

      {showExerciseDetails && (
        <div
          className="space-y-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2"
          data-testid="social-activity-details"
        >
          {!inBreakdownMode && (
            <div className="space-y-1" data-testid="social-activity-summary">
              <p className="text-[11px] font-medium text-muted-foreground">Typical exercise</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <input
                  type="number"
                  min={0}
                  max={7}
                  disabled={disabled}
                  aria-label="Days per week"
                  data-testid="social-activity-days"
                  value={activity?.daysPerWeek ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updateSection({
                      ...baseSection(),
                      daysPerWeek: raw === "" ? undefined : Number.parseInt(raw, 10) || undefined,
                    });
                  }}
                  className={COMPACT_INPUT_CLASS}
                  placeholder="—"
                />
                <span className="text-[10px] text-muted-foreground">days/wk</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  disabled={disabled}
                  aria-label="Minutes per session"
                  data-testid="social-activity-minutes"
                  value={activity?.minutesPerSession ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updateSection({
                      ...baseSection(),
                      minutesPerSession:
                        raw === "" ? undefined : Number.parseInt(raw, 10) || undefined,
                    });
                  }}
                  className={COMPACT_INPUT_CLASS}
                  placeholder="—"
                />
                <span className="text-[10px] text-muted-foreground">min/session</span>
              </div>
            </div>
          )}

          {!disabled && addOptions.length > 0 && items.length < MAX_ACTIVITY_ITEMS && (
            <div className="space-y-1.5" data-testid="social-activity-add">
              <p className="text-xs font-medium text-foreground/80">
                {inBreakdownMode ? "Add activity" : "Or break down by type"}
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add activity">
                {addOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    aria-label={`Add ${option.label}`}
                    data-testid={`social-activity-add-${option.value}`}
                    onClick={() => addActivityItem(option.value)}
                    className={ADD_CHIP_CLASS}
                  >
                    + {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div
              className="space-y-1 border-l-2 border-primary/20 pl-2"
              data-testid="social-activity-items"
            >
              {items.map((item, index) => (
                <ActivityItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  disabled={disabled}
                  onPatch={(patch) => patchItem(item.id, patch)}
                  onRemove={() => removeActivityItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1" data-testid="social-activity-limits">
        <p className="text-xs font-medium text-foreground/80">Health limitations</p>
        <p className="text-[10px] text-muted-foreground">
          Illness, injury, or other barriers to activity
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Health limitations">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={noneSelected}
            aria-label="No health limitation"
            data-testid="social-activity-limited-none"
            onClick={handleHealthLimitNone}
            className={cn(
              CHIP_CLASS,
              noneSelected
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            None
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={limitedSelected}
            aria-label="Limited by health"
            data-testid="social-activity-limited"
            onClick={handleHealthLimitLimited}
            className={cn(
              CHIP_CLASS,
              limitedSelected
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            Limited by health
          </button>
        </div>
        {limitedSelected && (
          <input
            type="text"
            disabled={disabled}
            value={activity?.barriers ?? ""}
            maxLength={200}
            placeholder="Barriers (e.g. knee OA, post-op, heart failure)"
            aria-label="Activity barriers"
            data-testid="social-activity-barriers"
            onChange={(e) =>
              updateSection({
                ...baseSection(),
                barriers: e.target.value.trim() || undefined,
              })
            }
            className={cn(RX_FIELD_INPUT_CLASS, "h-8 text-xs")}
          />
        )}
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`${inputIdPrefix}-activity-notes`}
          className="text-xs font-medium text-foreground/80"
        >
          Notes (optional)
        </label>
        <input
          id={`${inputIdPrefix}-activity-notes`}
          type="text"
          disabled={disabled}
          value={activity?.notes ?? ""}
          maxLength={200}
          placeholder={
            level === "sedentary"
              ? "No planned exercise…"
              : "Goals, restrictions, context…"
          }
          data-testid="social-activity-notes"
          onChange={(e) =>
            updateSection({
              ...baseSection(),
              notes: e.target.value.trim() || undefined,
            })
          }
          className={cn(RX_FIELD_INPUT_CLASS, "h-8 text-xs")}
        />
      </div>

      </div>

      {hints.length > 0 && (
        <div className="space-y-1" data-testid="social-activity-hints" role="status">
          {hints.map((hint) => (
            <p key={hint} className="text-xs text-amber-800 dark:text-amber-200">
              {hint}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
