"use client";

/**
 * Today's planned social starts. A due card stays in Chosen until it is started.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSocialCards, type SocialCard } from "@/components/dashboard/social/social-cards";
import { makeLine, makeTone } from "@/components/dashboard/social/make-plan";

export function SocialStartStrip({ token }: { token: string }): JSX.Element | null {
  const [cards, setCards] = useState<SocialCard[] | null>(null);

  useEffect(() => {
    let gone = false;
    listSocialCards(token)
      .then((next) => {
        if (!gone) setCards(next);
      })
      .catch(() => {
        if (!gone) setCards([]);
      });
    return () => {
      gone = true;
    };
  }, [token]);

  const due = (cards ?? []).filter((card) => {
    const stage = card.stage === "chosen" || card.stage === "making" ? card.stage : null;
    if (!stage) return false;
    const tone = makeTone(card.makeAt, stage);
    return tone === "today" || tone === "late";
  });
  if (!cards || due.length === 0) return null;

  return (
    <section aria-label="Social to start" className="rounded-xl border border-border bg-card px-4 py-3">
      <h2 className="text-sm font-medium text-foreground">Social to start</h2>
      <ul className="mt-2 space-y-2">
        {due.map((card) => {
          const stage = card.stage === "making" ? "making" : "chosen";
          const late = makeTone(card.makeAt, stage) === "late";
          return (
            <li key={card.id}>
              <Link
                href={`/dashboard/social?card=${card.id}`}
                className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{card.title}</span>
                  <span className={`block text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                    {makeLine(card.makeAt, stage)}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-primary">
                  {stage === "chosen" ? "Start making now" : "Open"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
