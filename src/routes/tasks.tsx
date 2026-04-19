import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { DailyChecklist } from "@/components/DailyChecklist";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Check, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <TasksPage />
      </AppShell>
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Tasks — Support Performance Tracker" }] }),
});

type Priority = "low" | "medium" | "high";
type Status = "pending" | "completed";
type Task = {
  id: string;
  name: string;
  priority: Priority;
  status: Status;
  points_awarded: number;
  created_at: string;
  completed_at: string | null;
};

const priorityMeta: Record<Priority, { label: string; class: string; points: number }> = {
  low: { label: "Low", class: "bg-muted text-muted-foreground border-border", points: 10 },
  medium: { label: "Medium", class: "bg-primary/10 text-primary border-primary/20", points: 15 },
  high: { label: "High", class: "bg-accent/15 text-accent-foreground border-accent/30", points: 20 },
};

const taskSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(120, "Max 120 characters"),
  priority: z.enum(["low", "medium", "high"]),
});

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      if (mounted) {
        setTasks((data ?? []) as Task[]);
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const filtered = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter]
  );

  const counts = useMemo(
    () => ({
      all: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      completed: tasks.filter((t) => t.status === "completed").length,
    }),
    [tasks]
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPriority("medium");
    setDialogOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setName(t.name);
    setPriority(t.priority);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = taskSchema.safeParse({ name, priority });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    if (editing) {
      const { data, error } = await supabase
        .from("tasks")
        .update({ name: parsed.data.name, priority: parsed.data.priority })
        .eq("id", editing.id)
        .select()
        .single();
      if (error) toast.error(error.message);
      else {
        setTasks((prev) => prev.map((t) => (t.id === editing.id ? (data as Task) : t)));
        toast.success("Task updated");
        setDialogOpen(false);
      }
    } else {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ user_id: user.id, name: parsed.data.name, priority: parsed.data.priority })
        .select()
        .single();
      if (error) toast.error(error.message);
      else {
        setTasks((prev) => [data as Task, ...prev]);
        toast.success("Task created");
        setDialogOpen(false);
      }
    }
    setSubmitting(false);
  };

  const toggleStatus = async (t: Task) => {
    const next: Status = t.status === "completed" ? "pending" : "completed";
    // optimistic
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: next })
      .eq("id", t.id)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      // revert
      setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    } else {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? (data as Task) : x)));
      if (next === "completed") {
        toast.success(`+${(data as Task).points_awarded} points earned!`, {
          description: t.name,
        });
      }
    }
  };

  const deleteTask = async (t: Task) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) {
      toast.error(error.message);
      setTasks((prev) => [t, ...prev]);
    } else {
      toast.success("Task deleted");
    }
  };

  return (
    <div className="space-y-6">
      <DailyChecklist />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">Tasks</h1>
          <p className="mt-1 text-muted-foreground text-sm">Earn points for every task you complete.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="press shadow-glow">
              <Plus className="size-4" />
              New task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editing ? "Edit task" : "New task"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-name">Task name</Label>
                <Input
                  id="task-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Investigate ticket #1234"
                  autoFocus
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
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
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="press">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts.all}</span></TabsTrigger>
          <TabsTrigger value="pending">Pending <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts.pending}</span></TabsTrigger>
          <TabsTrigger value="completed">Completed <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts.completed}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-muted-foreground text-sm">No tasks here yet.</div>
            <Button variant="outline" className="mt-4 press" onClick={openCreate}>
              <Plus className="size-4" />
              Create your first task
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {filtered.map((t) => (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
                >
                  <button
                    onClick={() => toggleStatus(t)}
                    className={cn(
                      "size-6 rounded-full border-2 flex items-center justify-center press transition-all flex-shrink-0",
                      t.status === "completed"
                        ? "bg-success border-success text-success-foreground"
                        : "border-muted-foreground/30 hover:border-primary"
                    )}
                    aria-label={t.status === "completed" ? "Mark as pending" : "Mark complete"}
                  >
                    {t.status === "completed" && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className={cn("font-medium text-sm truncate", t.status === "completed" && "line-through text-muted-foreground")}>
                      {t.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{format(new Date(t.created_at), "MMM d")}</span>
                      {t.status === "completed" && t.completed_at && (
                        <>
                          <span>·</span>
                          <span className="text-primary">+{t.points_awarded} pts</span>
                        </>
                      )}
                    </div>
                  </div>

                  <Badge variant="outline" className={cn("hidden sm:inline-flex text-xs", priorityMeta[t.priority].class)}>
                    {priorityMeta[t.priority].label}
                  </Badge>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="press" onClick={() => openEdit(t)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="press text-destructive hover:text-destructive" onClick={() => deleteTask(t)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}
