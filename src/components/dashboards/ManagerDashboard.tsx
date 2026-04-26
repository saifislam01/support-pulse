import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  UserPlus,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";

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

type EngineerOption = { id: string; display_name: string };
type Priority = "low" | "medium" | "high";

const assignSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(120, "Max 120 characters"),
  priority: z.enum(["low", "medium", "high"]),
  user_id: z.string().uuid("Pick an engineer"),
});

export function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [recent, setRecent] = useState<RecentTask[]>([]);
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());
  const [engineerOptions, setEngineerOptions] = useState<EngineerOption[]>([]);

  // Assign-task dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignName, setAssignName] = useState("");
  const [assignPriority, setAssignPriority] = useState<Priority>("medium");
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: lb }, { data: tasks }, { data: profiles }, { data: roleRows }] =
        await Promise.all([
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
          supabase
            .from("user_roles")
            .select("user_id, role")
            .eq("role", "support_engineer"),
        ]);
      if (!mounted) return;
      setEngineers((lb ?? []) as Engineer[]);
      setRecent((tasks ?? []) as RecentTask[]);
      const m = new Map<string, string>();
      (profiles ?? []).forEach((p: { id: string; display_name: string }) =>
        m.set(p.id, p.display_name),
      );
      setNameById(m);

      const engineerIds = new Set(
        ((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id),
      );
      const opts: EngineerOption[] = (profiles ?? [])
        .filter((p: { id: string }) => engineerIds.has(p.id))
        .map((p: { id: string; display_name: string }) => ({
          id: p.id,
          display_name: p.display_name ?? "Unnamed",
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      setEngineerOptions(opts);

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalPoints = engineers.reduce((s, e) => s + (e.total_points ?? 0), 0);
    const completed = engineers.reduce((s, e) => s + (e.tasks_completed ?? 0), 0);
    const highOpen = engineers.reduce((s, e) => s + (e.has_high ?? 0), 0);
    return { team: engineers.length, totalPoints, completed, highOpen };
  }, [engineers]);

  const openAssign = (preselectUserId?: string) => {
    setAssignName("");
    setAssignPriority("medium");
    setAssignUserId(preselectUserId ?? "");
    setAssignOpen(true);
  };

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = assignSchema.safeParse({
      name: assignName,
      priority: assignPriority,
      user_id: assignUserId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: parsed.data.user_id,
        name: parsed.data.name,
        priority: parsed.data.priority,
      })
      .select("id, name, status, priority, user_id, created_at, points_awarded")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const assignee =
      engineerOptions.find((e) => e.id === parsed.data.user_id)?.display_name ?? "engineer";
    toast.success(`Task assigned to ${assignee}`);
    setRecent((prev) => [data as RecentTask, ...prev].slice(0, 8));
    setAssignOpen(false);
  };

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
          <Button size="sm" className="press shadow-glow" onClick={() => openAssign()}>
            <Plus className="size-4" />
            Assign task
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
              const isEngineerOption = engineerOptions.some((o) => o.id === e.user_id);
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
                  <div className="text-right mr-2">
                    <div className="font-display font-semibold tabular-nums">
                      {e.total_points ?? 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      pts
                    </div>
                  </div>
                  {isEngineerOption && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="press"
                      onClick={() => openAssign(e.user_id)}
                    >
                      <UserPlus className="size-3.5" />
                      Assign
                    </Button>
                  )}
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Assign task to engineer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assign-engineer">Engineer</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger id="assign-engineer">
                  <SelectValue placeholder="Select an engineer" />
                </SelectTrigger>
                <SelectContent>
                  {engineerOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No engineers found
                    </div>
                  ) : (
                    engineerOptions.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.display_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-name">Task name</Label>
              <Input
                id="assign-name"
                value={assignName}
                onChange={(e) => setAssignName(e.target.value)}
                placeholder="Investigate ticket #1234"
                autoFocus
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={assignPriority}
                onValueChange={(v) => setAssignPriority(v as Priority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low · 10 points</SelectItem>
                  <SelectItem value="medium">Medium · 15 points</SelectItem>
                  <SelectItem value="high">High · 20 points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="press">
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Assign task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
