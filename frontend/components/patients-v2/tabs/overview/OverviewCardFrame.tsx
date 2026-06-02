import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OverviewCardFrameProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function OverviewCardFrame({ title, children, className }: OverviewCardFrameProps) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  );
}
