"use client";

/**
 * Social shell. Content is the board. Schedule is the week.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SocialAnalytics } from "./SocialAnalytics";
import { SocialBoard } from "./SocialBoard";
import { SocialSchedule } from "./SocialSchedule";
import {
  binDaysLeft,
  emptySocialBin,
  listSocialBin,
  purgeSocialCard,
  restoreSocialCard,
  type SocialCard,
} from "./social-cards";

type SocialTab = "content" | "schedule" | "analytics";

const TABS: readonly { id: SocialTab; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "analytics", label: "Analytics" },
];

export function SocialClient({ token }: { token: string }): JSX.Element {
  const [tab, setTab] = useState<SocialTab>("content");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [boardRevision, setBoardRevision] = useState(0);

  return (
    <div className="flex h-full min-h-full flex-1 flex-col gap-4 md:min-h-0 md:overflow-hidden">
      <h1 className="text-2xl font-semibold text-foreground">Social</h1>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div role="tablist" aria-label="Social sections" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="tab"
            id="social-tab-content"
            aria-selected={tab === "content"}
            aria-controls="social-panel-content"
            onClick={() => setTab("content")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === "content"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Content
          </button>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`social-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`social-panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "content" ? (
          <SocialBin token={token} onRestored={() => setBoardRevision((current) => current + 1)} />
        ) : null}
      </div>

      {tab === "content" ? (
        <div
          role="tabpanel"
          id="social-panel-content"
          aria-labelledby="social-tab-content"
          className="flex min-h-0 flex-1 flex-col"
        >
          <SocialBoard token={token} openCardId={openCardId} revision={boardRevision} />
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div
          role="tabpanel"
          id="social-panel-schedule"
          aria-labelledby="social-tab-schedule"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <SocialSchedule
            token={token}
            onOpen={(id) => {
              setOpenCardId(id);
              setTab("content");
            }}
          />
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div
          role="tabpanel"
          id="social-panel-analytics"
          aria-labelledby="social-tab-analytics"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <SocialAnalytics
            token={token}
            onUsed={(id) => {
              setOpenCardId(id);
              setTab("content");
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SocialBin({ token, onRestored }: { token: string; onRestored: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<SocialCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openBin(): Promise<void> {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setCards(await listSocialBin(token));
    } catch (err: unknown) {
      setCards([]);
      setError(err instanceof Error ? err.message : "Could not open the bin");
    } finally {
      setLoading(false);
    }
  }

  async function restoreCard(id: string): Promise<void> {
    setError(null);
    try {
      await restoreSocialCard(token, id);
      setCards((current) => current.filter((item) => item.id !== id));
      onRestored();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not restore the card");
    }
  }

  async function deleteForever(id: string): Promise<void> {
    setError(null);
    try {
      await purgeSocialCard(token, id);
      setCards((current) => current.filter((item) => item.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete the card");
    }
  }

  async function emptyBin(): Promise<void> {
    if (cards.length === 0) return;
    setError(null);
    try {
      await emptySocialBin(token);
      setCards([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not empty the bin");
      try {
        setCards(await listSocialBin(token));
      } catch {
        // The list stays as it was. The error above is enough.
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openBin()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Bin
      </button>
      {open
        ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-label="Bin"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="flex max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-md flex-col rounded-xl bg-card shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-4">
              <h2 className="mr-auto text-sm font-medium text-foreground">Bin</h2>
              {cards.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void emptyBin()}
                  className="text-sm text-destructive hover:underline"
                >
                  Empty bin
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="px-5 text-sm text-muted-foreground">
              Ideas stay here for 30 days. Delete removes one now.
            </p>
            {error ? (
              <p className="px-5 pt-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5">
              {loading ? (
                <li className="text-sm text-muted-foreground">Loading the bin.</li>
              ) : cards.length === 0 ? (
                <li className="text-sm text-muted-foreground">The bin is empty.</li>
              ) : (
                cards.map((card) => {
                  const days = card.deletedAt ? binDaysLeft(card.deletedAt) : 0;
                  const left = days === 1 ? "1 day left" : days === 0 ? "Goes today" : `${days} days left`;
                  return (
                    <li
                      key={card.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{card.title}</p>
                        <p className="text-xs text-muted-foreground">{left}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restoreCard(card.id)}
                        className="text-sm text-foreground hover:text-primary"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteForever(card.id)}
                        className="text-sm text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
