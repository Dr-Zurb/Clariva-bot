import { Card } from "@/components/ui/card";

const MOCK_POSTS = [
  { title: "Reel · evening skincare", messages: 42, booked: 11, seen: 9 },
  { title: "Post · clinic hours", messages: 18, booked: 6, seen: 5 },
  { title: "Reel · when to see a doctor", messages: 31, booked: 4, seen: 3 },
] as const;

/**
 * Illustrative post-to-visit mock. Sample figures only — no performance claims.
 */
export function ProofSection() {
  return (
    <section
      id="what-converts"
      className="scroll-mt-20 bg-white py-20 sm:py-24"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            See which post brought you patients.
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            Every reel and every comment thread, tracked from the first message
            to the completed visit. You&apos;ll know which content fills your
            calendar, and which doesn&apos;t.
          </p>
        </div>
        <Card className="border-black/5 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/50">
            This month
          </p>
          <ul className="mt-4 space-y-3">
            {MOCK_POSTS.map((post) => (
              <li
                key={post.title}
                className="rounded-xl border border-black/5 bg-[hsl(var(--halo-mist))]/50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
                  {post.title}
                </p>
                <p className="mt-1 font-tabular text-xs text-[hsl(var(--halo-ink))]/60">
                  {post.messages} messages · {post.booked} booked · {post.seen}{" "}
                  seen
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
