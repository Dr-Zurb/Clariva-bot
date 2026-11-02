import { PostStatsCard } from "./mock/PostStatsCard";

/** A view is not a visit. The post that sent them is the proof. */
export function EdgeBand() {
  return (
    <section className="bg-[hsl(var(--halo-mist))] py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="block text-[hsl(var(--halo-navy))]/35">
              Instagram counts a view.
            </span>
            <span className="mt-1 block text-[hsl(var(--halo-blue))]">
              Halo Aid counts the visit.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-lg text-[hsl(var(--halo-ink))]/70">
            A booking from your page lands back on the post that sent them.
          </p>
        </div>
        <PostStatsCard />
      </div>
    </section>
  );
}
