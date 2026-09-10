"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;

export function DeskQueueSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cn("relative w-full min-w-[12rem] md:w-72")}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={draft}
        autoComplete="off"
        placeholder="Search name, phone, MRN, or token"
        aria-label="Search today's list"
        className="h-11 pl-8 pr-8 lg:h-9"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (timerRef.current !== null) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
        }}
      />
      {draft !== "" ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            setDraft("");
            onChange("");
          }}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
