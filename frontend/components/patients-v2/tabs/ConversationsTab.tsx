"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getAppointmentsForPatient } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";
import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  conversationPreview,
  formatRelativeShort,
  lastRepliedByLabel,
  resolveConversationChannel,
  showUnreadFudge,
  type ConversationChannel,
} from "./history-tabs-utils";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface ConversationsTabProps {
  patientId: string;
  token: string;
}

function chatHref(appt: Appointment): string {
  const sessionId = appt.consultation_session?.id;
  if (sessionId) {
    return `/chat?conversation_id=${encodeURIComponent(sessionId)}`;
  }
  return `/dashboard/appointments/${appt.id}/chat-history`;
}

export function ConversationsTab({ patientId, token }: ConversationsTabProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useTabOpenedTelemetry("conversations", patientId);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void getAppointmentsForPatient(token, patientId)
      .then((res) => {
        if (cancelled) return;
        const withSession = (res.data.appointments ?? [])
          .filter((a) => a.consultation_session?.id != null)
          .sort(
            (a, b) =>
              new Date(b.appointment_date).getTime() -
              new Date(a.appointment_date).getTime(),
          );
        setAppointments(withSession);
      })
      .catch(() => {
        if (!cancelled) setAppointments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  useEffect(() => load(), [load]);

  const byChannel = useMemo(() => {
    const map = new Map<ConversationChannel, Appointment[]>();
    for (const ch of CHANNEL_ORDER) map.set(ch, []);
    for (const appt of appointments) {
      const ch = resolveConversationChannel(appt);
      map.get(ch)!.push(appt);
    }
    return map;
  }, [appointments]);

  const hasAny = appointments.length > 0;

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>;
  }

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No conversations recorded yet.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Conversations appear when a patient books a text, voice, or video consult and messages
          are exchanged during the session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4" aria-label="Conversations by channel">
      {CHANNEL_ORDER.map((channel) => {
        const rows = byChannel.get(channel) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={channel}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{CHANNEL_LABELS[channel]}</h3>
              <Badge variant="secondary" className="text-xs">
                {rows.length}
              </Badge>
            </div>
            <ul className="space-y-2">
              {rows.map((appt) => (
                <li key={appt.id}>
                  <Link
                    href={chatHref(appt)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3",
                      "transition-colors hover:bg-muted/40",
                    )}
                  >
                    {showUnreadFudge(appt) ? (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : (
                      <span className="mt-2 h-2 w-2 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {formatDate(appt.appointment_date)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeShort(appt.appointment_date)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {conversationPreview(appt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lastRepliedByLabel(appt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
