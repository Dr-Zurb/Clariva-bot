"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminDoctorsQuery } from "@/hooks/queries/useAdminDoctorsQuery";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteAdminClinicStaff,
  listAdminClinicStaff,
  patchAdminClinicStaff,
  patchAdminClinicStaffStatus,
  provisionAdminClinicStaff,
  type AdminClinicStaffItem,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function ClinicStaffAdminClient({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const listQuery = useQuery({
    queryKey: queryKeys.admin.clinicStaff(),
    queryFn: async () => {
      const res = await listAdminClinicStaff(token);
      return res.data.items;
    },
    enabled: Boolean(token),
  });

  const doctorsQuery = useAdminDoctorsQuery(token);

  const provision = useMutation({
    mutationFn: () =>
      provisionAdminClinicStaff(token, {
        email: email.trim(),
        doctorId,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      }),
    onSuccess: (res) => {
      setFormError(null);
      setTempPassword(res.data.temporaryPassword ?? null);
      setEmail("");
      setDisplayName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.clinicStaff() });
    },
    onError: (err: unknown) => {
      setTempPassword(null);
      setFormError(err instanceof Error ? err.message : "Could not provision staff");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminClinicStaff(token, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.clinicStaff() });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Could not delete receptionist");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      patchAdminClinicStaff(token, id, { displayName }),
    onSuccess: () => {
      setEditingId(null);
      setEditName("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.clinicStaff() });
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
      status: AdminClinicStaffItem["status"];
    }) => patchAdminClinicStaffStatus(token, id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.clinicStaff() });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !doctorId) {
      setFormError("Email and doctor are required");
      return;
    }
    provision.mutate();
  }

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-lg border border-border p-4"
      >
        <p className="text-sm font-medium text-foreground">Add receptionist</p>
        <p className="text-xs text-muted-foreground">
          Extra logins start suspended if that doctor already has an active seat.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-doctor">Doctor</Label>
            <select
              id="staff-doctor"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select a doctor</option>
              {(doctorsQuery.data ?? []).map((doc) => (
                <option key={doc.doctorId} value={doc.doctorId}>
                  {doc.fullName || doc.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Display name (optional)</Label>
            <Input
              id="staff-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        {tempPassword ? (
          <div
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <p className="font-medium text-foreground">Temporary password (shown once)</p>
            <p className="mt-1 font-mono text-foreground">{tempPassword}</p>
            <p className="mt-1 text-muted-foreground">
              Share this with the receptionist. It will not be shown again.
            </p>
          </div>
        ) : null}
        <Button type="submit" disabled={provision.isPending}>
          {provision.isPending ? "Saving…" : "Create login"}
        </Button>
      </form>

      {listQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load staff.
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Doctor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listQuery.isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No front-desk accounts yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.displayName || row.staffEmail || "—"}</p>
                  {row.displayName && row.staffEmail ? (
                    <p className="text-xs text-muted-foreground">{row.staffEmail}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{row.doctorEmail ?? "—"}</TableCell>
                <TableCell className="capitalize">{row.status}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === row.id ? (
                    <form
                      className="flex flex-col items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        editMutation.mutate({
                          id: row.id,
                          displayName: editName.trim(),
                        });
                      }}
                    >
                      <Input
                        aria-label="Display name"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        maxLength={80}
                        className="max-w-56"
                      />
                      <div>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={editMutation.isPending}
                        >
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
                    <>
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
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
