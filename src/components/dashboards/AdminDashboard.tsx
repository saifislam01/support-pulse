import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/KpiCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, Users, Trophy, ListChecks, UserPlus, Loader2, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Engineer = {
  user_id: string;
  display_name: string | null;
  total_points: number;
  tasks_completed: number;
};

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    admins: 0,
    managers: 0,
    supports: 0,
    tasksTotal: 0,
    tasksDone: 0,
    points: 0,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [
        { data: lb },
        { data: roles },
        { count: tasksTotal },
        { count: tasksDone },
        { count: dailyDone },
        { count: dailyTemplates },
      ] = await Promise.all([
        supabase
          .from("leaderboard_all")
          .select("user_id, display_name, total_points, tasks_completed")
          .order("total_points", { ascending: false }),
        supabase.from("user_roles").select("role"),
        supabase.from("tasks").select("*", { count: "exact", head: true }),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("daily_task_completions").select("*", { count: "exact", head: true }),
        supabase.from("daily_task_templates").select("*", { count: "exact", head: true }).eq("active", true),
      ]);
      if (!mounted) return;
      const list = (lb ?? []) as Engineer[];
      setEngineers(list);
      const r = (roles ?? []) as { role: string }[];
      const totalUsers = r.length;
      setCounts({
        total: totalUsers,
        admins: r.filter((x) => x.role === "admin").length,
        managers: r.filter((x) => x.role === "manager").length,
        supports: r.filter((x) => x.role === "support_engineer").length,
        tasksTotal: (tasksTotal ?? 0) + (dailyTemplates ?? 0) * totalUsers,
        tasksDone: (tasksDone ?? 0) + (dailyDone ?? 0),
        points: list.reduce((s, e) => s + (e.total_points ?? 0), 0),
      });
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const top = useMemo(() => engineers.slice(0, 3), [engineers]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="size-3.5" /> Admin overview
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            System at a glance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calm, complete view of your team's performance.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
            <Sparkles className="size-3.5" />
            Admin
          </Badge>
          <Button asChild size="sm" className="press shadow-glow">
            <Link to="/admin">
              <UserPlus className="size-4" />
              Manage team
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Team members" value={counts.total} icon={Users} tint="primary" />
        <KpiCard label="Total points" value={counts.points} icon={Trophy} tint="accent" />
        <KpiCard label="Tasks done" value={counts.tasksDone} icon={ListChecks} tint="success" />
        <KpiCard label="All tasks" value={counts.tasksTotal} icon={ListChecks} tint="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 glass shadow-card">
          <h3 className="font-display text-lg font-semibold mb-4">Roles breakdown</h3>
          <div className="space-y-3">
            <RoleRow label="Admins" count={counts.admins} total={counts.total} />
            <RoleRow label="Managers" count={counts.managers} total={counts.total} />
            <RoleRow label="Support engineers" count={counts.supports} total={counts.total} />
          </div>
        </Card>

        <Card className="p-6 glass shadow-card lg:col-span-2">
          <h3 className="font-display text-lg font-semibold mb-4">Top performers</h3>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : top.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No activity yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {top.map((e, i) => {
                const initials = (e.display_name ?? "U").slice(0, 2).toUpperCase();
                return (
                  <div
                    key={e.user_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border"
                  >
                    <div className="size-9 rounded-md gradient-rank flex items-center justify-center font-display font-semibold text-primary-foreground shadow-glow">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {e.display_name ?? "Unnamed"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.tasks_completed} tasks
                      </div>
                    </div>
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function RoleRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
