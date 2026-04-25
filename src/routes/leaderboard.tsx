import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Crown, Medal, Flame } from "lucide-react";
import { subDays } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <LeaderboardPage />
      </AppShell>
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Leaderboard — Support Performance Tracker" }] }),
});

type Period = "daily" | "weekly" | "monthly" | "all";
type ProfileRow = { id: string; display_name: string; avatar_url: string | null };
type TaskRow = {
  user_id: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  points_awarded: number;
  completed_at: string | null;
};
type DailyRow = {
  user_id: string;
  points_awarded: number;
  completed_at: string;
};

type Entry = {
  user_id: string;
  display_name: string;
  total_points: number;
  tasks_completed: number;
  has_high: number;
  first_completion: string | null;
};

function periodCutoff(p: Period): Date | null {
  switch (p) {
    case "daily": return subDays(new Date(), 1);
    case "weekly": return subDays(new Date(), 7);
    case "monthly": return subDays(new Date(), 30);
    default: return null;
  }
}

function LeaderboardPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [period, setPeriod] = useState<Period>("weekly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [{ data: profs }, { data: tks }, { data: dly }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url"),
        supabase.from("tasks").select("user_id, priority, status, points_awarded, completed_at").eq("status", "completed"),
        supabase.from("daily_task_completions").select("user_id, points_awarded, completed_at"),
      ]);
      if (mounted) {
        setProfiles((profs ?? []) as ProfileRow[]);
        setTasks((tks ?? []) as TaskRow[]);
        setDaily((dly ?? []) as DailyRow[]);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel("leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, async () => {
        const { data: tks } = await supabase
          .from("tasks")
          .select("user_id, priority, status, points_awarded, completed_at")
          .eq("status", "completed");
        setTasks((tks ?? []) as TaskRow[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_task_completions" }, async () => {
        const { data: dly } = await supabase
          .from("daily_task_completions")
          .select("user_id, points_awarded, completed_at");
        setDaily((dly ?? []) as DailyRow[]);
      })
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const cutoff = periodCutoff(period);
    const map = new Map<string, Entry>();
    profiles.forEach((p) => {
      map.set(p.id, {
        user_id: p.id,
        display_name: p.display_name,
        total_points: 0,
        tasks_completed: 0,
        has_high: 0,
        first_completion: null,
      });
    });
    tasks.forEach((t) => {
      if (!t.completed_at) return;
      if (cutoff && new Date(t.completed_at) < cutoff) return;
      const e = map.get(t.user_id);
      if (!e) return;
      e.total_points += t.points_awarded;
      e.tasks_completed += 1;
      if (t.priority === "high") e.has_high = 1;
      if (!e.first_completion || t.completed_at < e.first_completion) {
        e.first_completion = t.completed_at;
      }
    });
    daily.forEach((d) => {
      if (cutoff && new Date(d.completed_at) < cutoff) return;
      const e = map.get(d.user_id);
      if (!e) return;
      e.total_points += d.points_awarded;
      e.tasks_completed += 1;
      if (!e.first_completion || d.completed_at < e.first_completion) {
        e.first_completion = d.completed_at;
      }
    });
    // Tie-break: points DESC, has_high DESC, first_completion ASC
    return [...map.values()].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.has_high !== a.has_high) return b.has_high - a.has_high;
      if (a.first_completion && b.first_completion) {
        return a.first_completion.localeCompare(b.first_completion);
      }
      return 0;
    });
  }, [profiles, tasks, daily, period]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold flex items-center gap-3">
            <Trophy className="size-8 text-primary" />
            Leaderboard
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">Compete. Improve. Earn the crown.</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="all">All-time</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Card key={i} className="h-48 glass animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-12 text-center glass">
          <p className="text-muted-foreground text-sm">No engineers yet.</p>
        </Card>
      ) : (
        <>
          {/* Podium — rank 1, 2, 3 left to right, uniform alignment */}
          <div className="grid gap-4 md:grid-cols-3 items-stretch">
            {top3.map((e, idx) => {
              const rank = idx + 1;
              return (
                <PodiumCard key={e.user_id} entry={e} rank={rank} isMe={e.user_id === user?.id} />
              );
            })}
          </div>

          {/* Rest */}
          {rest.length > 0 && (
            <Card className="glass shadow-card overflow-hidden">
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {rest.map((e, i) => {
                    const rank = i + 4;
                    const isMe = e.user_id === user?.id;
                    const initials = e.display_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <motion.li
                        key={e.user_id}
                        layout
                        layoutId={`row-${e.user_id}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={cn(
                          "flex items-center gap-4 p-4 transition-colors",
                          isMe && "bg-primary/5"
                        )}
                      >
                        <div className="w-8 text-center font-display font-bold text-muted-foreground tabular-nums">
                          {rank}
                        </div>
                        <Avatar className="size-10">
                          <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate flex items-center gap-2">
                            {e.display_name}
                            {isMe && <Badge variant="outline" className="text-xs border-primary/30 text-primary">You</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {e.tasks_completed} task{e.tasks_completed !== 1 ? "s" : ""} completed
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display font-bold tabular-nums">{e.total_points.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">pts</div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PodiumCard({ entry, rank, isMe }: { entry: Entry; rank: number; isMe: boolean }) {
  const initials = entry.display_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const RankIcon = rank === 1 ? Crown : rank === 2 ? Medal : Flame;
  const accentClass = rank === 1
    ? "from-primary to-accent shadow-glow"
    : rank === 2
    ? "from-muted-foreground/30 to-muted-foreground/10"
    : "from-warning/40 to-warning/10";

  return (
    <motion.div layoutId={`pod-${entry.user_id}`} layout transition={{ type: "spring", stiffness: 250, damping: 28 }} className="h-full flex">
      <Card className={cn("relative w-full p-6 glass shadow-card overflow-hidden flex flex-col", rank === 1 && "border-primary/40")}>
        <div className={cn("absolute -top-12 -right-12 size-40 rounded-full opacity-30 bg-gradient-to-br blur-2xl", accentClass)} />
        <div className="relative flex flex-col items-center text-center flex-1">
          <div className={cn(
            "size-9 rounded-full flex items-center justify-center mb-3 bg-gradient-to-br",
            accentClass
          )}>
            <RankIcon className={cn("size-5", rank === 1 ? "text-primary-foreground" : "text-foreground")} strokeWidth={2.5} />
          </div>
          <Avatar className={cn("size-16 ring-2 ring-offset-2 ring-offset-card", rank === 1 ? "ring-primary" : "ring-border")}>
            <AvatarFallback className={cn("text-base font-semibold", rank === 1 ? "bg-primary/20 text-primary" : "bg-muted")}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="mt-3 font-display font-semibold truncate w-full flex items-center justify-center gap-2">
            {entry.display_name}
            {isMe && <Badge variant="outline" className="text-xs border-primary/30 text-primary">You</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {entry.tasks_completed} task{entry.tasks_completed !== 1 ? "s" : ""} · Rank #{rank}
          </div>
          <div className="mt-auto pt-4 font-display text-3xl font-bold tabular-nums text-gradient">
            {entry.total_points.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">points</div>
        </div>
      </Card>
    </motion.div>
  );
}
