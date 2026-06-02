import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getServerUser } from "@/lib/auth/server-user";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * Web Push deeplink target for voice-C3 (doctor joins from dashboard).
 * Resolves `consultation_sessions.id` → appointment detail (ConsultationLauncher).
 */
export default async function DashboardConsultDeepLinkPage({ params }: PageProps) {
  const { sessionId } = await params;
  const trimmed = sessionId?.trim();
  if (!trimmed) notFound();

  const {
    data: { user },
  } = await getServerUser();
  if (!user) redirect("/login");

  const supabase = await getServerSupabase();
  const { data: session, error } = await supabase
    .from("consultation_sessions")
    .select("appointment_id, doctor_id")
    .eq("id", trimmed)
    .maybeSingle();

  if (error || !session?.appointment_id) notFound();
  if (session.doctor_id !== user.id) notFound();

  redirect(`/dashboard/appointments/${session.appointment_id}`);
}
