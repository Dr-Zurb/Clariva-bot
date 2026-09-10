"use client";

export function DeskSplit({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 min-w-0 w-full flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">{left}</div>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">{right}</div>
    </div>
  );
}
