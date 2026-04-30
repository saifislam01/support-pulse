import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Trophy, LogOut, Moon, Sun, Sparkles, Shield, Briefcase, Headphones, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { TeamChat } from "@/components/TeamChat";
import { HourlyReminder } from "@/components/HourlyReminder";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/sumup", label: "Sumup", icon: FileText },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Role-specific tab appears FIRST, before the shared Dashboard tab.
  const roleNav =
    role === "admin"
      ? [{ to: "/admin", label: "Admin", icon: Shield }]
      : role === "manager"
        ? [{ to: "/admin", label: "Manager", icon: Briefcase }]
        : role === "support_engineer"
          ? [{ to: "/tasks", label: "Support Engineer", icon: Headphones }]
          : [];

  // For support engineers the role tab points to /tasks (same as Tasks),
  // so drop the duplicate Tasks entry to avoid two identical links.
  const filteredBase =
    role === "support_engineer"
      ? baseNav.filter((n) => n.to !== "/tasks")
      : baseNav;

  const navItems = [...roleNav, ...filteredBase];

  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "manager"
        ? "Manager"
        : role === "support_engineer"
          ? "Support Engineer"
          : null;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ?? user?.email?.split("@")[0] ?? "U";

  const initials = displayName.split(/[\s@]/)[0].slice(0, 2).toUpperCase();

  // Load avatar + display name from the profiles table so updates appear app-wide.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!active || !data) return;
      setAvatarUrl(data.avatar_url ?? null);
      setProfileName(data.display_name ?? null);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const shownName = profileName ?? displayName;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 min-h-screen flex-col border-r border-border bg-sidebar p-6 sticky top-0">
          <Link to="/dashboard" className="flex items-center gap-2 mb-10">
            <div className="size-9 rounded-lg gradient-rank flex items-center justify-center shadow-glow">
              <Sparkles className="size-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-bold text-base leading-none">Support Tracker</div>
              <div className="text-xs text-muted-foreground mt-0.5">Performance OS</div>
            </div>
          </Link>

          <nav className="flex flex-col gap-1 flex-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all press",
                    active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {user?.user_metadata?.display_name ?? user?.email?.split("@")[0]}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {roleLabel ?? user?.email}
              </div>
            </div>
            <NotificationBell />
          </div>

          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1 press" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="sm" className="flex-1 press" onClick={handleSignOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </aside>

        {/* Mobile top nav */}
        <header className="md:hidden fixed top-0 inset-x-0 z-50 glass border-b border-border px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-7 rounded-md gradient-rank flex items-center justify-center">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">Support Tracker</span>
          </Link>
          <div className="flex gap-1 items-center">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 min-w-0 pt-14 md:pt-0">
          <div className="p-4 md:p-8 max-w-7xl mx-auto animate-[fade-in_0.4s_ease-out]">
            {children}
          </div>
          {/* Mobile bottom nav */}
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-border flex justify-around p-2">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-4 py-2 rounded-md text-xs font-medium press",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="md:hidden h-20" />
        </main>
      </div>
      <TeamChat />
      <HourlyReminder />
    </div>
  );
}
