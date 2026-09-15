"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { cn } from "@/lib/utils";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";
import {
  deleteDoctorClinicStaff,
  listDoctorClinicStaff,
  patchDoctorClinicStaff,
  patchDoctorClinicStaffStatus,
  provisionDoctorClinicStaff,
  type DoctorClinicStaffItem,
} from "@/lib/api";
import {
  DEFAULT_STAFF_CAPABILITIES,
  STAFF_CAPABILITIES,
  STAFF_JOB_HELP,
  STAFF_JOB_LABELS,
  normalizeDeskCapabilities,
  type StaffCapability,
} from "@/lib/desk/capabilities";
import { queryKeys } from "@/lib/query/keys";

function staffCapsFromRow(row: DoctorClinicStaffItem): StaffCapability[] {
  return normalizeDeskCapabilities(row.capabilities);
}

function staffInitials(row: DoctorClinicStaffItem): string {
  const source = (row.displayName || row.staffEmail || "S").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function CapabilityChecks({
  value,
  onChange,
  idPrefix,
}: {
  value: StaffCapability[];
  onChange: (next: StaffCapability[]) => void;
  idPrefix: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">Jobs</legend>
      <div className="mt-2 overflow-hidden rounded-xl border border-border">
        {STAFF_CAPABILITIES.map((cap, index) => {
          const checked = value.includes(cap);
          return (
            <label
              key={cap}
              htmlFor={`${idPrefix}-${cap}`}
              className={cn(
                "flex cursor-pointer gap-3 px-4 py-3 hover:bg-muted/50",
                index > 0 && "border-t border-border",
                checked && "bg-primary/[0.03]",
              )}
            >
              <Checkbox
                id={`${idPrefix}-${cap}`}
                checked={checked}
                className="mt-0.5"
                onCheckedChange={(next) => {
                  if (next === true) {
                    onChange(
                      STAFF_CAPABILITIES.filter((item) => item === cap || value.includes(item)),
                    );
                    return;
                  }
                  const remaining = value.filter((item) => item !== cap);
                  if (remaining.length === 0) return;
                  onChange(remaining);
                }}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {STAFF_JOB_LABELS[cap]}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                  {STAFF_JOB_HELP[cap]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FrontDeskStaffClient() {
  const { token, isLoading: tokenLoading } = useSessionAccessToken();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCaps, setEditCaps] = useState<StaffCapability[]>([
    ...DEFAULT_STAFF_CAPABILITIES,
  ]);
  const [addCaps, setAddCaps] = useState<StaffCapability[]>([
    ...DEFAULT_STAFF_CAPABILITIES,
  ]);

  const listQuery = useQuery({
    queryKey: queryKeys.clinicStaff.mine(),
    queryFn: async () => {
      const res = await listDoctorClinicStaff(token!);
      return res.data.items;
    },
    enabled: Boolean(token),
  });

  const provision = useMutation({
    mutationFn: () =>
      provisionDoctorClinicStaff(token!, {
        email: email.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        capabilities: addCaps,
      }),
    onSuccess: (res) => {
      setFormError(null);
      setTempPassword(res.data.temporaryPassword ?? null);
      setEmail("");
      setDisplayName("");
      setAddCaps([...DEFAULT_STAFF_CAPABILITIES]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setTempPassword(null);
      setFormError(err instanceof Error ? err.message : "Could not add staff");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDoctorClinicStaff(token!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not delete staff");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      id,
      displayName,
      capabilities,
    }: {
      id: string;
      displayName: string;
      capabilities: StaffCapability[];
    }) => patchDoctorClinicStaff(token!, id, { displayName, capabilities }),
    onSuccess: () => {
      setEditingId(null);
      setEditName("");
      setEditCaps([...DEFAULT_STAFF_CAPABILITIES]);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not update staff");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: DoctorClinicStaffItem["status"];
    }) => patchDoctorClinicStaffStatus(token!, id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not update staff");
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setFormError("Email is required");
      return;
    }
    provision.mutate();
  }

  if (tokenLoading || !token) {
    return (
      <SettingsPageShell
        title="Staff"
        description="Give each login the jobs they may do. They sign in at /desk."
        isLoading
      />
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <SettingsPageShell
        title="Staff"
        description="Give each login the jobs they may do. They sign in at /desk."
        loadError="Could not load staff."
        onRetry={() => void listQuery.refetch()}
      />
    );
  }

  const items = listQuery.data ?? [];

  return (
    <SettingsPageShell
      title="Staff"
      description="Give each login the jobs they may do. They sign in at /desk."
      saveError={formError}
    >
      <div className="mt-8 space-y-8">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-medium text-foreground">People</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              One active login per job. One person may hold several.
            </p>
          </div>
          {items.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No staff yet. Create a login below.
            </p>
          ) : (
            <ul>
              {items.map((row, index) => (
                <li
                  key={row.id}
                  className={cn("px-5 py-4", index > 0 && "border-t border-border")}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
                    >
                      {staffInitials(row)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {row.displayName || row.staffEmail || "Staff"}
                        </p>
                        <Badge
                          variant={row.status === "active" ? "success" : "secondary"}
                          className="rounded-full font-medium"
                        >
                          {row.status === "active" ? "Active" : "Suspended"}
                        </Badge>
                      </div>
                      {row.displayName && row.staffEmail ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {row.staffEmail}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {staffCapsFromRow(row).map((cap) => (
                          <span
                            key={cap}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {STAFF_JOB_LABELS[cap]}
                          </span>
                        ))}
                      </div>
                      {editingId === row.id ? (
                        <form
                          className="mt-4 space-y-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            editMutation.mutate({
                              id: row.id,
                              displayName: editName.trim(),
                              capabilities: editCaps,
                            });
                          }}
                        >
                          <div className="space-y-1.5">
                            <Label htmlFor={`desk-staff-edit-${row.id}`}>
                              Display name
                            </Label>
                            <Input
                              id={`desk-staff-edit-${row.id}`}
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              maxLength={80}
                            />
                          </div>
                          <CapabilityChecks
                            idPrefix={`desk-staff-edit-${row.id}`}
                            value={editCaps}
                            onChange={setEditCaps}
                          />
                          <p className="text-xs text-muted-foreground">
                            Login email cannot be changed. Delete and add again
                            to use a different email.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" disabled={editMutation.isPending}>
                              {editMutation.isPending ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={editMutation.isPending}
                              onClick={() => {
                                setEditingId(null);
                                setEditName("");
                                setEditCaps([...DEFAULT_STAFF_CAPABILITIES]);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                id: row.id,
                                status:
                                  row.status === "active" ? "suspended" : "active",
                              })
                            }
                          >
                            {row.status === "active" ? "Suspend" : "Make active"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditName(row.displayName ?? "");
                              setEditCaps(staffCapsFromRow(row));
                              setFormError(null);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-muted-foreground"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(row.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-5"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Add staff</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A second login for the same job starts suspended.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desk-staff-email">Email</Label>
              <Input
                id="desk-staff-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desk-staff-name">Display name (optional)</Label>
              <Input
                id="desk-staff-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
          </div>
          <CapabilityChecks
            idPrefix="desk-staff-add"
            value={addCaps}
            onChange={setAddCaps}
          />
          <Button type="submit" disabled={provision.isPending}>
            {provision.isPending ? "Saving…" : "Create login"}
          </Button>
        </form>

        {tempPassword ? (
          <div
            role="status"
            className="rounded-2xl border border-border bg-muted/40 px-5 py-4 text-sm"
          >
            <p className="font-medium text-foreground">
              Temporary password (shown once)
            </p>
            <p className="mt-2 font-mono text-base text-foreground">{tempPassword}</p>
            <p className="mt-2 text-muted-foreground">
              Share this with them. It will not be shown again. They sign in at
              /desk.
            </p>
          </div>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
