import { CalendarCheck } from "lucide-react";

type BoardMockProps = {
  /**
   * Show only Making and Ready. When omitted, Ideas and Chosen hide below
   * the `sm` breakpoint and return from there up.
   */
  compact?: boolean;
};

type PostCard = {
  kind: "post";
  title: string;
  format: "Reel" | "Post" | "Story";
  booking?: boolean;
};

type BarCard = { kind: "bars"; widths: readonly string[] };

type BoardCard = PostCard | BarCard;

type BoardColumn = {
  label: string;
  optional: boolean;
  cards: readonly BoardCard[];
};

const COLUMNS: readonly BoardColumn[] = [
  {
    label: "Ideas",
    optional: true,
    cards: [
      { kind: "post", title: "Fees and timings", format: "Post" },
      { kind: "bars", widths: ["78%", "52%"] },
      { kind: "bars", widths: ["64%", "40%"] },
    ],
  },
  {
    label: "Chosen",
    optional: true,
    cards: [
      { kind: "post", title: "Clinic tour", format: "Story" },
      { kind: "bars", widths: ["70%", "46%"] },
    ],
  },
  {
    label: "Making",
    optional: false,
    cards: [
      { kind: "post", title: "Post-op care", format: "Reel" },
      { kind: "bars", widths: ["72%", "48%"] },
    ],
  },
  {
    label: "Ready",
    optional: false,
    cards: [
      {
        kind: "post",
        title: "Acne reel",
        format: "Reel",
        booking: true,
      },
      { kind: "post", title: "Morning stiffness", format: "Post" },
    ],
  },
];

/**
 * Drawn content board. Column names match the product: Ideas, Chosen,
 * Making, Ready. No patient names.
 */
export function BoardMock({ compact = false }: BoardMockProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
          Content
        </p>
        <span className="rounded-full bg-[hsl(var(--halo-blue))] px-2.5 py-1 text-[11px] font-semibold text-white">
          + Add idea
        </span>
      </div>
      <div
        className={
          compact
            ? "grid grid-cols-2 gap-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-4"
        }
      >
        {COLUMNS.map((column) => (
          <div
            key={column.label}
            className={`min-w-0 flex-col rounded-xl bg-[hsl(var(--halo-mist))] p-2.5 ${
              column.optional ? (compact ? "hidden" : "hidden sm:flex") : "flex"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/50">
                {column.label}
              </p>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[hsl(var(--halo-ink))]/50">
                {column.cards.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {column.cards.map((card, index) =>
                card.kind === "bars" ? (
                  <BarCardView
                    key={`${column.label}-bars-${index}`}
                    card={card}
                  />
                ) : (
                  <PostCardView key={card.title} card={card} />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostCardView({ card }: { card: PostCard }) {
  return (
    <div
      className={
        card.booking
          ? "rounded-lg border-2 border-[hsl(var(--halo-blue))]/30 bg-white p-2.5 shadow-sm"
          : "rounded-lg border border-[hsl(var(--halo-navy))]/10 bg-white p-2.5 shadow-sm"
      }
    >
      <p className="text-[12px] font-semibold leading-4 text-[hsl(var(--halo-navy))]">
        {card.title}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
        {card.format}
      </p>
      {card.booking ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--halo-blue))] px-2 py-0.5 text-[10px] font-semibold text-white">
          <CalendarCheck className="h-3 w-3" aria-hidden />1 booking
        </p>
      ) : null}
    </div>
  );
}

function BarCardView({ card }: { card: BarCard }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--halo-navy))]/10 bg-white p-2.5 shadow-sm">
      {card.widths.map((width) => (
        <div
          key={width}
          className="mt-2 h-2 rounded-full bg-[hsl(var(--halo-ink))]/10 first:mt-0"
          style={{ width }}
        />
      ))}
    </div>
  );
}
