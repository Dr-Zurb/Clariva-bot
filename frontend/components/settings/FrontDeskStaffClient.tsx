"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";
import {
  deleteDoctorClinicStaff,
  listDoctorClinicStaff,
  patchDoctorClinicStaff,
  patchDoctorClinicStaffStatus,
  provisionDoctorClinicStaff,
  type DoctorClinicStaffItem,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

export function FrontDeskStaffClient() {
  const { token, isLoading: tokenLoading } = useSessionAccessToken();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
      }),
    onSuccess: (res) => {
      setFormError(null);
      setTempPassword(res.data.temporaryPassword ?? null);
      setEmail("");
      setDisplayName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setTempPassword(null);
      setFormError(err instanceof Error ? err.message : "Could not add receptionist");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDoctorClinicStaff(token!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not delete receptionist");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      patchDoctorClinicStaff(token!, id, { displayName }),
    onSuccess: () => {
      setEditingId(null);
      setEditName("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.clinicStaff.mine() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not update receptionist");
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
      setFormError(err instanceof Error ? err.message : "Could not update receptionist");
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
        title="Front desk"
        description="Add as many logins as you need. Only one can be active."
        isLoading
      />
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <SettingsPageShell
        title="Front desk"
        description="Add as many logins as you need. Only one can be active."
        loadError="Could not load front desk staff."
        onRetry={() => void listQuery.refetch()}
      />
    );
  }

  const items = listQuery.data ?? [];

  return (
    <SettingsPageShell
      title="Front desk"
      description="Add as many logins as you need. Only one can be active — they sign in at /desk and cannot open the doctor app."
      saveError={formError}
    >
      <div className="mt-6 space-y-6">
        {items.map((row) => (
          <section
            key={row.id}
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-foreground">
              {row.displayName || row.staffEmail || "Receptionist"}
            </p>
            {row.displayName && row.staffEmail ? (
              <p className="mt-1 text-sm text-muted-foreground">{row.staffEmail}</p>
            ) : null}
            <p className="mt-1 text-sm capitalize text-muted-foreground">{row.status}</p>
            {editingId === row.id ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  editMutation.mutate({ id: row.id, displayName: editName.trim() });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`desk-staff-edit-${row.id}`}>Display name</Label>
                  <Input
                    id={`desk-staff-edit-${row.id}`}
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Login email cannot be changed. Delete and add again to use a
                  different email.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={editMutation.isPending}>
                    {editMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={editMutation.isPending}
                    onClick={() => {
                      setEditingId(null);
                      setEditName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      id: row.id,
                      status: row.status === "active" ? "suspended" : "active",
                    })
                  }
                >
                  {row.status === "active" ? "Suspend" : "Make active"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(row.id);
                    setEditName(row.displayName ?? "");
                    setFormError(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(row.id)}
                >
                  Delete
                </Button>
              </div>
            )}
          </section>
        ))}

        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm"
        >
            <p className="text-sm font-medium text-foreground">Add receptionist</p>
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
            <p className="text-xs text-muted-foreground">
              If someone is already active, this login starts suspended.
            </p>
            <Button type="submit" disabled={provision.isPending}>
              {provision.isPending ? "Saving…" : "Create login"}
            </Button>
          </form>

        {tempPassword ? (
          <div
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <p className="font-medium text-foreground">Temporary password (shown once)</p>
            <p className="mt-1 font-mono text-foreground">{tempPassword}</p>
            <p className="mt-1 text-muted-foreground">
              Share this with the receptionist. It will not be shown again. They sign
              in at /desk.
            </p>
          </div>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
