import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export function confidenceLevelOf(confidence: string): ConfidenceLevel {
  const c = confidence.trim().toLowerCase();
  if (c === "high") return "high";
  if (c === "medium") return "medium";
  if (c === "low") return "low";
  return "unknown";
}

const META: Record<
  ConfidenceLevel,
  { variant: "success" | "warning" | "destructive" | "info"; filled: number }
> = {
  high: { variant: "success", filled: 3 },
  medium: { variant: "warning", filled: 2 },
  low: { variant: "destructive", filled: 1 },
  unknown: { variant: "info", filled: 0 },
};

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const level = confidenceLevelOf(confidence);
  const { variant, filled } = META[level];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={variant} className="capitalize">
        {confidence || "unknown"}
      </Badge>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-3 rounded-sm",
              i < filled ? "bg-current opacity-80" : "bg-muted"
            )}
          />
        ))}
      </span>
    </span>
  );
}
