"use client";

/**
 * Sub-batch C · task-video-C8 — Three-way invite panel.
 *
 * Doctor-only UI for inviting a third party (interpreter, family
 * member, specialist) into a live consultation. Phase 1 minimum-
 * viable shell — the visual polish (auto-switching layouts, drag-to-
 * reorder list, SMS sender wired through Notification Service) is
 * deferred to Phase 2.
 *
 * What ships in Phase 1:
 *   - Display name (required) + role label (optional) form.
 *   - "Generate invite link" button → calls
 *     `createExtraParticipantInvite()` → renders the resulting
 *     `inviteUrl` with a "Copy link" button.
 *   - List of invites for the current session (loaded on mount and
 *     after each create / revoke) with status pills + a "Revoke"
 *     button per row.
 *   - All errors surface inline; no toast wiring needed because the
 *     parent `<VideoRoom>` already exposes a toast bus the panel can
 *     subscribe to in Phase 2.
 *
 * Mounted by:
 *   - The doctor's `<InCallActionPanel>` shell (Phase 2 wires it to
 *     the FAB's "Invite participant" entry).
 *   - Standalone for testing / dashboard inspector if needed.
 *
 * Why a self-contained component (instead of a sub-route):
 *   - Mirrors the C6 `<PrescriptionForm>` / `<FollowUpInlineBooker>`
 *     pattern — anything that mounts inside the in-call panel must
 *     be a controlled, prop-driven React component so the panel can
 *     swap between actions without router navigation.
 *
 * @see frontend/lib/api.ts (extra-participant helpers)
 * @see backend/src/services/consultation-extra-participant-service.ts
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/task-video-C8-three-way-call.md
 */

import { useCallback, useEffect, useState } from "react";
import {
  createExtraParticipantInvite,
  listExtraParticipantInvites,
  revokeExtraParticipantInvite,
  type ExtraParticipantInvite,
} from "@/lib/api";

export interface ThreeWayInvitePanelProps {
  /** Doctor Supabase JWT — Bearer header for the authenticated routes. */
  doctorToken: string;
  /** `consultation_sessions.id` UUID. */
  sessionId: string;
  /**
   * Optional callback fired after a successful create / revoke so
   * the parent (`<VideoRoom>`) can refresh related UI (e.g. count
   * badges on the invite FAB) without re-fetching here.
   */
  onChange?(): void;
}

interface PanelState {
  displayName: string;
  roleLabel: string;
  invites: ExtraParticipantInvite[];
  loadingList: boolean;
  busy: boolean;
  /** Last error message (load / create / revoke). */
  error: string | null;
  /** Most recent invite we created in this panel — used to render the share row. */
  lastCreated: { id: string; url: string | null; token: string } | null;
  /** Tracks "Copied!" feedback per token. */
  copiedToken: string | null;
}

const INITIAL_STATE: PanelState = {
  displayName: "",
  roleLabel: "",
  invites: [],
  loadingList: true,
  busy: false,
  error: null,
  lastCreated: null,
  copiedToken: null,
};

