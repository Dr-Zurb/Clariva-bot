/**
 * The doctor watches the file and writes what should change.
 * Nothing here trims or replaces the video.
 */

import { useEffect, useRef, useState } from "react";
import {
  addSocialCardTurn,
  listSocialCardTurns,
  type SocialCard,
  type SocialCardTurn,
  type SocialScrap,
} from "./social-cards";

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function spanLabel(turn: Pick<SocialCardTurn, "atMs" | "endMs">): string | null {
  if (turn.atMs == null) return null;
  if (turn.endMs == null) return clock(turn.atMs);
  return `${clock(turn.atMs)}–${clock(turn.endMs)}`;
}

export function SocialCardReview({
  token,
  card,
  fileUrl,
  scraps,
  busy,
  onShowDraft,
  onMarkReady,
}: {
  token: string;
  card: SocialCard;
  fileUrl: string | null;
  scraps: readonly SocialScrap[];
  busy: boolean;
  onShowDraft: () => void;
  onMarkReady: () => void;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [turns, setTurns] = useState<SocialCardTurn[]>([]);
  const [text, setText] = useState("");
  const [atMs, setAtMs] = useState<number | null>(null);
  const [endMs, setEndMs] = useState<number | null>(null);
  const [scrapId, setScrapId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const video = card.fileKind === "video";

  useEffect(() => {
    let gone = false;
    void listSocialCardTurns(token, card.id)
      .then((rows) => {
        if (!gone) setTurns(rows);
      })
      .catch(() => {
        if (!gone) setError("Could not load the messages");
      });
    return () => {
      gone = true;
    };
  }, [token, card.id]);

  function moment(): number | null {
    const node = videoRef.current;
    if (!node) return null;
    return Math.round(node.currentTime * 1000);
  }

  async function send(): Promise<void> {
    const line = text.trim();
    if (!line || sending) return;
    setSending(true);
    setError(null);
    try {
      const turn = await addSocialCardTurn(token, card.id, {
        text: line,
        atMs,
        endMs,
        scrapId: scrapId || null,
      });
      setTurns((current) => [...current, turn]);
      setText("");
      setAtMs(null);
      setEndMs(null);
      setScrapId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const resources = scraps.filter((item) => item.fileKind === "photo" || item.fileKind === "video");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-border px-4 py-2" role="group" aria-label="Card screen">
        <button type="button" onClick={onShowDraft} className="h-8 rounded-md px-2 text-sm text-muted-foreground">
          Draft
        </button>
        <button type="button" aria-pressed="true" className="h-8 rounded-md bg-primary px-2 text-sm text-primary-foreground">
          Review
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 border-b border-border p-4 md:border-b-0 md:border-r">
        {fileUrl && video ? (
          <video ref={videoRef} src={fileUrl} controls className="max-h-full w-full rounded-md bg-black" />
        ) : fileUrl ? (
          <img src={fileUrl} alt="" className="max-h-full w-full rounded-md object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">No file on this card yet.</p>
        )}
        {video && fileUrl ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-8 rounded-md border border-border px-2 text-sm"
              onClick={() => {
                setAtMs(moment());
                setEndMs(null);
              }}
            >
              This moment
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-2 text-sm"
              onClick={() => setAtMs(moment())}
            >
              From here
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-2 text-sm"
              onClick={() => {
                const end = moment();
                if (atMs == null || end == null || end <= atMs) return;
                setEndMs(end);
              }}
            >
              To here
            </button>
            {atMs != null ? (
              <span className="self-center text-sm text-muted-foreground">
                {endMs != null ? `${clock(atMs)}–${clock(endMs)}` : clock(atMs)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 p-4 md:max-w-md">
        <p className="text-sm font-medium text-foreground">{`With ${card.editorName ?? ""}`}</p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="Review messages">
          {turns.map((turn) => {
            const when = spanLabel(turn);
            const resource = turn.scrapId ? resources.find((item) => item.id === turn.scrapId) : null;
            return (
              <p key={turn.id} className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                {when ? <span className="mr-2 font-medium">{when}</span> : null}
                {turn.text}
                {resource ? <span className="mt-1 block text-xs text-muted-foreground">From Resources</span> : null}
              </p>
            );
          })}
        </div>
        {resources.length > 0 ? (
          <label className="block text-xs text-muted-foreground">
            From Resources
            <select
              aria-label="From Resources"
              value={scrapId}
              onChange={(event) => setScrapId(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="">None</option>
              {resources.map((item, index) => (
                <option key={item.id} value={item.id}>{`${item.fileKind === "video" ? "Video" : "Photo"} ${index + 1}`}</option>
              ))}
            </select>
          </label>
        ) : null}
        <textarea
          aria-label="Instruction"
          value={text}
          maxLength={500}
          rows={3}
          onChange={(event) => setText(event.target.value)}
          placeholder="Shorten this, or add a clip"
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={sending || text.trim().length === 0}
            onClick={() => void send()}
            className="h-10 flex-1 rounded-md border border-border text-sm disabled:opacity-50"
          >
            Send
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onMarkReady}
            className="h-10 flex-1 rounded-md bg-primary text-sm text-primary-foreground disabled:opacity-50"
          >
            Mark ready
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
