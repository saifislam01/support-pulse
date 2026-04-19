import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/CountUp";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  tint = "primary",
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: LucideIcon;
  tint?: "primary" | "accent" | "warning" | "success";
  decimals?: number;
}) {
  const tintMap = {
    primary: "text-primary bg-primary/10 border-primary/20",
    accent: "text-accent-foreground bg-accent/15 border-accent/30",
    warning: "text-warning bg-warning/10 border-warning/20",
    success: "text-success bg-success/10 border-success/20",
  };

  return (
    <Card className="p-5 glass shadow-card hover:shadow-glow transition-shadow duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="mt-2 font-display text-3xl md:text-4xl font-bold tabular-nums">
            <CountUp value={value} decimals={decimals} />
            {suffix && <span className="text-muted-foreground text-2xl ml-1">{suffix}</span>}
          </div>
        </div>
        <div className={cn("size-10 rounded-lg flex items-center justify-center border", tintMap[tint])}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}
