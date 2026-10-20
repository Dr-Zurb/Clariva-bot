/**
 * On-the-go idea capture. Logged-out visits bounce through login and return here.
 */

import { IdeaCapture } from "@/components/dashboard/social/IdeaCapture";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "New idea" };

export default async function SocialIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; note?: string; link?: string; keys?: string }>;
}) {
  const { token } = await requireDashboardAuth();
  const params = await Promise.resolve(searchParams);

  return (
    <IdeaCapture
      token={token}
      title={params.title ?? ""}
      note={params.note ?? ""}
      link={params.link ?? ""}
      fileKeys={params.keys ?? ""}
    />
  );
}
