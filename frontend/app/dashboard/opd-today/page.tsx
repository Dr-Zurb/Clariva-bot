import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OpdTodayClient from "@/components/opd/OpdTodayClient";

/**
 * Doctor OPD operational hub (queue board or slot hints). e-task-opd-06.
 */
export default async function OpdTodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  if (!token) redirect("/login");

  return <OpdTodayClient token={token} />;
}
