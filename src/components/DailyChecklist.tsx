import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarCheck2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  points: number;
  sort_order: number;
};

type Completion = {
  id: string;
  template_id: string;
  points_awarded: number;
};

function todayUTC(): string {
  const now = new Date();
  return format(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    "yyyy-MM-dd",
  );
}

export function DailyChecklist() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const date = todayUTC();

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const [{ data: tpls }, { data: comps }] = await Promise.all([
        supabase
          .from("daily_task_templates")
          .select("id, name, points, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("daily_task_completions")
          .select("id, template_id, points_awarded")
          .eq("user_id", user.id)
          .eq("completion_date", date),
      ]);
      if (!mounted) return;
      setTemplates((tpls ?? []) as Template[]);
      setCompletions((comps ?? []) as Completion[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user, date]);

  const completedMap = useMemo(() => {
    const m = new Map<string, Completion>();
    completions.forEach((c) => m.set(c.template_id, c));
    return m;
  }, [completions]);

  const stats = useMemo(() => {
    const totalPoints = templates.reduce((s, t) => s + t.points, 0);
    const earned = completions.reduce((s, c) => s + c.points_awarded, 0);
    const pct = templates.length ? (completions.length / templates.length) * 100 : 0;
    return { totalPoints, earned, pct };
  }, [templates, completions]);

  async function toggle(tpl: Template) {
    if (!user || busyId) return;
    setBusyId(tpl.id);
    const existing = completedMap.get(tpl.id);
    try {
      if (existing) {
        const { error } = await supabase
          .from("daily_task_completions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        setCompletions((prev) => prev.filter((c) => c.id !== existing.id));
      } else {
        const { data, error } = await supabase
          .from("daily_task_completions")
          .insert({
            user_id: user.id,
            template_id: tpl.id,
            completion_date: date,
          })
          .select("id, template_id, points_awarded")
          .single();
        if (error) throw error;
        setCompletions((prev) => [...prev, data as Completion]);
        toast.success(`+${data.points_awarded} pts`, { description: tpl.name });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="p-6 glass shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
            <CalendarCheck2 className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Daily Checklist</h3>
            <p className="text-xs text-muted-foreground">
              Resets every day · {format(new Date(), "EEEE, MMM d")}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-1.5 border-primary/30 text-primary tabular-nums"
        >
          <Sparkles className="size-3.5" />
          {stats.earned} / {stats.totalPoints} pts today
        </Badge>
      </div>

      <Progress value={stats.pct} className="h-2 mb-4" />

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {templates.map((tpl) => {
            const done = completedMap.has(tpl.id);
            return (
              <motion.li
                key={tpl.id}
                layout
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all select-none",
                  done
                    ? "border-success/40 bg-success/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
                  busyId === tpl.id && "opacity-60 pointer-events-none",
                )}
                onClick={() => toggle(tpl)}
              >
                <Checkbox checked={done} className="pointer-events-none" />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium truncate",
                      done && "line-through text-muted-foreground",
                    )}
                  >
                    {tpl.name}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "tabular-nums text-xs",
                    done
                      ? "border-success/40 text-success"
                      : "border-primary/30 text-primary",
                  )}
                >
                  +{tpl.points}
                </Badge>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
