"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  INBOX_FUNNEL_STAGES,
  emptyInteractionStageCounts,
  getInteraction,
  type InteractionDetail,
  type InteractionFusedStatus,
  type InteractionListItem,
  type InteractionStageCounts,
  type InteractionTimelineStep,
} from "@/lib/api";
import type { DoctorSettings } from "@/types/doctor-settings";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";
import { ReviewConversationThread } from "@/components/service-reviews/ReviewConversationThread";
import { ServiceReviewsInbox } from "@/components/service-reviews/ServiceReviewsInbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useInboxPolling } from "@/lib/inbox/useInboxPolling";
import { useReviewsPolling } from "@/lib/service-reviews/useReviewsPolling";
import {
  inboxDateBounds,
  resolveCustomInboxDates,
  type InboxDatePreset,
} from "@/lib/inbox/date-window";
import {
  formatInboxAbsoluteTime,
  formatInboxRelativeTime,
} from "@/lib/inbox/format-relative";
import {
  readInboxPathExpandedFromStorage,
  writeInboxPathExpandedToStorage,
} from "@/lib/inbox/path-expanded-preference";
import {
  buildInboxPathJourney,
  journeyStepLabel,
  summarizeInboxPathJourney,
} from "@/lib/inbox/path-journey";
import { resolveInteractionProfileLinks } from "@/lib/inbox/profile-links";
import {
  buildPublicSocialProfileUrl,
  formatPlatformUsername,
} from "@/lib/inbox/social-profile-url";

type ChannelFilter = "all" | "instagram" | "facebook";
type RailSelection = "needs_review" | "all" | InteractionFusedStatus;

const FOCUS_ON_LEADS_HINT =
  "Show people on a booking path — comments, chats with progress, reviews, or appointments. Turn off to see every chat, including idle ones.";

const RAIL_HINTS: Record<RailSelection, string> = {
  all: "Everyone in the current filters, except Needs review (see above).",
  new_lead: "Just started — commented or early chat, not deep into booking yet.",
  in_conversation: "Actively messaging, but not collecting booking details yet.",
  booking_pending: "Booking flow in progress — details, consent, or picking a slot.",
  booked: "Appointment is on your calendar; waiting for payment or confirm.",
  paid: "Appointment is confirmed (paid or locked in).",
  cancelled: "Appointment was cancelled.",
  needs_review: "Confirm or reassign the visit type the AI suggested.",
  no_show: "Marked as no-show after the visit time.",
};

