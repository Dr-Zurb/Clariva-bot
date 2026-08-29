"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ListFilter, Search, X } from "lucide-react";

import { VerificationRow } from "@/components/admin/verifications/VerificationRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminVerificationsQuery } from "@/hooks/queries/useAdminVerificationsQuery";
import type {
  AdminVerificationListItem,
  AdminVerificationListStatus,
} from "@/lib/api";

const STATUS_FILTERS: {
  value: AdminVerificationListStatus;
  label: string;
}[] = [
  { value: "pending_review", label: "Pending" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

/** Preset windows; `custom` uses from/to date strings (YYYY-MM-DD). */
type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function matchesQuery(row: AdminVerificationListItem, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.fullName,
    row.registrationNumber,
    row.councilState,
    row.specialty,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function matchesDate(
  row: AdminVerificationListItem,
  preset: DatePreset,
  fromYmd: string,
  toYmd: string,
): boolean {
  if (preset === "all") return true;
  if (!row.submittedAt) return false;
  const t = new Date(row.submittedAt).getTime();
  if (Number.isNaN(t)) return false;

  const now = new Date();
  if (preset === "today") {
    return t >= startOfLocalDay(now).getTime();
  }
  if (preset === "7d") {
    return t >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
  }
  if (preset === "30d") {
    return t >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }

  // custom
  const from = fromYmd ? parseYmd(fromYmd) : null;
  const to = toYmd ? parseYmd(toYmd) : null;
  if (!from && !to) return true;
  if (from && t < startOfLocalDay(from).getTime()) return false;
  if (to && t > endOfLocalDay(to).getTime()) return false;
  return true;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = v?.trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function parseDatePreset(raw: string | null): DatePreset {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "custom") {
    return raw;
  }
  return "all";
}

function dateChipLabel(
  preset: DatePreset,
  fromYmd: string,
  toYmd: string,
): string {
  if (preset === "today") return "today";
  if (preset === "7d") return "last 7 days";
  if (preset === "30d") return "last 30 days";
  if (preset === "custom") {
    if (fromYmd && toYmd) return `${fromYmd} → ${toYmd}`;
    if (fromYmd) return `from ${fromYmd}`;
    if (toYmd) return `until ${toYmd}`;
    return "custom range";
  }
  return "";
}

interface VerificationsListClientProps {
  token: string;
  status: AdminVerificationListStatus;
}

/**
 * admin-console · Notion-style verification database: search, date + property
 * filters, status chips; name opens the profile; doc icons + row actions.
 */
export function VerificationsListClient({
  token,
  status,
}: VerificationsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, refetch } = useAdminVerificationsQuery(
    token,
    status,
  );

  const qFromUrl = searchParams.get("q") ?? "";
  const datePresetFromUrl = parseDatePreset(searchParams.get("submitted"));
  const fromFromUrl = searchParams.get("from") ?? "";
  const toFromUrl = searchParams.get("to") ?? "";

  const [qDraft, setQDraft] = useState(qFromUrl);
  const [council, setCouncil] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>(
    // If from/to present without preset, treat as custom.
    fromFromUrl || toFromUrl ? "custom" : datePresetFromUrl,
  );
  const [fromYmd, setFromYmd] = useState(fromFromUrl);
  const [toYmd, setToYmd] = useState(toFromUrl);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    if (fromFromUrl || toFromUrl) {
      setDatePreset("custom");
      setFromYmd(fromFromUrl);
      setToYmd(toFromUrl);
    } else {
      setDatePreset(datePresetFromUrl);
      if (datePresetFromUrl !== "custom") {
        setFromYmd("");
        setToYmd("");
      }
    }
  }, [datePresetFromUrl, fromFromUrl, toFromUrl]);

  // Debounce URL sync for search.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (qDraft.trim() === current.trim()) return;
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = qDraft.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `/admin/verifications?${qs}` : "/admin/verifications");
    }, 200);
    return () => window.clearTimeout(handle);
  }, [qDraft, router, searchParams]);

  function replaceParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `/admin/verifications?${qs}` : "/admin/verifications");
  }

  function writeDateToUrl(
    nextPreset: DatePreset,
    nextFrom: string,
    nextTo: string,
  ) {
    replaceParams((params) => {
      params.delete("submitted");
      params.delete("from");
      params.delete("to");
      if (nextPreset === "all") return;
      if (nextPreset === "custom") {
        params.set("submitted", "custom");
        if (nextFrom) params.set("from", nextFrom);
        if (nextTo) params.set("to", nextTo);
        return;
      }
      params.set("submitted", nextPreset);
    });
  }

  function applyDatePreset(next: DatePreset) {
    setDatePreset(next);
    if (next !== "custom") {
      setFromYmd("");
      setToYmd("");
      writeDateToUrl(next, "", "");
    } else {
      writeDateToUrl("custom", fromYmd, toYmd);
    }
  }

  function applyCustomRange(nextFrom: string, nextTo: string) {
    setDatePreset("custom");
    setFromYmd(nextFrom);
    setToYmd(nextTo);
    writeDateToUrl("custom", nextFrom, nextTo);
  }

  function clearDateFilter() {
    setDatePreset("all");
    setFromYmd("");
    setToYmd("");
    writeDateToUrl("all", "", "");
  }

  function setStatus(next: AdminVerificationListStatus) {
    replaceParams((params) => {
      params.set("status", next);
    });
  }

  function clearSearch() {
    setQDraft("");
    replaceParams((params) => {
      params.delete("q");
    });
  }

  const q = qDraft.trim().toLowerCase();

  const councils = useMemo(
    () => uniqueSorted((data ?? []).map((r) => r.councilState)),
    [data],
  );
  const specialties = useMemo(
    () => uniqueSorted((data ?? []).map((r) => r.specialty)),
    [data],
  );

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter(
      (row) =>
        matchesQuery(row, q) &&
        matchesDate(row, datePreset, fromYmd, toYmd) &&
        (!council || (row.councilState ?? "") === council) &&
        (!specialty || (row.specialty ?? "") === specialty),
    );
  }, [data, q, datePreset, fromYmd, toYmd, council, specialty]);

  const dateActive =
    datePreset !== "all" &&
    (datePreset !== "custom" || Boolean(fromYmd || toYmd));
  const activePropFilters = (council ? 1 : 0) + (specialty ? 1 : 0);

  function clearPropFilters() {
    setCouncil("");
    setSpecialty("");
  }

  const statusLabel =
    STATUS_FILTERS.find((f) => f.value === status)?.label.toLowerCase() ?? "";

  const dateButtonLabel = dateActive
    ? dateChipLabel(datePreset, fromYmd, toYmd)
    : "Date";

  return (
    <div className="space-y-3">
      {/* Notion-style toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                clearSearch();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Search name, registration, council…"
            className="h-9 pl-8 pr-8 text-sm"
            aria-label="Search verifications"
          />
          {qDraft ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date filter */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={dateActive ? "default" : "outline"}
                className="h-9 max-w-[14rem] gap-1.5"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{dateButtonLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Submitted date</p>
                {dateActive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearDateFilter}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                {DATE_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    size="sm"
                    variant={datePreset === p.value ? "secondary" : "ghost"}
                    className="h-8 justify-start px-2 text-sm"
                    onClick={() => applyDatePreset(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {datePreset === "custom" ? (
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="date-from" className="text-xs">
                      From
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={fromYmd}
                      className="h-9"
                      onChange={(e) =>
                        applyCustomRange(e.target.value, toYmd)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date-to" className="text-xs">
                      To
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={toYmd}
                      className="h-9"
                      min={fromYmd || undefined}
                      onChange={(e) =>
                        applyCustomRange(fromYmd, e.target.value)
                      }
                    />
                  </div>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>

          {/* Property filters */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
              >
                <ListFilter className="h-3.5 w-3.5" aria-hidden />
                Filter
                {activePropFilters > 0 ? (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary">
                    {activePropFilters}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Filters</p>
                {activePropFilters > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearPropFilters}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-council" className="text-xs">
                  Council
                </Label>
                <select
                  id="filter-council"
                  value={council}
                  onChange={(e) => setCouncil(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Any</option>
                  {councils.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-specialty" className="text-xs">
                  Specialty
                </Label>
                <select
                  id="filter-specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Any</option>
                  {specialties.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs"
                variant={status === f.value ? "default" : "ghost"}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {activePropFilters > 0 || q || dateActive ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            Showing {filtered.length}
            {data ? ` of ${data.length}` : ""}
          </span>
          {q ? (
            <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
              search: “{qDraft.trim()}”
            </span>
          ) : null}
          {dateActive ? (
            <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
              date: {dateChipLabel(datePreset, fromYmd, toYmd)}
            </span>
          ) : null}
          {council ? (
            <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
              council: {council}
            </span>
          ) : null}
          {specialty ? (
            <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
              specialty: {specialty}
            </span>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="text-destructive">Could not load verifications.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && (data?.length ?? 0) === 0 ? (
        <p className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No {statusLabel} signups.
        </p>
      ) : null}

      {!isLoading &&
      !isError &&
      data &&
      data.length > 0 &&
      filtered.length === 0 ? (
        <p className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No matches
          {qDraft.trim() ? ` for “${qDraft.trim()}”` : ""}.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              clearSearch();
              clearPropFilters();
              clearDateFilter();
            }}
          >
            Clear filters
          </button>
        </p>
      ) : null}

      {!isLoading && !isError && filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Registration
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Council
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Specialty
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Submitted
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 px-1 text-center text-xs font-medium text-muted-foreground">
                  Cert
                </TableHead>
                <TableHead className="h-9 px-1 text-center text-xs font-medium text-muted-foreground">
                  ID
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <VerificationRow key={row.doctorId} token={token} row={row} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
