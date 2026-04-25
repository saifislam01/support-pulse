import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/KpiCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ClipboardList,
  Users,
  Trophy,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";

type Engineer = {
  user_id: string;
  display_name: string | null;
  total_points: number;
  tasks_completed: number;
  has_high: number;
};

type RecentTask = {
  id: string;
  name: string;
  status: "pending" | "completed";
  priority: "low" | "medium" | "high";
  user_id: string;
  created_at: string;
  points_awarded: number;
};

export function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [recent, setRecent] = useState<RecentTask[]>([]);
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: lb }, { data: tasks }, { data: profiles }] = await Promise.all([
        supabase
          .from("leaderboard_all")
          .select("user_id, display_name, total_points, tasks_completed, has_high")
          .order("total_points", { ascending: false }),
        supabase
          .from("tasks")
          .select("id, name, status, priority, user_id, created_at, points_awarded")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("profiles").select("id, display_name"),
      ]);
      if (!mounted) return;
      setEngineers((lb ?? []) as Engineer[]);
      setRecent((tasks ?? []) as RecentTask[]);
      const m = new Map<string, string>();
      (profiles ?? []).forEach((p: { id: string; display_name: string }) =>
        m.set(p.id, p.display_name),
      );
      setNameById(m);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const totalPoints = engineers.reduce((s, e) => s + (e.total_points ?? 0), 0);
    const completed = engineers.reduce((s, e) => s + (e.tasks_completed ?? 0), 0);
    const highOpen = engineers.reduce((s, e) => s + (e.has_high ?? 0), 0);
    return { team: engineers.length, totalPoints, completed, highOpen };
  }, [engineers]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="size-3.5" /> Manager overview
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Your team today
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track progress, assign new work, keep the rhythm calm.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
            <Sparkles className="size-3.5" />
            Manager
          </Badge>
          <Button asChild size="sm" className="press shadow-glow">
            <Link to="/tasks">
              <Plus className="size-4" />
              Assign task
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Engineers" value={stats.team} icon={Users} tint="primary" />
        <KpiCard label="Tasks done" value={stats.completed} icon={CheckCircle2} tint="success" />
        <KpiCard label="Team points" value={stats.totalPoints} icon={Trophy} tint="accent" />
        <KpiCard label="High-priority open" value={stats.highOpen} icon={ClipboardList} tint="warning" />
      </div>

      <Card className="p-6 glass shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Engineer leaderboard</h3>
          <span className="text-xs text-muted-foreground">{engineers.length} total</span>
        </div>
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : engineers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No engineers yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {engineers.map((e, i) => {
              const initials = (e.display_name ?? "U").slice(0, 2).toUpperCase();
              return (
                <div key={e.user_id} className="flex items-center gap-3 py-3">
                  <span className="text-xs text-muted-foreground tabular-nums w-5 text-right">
                    {i + 1}
                  </span>
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {e.display_name ?? "Unnamed"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.tasks_completed} done · {e.has_high} high-priority
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-semibold tabular-nums">
                      {e.total_points ?? 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6 glass shadow-card">
        <h3 className="font-display text-lg font-semibold mb-4">Recent team activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No recent task activity.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div
                  className={`size-2 rounded-full ${
                    t.status === "completed" ? "bg-success" : "bg-warning"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {nameById.get(t.user_id) ?? "Unassigned"} · {t.priority} ·{" "}
                    {format(new Date(t.created_at), "MMM d, h:mm a")}
                  </div>
                </div>
                {t.status === "completed" && (
                  <Badge variant="outline" className="text-primary border-primary/30">
                    +{t.points_awarded}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