export default function ThreeWayInvitePanel({
  doctorToken,
  sessionId,
  onChange,
}: ThreeWayInvitePanelProps) {
  const [state, setState] = useState<PanelState>(INITIAL_STATE);

  const refreshList = useCallback(async () => {
    setState((prev) => ({ ...prev, loadingList: true, error: null }));
    try {
      const res = await listExtraParticipantInvites(doctorToken, sessionId);
      setState((prev) => ({
        ...prev,
        invites: res.data.invites,
        loadingList: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load invites";
      setState((prev) => ({
        ...prev,
        loadingList: false,
        error: message,
      }));
    }
  }, [doctorToken, sessionId]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const handleCreate = useCallback(async () => {
    const displayName = state.displayName.trim();
    if (displayName.length === 0) {
      setState((prev) => ({ ...prev, error: "Display name is required" }));
      return;
    }
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const res = await createExtraParticipantInvite(doctorToken, sessionId, {
        displayName,
        roleLabel: state.roleLabel.trim() || null,
      });
      setState((prev) => ({
        ...prev,
        busy: false,
        displayName: "",
        roleLabel: "",
        lastCreated: {
          id: res.data.participantId,
          url: res.data.inviteUrl,
          token: res.data.inviteToken,
        },
      }));
      onChange?.();
      void refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create invite";
      setState((prev) => ({ ...prev, busy: false, error: message }));
    }
  }, [doctorToken, onChange, refreshList, sessionId, state.displayName, state.roleLabel]);

  const handleRevoke = useCallback(
    async (participantId: string) => {
      setState((prev) => ({ ...prev, busy: true, error: null }));
      try {
        await revokeExtraParticipantInvite(doctorToken, sessionId, participantId);
        setState((prev) => ({ ...prev, busy: false }));
        onChange?.();
        void refreshList();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to revoke";
        setState((prev) => ({ ...prev, busy: false, error: message }));
      }
    },
    [doctorToken, onChange, refreshList, sessionId],
  );

  const handleCopy = useCallback(async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setState((prev) => ({ ...prev, copiedToken: token }));
      // Reset the "Copied!" badge after 1.5s — matches the same
      // ephemeral feedback duration the dashboard's snippet copier uses.
      setTimeout(() => {
        setState((prev) =>
          prev.copiedToken === token ? { ...prev, copiedToken: null } : prev,
        );
      }, 1500);
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Could not access the clipboard. Copy the link manually.",
      }));
    }
  }, []);

  return (
    <div className="space-y-4 text-sm text-gray-800">
      {/* Form */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Display name
        </label>
        <input
          type="text"
          value={state.displayName}
          onChange={(e) =>
            setState((prev) => ({ ...prev, displayName: e.target.value }))
          }
          maxLength={80}
          placeholder="e.g. Maria"
          disabled={state.busy}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
        />

        <label className="block pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Role label (optional)
        </label>
        <input
          type="text"
          value={state.roleLabel}
          onChange={(e) =>
            setState((prev) => ({ ...prev, roleLabel: e.target.value }))
          }
          maxLength={64}
          placeholder="e.g. interpreter, family member, specialist"
          disabled={state.busy}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
        />

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={state.busy || state.displayName.trim().length === 0}
          className="mt-2 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {state.busy ? "Working\u2026" : "Generate invite link"}
        </button>
      </div>

      {/* Most-recent invite share row */}
      {state.lastCreated && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-900">
            New invite link
          </p>
          {state.lastCreated.url ? (
            <div className="flex flex-col gap-2">
              <code className="break-all rounded bg-white px-2 py-1 text-xs text-gray-800">
                {state.lastCreated.url}
              </code>
              <button
                type="button"
                onClick={() =>
                  state.lastCreated?.url &&
                  void handleCopy(state.lastCreated.url, state.lastCreated.token)
                }
                className="self-start rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100"
              >
                {state.copiedToken === state.lastCreated.token
                  ? "Copied!"
                  : "Copy link"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-blue-900">
              Token issued: <code className="break-all">{state.lastCreated.token}</code>{" "}
              <span className="text-blue-700">
                (Set <code>APP_BASE_URL</code> server-side to render a full URL.)
              </span>
            </p>
          )}
        </div>
      )}

      {/* Inline error */}
      {state.error && (
        <p className="text-xs text-red-600" role="alert">
          {state.error}
        </p>
      )}

      {/* Invite list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Invites for this call
        </p>
        {state.loadingList ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : state.invites.length === 0 ? (
          <p className="text-xs text-gray-500">No invites yet.</p>
        ) : (
          <ul className="space-y-1">
            {state.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {invite.displayName}
                    {invite.roleLabel && (
                      <span className="ml-1 text-xs text-gray-500">
                        ({invite.roleLabel})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    <InviteStatusPill invite={invite} />
                  </p>
                </div>
                {invite.revokedAt === null && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(invite.id)}
                    disabled={state.busy}
                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InviteStatusPill({ invite }: { invite: ExtraParticipantInvite }) {
  if (invite.revokedAt !== null) return <span className="text-red-600">Revoked</span>;
  if (invite.leftAt !== null) return <span className="text-gray-500">Left</span>;
  if (invite.active) return <span className="text-emerald-700">In the call</span>;
  return <span className="text-amber-700">Pending join</span>;
}
