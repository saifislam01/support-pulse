import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { AiInsightCard } from "@/components/AiInsightCard";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, Zap, CheckCircle2, TrendingUp } from "lucide-react";
import { format, subDays, startOfDay, isAfter } from "date-fns";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <DashboardRouter />
      </AppShell>
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Dashboard — Support Performance Tracker" }] }),
});

function DashboardRouter() {
  const { role, loading } = useAuth();
  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (role === "admin") return <AdminDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  return <DashboardPage />;
}

type Task = {
  id: string;
  name: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  points_awarded: number;
  created_at: string;
  completed_at: string | null;
};

type DailyCompletion = {
  id: string;
  points_awarded: number;
  completed_at: string;
};

function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyCompletions, setDailyCompletions] = useState<DailyCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const loadTasks = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, name, priority, status, points_awarded, created_at, completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (mounted) setTasks((data ?? []) as Task[]);
    };

    const loadDaily = async () => {
      const { data } = await supabase
        .from("daily_task_completions")
        .select("id, points_awarded, completed_at")
        .eq("user_id", user.id);
      if (mounted) setDailyCompletions((data ?? []) as DailyCompletion[]);
    };

    (async () => {
      await Promise.all([loadTasks(), loadDaily()]);
      if (mounted) setLoading(false);
    })();

    // Realtime — both tables affect total points
    const channel = supabase
      .channel(`dashboard-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` },
        loadTasks,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_task_completions", filter: `user_id=eq.${user.id}` },
        loadDaily,
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "completed");
    const pending = tasks.filter((t) => t.status === "pending");
    const taskPoints = completed.reduce((sum, t) => sum + t.points_awarded, 0);
    const dailyPoints = dailyCompletions.reduce((sum, d) => sum + (d.points_awarded ?? 0), 0);
    const totalPoints = taskPoints + dailyPoints;
    const totalCompleted = completed.length + dailyCompletions.length;
    // Include daily checklist completions in the rate. Each completion counts as
    // a completed unit out of total tracked units (regular tasks + daily completions).
    const totalUnits = tasks.length + dailyCompletions.length;
    const completionRate = totalUnits > 0 ? (totalCompleted / totalUnits) * 100 : 0;

    // Average completions per active day (tasks + daily checklist)
    const days = new Set<string>();
    completed.forEach((t) => {
      if (t.completed_at) days.add(format(new Date(t.completed_at), "yyyy-MM-dd"));
    });
    dailyCompletions.forEach((d) => {
      days.add(format(new Date(d.completed_at), "yyyy-MM-dd"));
    });
    const avgPerDay = days.size > 0 ? totalCompleted / days.size : 0;

    return {
      totalPoints,
      completed: totalCompleted,
      pending: pending.length,
      total: tasks.length,
      completionRate,
      avgPerDay,
    };
  }, [tasks, dailyCompletions]);


  const trend = useMemo(() => {
    const days: { day: string; completed: number; points: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ day: format(d, "EEE"), completed: 0, points: 0 });
    }
    tasks.forEach((t) => {
      if (t.status !== "completed" || !t.completed_at) return;
      const d = startOfDay(new Date(t.completed_at));
      const diff = Math.floor((startOfDay(new Date()).getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) {
        const idx = 6 - diff;
        days[idx].completed += 1;
        days[idx].points += t.points_awarded;
      }
    });
    return days;
  }, [tasks]);

  const recent = tasks.slice(0, 5);
  const highPriorityPending = tasks.filter((t) => t.status === "pending" && t.priority === "high").length;
  const weekCompleted = tasks.filter(
    (t) => t.status === "completed" && t.completed_at && isAfter(new Date(t.completed_at), subDays(new Date(), 7))
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Welcome back,</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">
            {user?.user_metadata?.display_name ?? user?.email?.split("@")[0]}
          </h1>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 border-primary/30 text-primary">
          <TrendingUp className="size-3.5" />
          {weekCompleted} completed this week
        </Badge>
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Points" value={stats.totalPoints} icon={Trophy} tint="primary" />
        <KpiCard label="Completed" value={stats.completed} icon={CheckCircle2} tint="success" />
        <KpiCard label="Pending" value={stats.pending} icon={Target} tint="warning" />
        <KpiCard label="Avg / Day" value={stats.avgPerDay} icon={Zap} tint="accent" decimals={1} />
      </div>

      <AiInsightCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 glass shadow-card">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Weekly performance</h3>
              <p className="text-sm text-muted-foreground">Tasks completed in the last 7 days</p>
            </div>
          </div>
          <div className="h-64">
            {loading ? (
              <div className="h-full w-full animate-pulse bg-muted/50 rounded-md" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPoints" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  />
                  <Area type="monotone" dataKey="completed" stroke="var(--primary)" strokeWidth={2.5} fill="url(#gradPoints)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6 glass shadow-card flex flex-col">
          <h3 className="font-display text-lg font-semibold">Completion rate</h3>
          <p className="text-sm text-muted-foreground mb-6">Across all your tasks</p>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative size-40 flex items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="url(#gradRing)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(stats.completionRate / 100) * 264} 264`}
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="gradRing" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="text-center">
                <div className="font-display text-3xl font-bold tabular-nums">{stats.completionRate.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground mt-1">{stats.completed}/{stats.completed + stats.pending}</div>
              </div>
            </div>
            {highPriorityPending > 0 && (
              <div className="mt-6 text-center text-xs text-warning">
                {highPriorityPending} high-priority task{highPriorityPending > 1 ? "s" : ""} pending
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6 glass shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Recent activity</h3>
        </div>
        {recent.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No tasks yet. Create your first task to start earning points.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors">
                <div className={`size-2 rounded-full ${t.status === "completed" ? "bg-success" : "bg-warning"}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.priority} priority · {format(new Date(t.created_at), "MMM d, h:mm a")}
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

      <Card className="p-6 glass shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Pending tasks</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{stats.pending} open</span>
        </div>
        <Progress value={stats.completionRate} className="h-2" />
        <div className="mt-2 text-xs text-muted-foreground">
          {stats.completed} of {stats.total} tasks completed
        </div>
      </Card>
    </div>
  );
}
