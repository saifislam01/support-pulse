import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/KpiCard";
import { Shield, Users, Trophy, ListChecks, Plus, Minus, Loader2, UserCog, ShieldCheck, Briefcase, Wrench, Search } from "lucide-react";

type Role = "admin" | "manager" | "support_engineer";
const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  support_engineer: "Support engineer",
};
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <AdminPage />
      </AppShell>
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Admin — Support Performance Tracker" }] }),
});

type Engineer = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  total_points: number;
  tasks_completed: number;
  has_high: number;
};

type ManagedUser = {
  id: string;
  display_name: string | null;
};

function AdminPage() {
  const { role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [systemTotals, setSystemTotals] = useState({ engineers: 0, tasks: 0, completed: 0, points: 0 });
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<Engineer | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [roleMap, setRoleMap] = useState<Record<string, Role>>({});
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  useEffect(() => {
    if (authLoading) return;
    if (role !== "admin" && role !== "manager") {
      toast.error("Admin or manager access required");
      navigate({ to: "/dashboard" });
    }
  }, [role, authLoading, navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: lb }, { count: tasksTotal }, { count: tasksDone }, { data: roles }, { data: profiles }] =
      await Promise.all([
        supabase
          .from("leaderboard_all")
          .select("user_id, display_name, avatar_url, total_points, tasks_completed, has_high")
          .order("total_points", { ascending: false }),
        supabase.from("tasks").select("*", { count: "exact", head: true }),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, display_name").order("display_name", { ascending: true }),
      ]);
    const list = (lb ?? []) as Engineer[];
    setEngineers(list);
    setAllUsers((profiles ?? []) as ManagedUser[]);
    setSystemTotals({
      engineers: list.length,
      tasks: tasksTotal ?? 0,
      completed: tasksDone ?? 0,
      points: list.reduce((s, e) => s + (e.total_points ?? 0), 0),
    });
    const priority: Role[] = ["admin", "manager", "support_engineer"];
    const map: Record<string, Role> = {};
    for (const r of (roles ?? []) as { user_id: string; role: Role }[]) {
      const current = map[r.user_id];
      if (!current || priority.indexOf(r.role) < priority.indexOf(current)) {
        map[r.user_id] = r.role;
      }
    }
    setRoleMap(map);
    setLoading(false);
  };

  useEffect(() => {
    if (role === "admin" || role === "manager") load();
  }, [role]);

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const n = parseInt(delta, 10);
    if (Number.isNaN(n) || n === 0) {
      toast.error("Enter a non-zero integer");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("point_adjustments").insert({
      user_id: adjustTarget.user_id,
      admin_id: userData.user!.id,
      delta: n,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Adjusted ${adjustTarget.display_name ?? "engineer"} by ${n > 0 ? "+" : ""}${n} pts`);
    setAdjustTarget(null);
    setDelta("");
    setReason("");
    load();
  };

  const changeRole = async (userId: string, newRole: Role) => {
    const previous = roleMap[userId];
    if (previous === newRole) return;
    setUpdatingRole(userId);
    // Optimistic
    setRoleMap((m) => ({ ...m, [userId]: newRole }));
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) {
      setUpdatingRole(null);
      setRoleMap((m) => ({ ...m, [userId]: previous }));
      toast.error(delErr.message);
      return;
    }
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    setUpdatingRole(null);
    if (insErr) {
      setRoleMap((m) => ({ ...m, [userId]: previous }));
      toast.error(insErr.message);
      return;
    }
    toast.success(`Role updated to ${ROLE_LABEL[newRole]}`);
  };

  const top = useMemo(() => engineers.slice(0, 3), [engineers]);

  const filteredUsers = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return allUsers.filter((u) => {
      const r = roleMap[u.id] ?? "support_engineer";
      if (roleFilter !== "all" && r !== roleFilter) return false;
      if (q && !(u.display_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allUsers, roleMap, roleSearch, roleFilter]);

  const roleCounts = useMemo(() => {
    const c = { admin: 0, manager: 0, support_engineer: 0 };
    for (const u of allUsers) {
      const r = (roleMap[u.id] ?? "support_engineer") as Role;
      c[r]++;
    }
    return c;
  }, [allUsers, roleMap]);

  if (authLoading || (role !== "admin" && role !== "manager")) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = role === "admin";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="size-3.5" /> {isAdmin ? "Admin" : "Manager"} console
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            {isAdmin ? "System overview" : "Team overview"}
          </h1>
        </div>
        <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
          <Shield className="size-3.5" />
          {isAdmin ? "Admin" : "Manager"}
        </Badge>
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Engineers" value={systemTotals.engineers} icon={Users} tint="primary" />
        <KpiCard label="Total points" value={systemTotals.points} icon={Trophy} tint="accent" />
        <KpiCard label="Tasks completed" value={systemTotals.completed} icon={ListChecks} tint="success" />
        <KpiCard label="Total tasks" value={systemTotals.tasks} icon={ListChecks} tint="warning" />
      </div>

      {top.length > 0 && (
        <Card className="p-6 glass shadow-card">
          <h3 className="font-display text-lg font-semibold mb-4">Top performers</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {top.map((e, i) => (
              <div key={e.user_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="size-8 rounded-md gradient-rank flex items-center justify-center font-display font-bold text-primary-foreground shadow-glow">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.display_name ?? "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">{e.tasks_completed} tasks</div>
                </div>
                <div className="font-display font-bold tabular-nums text-primary">{e.total_points}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6 glass shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <UserCog className="size-4 text-primary" />
              <h3 className="font-display text-lg font-semibold">Manage roles</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1"><ShieldCheck className="size-3" />{roleCounts.admin} Admin</Badge>
              <Badge variant="outline" className="gap-1"><Briefcase className="size-3" />{roleCounts.manager} Manager</Badge>
              <Badge variant="outline" className="gap-1"><Wrench className="size-3" />{roleCounts.support_engineer} Engineer</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Search registered users by name..."
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | "all")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="support_engineer">Support engineers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No users match your filters.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredUsers.map((u) => {
                const initials = (u.display_name ?? "U").slice(0, 2).toUpperCase();
                const current = (roleMap[u.id] ?? "support_engineer") as Role;
                const isUpdating = updatingRole === u.id;
                return (
                  <div key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm font-medium truncate">{u.display_name ?? "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Current:
                        <Badge
                          variant="outline"
                          className={
                            current === "admin"
                              ? "border-primary/40 text-primary"
                              : current === "manager"
                                ? "border-accent/40 text-accent"
                                : "border-border"
                          }
                        >
                          {ROLE_LABEL[current]}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant={current === "support_engineer" ? "default" : "outline"}
                        disabled={isUpdating || current === "support_engineer"}
                        onClick={() => changeRole(u.id, "support_engineer")}
                      >
                        <Wrench className="size-3.5" /> Engineer
                      </Button>
                      <Button
                        size="sm"
                        variant={current === "manager" ? "default" : "outline"}
                        disabled={isUpdating || current === "manager"}
                        onClick={() => changeRole(u.id, "manager")}
                      >
                        <Briefcase className="size-3.5" /> Manager
                      </Button>
                      <Button
                        size="sm"
                        variant={current === "admin" ? "default" : "outline"}
                        disabled={isUpdating || current === "admin"}
                        onClick={() => changeRole(u.id, "admin")}
                      >
                        <ShieldCheck className="size-3.5" /> Admin
                      </Button>
                      {isUpdating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card className="p-6 glass shadow-card">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">All engineers</h3>
          <span className="text-xs text-muted-foreground">{engineers.length} total</span>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : engineers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No engineers yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {engineers.map((e) => {
              const initials = (e.display_name ?? "U").slice(0, 2).toUpperCase();
              return (
                <div key={e.user_id} className="flex items-center gap-3 py-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.display_name ?? "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.tasks_completed} completed · {e.has_high} high-priority
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold tabular-nums">{e.total_points ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">pts</div>
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="press" onClick={() => setAdjustTarget(e)}>
                      Adjust
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust points · {adjustTarget?.display_name ?? "Engineer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="delta">Point change</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDelta((d) => String((parseInt(d || "0", 10) || 0) - 5))}
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  id="delta"
                  type="number"
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="e.g. +20 or -10"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDelta((d) => String((parseInt(d || "0", 10) || 0) + 5))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Bonus for incident response"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitAdjust} disabled={submitting} className="press shadow-glow">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Apply adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