function RailNavButton({
  active,
  label,
  count,
  hint,
  onClick,
  emphasize,
}: {
  active: boolean;
  label: string;
  count?: number;
  hint: string;
  onClick: () => void;
  /** Bold label — for Action items like Needs review. */
  emphasize?: boolean;
}) {
  const muted = count === 0 && !active;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            active
              ? "bg-primary text-primary-foreground shadow"
              : muted
                ? "border border-transparent text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground"
                : "border border-transparent text-foreground hover:bg-muted"
          )}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className={cn(emphasize && "font-semibold")}>{label}</span>
            {count != null && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  active ? "opacity-80" : muted ? "opacity-60" : "opacity-80"
                )}
              >
                {count}
              </span>
            )}
          </span>
          {active && (
            <span className="text-[11px] leading-snug text-primary-foreground/80">
              {hint}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

const INBOX_SHELL =
  "rounded-lg border border-border/50 bg-card shadow-sm";

function InboxSearchBox({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(
    (next: string) => {
      setDraft(next);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(next), 200);
    },
    [onChange]
  );

  return (
    <div className="relative w-full md:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(e) => flush(e.target.value)}
        placeholder="Search name or message…"
        aria-label="Search inbox"
        className="h-8 pl-8 pr-8 text-xs"
      />
      {draft !== "" && (
        <button
          type="button"
          onClick={() => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            setDraft("");
            onChange("");
          }}
          aria-label="Clear search"
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2",
            "text-muted-foreground hover:text-foreground",
            "rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function InboxEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 p-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function rowMatchesSearch(row: InteractionListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.patient_display_name,
    row.lead_label,
    row.medical_record_number,
    row.last_message_snippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function statusLabel(status: InteractionFusedStatus): string {
  switch (status) {
    case "needs_review":
      return "Needs review";
    case "no_show":
      return "No-show";
    default:
      return INBOX_FUNNEL_STAGES.find((o) => o.value === status)?.label ?? status;
  }
}

function channelAccentClass(channel: InteractionListItem["channel"]): string {
  switch (channel) {
    case "instagram":
      return "bg-pink-500";
    case "facebook":
      return "bg-blue-500";
    case "whatsapp":
      return "bg-emerald-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function channelAvatarClass(channel: InteractionListItem["channel"]): string {
  switch (channel) {
    case "instagram":
      return "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 text-white";
    case "facebook":
      return "bg-gradient-to-br from-blue-600 to-sky-400 text-white";
    case "whatsapp":
      return "bg-gradient-to-br from-emerald-600 to-lime-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function leadInitials(name: string): string {
  const cleaned = name.replace(/^@/, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function InboxAvatar({
  row,
  sizeClass,
  textClass,
  showChannelBadge = false,
}: {
  row: Pick<
    InteractionListItem,
    "channel" | "avatar_url" | "patient_display_name" | "lead_label" | "medical_record_number"
  >;
  sizeClass: string;
  textClass: string;
  showChannelBadge?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const title = displayName(row as InteractionListItem);
  const showImg = Boolean(row.avatar_url) && !imgFailed;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold shadow-sm",
        sizeClass,
        textClass,
        !showImg && channelAvatarClass(row.channel)
      )}
      aria-hidden
    >
      {showImg ? (
        // Meta CDN URLs expire; plain img + initials fallback (not next/image).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.avatar_url!}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        leadInitials(title)
      )}
      {showChannelBadge && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
            channelAccentClass(row.channel)
          )}
        />
      )}
    </span>
  );
}

/** Chat-app pattern: identity on top, latest text underneath. */
function rowTitle(row: InteractionListItem): string {
  return displayName(row);
}

function rowSubtitle(row: InteractionListItem): string {
  const snippet = row.last_message_snippet?.trim();
  if (row.kind === "comment_lead") {
    return snippet ? snippet : "Commented · Waiting for DM";
  }
  const parts: string[] = [];
  if (snippet) parts.push(snippet);
  else parts.push(statusLabel(row.status));
  if (row.has_comment_lead) parts.push("From comment");
  return parts.join(" · ");
}

function statusToneClass(status: InteractionFusedStatus): string {
  switch (status) {
    case "new_lead":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "in_conversation":
      return "bg-sky-500/10 text-sky-800 dark:text-sky-300";
    case "booking_pending":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "booked":
      return "bg-blue-500/10 text-blue-800 dark:text-blue-300";
    case "paid":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "cancelled":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "needs_review":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    case "no_show":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function displayName(row: InteractionListItem): string {
  if (row.patient_display_name?.trim()) return row.patient_display_name.trim();
  if (row.medical_record_number?.trim()) return row.medical_record_number.trim();
  return row.lead_label || "Lead";
}

function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      title={formatInboxAbsoluteTime(iso)}
    >
      {formatInboxRelativeTime(iso)}
    </span>
  );
}

/**
 * Pinned Path bar: compact chip by default; expands to full stepper.
 * Preference persisted in localStorage; action extras (review/reschedule) open expanded
 * for that interaction (user can still collapse).
 */
function InboxPathTimeline({
  interactionId,
  steps,
}: {
  interactionId: string;
  steps: InteractionTimelineStep[];
}) {
  const journey = buildInboxPathJourney(steps);
  const summary = summarizeInboxPathJourney(journey);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const j = buildInboxPathJourney(steps);
    const s = summarizeInboxPathJourney(j);
    setExpanded(s.hasActionExtras || readInboxPathExpandedFromStorage());
    // Reset only when the selected interaction changes — not on every poll of `steps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [interactionId]);

  if (!journey.nodes.length && !journey.extras.length) return null;

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      writeInboxPathExpandedToStorage(next);
      return next;
    });
  };

  const compactParts = [
    summary.current?.label ?? "Path",
    summary.total > 0 && summary.reachedIndex > 0
      ? `${summary.reachedIndex}/${summary.total}`
      : null,
    summary.current?.at ? formatInboxRelativeTime(summary.current.at) : null,
  ].filter(Boolean);

  return (
    <div
      className="shrink-0 border-b border-border/50 bg-muted/20 px-4 py-2"
      data-testid="inbox-path-bar"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-muted/60"
          aria-expanded={expanded}
          data-testid="inbox-path-toggle"
        >
          <span className="shrink-0 text-[11px] font-semibold tracking-wide text-muted-foreground">
            Path
          </span>
          {!expanded && (
            <span
              className="min-w-0 truncate text-[11px] font-medium text-foreground"
              data-testid="inbox-path-compact"
              title={
                summary.current?.at
                  ? formatInboxAbsoluteTime(summary.current.at)
                  : undefined
              }
            >
              {compactParts.join(" · ")}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground" aria-hidden>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      </div>

      {!expanded && journey.extras.length > 0 && (
        <ul
          className="mt-1.5 flex flex-wrap gap-1.5 pl-1"
          data-testid="interaction-path-extras"
        >
          {journey.extras.map((step, i) => (
            <li
              key={`${step.type}-${step.at}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:text-orange-200"
              title={formatInboxAbsoluteTime(step.at)}
            >
              {journeyStepLabel(step.type)} · {formatInboxRelativeTime(step.at)}
            </li>
          ))}
        </ul>
      )}

      {expanded && (
        <div className="mt-2">
          <ol
            className="flex w-full min-w-0 items-start"
            data-testid="interaction-timeline"
            aria-label="Patient path"
          >
            {journey.nodes.map((node, i) => {
              const tip = [
                node.label,
                node.at ? formatInboxRelativeTime(node.at) : null,
                node.at ? formatInboxAbsoluteTime(node.at) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={node.type}
                  className="flex min-w-0 flex-1 flex-col items-stretch"
                >
                  <div className="flex w-full items-center">
                    <span
                      className={cn(
                        "h-px min-w-[4px] flex-1",
                        i === 0
                          ? "bg-transparent"
                          : node.state === "upcoming"
                            ? "bg-border"
                            : "bg-primary/40"
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "flex h-2.5 w-2.5 shrink-0 rounded-full",
                        node.state === "current" &&
                          "bg-primary ring-2 ring-primary/25",
                        node.state === "done" && "bg-primary",
                        node.state === "upcoming" &&
                          "bg-muted-foreground/30 ring-1 ring-border"
                      )}
                      title={tip}
                      aria-label={tip}
                    />
                    <span
                      className={cn(
                        "h-px min-w-[4px] flex-1",
                        i === journey.nodes.length - 1
                          ? "bg-transparent"
                          : node.state === "upcoming" ||
                              journey.nodes[i + 1]?.state === "upcoming"
                            ? "bg-border"
                            : "bg-primary/40"
                      )}
                      aria-hidden
                    />
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 truncate px-0.5 text-center text-[10px] font-medium leading-tight",
                      node.state === "current" && "text-primary",
                      node.state === "done" && "text-foreground",
                      node.state === "upcoming" && "text-muted-foreground"
                    )}
                    title={tip}
                  >
                    {node.label}
                  </span>
                  {node.at && node.state !== "upcoming" ? (
                    <span
                      className={cn(
                        "truncate px-0.5 text-center text-[9px] leading-tight",
                        node.state === "current"
                          ? "text-primary/80"
                          : "text-muted-foreground"
                      )}
                      title={formatInboxAbsoluteTime(node.at)}
                    >
                      {formatInboxRelativeTime(node.at)}
                    </span>
                  ) : (
                    <span className="h-[12px]" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
          {journey.extras.length > 0 && (
            <ul
              className="mt-2 flex flex-wrap gap-1.5"
              data-testid="interaction-path-extras"
            >
              {journey.extras.map((step, i) => (
                <li
                  key={`${step.type}-${step.at}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:text-orange-200"
                  title={formatInboxAbsoluteTime(step.at)}
                >
                  {journeyStepLabel(step.type)} ·{" "}
                  {formatInboxRelativeTime(step.at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function countForStage(
  counts: InteractionStageCounts,
  stage: RailSelection
): number {
  if (stage === "all") return counts.all;
  if (stage === "needs_review") return counts.needs_review;
  if (stage === "no_show") return 0;
  return counts[stage] ?? 0;
}

export interface InboxClientProps {
  token: string;
  /** When true, select Needs review rail (from ?filter=needs_review). */
  initialNeedsReviewOpen?: boolean;
  initialInteractions: InteractionListItem[];
  initialCounts?: InteractionStageCounts;
  initialNextCursor?: string | null;
  initialReviews: ServiceStaffReviewListItem[];
  settings: DoctorSettings | null;
}

export function InboxClient({
  token,
  initialNeedsReviewOpen = false,
  initialInteractions,
  initialCounts,
  initialNextCursor = null,
  initialReviews,
  settings,
}: InboxClientProps) {
  const [rail, setRail] = useState<RailSelection>(
    initialNeedsReviewOpen ? "needs_review" : "all"
  );
  const [focusOnLeads, setFocusOnLeads] = useState(true);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [datePreset, setDatePreset] = useState<InboxDatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustomEnd, setShowCustomEnd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialInteractions[0]?.id ?? null
  );
  const [detail, setDetail] = useState<InteractionDetail | null>(
    initialInteractions[0]
      ? { ...initialInteractions[0], timeline: [] }
      : null
  );
  /** True while detail fetch is in flight and we have no timeline yet. */
  const [detailLoading, setDetailLoading] = useState(false);
  const detailCacheRef = useRef<Map<string, InteractionDetail>>(new Map());

  const customResolved = useMemo(() => {
    if (datePreset !== "custom") return null;
    if (!customFrom) return { error: "Pick a date." as const };
    return resolveCustomInboxDates(
      customFrom,
      showCustomEnd && customTo ? customTo : undefined
    );
  }, [datePreset, customFrom, customTo, showCustomEnd]);

  const dateBounds = useMemo(() => {
    if (datePreset === "custom") {
      if (customResolved && "dateFrom" in customResolved) {
        return {
          dateFrom: customResolved.dateFrom,
          dateTo: customResolved.dateTo,
        };
      }
      // Invalid custom — keep last good preset window until fixed.
      return inboxDateBounds("30d");
    }
    return inboxDateBounds(datePreset);
  }, [datePreset, customResolved]);

  const dateError =
    datePreset === "custom" && customResolved && "error" in customResolved
      ? customResolved.error
      : null;

  const statusFilter = useMemo((): InteractionFusedStatus[] | undefined => {
    if (rail === "all" || rail === "needs_review") return undefined;
    return [rail];
  }, [rail]);

  const listFilters = useMemo(
    () => ({
      scope: (focusOnLeads ? "signal" : "all") as "signal" | "all",
      channel: channel === "all" ? undefined : channel,
      statuses: statusFilter,
      dateFrom: dateBounds.dateFrom,
      dateTo: dateBounds.dateTo,
    }),
    [focusOnLeads, channel, statusFilter, dateBounds]
  );

  const polling = useInboxPolling({
    token,
    filters: listFilters,
    // Don't hit the API with an invalid custom window.
    paused: Boolean(dateError),
    initialRows: initialInteractions,
    initialCounts: initialCounts ?? emptyInteractionStageCounts(),
    initialNextCursor,
  });

  const rows = polling.rows ?? initialInteractions;
  const counts = polling.counts ?? initialCounts ?? emptyInteractionStageCounts();
  const visibleRows = useMemo(
    () => rows.filter((row) => rowMatchesSearch(row, searchQuery)),
    [rows, searchQuery]
  );

  const hasActiveListFilters =
    channel !== "all" ||
    datePreset !== "30d" ||
    !focusOnLeads ||
    searchQuery.trim() !== "" ||
    (rail !== "all" && rail !== "needs_review");

  const clearListFilters = useCallback(() => {
    setChannel("all");
    setDatePreset("30d");
    setCustomFrom("");
    setCustomTo("");
    setShowCustomEnd(false);
    setFocusOnLeads(true);
    setSearchQuery("");
    if (rail !== "needs_review") setRail("all");
  }, [rail]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const shellFromRow = useCallback((row: InteractionListItem): InteractionDetail => {
    const cached = detailCacheRef.current.get(row.id);
    if (cached) {
      return {
        ...cached,
        ...row,
        timeline: cached.timeline,
        comment_text: cached.comment_text,
      };
    }
    return { ...row, timeline: [] };
  }, []);

  const selectInteraction = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) {
        setDetail(null);
        setDetailLoading(false);
        return;
      }
      const cached = detailCacheRef.current.get(id);
      if (cached) {
        const row = rows.find((r) => r.id === id);
        setDetail(row ? { ...cached, ...row, timeline: cached.timeline, comment_text: cached.comment_text } : cached);
        setDetailLoading(false);
        return;
      }
      const row = rows.find((r) => r.id === id);
      if (row) {
        setDetail(shellFromRow(row));
        setDetailLoading(true);
      }
    },
    [rows, shellFromRow]
  );

  // Live pending-review count for the Action badge (not date-window fused status).
  const {
    rows: pendingReviewRows,
    refetch: refetchPendingReviews,
  } = useReviewsPolling({ token, tab: "pending" });
  useEffect(() => {
    void refetchPendingReviews();
  }, [token, refetchPendingReviews]);
  useEffect(() => {
    // Refresh badge after leaving the review pane (actions may have cleared items).
    if (rail !== "needs_review") void refetchPendingReviews();
  }, [rail, refetchPendingReviews]);
  const pendingReviewCount =
    pendingReviewRows?.length ?? initialReviews.length;

  // Keep selection valid when the list refreshes; paint shell immediately.
  useEffect(() => {
    const stillThere = selectedId != null && rows.some((r) => r.id === selectedId);
    const nextId = stillThere ? selectedId : rows[0]?.id ?? null;
    if (nextId !== selectedId) {
      selectInteraction(nextId);
      return;
    }
    if (!nextId || rail === "needs_review") return;
    const row = rows.find((r) => r.id === nextId);
    if (!row) return;
    setDetail((prev) => {
      if (prev?.id !== nextId) return shellFromRow(row);
      if (
        prev.status === row.status &&
        prev.updated_at === row.updated_at &&
        prev.last_message_snippet === row.last_message_snippet &&
        prev.lead_label === row.lead_label &&
        prev.needs_review === row.needs_review
      ) {
        return prev;
      }
      return {
        ...prev,
        ...row,
        timeline: prev.timeline,
        comment_text: prev.comment_text,
      };
    });
  }, [rows, selectedId, selectInteraction, shellFromRow, rail]);

  useEffect(() => {
    if (rail === "needs_review" || !selectedId) {
      if (rail === "needs_review") return;
      if (!selectedId) {
        setDetail(null);
        setDetailLoading(false);
      }
      return;
    }
    let cancelled = false;
    const cached = detailCacheRef.current.get(selectedId);
    if (!cached?.timeline?.length) {
      setDetailLoading(true);
    }
    void getInteraction(token, selectedId)
      .then((res) => {
        if (cancelled) return;
        const next = res.data.interaction;
        detailCacheRef.current.set(selectedId, next);
        setDetail(next);
        setDetailLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, token, rail]);

  const dateSummary =
    datePreset === "custom"
      ? customFrom
        ? showCustomEnd && customTo
          ? `${customFrom} → ${customTo}`
          : customFrom
        : "Custom date"
      : datePreset === "7d"
        ? "Last 7 days"
        : datePreset === "90d"
          ? "Last 90 days"
          : "Last 30 days";

  return (
    <TooltipProvider delayDuration={300}>
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
      {/* Left rail: action queue + status filters */}
      <nav
        className="h-full overflow-y-auto rounded-md border border-border bg-muted/20 p-2 lg:sticky lg:top-0"
        aria-label="Inbox filters"
      >
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Action
        </p>
        <div className="mb-3">
          <RailNavButton
            active={rail === "needs_review"}
            label="Needs review"
            count={pendingReviewCount}
            hint={RAIL_HINTS.needs_review}
            onClick={() => setRail("needs_review")}
            emphasize
          />
        </div>

        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <ul className="space-y-0.5">
          <li>
            <RailNavButton
              active={rail === "all"}
              label="All"
              count={countForStage(counts, "all")}
              hint={RAIL_HINTS.all}
              onClick={() => setRail("all")}
            />
          </li>
          {INBOX_FUNNEL_STAGES.map((stage) => {
            const active = rail === stage.value;
            const n = countForStage(counts, stage.value);
            return (
              <li key={stage.value}>
                <RailNavButton
                  active={active}
                  label={stage.label}
                  count={n}
                  hint={RAIL_HINTS[stage.value]}
                  onClick={() => setRail(stage.value)}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <div className="sticky top-14 z-20 -mx-1 shrink-0 bg-background/80 px-1 pb-1 pt-0.5 backdrop-blur">
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-1.5"
            aria-label="Inbox filters"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Channel</span>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as ChannelFilter)}
              >
                <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="Channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-normal"
                >
                  {dateSummary}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["7d", "7 days"],
                      ["30d", "30 days"],
                      ["90d", "90 days"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={datePreset === id ? "default" : "secondary"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setDatePreset(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium text-foreground">Custom</p>
                  <p className="text-[11px] text-muted-foreground">
                    One day, or add an end date (max 1 year).
                  </p>
                  <label className="block space-y-1 text-[11px] text-muted-foreground">
                    Date
                    <Input
                      type="date"
                      value={customFrom}
                      onChange={(e) => {
                        setCustomFrom(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="h-8 text-xs"
                    />
                  </label>
                  {!showCustomEnd ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={() => setShowCustomEnd(true)}
                    >
                      Add end date
                    </Button>
                  ) : (
                    <label className="block space-y-1 text-[11px] text-muted-foreground">
                      End date
                      <Input
                        type="date"
                        value={customTo}
                        onChange={(e) => {
                          setCustomTo(e.target.value);
                          setDatePreset("custom");
                        }}
                        className="h-8 text-xs"
                      />
                    </label>
                  )}
                  {dateError && (
                    <p className="text-xs text-destructive" role="alert">
                      {dateError}
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {rail !== "needs_review" ? (
              <InboxSearchBox
                value={searchQuery}
                onChange={setSearchQuery}
                inputRef={searchInputRef}
              />
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-xs text-foreground",
                    rail === "needs_review" ? "ml-auto" : "sm:ml-auto"
                  )}
                >
                  <Checkbox
                    checked={focusOnLeads}
                    onCheckedChange={(checked) =>
                      setFocusOnLeads(checked === true)
                    }
                    aria-label="Focus on leads"
                    disabled={rail === "needs_review"}
                  />
                  Focus on leads
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px]">
                {FOCUS_ON_LEADS_HINT}
              </TooltipContent>
            </Tooltip>

            {polling.isFetching && (
              <span className="text-xs text-muted-foreground">Refreshing…</span>
            )}
          </div>
        </div>

        {rail === "needs_review" ? (
          <section
            className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", INBOX_SHELL)}
            aria-label="Needs review"
          >
            <ServiceReviewsInbox
              initialReviews={initialReviews}
              settings={settings}
              token={token}
              embedded
            />
          </section>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)]">
            <section
              className={cn("flex min-h-0 flex-col overflow-hidden", INBOX_SHELL)}
              aria-label="Interactions"
            >
              {visibleRows.length === 0 ? (
                <InboxEmptyState
                  title={
                    searchQuery.trim()
                      ? "No conversations match this search"
                      : "No interactions match these filters"
                  }
                  description={
                    hasActiveListFilters
                      ? "Try clearing filters or widening the date range."
                      : "New comments and chats will show up here."
                  }
                  action={
                    hasActiveListFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearListFilters}
                      >
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                  {visibleRows.map((row) => {
                    const active = row.id === selectedId;
                    return (
                      <li key={`${row.kind}-${row.id}`}>
                        <button
                          type="button"
                          onClick={() => selectInteraction(row.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-all",
                            active
                              ? "bg-primary/10 shadow-sm ring-1 ring-primary/15"
                              : "hover:bg-muted/70"
                          )}
                        >
                          <InboxAvatar
                            key={`${row.id}-${row.avatar_url ?? "none"}`}
                            row={row}
                            sizeClass="h-9 w-9"
                            textClass="text-[11px] tracking-wide"
                            showChannelBadge
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold leading-tight text-foreground">
                                {rowTitle(row)}
                              </span>
                              <RelativeTime
                                iso={row.updated_at}
                                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                              />
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-muted-foreground">
                                {rowSubtitle(row)}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  statusToneClass(row.status)
                                )}
                              >
                                {statusLabel(row.status)}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {polling.nextCursor && !searchQuery.trim() && (
                    <li className="p-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => void polling.loadMore()}
                        disabled={polling.isLoadingMore}
                      >
                        {polling.isLoadingMore ? "Loading…" : "Load more"}
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </section>

            <section
              className={cn("flex min-h-0 flex-col overflow-hidden", INBOX_SHELL)}
              aria-label="Interaction detail"
            >
              {!detail ? (
                <InboxEmptyState
                  title="Select a conversation"
                  description="Pick a lead from the list to see path, comments, and chat."
                />
              ) : (
                <InboxDetailPane
                  detail={detail}
                  detailLoading={detailLoading}
                  selectedId={selectedId}
                  token={token}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}

function InboxDetailPane({
  detail,
  detailLoading,
  selectedId,
  token,
}: {
  detail: InteractionDetail;
  detailLoading: boolean;
  selectedId: string | null;
  token: string;
}) {
  const profileLinks = resolveInteractionProfileLinks(detail);
  const socialProfileUrl = buildPublicSocialProfileUrl(
    detail.channel,
    detail.platform_username
  );
  const socialHandle = formatPlatformUsername(detail.platform_username);
  const socialLabel =
    detail.channel === "instagram"
      ? "Open on Instagram"
      : detail.channel === "facebook"
        ? "Open on Facebook"
        : null;

  return (
                <div className="flex min-h-0 flex-1 flex-col">
                  <header className="shrink-0 border-b border-border/50 bg-gradient-to-b from-muted/40 to-transparent px-4 py-3">
                    <div className="flex items-start gap-3">
                      <InboxAvatar
                        key={`${detail.id}-${detail.avatar_url ?? "none"}`}
                        row={detail}
                        sizeClass="mt-0.5 h-10 w-10"
                        textClass="text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                            {displayName(detail)}
                          </h2>
                          <RelativeTime
                            iso={detail.updated_at}
                            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              statusToneClass(detail.status)
                            )}
                          >
                            {statusLabel(detail.status)}
                          </span>
                          <span
                            className="text-[11px] text-muted-foreground"
                            title={formatInboxAbsoluteTime(detail.created_at)}
                          >
                            Lead since {formatInboxRelativeTime(detail.created_at)}
                          </span>
                          {socialProfileUrl && socialLabel && (
                            <a
                              href={socialProfileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-primary hover:underline"
                              data-testid="inbox-social-profile-link"
                            >
                              {/* Avoid repeating @handle when it's already the title */}
                              {displayName(detail) === socialHandle
                                ? socialLabel
                                : (socialHandle ?? socialLabel)}
                            </a>
                          )}
                          {profileLinks.chatterProfilePatientId && (
                            <Link
                              href={`/dashboard/patients-v2/${profileLinks.chatterProfilePatientId}`}
                              className="text-[11px] font-medium text-primary hover:underline"
                              data-testid="inbox-chatter-profile-link"
                            >
                              Patient profile
                            </Link>
                          )}
                          {profileLinks.bookedForPatientId && (
                            <Link
                              href={`/dashboard/patients-v2/${profileLinks.bookedForPatientId}`}
                              className="text-[11px] font-medium text-primary hover:underline"
                              data-testid="inbox-booked-for-link"
                            >
                              Booked for {profileLinks.bookedForLabel}
                            </Link>
                          )}
                          {detail.appointment_id && (
                            <Link
                              href={`/dashboard/appointments/${detail.appointment_id}`}
                              className="text-[11px] font-medium text-primary hover:underline"
                            >
                              Appointment
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </header>

                  {detail.timeline?.length ? (
                    <InboxPathTimeline
                      interactionId={detail.id}
                      steps={detail.timeline}
                    />
                  ) : detailLoading ? (
                    <div
                      className="shrink-0 space-y-2 border-b border-border/50 px-4 py-3"
                      data-testid="interaction-path-loading"
                      aria-busy="true"
                      aria-label="Loading path"
                    >
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64 max-w-full" />
                    </div>
                  ) : detail.kind === "conversation" ? (
                    <p className="shrink-0 border-b border-border/50 px-4 py-2 text-sm text-muted-foreground">
                      No path events yet.
                    </p>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {detail.kind === "comment_lead" ? (
                      <div data-testid="comment-lead-detail" className="space-y-3">
                        <div>
                          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                            Their comment
                          </h3>
                          <blockquote className="mt-2 rounded-2xl bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                            {detail.comment_text?.trim() ||
                              detail.last_message_snippet ||
                              "Comment unavailable"}
                          </blockquote>
                        </div>
                        <p
                          className="text-sm text-muted-foreground"
                          data-testid="comment-lead-no-thread"
                        >
                          Waiting for DM — when they reply, the thread and booking path
                          will show here.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-muted/25 px-3 py-3 ring-1 ring-border/40">
                        <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
                          Conversation
                        </h3>
                        <ReviewConversationThread
                          key={selectedId ?? detail.id}
                          token={token}
                          conversationId={selectedId ?? detail.id}
                        />
                      </div>
                    )}
                  </div>
                </div>
  );
}
